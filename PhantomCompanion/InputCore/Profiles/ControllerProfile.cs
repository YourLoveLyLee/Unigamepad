using System.Text.Json.Serialization;

namespace PhantomCompanion.InputCore.Profiles;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum OutputMode
{
    UniversalGamepad,
    KeyboardMouse
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum XboxButtonTarget
{
    None,
    A,
    B,
    X,
    Y,
    LeftShoulder,
    RightShoulder,
    LeftTriggerDigital,
    RightTriggerDigital,
    LeftThumbClick,
    RightThumbClick,
    Start,
    Back,
    DpadUp,
    DpadDown,
    DpadLeft,
    DpadRight
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum KbMouseActionType
{
    None,
    Key,
    MouseLeft,
    MouseRight,
    MouseMiddle
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TouchpadMode
{
    ButtonOnly,
    MouseCursor,
    ScrollAndButton
}

public sealed class KbMouseBinding
{
    public KbMouseActionType ActionType { get; set; } = KbMouseActionType.None;
    public string KeyName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    public static KbMouseBinding Unassigned(string desc = "Unassigned") =>
        new() { ActionType = KbMouseActionType.None, KeyName = string.Empty, Description = desc };

    public static KbMouseBinding Key(string keyName, string desc = "") =>
        new() { ActionType = KbMouseActionType.Key, KeyName = keyName, Description = desc };

    public static KbMouseBinding MouseLeft(string desc = "Primary Attack (M1)") =>
        new() { ActionType = KbMouseActionType.MouseLeft, KeyName = "LMB", Description = desc };

    public static KbMouseBinding MouseRight(string desc = "Secondary (M2)") =>
        new() { ActionType = KbMouseActionType.MouseRight, KeyName = "RMB", Description = desc };
}

public sealed class StickProfileConfig
{
    public double LeftSensitivity { get; set; } = 1.0;
    public double LeftDeadzone { get; set; } = 0.08;
    public double RightSensitivity { get; set; } = 1.0;
    public double RightDeadzone { get; set; } = 0.08;
    public double TriggerSensitivity { get; set; } = 1.0;
    public bool InvertLeftY { get; set; }
    public bool InvertRightY { get; set; }
    public bool LeftStickAsWasd { get; set; } = true;
    public double WasdThreshold { get; set; } = 0.28;
    public double MouseSensitivity { get; set; } = 14.0;
    public double InputSmoothing { get; set; } = 0.25;
}

public sealed class TouchpadProfileConfig
{
    public TouchpadMode Mode { get; set; } = TouchpadMode.ButtonOnly;
    public double CursorSensitivity { get; set; } = 1.25;
    public XboxButtonTarget ClickGamepadTarget { get; set; } = XboxButtonTarget.Back;
    public XboxButtonTarget SwipeUpGamepadTarget { get; set; } = XboxButtonTarget.Start;
    public XboxButtonTarget SwipeDownGamepadTarget { get; set; } = XboxButtonTarget.None;
    public KbMouseBinding ClickKbMouse { get; set; } = KbMouseBinding.Key("Tab", "Scoreboard / Map");
    public KbMouseBinding SwipeUpKbMouse { get; set; } = KbMouseBinding.Key("M", "Tactical Map");
    public KbMouseBinding SwipeDownKbMouse { get; set; } = KbMouseBinding.Key("B", "Inventory");
}

public sealed class ControllerProfile
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "Custom Profile";
    public bool IsBuiltIn { get; set; }
    public string BuiltInKey { get; set; } = string.Empty;
    public OutputMode OutputMode { get; set; } = OutputMode.UniversalGamepad;

    public Dictionary<string, XboxButtonTarget> GamepadMappings { get; set; } = CreateDefaultGamepadMap();
    public Dictionary<string, KbMouseBinding> KbMouseMappings { get; set; } = CreateDefaultKbMouseMap();

    public StickProfileConfig Sticks { get; set; } = new();
    public TouchpadProfileConfig Touchpad { get; set; } = new();

    public static Dictionary<string, XboxButtonTarget> CreateDefaultGamepadMap() => new(StringComparer.OrdinalIgnoreCase)
    {
        ["L1"] = XboxButtonTarget.LeftShoulder,
        ["R1"] = XboxButtonTarget.RightShoulder,
        ["L2"] = XboxButtonTarget.LeftTriggerDigital,
        ["R2"] = XboxButtonTarget.RightTriggerDigital,
        ["CROSS"] = XboxButtonTarget.A,
        ["CIRCLE"] = XboxButtonTarget.B,
        ["SQUARE"] = XboxButtonTarget.X,
        ["TRIANGLE"] = XboxButtonTarget.Y,
        ["UP"] = XboxButtonTarget.DpadUp,
        ["DOWN"] = XboxButtonTarget.DpadDown,
        ["LEFT"] = XboxButtonTarget.DpadLeft,
        ["RIGHT"] = XboxButtonTarget.DpadRight,
        ["L3"] = XboxButtonTarget.LeftThumbClick,
        ["R3"] = XboxButtonTarget.RightThumbClick,
        ["START"] = XboxButtonTarget.Start,
        ["BACK"] = XboxButtonTarget.Back,
        ["TOUCHPAD_CLICK"] = XboxButtonTarget.Back
    };

    public static Dictionary<string, KbMouseBinding> CreateDefaultKbMouseMap() => new(StringComparer.OrdinalIgnoreCase)
    {
        ["L1"] = KbMouseBinding.Key("E", "Interact"),
        ["R1"] = KbMouseBinding.MouseLeft("Primary Fire"),
        ["L2"] = KbMouseBinding.MouseRight("Aim Down Sights"),
        ["R2"] = KbMouseBinding.Key("R", "Reload"),
        ["CROSS"] = KbMouseBinding.Key("Space", "Jump"),
        ["CIRCLE"] = KbMouseBinding.Key("C", "Crouch"),
        ["SQUARE"] = KbMouseBinding.Key("F", "Use"),
        ["TRIANGLE"] = KbMouseBinding.Key("Tab", "Inventory"),
        ["UP"] = KbMouseBinding.Key("Up", "Up"),
        ["DOWN"] = KbMouseBinding.Key("Down", "Down"),
        ["LEFT"] = KbMouseBinding.Key("Left", "Left"),
        ["RIGHT"] = KbMouseBinding.Key("Right", "Right"),
        ["TOUCHPAD_CLICK"] = KbMouseBinding.Key("M", "Map")
    };

    public static ControllerProfile CreateDefaultController() => new()
    {
        Id = "builtin-default",
        Name = "Default Controller",
        IsBuiltIn = true,
        BuiltInKey = "default",
        OutputMode = OutputMode.UniversalGamepad,
        GamepadMappings = CreateDefaultGamepadMap(),
        KbMouseMappings = CreateDefaultKbMouseMap(),
        Sticks = new StickProfileConfig(),
        Touchpad = new TouchpadProfileConfig()
    };

    public static ControllerProfile CreateBattlegrounds() => new()
    {
        Id = "builtin-battlegrounds",
        Name = "BATTLEGROUNDS",
        IsBuiltIn = true,
        BuiltInKey = "battlegrounds",
        OutputMode = OutputMode.KeyboardMouse,
        GamepadMappings = CreateDefaultGamepadMap(),
        KbMouseMappings = new Dictionary<string, KbMouseBinding>(StringComparer.OrdinalIgnoreCase)
        {
            ["L1"] = KbMouseBinding.Key("Q", "Dash"),
            ["R1"] = KbMouseBinding.MouseLeft("Primary Attack (M1)"),
            ["L2"] = KbMouseBinding.Unassigned("Unassigned"),
            ["R2"] = KbMouseBinding.Unassigned("Unassigned"),
            ["SQUARE"] = KbMouseBinding.Key("D1", "Skill 1"),
            ["TRIANGLE"] = KbMouseBinding.Key("D2", "Skill 2"),
            ["CIRCLE"] = KbMouseBinding.Key("D3", "Skill 3"),
            ["CROSS"] = KbMouseBinding.Key("D4", "Skill 4"),
            ["UP"] = KbMouseBinding.Key("F", "Interact / Emote"),
            ["DOWN"] = KbMouseBinding.Key("G", "Guard / Block"),
            ["LEFT"] = KbMouseBinding.Key("R", "Utility Left"),
            ["RIGHT"] = KbMouseBinding.Key("E", "Utility Right"),
            ["TOUCHPAD_CLICK"] = KbMouseBinding.Key("Tab", "Scoreboard / Map")
        },
        Sticks = new StickProfileConfig
        {
            LeftSensitivity = 1.05,
            LeftDeadzone = 0.08,
            RightSensitivity = 1.15,
            RightDeadzone = 0.06,
            LeftStickAsWasd = true,
            WasdThreshold = 0.25,
            MouseSensitivity = 16.0,
            InputSmoothing = 0.2
        },
        Touchpad = new TouchpadProfileConfig
        {
            Mode = TouchpadMode.MouseCursor,
            CursorSensitivity = 1.35,
            ClickGamepadTarget = XboxButtonTarget.Back,
            ClickKbMouse = KbMouseBinding.Key("Tab", "Scoreboard")
        }
    };

    public static ControllerProfile CreateCustomTemplate() => new()
    {
        Id = "builtin-custom",
        Name = "Custom Profile",
        IsBuiltIn = true,
        BuiltInKey = "custom",
        OutputMode = OutputMode.UniversalGamepad,
        GamepadMappings = CreateDefaultGamepadMap(),
        KbMouseMappings = CreateDefaultKbMouseMap(),
        Sticks = new StickProfileConfig(),
        Touchpad = new TouchpadProfileConfig()
    };
}
