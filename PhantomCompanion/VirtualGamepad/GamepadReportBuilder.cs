using System.Buffers.Binary;
using PhantomCompanion.InputCore.Profiles;
using PhantomCompanion.InputCore.State;

namespace PhantomCompanion.VirtualGamepad;

public static class GamepadReportBuilder
{
    public static VirtualXboxGamepadState BuildState(
        ControllerStateSnapshot snapshot,
        ControllerProfile profile)
    {
        XboxButtonMask mask = XboxButtonMask.None;

        void ApplyButton(string inputKey, bool isPressed)
        {
            if (!isPressed) return;
            if (!profile.GamepadMappings.TryGetValue(inputKey, out var target)) return;

            mask |= target switch
            {
                XboxButtonTarget.A => XboxButtonMask.A,
                XboxButtonTarget.B => XboxButtonMask.B,
                XboxButtonTarget.X => XboxButtonMask.X,
                XboxButtonTarget.Y => XboxButtonMask.Y,
                XboxButtonTarget.LeftShoulder => XboxButtonMask.LeftShoulder,
                XboxButtonTarget.RightShoulder => XboxButtonMask.RightShoulder,
                XboxButtonTarget.LeftThumbClick => XboxButtonMask.LeftThumb,
                XboxButtonTarget.RightThumbClick => XboxButtonMask.RightThumb,
                XboxButtonTarget.Start => XboxButtonMask.Start,
                XboxButtonTarget.Back => XboxButtonMask.Back,
                XboxButtonTarget.DpadUp => XboxButtonMask.DpadUp,
                XboxButtonTarget.DpadDown => XboxButtonMask.DpadDown,
                XboxButtonTarget.DpadLeft => XboxButtonMask.DpadLeft,
                XboxButtonTarget.DpadRight => XboxButtonMask.DpadRight,
                _ => XboxButtonMask.None
            };
        }

        ApplyButton("L1", snapshot.L1);
        ApplyButton("R1", snapshot.R1);
        ApplyButton("TRIANGLE", snapshot.Triangle);
        ApplyButton("CIRCLE", snapshot.Circle);
        ApplyButton("CROSS", snapshot.Cross);
        ApplyButton("SQUARE", snapshot.Square);
        ApplyButton("L3", snapshot.L3);
        ApplyButton("R3", snapshot.R3);
        ApplyButton("START", snapshot.Start);
        ApplyButton("BACK", snapshot.Back);
        ApplyButton("UP", snapshot.DpadUp);
        ApplyButton("DOWN", snapshot.DpadDown);
        ApplyButton("LEFT", snapshot.DpadLeft);
        ApplyButton("RIGHT", snapshot.DpadRight);

        if (snapshot.TouchpadClick && profile.Touchpad.ClickGamepadTarget != XboxButtonTarget.None)
        {
            mask |= MapSingleTarget(profile.Touchpad.ClickGamepadTarget);
        }

        byte lt = ToTriggerByte(snapshot.L2Value, profile.Sticks.TriggerSensitivity);
        byte rt = ToTriggerByte(snapshot.R2Value, profile.Sticks.TriggerSensitivity);

        // If L1/R1 or another button was mapped to LeftTriggerDigital / RightTriggerDigital
        if (HasDigitalTriggerTarget(snapshot, profile, XboxButtonTarget.LeftTriggerDigital))
            lt = 255;
        if (HasDigitalTriggerTarget(snapshot, profile, XboxButtonTarget.RightTriggerDigital))
            rt = 255;

        // Standard HID gamepad Y-axis: -32767 top, +32767 bottom; inverted XInput Y handled per HID descriptor
        short lx = ToSignedAxis(snapshot.LeftStickX);
        short ly = ToSignedAxis(-snapshot.LeftStickY);
        short rx = ToSignedAxis(snapshot.RightStickX);
        short ry = ToSignedAxis(-snapshot.RightStickY);

        byte hat = ComputeHatSwitch(snapshot.DpadUp, snapshot.DpadRight, snapshot.DpadDown, snapshot.DpadLeft);

        return new VirtualXboxGamepadState(mask, hat, lt, rt, lx, ly, rx, ry);
    }

