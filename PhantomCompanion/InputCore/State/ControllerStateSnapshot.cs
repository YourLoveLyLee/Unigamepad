namespace PhantomCompanion.InputCore.State;

public sealed class ControllerStateSnapshot
{
    public bool L1 { get; set; }
    public bool R1 { get; set; }
    public double L2Value { get; set; }
    public double R2Value { get; set; }

    public bool Triangle { get; set; }
    public bool Circle { get; set; }
    public bool Cross { get; set; }
    public bool Square { get; set; }

    public bool L3 { get; set; }
    public bool R3 { get; set; }
    public bool Start { get; set; }
    public bool Back { get; set; }
    public bool TouchpadClick { get; set; }

    public bool DpadUp { get; set; }
    public bool DpadDown { get; set; }
    public bool DpadLeft { get; set; }
    public bool DpadRight { get; set; }

    public double LeftStickX { get; set; }
    public double LeftStickY { get; set; }
    public double RightStickX { get; set; }
    public double RightStickY { get; set; }

    public double TouchpadX { get; set; } = 0.5;
    public double TouchpadY { get; set; } = 0.5;
    public string LastTouchpadAction { get; set; } = "idle";
    public long LastEventTimestamp { get; set; }

    public void ResetAll()
    {
        L1 = false;
        R1 = false;
        L2Value = 0;
        R2Value = 0;
        Triangle = false;
        Circle = false;
        Cross = false;
        Square = false;
        L3 = false;
        R3 = false;
        Start = false;
        Back = false;
        TouchpadClick = false;
        DpadUp = false;
        DpadDown = false;
        DpadLeft = false;
        DpadRight = false;
        LeftStickX = 0;
        LeftStickY = 0;
        RightStickX = 0;
        RightStickY = 0;
        LastTouchpadAction = "idle";
    }

    public ControllerStateSnapshot Clone()
    {
        return new ControllerStateSnapshot
        {
            L1 = L1,
            R1 = R1,
            L2Value = L2Value,
            R2Value = R2Value,
            Triangle = Triangle,
            Circle = Circle,
            Cross = Cross,
            Square = Square,
            L3 = L3,
            R3 = R3,
            Start = Start,
            Back = Back,
            TouchpadClick = TouchpadClick,
            DpadUp = DpadUp,
            DpadDown = DpadDown,
            DpadLeft = DpadLeft,
            DpadRight = DpadRight,
            LeftStickX = LeftStickX,
            LeftStickY = LeftStickY,
            RightStickX = RightStickX,
            RightStickY = RightStickY,
            TouchpadX = TouchpadX,
            TouchpadY = TouchpadY,
            LastTouchpadAction = LastTouchpadAction,
            LastEventTimestamp = LastEventTimestamp
        };
    }
}
