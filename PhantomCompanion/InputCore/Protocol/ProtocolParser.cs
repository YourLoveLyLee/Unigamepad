using System.Text.Json;

namespace PhantomCompanion.InputCore.Protocol;

public static class ProtocolParser
{
    public const int MaxMessageBytes = 4096;

    private static readonly HashSet<string> AllowedButtons = new(StringComparer.OrdinalIgnoreCase)
    {
        "L1", "R1", "L2", "R2",
        "TRIANGLE", "CIRCLE", "CROSS", "SQUARE",
        "UP", "DOWN", "LEFT", "RIGHT",
        "TOUCHPAD_CLICK", "L3", "R3", "START", "BACK"
    };

    private static readonly HashSet<string> AllowedSticks = new(StringComparer.OrdinalIgnoreCase)
    {
        "left", "right"
    };

    private static readonly HashSet<string> AllowedTriggers = new(StringComparer.OrdinalIgnoreCase)
    {
        "L2", "R2"
    };

    private static readonly HashSet<string> AllowedTouchpadActions = new(StringComparer.OrdinalIgnoreCase)
    {
        "move", "down", "up", "touch", "tap", "double_tap", "click",
        "swipe_up", "swipe_down", "swipe_left", "swipe_right", "idle"
    };

    public static bool TryParse(ReadOnlySpan<byte> utf8Payload, out ParsedControllerEvent parsed, out string error)
    {
        parsed = default!;
        error = string.Empty;

        if (utf8Payload.Length == 0 || utf8Payload.Length > MaxMessageBytes)
        {
            error = $"Payload length {utf8Payload.Length} out of bounds.";
            return false;
        }

        try
        {
            using var doc = JsonDocument.Parse(utf8Payload.ToArray());
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                error = "Root JSON value must be an object.";
                return false;
            }

            if (!root.TryGetProperty("type", out var typeProp) || typeProp.ValueKind != JsonValueKind.String)
            {
                error = "Missing string 'type' property.";
                return false;
            }

            var typeStr = typeProp.GetString()?.Trim().ToLowerInvariant();
            long timestamp = root.TryGetProperty("timestamp", out var tsProp) && tsProp.TryGetInt64(out var tsVal)
                ? tsVal
                : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            switch (typeStr)
            {
                case "button":
                {
                    if (!root.TryGetProperty("button", out var btnProp) || btnProp.ValueKind != JsonValueKind.String)
                    {
                        error = "Button event missing 'button'.";
                        return false;
                    }
                    var btn = btnProp.GetString()?.Trim().ToUpperInvariant() ?? string.Empty;
                    if (!AllowedButtons.Contains(btn))
                    {
                        error = $"Unknown button identifier '{btn}'.";
                        return false;
                    }
                    if (!root.TryGetProperty("pressed", out var pressedProp) ||
                        (pressedProp.ValueKind != JsonValueKind.True && pressedProp.ValueKind != JsonValueKind.False))
                    {
                        error = "Button event missing boolean 'pressed'.";
                        return false;
                    }
                    parsed = new ParsedControllerEvent
                    {
                        Type = ControllerEventType.Button,
                        Target = btn,
                        Pressed = pressedProp.GetBoolean(),
                        Timestamp = timestamp
                    };
                    return true;
                }

                case "joystick":
                {
                    if (!root.TryGetProperty("stick", out var stickProp) || stickProp.ValueKind != JsonValueKind.String)
                    {
                        error = "Joystick event missing 'stick'.";
                        return false;
                    }
                    var stick = stickProp.GetString()?.Trim().ToLowerInvariant() ?? string.Empty;
                    if (!AllowedSticks.Contains(stick))
                    {
                        error = $"Unknown stick '{stick}'.";
                        return false;
                    }
                    if (!TryReadFiniteDouble(root, "x", out var x) || !TryReadFiniteDouble(root, "y", out var y))
                    {
                        error = "Joystick event missing finite x/y coordinates.";
                        return false;
                    }
                    parsed = new ParsedControllerEvent
                    {
                        Type = ControllerEventType.Joystick,
                        Target = stick,
                        X = Math.Clamp(x, -1.0, 1.0),
                        Y = Math.Clamp(y, -1.0, 1.0),
                        Timestamp = timestamp
                    };
                    return true;
                }

                case "trigger":
                {
                    if (!root.TryGetProperty("trigger", out var trigProp) || trigProp.ValueKind != JsonValueKind.String)
                    {
                        error = "Trigger event missing 'trigger'.";
                        return false;
                    }
                    var trig = trigProp.GetString()?.Trim().ToUpperInvariant() ?? string.Empty;
                    if (!AllowedTriggers.Contains(trig))
                    {
                        error = $"Unknown trigger '{trig}'.";
                        return false;
                    }
                    if (!TryReadFiniteDouble(root, "value", out var val))
                    {
                        error = "Trigger event missing finite 'value'.";
                        return false;
                    }
                    parsed = new ParsedControllerEvent
                    {
                        Type = ControllerEventType.Trigger,
                        Target = trig,
                        Value = Math.Clamp(val, 0.0, 1.0),
                        Pressed = val >= 0.35,
                        Timestamp = timestamp
                    };
                    return true;
                }

                case "dpad":
                {
                    bool up = ReadBool(root, "up");
                    bool down = ReadBool(root, "down");
                    bool left = ReadBool(root, "left");
                    bool right = ReadBool(root, "right");
                    parsed = new ParsedControllerEvent
                    {
                        Type = ControllerEventType.Dpad,
                        Up = up,
                        Down = down,
                        Left = left,
                        Right = right,
                        Timestamp = timestamp
                    };
                    return true;
                }

                case "touchpad":
                {
                    var action = root.TryGetProperty("action", out var actProp) && actProp.ValueKind == JsonValueKind.String
                        ? actProp.GetString()?.Trim().ToLowerInvariant() ?? "move"
                        : "move";
                    if (!AllowedTouchpadActions.Contains(action))
                    {
                        error = $"Unsupported touchpad action '{action}'.";
                        return false;
                    }
                    TryReadFiniteDouble(root, "x", out var tx);
                    TryReadFiniteDouble(root, "y", out var ty);
                    parsed = new ParsedControllerEvent
                    {
                        Type = ControllerEventType.Touchpad,
                        Action = action,
                        X = Math.Clamp(tx, 0.0, 1.0),
                        Y = Math.Clamp(ty, 0.0, 1.0),
                        Timestamp = timestamp
                    };
                    return true;
                }

                case "ping":
                {
                    parsed = new ParsedControllerEvent
                    {
                        Type = ControllerEventType.Ping,
                        Timestamp = timestamp
                    };
                    return true;
                }

                case "state_sync":
                {
                    parsed = new ParsedControllerEvent
                    {
                        Type = ControllerEventType.StateSync,
                        Timestamp = timestamp
                    };
                    return true;
                }

                default:
                    error = $"Unsupported event type '{typeStr}'.";
                    return false;
            }
        }
        catch (JsonException ex)
        {
            error = $"Malformed JSON: {ex.Message}";
            return false;
        }
    }

    private static bool TryReadFiniteDouble(JsonElement root, string name, out double val)
    {
        val = 0;
        if (!root.TryGetProperty(name, out var prop) || prop.ValueKind != JsonValueKind.Number)
            return false;
        if (!prop.TryGetDouble(out val))
            return false;
        return double.IsFinite(val);
    }

    private static bool ReadBool(JsonElement root, string name)
    {
        return root.TryGetProperty(name, out var prop) && prop.ValueKind == JsonValueKind.True;
    }
}