    public static PhantomHidInputReport ToHidReport(VirtualXboxGamepadState state)
    {
        return new PhantomHidInputReport
        {
            ReportId = PhantomHidInputReport.ExpectedReportId,
            Buttons = (ushort)state.Buttons,
            HatSwitch = state.HatSwitch,
            LeftTrigger = state.LeftTrigger,
            RightTrigger = state.RightTrigger,
            ThumbLX = state.ThumbLX,
            ThumbLY = state.ThumbLY,
            ThumbRX = state.ThumbRX,
            ThumbRY = state.ThumbRY
        };
    }

    public static byte[] SerializeHidReport(in PhantomHidInputReport report)
    {
        byte[] buffer = new byte[PhantomHidInputReport.SizeBytes];
        buffer[0] = report.ReportId;
        BinaryPrimitives.WriteUInt16LittleEndian(buffer.AsSpan(1, 2), report.Buttons);
        buffer[3] = report.HatSwitch;
        buffer[4] = report.LeftTrigger;
        buffer[5] = report.RightTrigger;
        BinaryPrimitives.WriteInt16LittleEndian(buffer.AsSpan(6, 2), report.ThumbLX);
        BinaryPrimitives.WriteInt16LittleEndian(buffer.AsSpan(8, 2), report.ThumbLY);
        BinaryPrimitives.WriteInt16LittleEndian(buffer.AsSpan(10, 2), report.ThumbRX);
        BinaryPrimitives.WriteInt16LittleEndian(buffer.AsSpan(12, 2), report.ThumbRY);
        return buffer;
    }

    public static byte ComputeHatSwitch(bool up, bool right, bool down, bool left)
    {
        if (up && right) return 1;
        if (right && down) return 3;
        if (down && left) return 5;
        if (left && up) return 7;
        if (up) return 0;
        if (right) return 2;
        if (down) return 4;
        if (left) return 6;
        return 8; // Centered (null state)
    }

    public static byte ToTriggerByte(double value, double sensitivity)
    {
        double scaled = Math.Clamp(value * Math.Clamp(sensitivity, 0.2, 2.5), 0.0, 1.0);
        return (byte)Math.Round(scaled * 255.0);
    }

    public static short ToSignedAxis(double normalized)
    {
        double clamped = Math.Clamp(normalized, -1.0, 1.0);
        int val = (int)Math.Round(clamped * 32767.0);
        return (short)Math.Clamp(val, short.MinValue, short.MaxValue);
    }

    private static bool HasDigitalTriggerTarget(
        ControllerStateSnapshot snapshot,
        ControllerProfile profile,
        XboxButtonTarget triggerTarget)
    {
        bool IsTarget(string key, bool pressed) =>
            pressed && profile.GamepadMappings.TryGetValue(key, out var t) && t == triggerTarget;

        return IsTarget("L1", snapshot.L1) ||
               IsTarget("R1", snapshot.R1) ||
               IsTarget("TRIANGLE", snapshot.Triangle) ||
               IsTarget("CIRCLE", snapshot.Circle) ||
               IsTarget("CROSS", snapshot.Cross) ||
               IsTarget("SQUARE", snapshot.Square);
    }

    private static XboxButtonMask MapSingleTarget(XboxButtonTarget target) => target switch
    {
        XboxButtonTarget.A => XboxButtonMask.A,
        XboxButtonTarget.B => XboxButtonMask.B,
        XboxButtonTarget.X => XboxButtonMask.X,
        XboxButtonTarget.Y => XboxButtonMask.Y,
        XboxButtonTarget.LeftShoulder => XboxButtonMask.LeftShoulder,
        XboxButtonTarget.RightShoulder => XboxButtonMask.RightShoulder,
        XboxButtonTarget.LeftThumbClick => XboxButtonMask.LeftThumb,
        XboxButtonTarget.RightThumbClick => XboxButtonMask.RightThumb,
        XboxButtonTarget.Start => XboxButtonMask.Start,
        XboxButtonTarget.Back => XboxButtonMask.Back,
        _ => XboxButtonMask.None
    };
}
