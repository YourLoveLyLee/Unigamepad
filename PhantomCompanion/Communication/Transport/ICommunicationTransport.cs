using PhantomCompanion.Diagnostics;
using PhantomCompanion.InputCore.Protocol;

namespace PhantomCompanion.Communication.Transport;

public enum TransportState
{
    Stopped,
    Listening,
    Connected,
    Error
}

/// <summary>
/// Transport abstraction separating physical link mechanics (ADB reverse WebSocket,
/// or a future dedicated USB bulk/AOA protocol) from InputCore event processing.
/// </summary>
public interface ICommunicationTransport : IAsyncDisposable
{
    string TransportName { get; }
    TransportState State { get; }
    bool HasActiveClient { get; }
    LatencyTelemetry GetTelemetry();

    event Action<TransportState>? StateChanged;
    event Action<ParsedControllerEvent, double>? EventReceived;
    event Action? ClientConnected;
    event Action? ClientDisconnected;

    Task StartAsync(CancellationToken cancellationToken = default);
    Task StopAsync();
}
