namespace PhantomCompanion.Diagnostics;

public enum LogSeverity
{
    Info,
    Warning,
    Error
}

public sealed record DiagnosticLogEntry(
    DateTimeOffset Timestamp,
    LogSeverity Severity,
    string Source,
    string Message);

public sealed record SystemVerificationState(
    bool AdbAvailable,
    bool PhoneUsbConnected,
    bool WebSocketListening,
    bool CompanionReceivingInput,
    bool VirtualDriverInstalled,
    bool VirtualGamepadCreated,
    bool WindowsDetectingGamepad,
    string ActiveOutputMode,
    string ActiveProfileName,
    string DetailMessage);

public sealed record LatencyTelemetry(
    double? RoundTripMs,
    double LastProcessingMicroseconds,
    double MessagesPerSecond,
    double ControllerUpdateHz,
    long TotalEventsProcessed,
    long DroppedOrInvalidEvents);
