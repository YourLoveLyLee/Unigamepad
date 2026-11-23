namespace PhantomCompanion.InputCore.Protocol;

public enum ControllerEventType
{
    Button,
    Joystick,
    Trigger,
    Dpad,
    Touchpad,
    Ping,
    StateSync
}

public sealed record ParsedControllerEvent
{
    public ControllerEventType Type { get; init; }
    public string Target { get; init; } = string.Empty;
    public bool Pressed { get; init; }
    public double X { get; init; }
    public double Y { get; init; }
    public double Value { get; init; }
    public bool Up { get; init; }
    public bool Down { get; init; }
    public bool Left { get; init; }
    public bool Right { get; init; }
    public string Action { get; init; } = string.Empty;
    public long Timestamp { get; init; }
}
