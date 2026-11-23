using System.Diagnostics;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using PhantomCompanion.Communication.Transport;
using PhantomCompanion.Diagnostics;
using PhantomCompanion.InputCore.Processing;
using PhantomCompanion.InputCore.Protocol;

namespace PhantomCompanion.Communication.WebSocket;

public sealed class LocalWebSocketServer : ICommunicationTransport
{
    private readonly DiagnosticLogger _logger;
    private readonly InputPipeline _pipeline;
    private readonly int _port;

    private HttpListener? _listener;
    private CancellationTokenSource? _cts;
    private Task? _acceptLoopTask;
    private System.Net.WebSockets.WebSocket? _activeSocket;
    private readonly SemaphoreSlim _sendLock = new(1, 1);

    private long _totalEvents;
    private long _droppedEvents;
    private double _lastProcMicros;
    private double? _lastRttMs;
    private long _windowEvents;
    private long _windowStartTimestamp = Stopwatch.GetTimestamp();
    private double _messagesPerSecond;
    private double _controllerUpdateHz;

    public string TransportName => "ADB Reverse WebSocket (127.0.0.1)";
    public TransportState State { get; private set; } = TransportState.Stopped;
    public bool HasActiveClient => _activeSocket is { State: WebSocketState.Open };

    public event Action<TransportState>? StateChanged;
    public event Action<ParsedControllerEvent, double>? EventReceived;
    public event Action? ClientConnected;
    public event Action? ClientDisconnected;

    public LocalWebSocketServer(
        InputPipeline pipeline,
        DiagnosticLogger logger,
        int port = 8765)
    {
        _pipeline = pipeline;
        _logger = logger;
        _port = port is >= 1024 and <= 65535 ? port : 8765;
    }

    public Task StartAsync(CancellationToken cancellationToken = default)
    {
        if (State is TransportState.Listening or TransportState.Connected)
            return Task.CompletedTask;

        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _listener = new HttpListener();
        // Strictly bind only to localhost loopback
        _listener.Prefixes.Add($"http://127.0.0.1:{_port}/");

        try
        {
            _listener.Start();
            SetState(TransportState.Listening);
            _logger.Info("WebSocket", $"Listening strictly on ws://127.0.0.1:{_port}");
            _acceptLoopTask = Task.Run(() => AcceptLoopAsync(_cts.Token), _cts.Token);
        }
        catch (Exception ex)
        {
            SetState(TransportState.Error);
            _logger.Error("WebSocket", $"Failed to start listener on 127.0.0.1:{_port}: {ex.Message}");
        }

        return Task.CompletedTask;
    }

    public async Task StopAsync()
    {
        try
        {
            _cts?.Cancel();
            if (_activeSocket is { State: WebSocketState.Open })
            {
                await _activeSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Server stopping", CancellationToken.None);
            }
            _listener?.Stop();
            _listener?.Close();
            if (_acceptLoopTask is not null)
            {
                await _acceptLoopTask.ConfigureAwait(false);
            }
        }
        catch
        {
            // Ignore shutdown exceptions
        }
        finally
        {
            _activeSocket = null;
            _pipeline.ReleaseAllOnDisconnect();
            SetState(TransportState.Stopped);
            _logger.Info("WebSocket", "Server stopped and controller inputs released.");
        }
    }

    public LatencyTelemetry GetTelemetry()
    {
        UpdateRateCounters();
        return new LatencyTelemetry(
            _lastRttMs,
            _lastProcMicros,
            _messagesPerSecond,
            _controllerUpdateHz,
            Interlocked.Read(ref _totalEvents),
            Interlocked.Read(ref _droppedEvents));
    }

