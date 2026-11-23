using System.Diagnostics;
using PhantomCompanion.InputCore.Profiles;
using PhantomCompanion.InputCore.Protocol;
using PhantomCompanion.InputCore.State;

namespace PhantomCompanion.InputCore.Processing;

public interface IGamepadSink
{
    void ApplyState(ControllerStateSnapshot state, ControllerProfile profile);
    void ReleaseAll();
}

public interface IKeyboardMouseSink
{
    void ProcessEvent(ParsedControllerEvent ev, ControllerStateSnapshot state, ControllerProfile profile);
    void TickContinuousAxes(ControllerStateSnapshot state, ControllerProfile profile, double dtSeconds);
    void ReleaseAll();
}

public sealed class InputPipeline
{
    private readonly object _gate = new();
    private readonly ControllerStateSnapshot _state = new();
    private readonly IGamepadSink _gamepadSink;
    private readonly IKeyboardMouseSink _kbMouseSink;

    private ControllerProfile _activeProfile;
    private double _smoothedRightX;
    private double _smoothedRightY;

    public event Action<ControllerStateSnapshot>? StateChanged;

    public InputPipeline(
        ControllerProfile initialProfile,
        IGamepadSink gamepadSink,
        IKeyboardMouseSink kbMouseSink)
    {
        _activeProfile = initialProfile;
        _gamepadSink = gamepadSink;
        _kbMouseSink = kbMouseSink;
    }

    public ControllerProfile ActiveProfile
    {
        get { lock (_gate) return _activeProfile; }
    }

    public ControllerStateSnapshot GetSnapshot()
    {
        lock (_gate) return _state.Clone();
    }

    public void SetActiveProfile(ControllerProfile profile)
    {
        lock (_gate)
        {
            var previousMode = _activeProfile.OutputMode;
            _activeProfile = profile;
            if (previousMode != profile.OutputMode)
            {
                // Guarantee mutual exclusion: release previous backend completely before switching
                _gamepadSink.ReleaseAll();
                _kbMouseSink.ReleaseAll();
            }
        }
    }

    public double ProcessIncomingEvent(ParsedControllerEvent ev)
    {
        long start = Stopwatch.GetTimestamp();
        ControllerStateSnapshot? snapshotForUi = null;

        lock (_gate)
        {
            _state.LastEventTimestamp = ev.Timestamp;

            switch (ev.Type)
            {
                case ControllerEventType.Button:
                    ApplyButtonState(ev.Target, ev.Pressed);
                    break;

                case ControllerEventType.Trigger:
                    if (ev.Target == "L2") _state.L2Value = ev.Value;
                    else if (ev.Target == "R2") _state.R2Value = ev.Value;
                    break;

                case ControllerEventType.Joystick:
                    if (ev.Target == "left")
                    {
                        var (sx, sy) = ShapeStick(
                            ev.X,
                            ev.Y,
                            _activeProfile.Sticks.LeftDeadzone,
                            _activeProfile.Sticks.LeftSensitivity,
                            _activeProfile.Sticks.InvertLeftY);
                        _state.LeftStickX = sx;
                        _state.LeftStickY = sy;
                    }
                    else
                    {
                        var (sx, sy) = ShapeStick(
                            ev.X,
                            ev.Y,
                            _activeProfile.Sticks.RightDeadzone,
                            _activeProfile.Sticks.RightSensitivity,
                            _activeProfile.Sticks.InvertRightY);

                        double alpha = Math.Clamp(1.0 - _activeProfile.Sticks.InputSmoothing, 0.15, 1.0);
                        _smoothedRightX += (sx - _smoothedRightX) * alpha;
                        _smoothedRightY += (sy - _smoothedRightY) * alpha;
                        if (Math.Abs(sx) < 1e-4 && Math.Abs(_smoothedRightX) < 0.005) _smoothedRightX = 0;
                        if (Math.Abs(sy) < 1e-4 && Math.Abs(_smoothedRightY) < 0.005) _smoothedRightY = 0;

                        _state.RightStickX = _smoothedRightX;
                        _state.RightStickY = _smoothedRightY;
                    }
                    break;

                case ControllerEventType.Dpad:
                    _state.DpadUp = ev.Up;
                    _state.DpadDown = ev.Down;
                    _state.DpadLeft = ev.Left;
                    _state.DpadRight = ev.Right;
                    break;

                case ControllerEventType.Touchpad:
                    _state.TouchpadX = ev.X;
                    _state.TouchpadY = ev.Y;
                    _state.LastTouchpadAction = ev.Action;
                    break;
            }

            // Strictly mutually exclusive output routing
            if (_activeProfile.OutputMode == OutputMode.UniversalGamepad)
            {
                _gamepadSink.ApplyState(_state, _activeProfile);
            }
            else
            {
                _kbMouseSink.ProcessEvent(ev, _state, _activeProfile);
            }

            snapshotForUi = _state.Clone();
        }

        StateChanged?.Invoke(snapshotForUi);
        long elapsedTicks = Stopwatch.GetTimestamp() - start;
        return (elapsedTicks * 1_000_000.0) / Stopwatch.Frequency;
    }

