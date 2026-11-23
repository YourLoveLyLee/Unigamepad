using System.Collections.Concurrent;

namespace PhantomCompanion.Diagnostics;

public sealed class DiagnosticLogger
{
    private readonly ConcurrentQueue<DiagnosticLogEntry> _entries = new();
    private readonly int _maxEntries;

    public event Action<DiagnosticLogEntry>? EntryAdded;

    public DiagnosticLogger(int maxEntries = 200)
    {
        _maxEntries = Math.Max(20, maxEntries);
    }

    public void Info(string source, string message) => Write(LogSeverity.Info, source, message);
    public void Warning(string source, string message) => Write(LogSeverity.Warning, source, message);
    public void Error(string source, string message) => Write(LogSeverity.Error, source, message);

    public void Write(LogSeverity severity, string source, string message)
    {
        var entry = new DiagnosticLogEntry(DateTimeOffset.UtcNow, severity, source, message);
        _entries.Enqueue(entry);
        while (_entries.Count > _maxEntries && _entries.TryDequeue(out _)) { }
        EntryAdded?.Invoke(entry);
    }

    public IReadOnlyList<DiagnosticLogEntry> GetSnapshot()
    {
        return _entries.ToArray();
    }

    public void Clear()
    {
        while (_entries.TryDequeue(out _)) { }
    }
}