    private async Task AcceptLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _listener is { IsListening: true })
        {
            HttpListenerContext ctx;
            try
            {
                ctx = await _listener.GetContextAsync().ConfigureAwait(false);
            }
            catch (HttpListenerException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.Warning("WebSocket", $"Accept loop warning: {ex.Message}");
                continue;
            }

            if (!ctx.Request.IsWebSocketRequest)
            {
                ctx.Response.StatusCode = 400;
                ctx.Response.Close();
                continue;
            }

            try
            {
                var wsCtx = await ctx.AcceptWebSocketAsync(null).ConfigureAwait(false);
                await HandleClientSessionAsync(wsCtx.WebSocket, ct).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.Error("WebSocket", $"WebSocket handshake failed: {ex.Message}");
            }
        }
    }

    private async Task HandleClientSessionAsync(System.Net.WebSockets.WebSocket socket, CancellationToken ct)
    {
        // Replace any stale session cleanly
        if (_activeSocket is { State: WebSocketState.Open })
        {
            try
            {
                await _activeSocket.CloseAsync(WebSocketCloseStatus.PolicyViolation, "Replaced by newer phone connection", CancellationToken.None);
            }
            catch { }
        }

        _activeSocket = socket;
        SetState(TransportState.Connected);
        _logger.Info("WebSocket", "Android controller connected over localhost WebSocket.");
        ClientConnected?.Invoke();

        byte[] buffer = new byte[ProtocolParser.MaxMessageBytes];
        using var ms = new MemoryStream(ProtocolParser.MaxMessageBytes);

        try
        {
            while (socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                ms.SetLength(0);
                WebSocketReceiveResult result;
                do
                {
                    result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), ct).ConfigureAwait(false);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Client closed", CancellationToken.None).ConfigureAwait(false);
                        return;
                    }
                    if (ms.Length + result.Count > ProtocolParser.MaxMessageBytes)
                    {
                        Interlocked.Increment(ref _droppedEvents);
                        _logger.Warning("WebSocket", "Dropped oversized WebSocket frame.");
                        ms.SetLength(0);
                        break;
                    }
                    ms.Write(buffer, 0, result.Count);
                }
                while (!result.EndOfMessage);

                if (result.MessageType != WebSocketMessageType.Text || ms.Length == 0)
                    continue;

                var span = ms.GetBuffer().AsSpan(0, (int)ms.Length);
                if (!ProtocolParser.TryParse(span, out var parsed, out var err))
                {
                    Interlocked.Increment(ref _droppedEvents);
                    _logger.Warning("Protocol", $"Rejected invalid message: {err}");
                    continue;
                }

                if (parsed.Type == ControllerEventType.Ping)
                {
                    await SendPongAsync(socket, parsed.Timestamp, ct).ConfigureAwait(false);
                    continue;
                }

                double procMicros = _pipeline.ProcessIncomingEvent(parsed);
                _lastProcMicros = procMicros;
                Interlocked.Increment(ref _totalEvents);
                Interlocked.Increment(ref _windowEvents);
                UpdateRateCounters();

                EventReceived?.Invoke(parsed, procMicros);
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown
        }
        catch (WebSocketException ex)
        {
            _logger.Warning("WebSocket", $"Connection interrupted: {ex.Message}");
        }
        finally
        {
            _activeSocket = null;
            _lastRttMs = null;
            _messagesPerSecond = 0;
            _controllerUpdateHz = 0;
            _pipeline.ReleaseAllOnDisconnect();
            SetState(_listener is { IsListening: true } ? TransportState.Listening : TransportState.Stopped);
            _logger.Info("WebSocket", "Phone disconnected; all held virtual inputs released.");
            ClientDisconnected?.Invoke();
        }
    }

    private async Task SendPongAsync(System.Net.WebSockets.WebSocket socket, long clientTimestamp, CancellationToken ct)
    {
        var pongJson = $"{{\"type\":\"pong\",\"timestamp\":{clientTimestamp}}}";
        var bytes = Encoding.UTF8.GetBytes(pongJson);
        await _sendLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (socket.State == WebSocketState.Open)
            {
                await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, ct).ConfigureAwait(false);
            }
        }
        finally
        {
            _sendLock.Release();
        }
    }

    private void UpdateRateCounters()
    {
        long now = Stopwatch.GetTimestamp();
        double elapsedSec = (now - _windowStartTimestamp) / (double)Stopwatch.Frequency;
        if (elapsedSec >= 1.0)
        {
            long count = Interlocked.Exchange(ref _windowEvents, 0);
            _windowStartTimestamp = now;
            _messagesPerSecond = Math.Round(count / elapsedSec, 1);
            _controllerUpdateHz = _messagesPerSecond;
        }
    }

    private void SetState(TransportState next)
    {
        if (State == next) return;
        State = next;
        StateChanged?.Invoke(next);
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync().ConfigureAwait(false);
        _sendLock.Dispose();
        _cts?.Dispose();
    }
}
