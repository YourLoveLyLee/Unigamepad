using System.Runtime.InteropServices;
using PhantomCompanion.Diagnostics;
using PhantomCompanion.InputCore.Profiles;
using PhantomCompanion.InputCore.Protocol;
using PhantomCompanion.InputCore.State;

namespace PhantomCompanion.KeyboardMouse;

public sealed class Win32SendInputBackend : IKeyboardMouseBackend
{
    private readonly DiagnosticLogger _logger;
    private readonly object _gate = new();

    private readonly HashSet<ushort> _heldVirtualKeys = new();
    private bool _lmbDown;
    private bool _rmbDown;
    private bool _mmbDown;

    private bool _wasdW;
    private bool _wasdS;
    private bool _wasdA;
    private bool _wasdD;

    private bool _l2ThresholdHeld;
    private bool _r2ThresholdHeld;

    private double _mouseAccumX;
    private double _mouseAccumY;

    public bool IsSupportedOnCurrentPlatform => OperatingSystem.IsWindows();

    public IReadOnlyCollection<string> CurrentlyHeldInputs
    {
        get
        {
            lock (_gate)
            {
                var list = new List<string>();
                if (_lmbDown) list.Add("LMB");
                if (_rmbDown) list.Add("RMB");
                if (_mmbDown) list.Add("MMB");
                foreach (var vk in _heldVirtualKeys)
                {
                    list.Add($"VK_0x{vk:X2}");
                }
                return list;
            }
        }
    }

    public Win32SendInputBackend(DiagnosticLogger logger)
    {
        _logger = logger;
    }

    public void ProcessEvent(ParsedControllerEvent ev, ControllerStateSnapshot state, ControllerProfile profile)
    {
        lock (_gate)
        {
            switch (ev.Type)
            {
                case ControllerEventType.Button:
                    ApplyMappedBinding(profile, ev.Target, ev.Pressed);
                    break;

                case ControllerEventType.Trigger:
                    if (ev.Target == "L2")
                    {
                        bool pressed = ev.Value >= 0.45;
                        if (pressed != _l2ThresholdHeld)
                        {
                            _l2ThresholdHeld = pressed;
                            ApplyMappedBinding(profile, "L2", pressed);
                        }
                    }
                    else if (ev.Target == "R2")
                    {
                        bool pressed = ev.Value >= 0.45;
                        if (pressed != _r2ThresholdHeld)
                        {
                            _r2ThresholdHeld = pressed;
                            ApplyMappedBinding(profile, "R2", pressed);
                        }
                    }
                    break;

                case ControllerEventType.Dpad:
                    ApplyMappedBinding(profile, "UP", ev.Up);
                    ApplyMappedBinding(profile, "DOWN", ev.Down);
                    ApplyMappedBinding(profile, "LEFT", ev.Left);
                    ApplyMappedBinding(profile, "RIGHT", ev.Right);
                    break;

                case ControllerEventType.Touchpad:
                    HandleTouchpadEvent(ev, profile);
                    break;
            }
        }
    }

    public void TickContinuousAxes(ControllerStateSnapshot state, ControllerProfile profile, double dtSeconds)
    {
        lock (_gate)
        {
            double clampedDt = Math.Clamp(dtSeconds, 0.001, 0.05);

            // Left stick -> WASD directional movement when enabled
            if (profile.Sticks.LeftStickAsWasd)
            {
                double threshold = Math.Clamp(profile.Sticks.WasdThreshold, 0.1, 0.75);
                bool nextW = state.LeftStickY < -threshold;
                bool nextS = state.LeftStickY > threshold;
                bool nextA = state.LeftStickX < -threshold;
                bool nextD = state.LeftStickX > threshold;

                UpdateWasdKey(ref _wasdW, nextW, 0x57); // W
                UpdateWasdKey(ref _wasdS, nextS, 0x53); // S
                UpdateWasdKey(ref _wasdA, nextA, 0x41); // A
                UpdateWasdKey(ref _wasdD, nextD, 0x44); // D
            }

            // Right stick -> smooth relative camera mouse delta
            if (Math.Abs(state.RightStickX) > 1e-4 || Math.Abs(state.RightStickY) > 1e-4)
            {
                // Reference rate scaled cleanly to 60Hz feel across frame intervals
                double rateScale = profile.Sticks.MouseSensitivity * 60.0 * clampedDt;
                _mouseAccumX += state.RightStickX * rateScale;
                _mouseAccumY += state.RightStickY * rateScale;

                int dx = (int)Math.Truncate(_mouseAccumX);
                int dy = (int)Math.Truncate(_mouseAccumY);

                if (dx != 0 || dy != 0)
                {
                    _mouseAccumX -= dx;
                    _mouseAccumY -= dy;
                    SendMouseMove(dx, dy);
                }
            }
            else
            {
                _mouseAccumX = 0;
                _mouseAccumY = 0;
            }
        }
    }

