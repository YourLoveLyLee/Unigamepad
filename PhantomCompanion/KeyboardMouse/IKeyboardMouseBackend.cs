using PhantomCompanion.InputCore.Processing;

namespace PhantomCompanion.KeyboardMouse;

public interface IKeyboardMouseBackend : IKeyboardMouseSink, IDisposable
{
    bool IsSupportedOnCurrentPlatform { get; }
    IReadOnlyCollection<string> CurrentlyHeldInputs { get; }
}
