using System.Runtime.InteropServices;

namespace PhantomCompanion.VirtualGamepad;

[Flags]
public enum XboxButtonMask : ushort
{
    None = 0,
    DpadUp = 0x0001,
    DpadDown = 0x0002,
    DpadLeft = 0x0004,
    DpadRight = 0x0008,
    Start = 0x0010,
    Back = 0x0020,
    LeftThumb = 0x0040,
    RightThumb = 0x0080,
    LeftShoulder = 0x0100,
    RightShoulder = 0x0200,
    Guide = 0x0400,
    A = 0x1000,
    B = 0x2000,
    X = 0x4000,
    Y = 0x8000
}

/// <summary>
/// Binary 14-byte HID Input Report matching PhantomVhfDriver\HidDescriptor.h.
/// Report ID 1:
///   [0]     ReportId = 0x01
///   [1..2]  Buttons (16 bits LE)
///   [3]     HatSwitch (0..7 = N..NW, 8 = centered)
///   [4]     LeftTrigger (0..255)
///   [5]     RightTrigger (0..255)
///   [6..7]  ThumbLX (Int16 LE: -32768..32767)
///   [8..9]  ThumbLY (Int16 LE: -32768..32767)
///   [10..11] ThumbRX (Int16 LE: -32768..32767)
///   [12..13] ThumbRY (Int16 LE: -32768..32767)
/// </summary>
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public struct PhantomHidInputReport
{
    public const byte ExpectedReportId = 0x01;
    public const int SizeBytes = 14;

    public byte ReportId;
    public ushort Buttons;
    public byte HatSwitch;
    public byte LeftTrigger;
    public byte RightTrigger;
    public short ThumbLX;
    public short ThumbLY;
    public short ThumbRX;
    public short ThumbRY;
}

public sealed record VirtualXboxGamepadState(
    XboxButtonMask Buttons,
    byte HatSwitch,
    byte LeftTrigger,
    byte RightTrigger,
    short ThumbLX,
    short ThumbLY,
    short ThumbRX,
    short ThumbRY);