    public void ReleaseAll()
    {
        lock (_gate)
        {
            if (_lmbDown) { SendMouseButton(MouseEventFlags.LeftUp); _lmbDown = false; }
            if (_rmbDown) { SendMouseButton(MouseEventFlags.RightUp); _rmbDown = false; }
            if (_mmbDown) { SendMouseButton(MouseEventFlags.MiddleUp); _mmbDown = false; }

            if (_wasdW) { SendKey(0x57, false); _wasdW = false; }
            if (_wasdS) { SendKey(0x53, false); _wasdS = false; }
            if (_wasdA) { SendKey(0x41, false); _wasdA = false; }
            if (_wasdD) { SendKey(0x44, false); _wasdD = false; }

            foreach (var vk in _heldVirtualKeys.ToArray())
            {
                SendKey(vk, false);
            }
            _heldVirtualKeys.Clear();
            _l2ThresholdHeld = false;
            _r2ThresholdHeld = false;
            _mouseAccumX = 0;
            _mouseAccumY = 0;
        }
    }

    private void HandleTouchpadEvent(ParsedControllerEvent ev, ControllerProfile profile)
    {
        if (profile.Touchpad.Mode == TouchpadMode.MouseCursor && ev.Action == "move")
        {
            // Small bounded relative delta from normalized touchpad offset when swiping
            int dx = (int)Math.Round(ev.X * profile.Touchpad.CursorSensitivity * 18.0);
            int dy = (int)Math.Round(ev.Y * profile.Touchpad.CursorSensitivity * 18.0);
            if (dx != 0 || dy != 0)
            {
                SendMouseMove(dx, dy);
            }
        }
        else if (ev.Action == "swipe_up")
        {
            PulseBinding(profile.Touchpad.SwipeUpKbMouse);
        }
        else if (ev.Action == "swipe_down")
        {
            PulseBinding(profile.Touchpad.SwipeDownKbMouse);
        }
        else if (ev.Action == "tap")
        {
            PulseBinding(profile.Touchpad.ClickKbMouse);
        }
    }

    private void PulseBinding(KbMouseBinding binding)
    {
        ApplyBinding(binding, true);
        ApplyBinding(binding, false);
    }

    private void ApplyMappedBinding(ControllerProfile profile, string target, bool pressed)
    {
        if (target == "TOUCHPAD_CLICK")
        {
            ApplyBinding(profile.Touchpad.ClickKbMouse, pressed);
            return;
        }

        if (!profile.KbMouseMappings.TryGetValue(target, out var binding))
            return;

        ApplyBinding(binding, pressed);
    }

    private void ApplyBinding(KbMouseBinding binding, bool pressed)
    {
        switch (binding.ActionType)
        {
            case KbMouseActionType.None:
                return;

            case KbMouseActionType.MouseLeft:
                if (pressed && !_lmbDown)
                {
                    SendMouseButton(MouseEventFlags.LeftDown);
                    _lmbDown = true;
                }
                else if (!pressed && _lmbDown)
                {
                    SendMouseButton(MouseEventFlags.LeftUp);
                    _lmbDown = false;
                }
                break;

            case KbMouseActionType.MouseRight:
                if (pressed && !_rmbDown)
                {
                    SendMouseButton(MouseEventFlags.RightDown);
                    _rmbDown = true;
                }
                else if (!pressed && _rmbDown)
                {
                    SendMouseButton(MouseEventFlags.RightUp);
                    _rmbDown = false;
                }
                break;

            case KbMouseActionType.MouseMiddle:
                if (pressed && !_mmbDown)
                {
                    SendMouseButton(MouseEventFlags.MiddleDown);
                    _mmbDown = true;
                }
                else if (!pressed && _mmbDown)
                {
                    SendMouseButton(MouseEventFlags.MiddleUp);
                    _mmbDown = false;
                }
                break;

            case KbMouseActionType.Key:
                if (!TryResolveVirtualKey(binding.KeyName, out ushort vk))
                    return;

                if (pressed)
                {
                    if (_heldVirtualKeys.Add(vk))
                    {
                        SendKey(vk, true);
                    }
                }
                else
                {
                    if (_heldVirtualKeys.Remove(vk))
                    {
                        SendKey(vk, false);
                    }
                }
                break;
        }
    }

    private void UpdateWasdKey(ref bool stateFlag, bool desired, ushort vk)
    {
        if (stateFlag == desired) return;
        stateFlag = desired;
        SendKey(vk, desired);
    }

