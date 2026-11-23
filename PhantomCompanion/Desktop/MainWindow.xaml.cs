using System.Windows;
using System.Windows.Threading;
using PhantomCompanion.Desktop.Services;
using PhantomCompanion.Desktop.ViewModels;

namespace PhantomCompanion.Desktop;

public partial class MainWindow : Window
{
    private readonly MainViewModel _viewModel;
    private readonly DispatcherTimer _telemetryTimer;

    public MainWindow()
    {
        InitializeComponent();

        var orchestrator = new CompanionOrchestrator();
        _viewModel = new MainViewModel(orchestrator);
        DataContext = _viewModel;

        _viewModel.ControllerVisualStateReady += snap => Visualizer.UpdateState(snap);

        _telemetryTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(500)
        };
        _telemetryTimer.Tick += (_, _) => _viewModel.RefreshTelemetryTick();

        Loaded += async (_, _) =>
        {
            await _viewModel.StartAsync();
            _telemetryTimer.Start();
        };

        Closed += (_, _) =>
        {
            _telemetryTimer.Stop();
            _viewModel.Dispose();
        };
    }
}
