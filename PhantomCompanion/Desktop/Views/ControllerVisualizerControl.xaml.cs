using System.Windows.Controls;
using System.Windows.Media;
using PhantomCompanion.InputCore.State;

namespace PhantomCompanion.Desktop.Views;

public partial class ControllerVisualizerControl : UserControl
{
    private static readonly Brush InactiveBg = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1D212B"));
    private static readonly Brush InactiveBorder = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2E3340"));
    private static readonly Brush ActiveCrimsonBg = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#7F1D2B"));
    private static readonly Brush ActiveGoldBorder = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#D4A853"));

    public ControllerVisualizerControl()
    {
        InitializeComponent();
    }

    public void UpdateState(ControllerStateSnapshot s)
    {
        SetBadge(L1Badge, s.L1);
        SetBadge(R1Badge, s.R1);
        L2Fill.Width = Math.Clamp(s.L2Value, 0, 1) * 62.0;
        R2Fill.Width = Math.Clamp(s.R2Value, 0, 1) * 62.0;

        SetBadge(DpadUp, s.DpadUp);
        SetBadge(DpadDown, s.DpadDown);
        SetBadge(DpadLeft, s.DpadLeft);
        SetBadge(DpadRight, s.DpadRight);

        SetBadge(BtnTriangle, s.Triangle);
        SetBadge(BtnCircle, s.Circle);
        SetBadge(BtnCross, s.Cross);
        SetBadge(BtnSquare, s.Square);

        TouchpadPlate.BorderBrush = s.TouchpadClick ? ActiveGoldBorder : InactiveBorder;
        Canvas.SetLeft(TouchDot, Math.Clamp(s.TouchpadX, 0, 1) * 150.0);
        Canvas.SetTop(TouchDot, Math.Clamp(s.TouchpadY, 0, 1) * 54.0);
        TouchDot.Opacity = s.LastTouchpadAction == "idle" ? 0.3 : 1.0;

        Canvas.SetLeft(LeftStickCap, 21.0 + Math.Clamp(s.LeftStickX, -1, 1) * 18.0);
        Canvas.SetTop(LeftStickCap, 21.0 + Math.Clamp(s.LeftStickY, -1, 1) * 18.0);
        Canvas.SetLeft(RightStickCap, 21.0 + Math.Clamp(s.RightStickX, -1, 1) * 18.0);
        Canvas.SetTop(RightStickCap, 21.0 + Math.Clamp(s.RightStickY, -1, 1) * 18.0);
    }

    private static void SetBadge(Border border, bool active)
    {
        border.Background = active ? ActiveCrimsonBg : InactiveBg;
        border.BorderBrush = active ? ActiveGoldBorder : InactiveBorder;
    }
}