    public void TickContinuous(double dtSeconds)
    {
        lock (_gate)
        {
            if (_activeProfile.OutputMode == OutputMode.KeyboardMouse)
            {
                _kbMouseSink.TickContinuousAxes(_state, _activeProfile, dtSeconds);
            }
        }
    }

    public void ReleaseAllOnDisconnect()
    {
        ControllerStateSnapshot snap;
        lock (_gate)
        {
            _state.ResetAll();
            _smoothedRightX = 0;
            _smoothedRightY = 0;
            _gamepadSink.ReleaseAll();
            _kbMouseSink.ReleaseAll();
            snap = _state.Clone();
        }
        StateChanged?.Invoke(snap);
    }

    private void ApplyButtonState(string target, bool pressed)
    {
        switch (target)
        {
            case "L1": _state.L1 = pressed; break;
            case "R1": _state.R1 = pressed; break;
            case "L2": _state.L2Value = pressed ? 1.0 : 0.0; break;
            case "R2": _state.R2Value = pressed ? 1.0 : 0.0; break;
            case "TRIANGLE": _state.Triangle = pressed; break;
            case "CIRCLE": _state.Circle = pressed; break;
            case "CROSS": _state.Cross = pressed; break;
            case "SQUARE": _state.Square = pressed; break;
            case "L3": _state.L3 = pressed; break;
            case "R3": _state.R3 = pressed; break;
            case "START": _state.Start = pressed; break;
            case "BACK": _state.Back = pressed; break;
            case "TOUCHPAD_CLICK": _state.TouchpadClick = pressed; break;
            case "UP": _state.DpadUp = pressed; break;
            case "DOWN": _state.DpadDown = pressed; break;
            case "LEFT": _state.DpadLeft = pressed; break;
            case "RIGHT": _state.DpadRight = pressed; break;
        }
    }

    public static (double X, double Y) ShapeStick(
        double rawX,
        double rawY,
        double deadzone,
        double sensitivity,
        bool invertY)
    {
        double mag = Math.Sqrt(rawX * rawX + rawY * rawY);
        double clampedMag = Math.Min(1.0, mag);
        double dz = Math.Clamp(deadzone, 0.0, 0.65);

        if (clampedMag <= dz || mag < 1e-6)
        {
            return (0.0, 0.0);
        }

        double dirX = rawX / mag;
        double dirY = (invertY ? -rawY : rawY) / mag;
        double rescaled = (clampedMag - dz) / (1.0 - dz);
        double shaped = Math.Clamp(rescaled * sensitivity, 0.0, 1.0);
        return (Math.Clamp(dirX * shaped, -1.0, 1.0), Math.Clamp(dirY * shaped, -1.0, 1.0));
    }
}