    public static bool TryResolveVirtualKey(string keyName, out ushort virtualKey)
    {
        virtualKey = 0;
        if (string.IsNullOrWhiteSpace(keyName)) return false;

        var normalized = keyName.Trim().ToUpperInvariant();
        if (normalized.Length == 1)
        {
            char c = normalized[0];
            if (c is >= 'A' and <= 'Z' or >= '0' and <= '9')
            {
                virtualKey = c;
                return true;
            }
        }

        virtualKey = normalized switch
        {
            "D0" or "0" => 0x30,
            "D1" or "1" => 0x31,
            "D2" or "2" => 0x32,
            "D3" or "3" => 0x33,
            "D4" or "4" => 0x34,
            "D5" or "5" => 0x35,
            "D6" or "6" => 0x36,
            "D7" or "7" => 0x37,
            "D8" or "8" => 0x38,
            "D9" or "9" => 0x39,
            "SPACE" => 0x20,
            "TAB" => 0x09,
            "ENTER" or "RETURN" => 0x0D,
            "ESC" or "ESCAPE" => 0x1B,
            "SHIFT" or "LSHIFT" => 0xA0,
            "RSHIFT" => 0xA1,
            "CTRL" or "LCTRL" => 0xA2,
            "RCTRL" => 0xA3,
            "ALT" or "LALT" => 0xA4,
            "LEFT" => 0x25,
            "UP" => 0x26,
            "RIGHT" => 0x27,
            "DOWN" => 0x28,
            "F1" => 0x70,
            "F2" => 0x71,
            "F3" => 0x72,
            "F4" => 0x73,
            "F5" => 0x74,
            "F6" => 0x75,
            "F7" => 0x76,
            "F8" => 0x77,
            "F9" => 0x78,
            "F10" => 0x79,
            "F11" => 0x7A,
            "F12" => 0x7B,
            _ => 0
        };

        return virtualKey != 0;
    }

    private void SendKey(ushort vk, bool down)
    {
        if (!OperatingSystem.IsWindows()) return;

        uint scan = MapVirtualKeyW(vk, 0);
        uint flags = KeyEventFlags.Scancode | (down ? 0 : KeyEventFlags.KeyUp);
        if (IsExtendedKey(vk))
        {
            flags |= KeyEventFlags.ExtendedKey;
        }

        var input = new INPUT
        {
            type = InputType.Keyboard,
            U = new InputUnion
            {
                ki = new KEYBDINPUT
                {
                    wVk = vk,
                    wScan = (ushort)scan,
                    dwFlags = flags,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero
                }
            }
        };

        uint sent = SendInput(1, new[] { input }, Marshal.SizeOf<INPUT>());
        if (sent == 0)
        {
            _logger.Warning("KeyboardMouse", $"SendInput key VK_0x{vk:X2} failed (err={Marshal.GetLastWin32Error()}).");
        }
    }

    private static void SendMouseMove(int dx, int dy)
    {
        if (!OperatingSystem.IsWindows()) return;

        var input = new INPUT
        {
            type = InputType.Mouse,
            U = new InputUnion
            {
                mi = new MOUSEINPUT
                {
                    dx = dx,
                    dy = dy,
                    mouseData = 0,
                    dwFlags = MouseEventFlags.Move,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero
                }
            }
        };
        SendInput(1, new[] { input }, Marshal.SizeOf<INPUT>());
    }

    private static void SendMouseButton(uint flag)
    {
        if (!OperatingSystem.IsWindows()) return;

        var input = new INPUT
        {
            type = InputType.Mouse,
            U = new InputUnion
            {
                mi = new MOUSEINPUT
                {
                    dx = 0,
                    dy = 0,
                    mouseData = 0,
                    dwFlags = flag,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero
                }
            }
        };
        SendInput(1, new[] { input }, Marshal.SizeOf<INPUT>());
    }

    private static bool IsExtendedKey(ushort vk) =>
        vk is 0x25 or 0x26 or 0x27 or 0x28 or 0x2D or 0x2E or 0x21 or 0x22 or 0x23 or 0x24;

    public void Dispose()
    {
        ReleaseAll();
    }

    #region Win32 Interop
    private static class InputType
    {
        public const uint Mouse = 0;
        public const uint Keyboard = 1;
    }

    private static class KeyEventFlags
    {
        public const uint ExtendedKey = 0x0001;
        public const uint KeyUp = 0x0002;
        public const uint Scancode = 0x0008;
    }

    private static class MouseEventFlags
    {
        public const uint Move = 0x0001;
        public const uint LeftDown = 0x0002;
        public const uint LeftUp = 0x0004;
        public const uint RightDown = 0x0008;
        public const uint RightUp = 0x0010;
        public const uint MiddleDown = 0x0020;
        public const uint MiddleUp = 0x0040;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, [In] INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    private static extern uint MapVirtualKeyW(uint uCode, uint uMapType);
    #endregion
}
