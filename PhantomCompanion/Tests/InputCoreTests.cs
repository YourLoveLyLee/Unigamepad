using System.Text;
using PhantomCompanion.ADB;
using PhantomCompanion.InputCore.Processing;
using PhantomCompanion.InputCore.Profiles;
using PhantomCompanion.InputCore.Protocol;
using PhantomCompanion.InputCore.State;
using PhantomCompanion.KeyboardMouse;
using PhantomCompanion.VirtualGamepad;
using Xunit;

namespace PhantomCompanion.Tests;

public sealed class InputCoreTests
{
    private sealed class RecordingGamepadSink : IGamepadSink
    {
        public int ApplyCount { get; private set; }
        public int ReleaseCount { get; private set; }
        public ControllerStateSnapshot? LastState { get; private set; }

        public void ApplyState(ControllerStateSnapshot state, ControllerProfile profile)
        {
            ApplyCount++;
            LastState = state.Clone();
        }

        public void ReleaseAll() => ReleaseCount++;
    }

    private sealed class RecordingKbMouseSink : IKeyboardMouseSink
    {
        public int ProcessCount { get; private set; }
        public int ReleaseCount { get; private set; }
        public ParsedControllerEvent? LastEvent { get; private set; }

        public void ProcessEvent(ParsedControllerEvent ev, ControllerStateSnapshot state, ControllerProfile profile)
        {
            ProcessCount++;
            LastEvent = ev;
        }

        public void TickContinuousAxes(ControllerStateSnapshot state, ControllerProfile profile, double dtSeconds) { }

        public void ReleaseAll() => ReleaseCount++;
    }

    [Fact]
    public void ProtocolParser_ParsesValidButtonAndJoystickMessages()
    {
        var btnJson = Encoding.UTF8.GetBytes("{\"type\":\"button\",\"target\":\"L1\",\"pressed\":true,\"timestamp\":123456}");
        Assert.True(ProtocolParser.TryParse(btnJson, out var btnEv, out var btnErr), btnErr);
        Assert.Equal(ControllerEventType.Button, btnEv.Type);
        Assert.Equal("L1", btnEv.Target);
        Assert.True(btnEv.Pressed);

        var joyJson = Encoding.UTF8.GetBytes("{\"type\":\"joystick\",\"target\":\"right\",\"x\":0.75,\"y\":-0.5,\"timestamp\":123457}");
        Assert.True(ProtocolParser.TryParse(joyJson, out var joyEv, out var joyErr), joyErr);
        Assert.Equal(ControllerEventType.Joystick, joyEv.Type);
        Assert.Equal("right", joyEv.Target);
        Assert.Equal(0.75, joyEv.X, 4);
        Assert.Equal(-0.5, joyEv.Y, 4);
    }

    [Fact]
    public void ProtocolParser_RejectsMalformedOrUnknownTarget()
    {
        var badTarget = Encoding.UTF8.GetBytes("{\"type\":\"button\",\"target\":\"DROP_TABLE\",\"pressed\":true}");
        Assert.False(ProtocolParser.TryParse(badTarget, out _, out _));

        var badJson = Encoding.UTF8.GetBytes("{not-json");
        Assert.False(ProtocolParser.TryParse(badJson, out _, out _));
    }

    [Fact]
    public void BattlegroundsPreset_MatchesExactRequiredBindingsAndMode()
    {
        var bg = ControllerProfile.CreateBattlegrounds();
        Assert.Equal("BATTLEGROUNDS", bg.Name);
        Assert.Equal(OutputMode.KeyboardMouse, bg.OutputMode);
        Assert.Equal("Q", bg.KbMouseMappings["L1"].KeyName);
        Assert.Equal(KbMouseActionType.MouseLeft, bg.KbMouseMappings["R1"].ActionType);
        Assert.Equal(KbMouseActionType.None, bg.KbMouseMappings["L2"].ActionType);
        Assert.Equal(KbMouseActionType.None, bg.KbMouseMappings["R2"].ActionType);
        Assert.Equal("D1", bg.KbMouseMappings["SQUARE"].KeyName);
        Assert.Equal("D2", bg.KbMouseMappings["TRIANGLE"].KeyName);
        Assert.Equal("D3", bg.KbMouseMappings["CIRCLE"].KeyName);
        Assert.Equal("D4", bg.KbMouseMappings["CROSS"].KeyName);
        Assert.True(bg.Sticks.LeftStickAsWasd);
    }

    [Fact]
    public void InputPipeline_EnforcesMutualExclusionAndReleasesOnDisconnect()
    {
        var gp = new RecordingGamepadSink();
        var km = new RecordingKbMouseSink();
        var pipeline = new InputPipeline(ControllerProfile.CreateDefaultController(), gp, km);

        pipeline.ProcessIncomingEvent(new ParsedControllerEvent
        {
            Type = ControllerEventType.Button,
            Target = "L1",
            Pressed = true
        });
        Assert.Equal(1, gp.ApplyCount);
        Assert.Equal(0, km.ProcessCount);

        pipeline.SetActiveProfile(ControllerProfile.CreateBattlegrounds());
        Assert.Equal(1, gp.ReleaseCount);
        Assert.Equal(1, km.ReleaseCount);

        pipeline.ProcessIncomingEvent(new ParsedControllerEvent
        {
            Type = ControllerEventType.Button,
            Target = "R1",
            Pressed = true
        });
        Assert.Equal(1, km.ProcessCount);
        Assert.Equal(1, gp.ApplyCount);

        pipeline.ReleaseAllOnDisconnect();
        Assert.False(pipeline.GetSnapshot().R1);
        Assert.Equal(2, gp.ReleaseCount);
        Assert.Equal(2, km.ReleaseCount);
    }

    [Fact]
    public void ShapeStick_AppliesDeadzoneRescalingAndInvertY()
    {
        var (zx, zy) = InputPipeline.ShapeStick(0.05, 0.04, 0.1, 1.0, false);
        Assert.Equal(0.0, zx);
        Assert.Equal(0.0, zy);

        var (sx, sy) = InputPipeline.ShapeStick(0.0, 1.0, 0.1, 1.0, true);
        Assert.Equal(0.0, sx, 4);
        Assert.Equal(-1.0, sy, 4);
    }

    [Fact]
    public void GamepadReportBuilder_Serializes14ByteHidReport()
    {
        var snapshot = new ControllerStateSnapshot
        {
            Cross = true,
            L1 = true,
            R2Value = 1.0,
            LeftStickX = 1.0,
            DpadUp = true
        };
        var state = GamepadReportBuilder.BuildState(snapshot, ControllerProfile.CreateDefaultController());
        var report = GamepadReportBuilder.ToHidReport(state);
        var bytes = GamepadReportBuilder.SerializeHidReport(report);

        Assert.Equal(14, bytes.Length);
        Assert.Equal(PhantomHidInputReport.ExpectedReportId, bytes[0]);
        Assert.Equal(255, bytes[5]); // RightTrigger
        Assert.Equal(0, bytes[3]);   // Hat North
        Assert.True((state.Buttons & XboxButtonMask.A) != 0);
        Assert.True((state.Buttons & XboxButtonMask.LeftShoulder) != 0);
    }

    [Fact]
    public void ProfileManager_SupportsCreateDuplicateExportImportAndBuiltInProtection()
    {
        var tempFile = Path.Combine(Path.GetTempPath(), $"phantom-test-{Guid.NewGuid():N}.json");
        try
        {
            var mgr = new ProfileManager(tempFile);
            Assert.True(mgr.Profiles.Count >= 3);
            Assert.False(mgr.DeleteCustomProfile("builtin-battlegrounds"));

            var created = mgr.CreateProfile("Sniper Preset", OutputMode.KeyboardMouse);
            Assert.Equal("Sniper Preset", created.Name);

            var json = mgr.ExportProfileJson(created.Id);
            var imported = mgr.ImportProfileJson(json);
            Assert.NotEqual(created.Id, imported.Id);

            Assert.True(mgr.DeleteCustomProfile(created.Id));
            Assert.True(mgr.DeleteCustomProfile(imported.Id));
        }
        finally
        {
            if (File.Exists(tempFile)) File.Delete(tempFile);
        }
    }

    [Fact]
    public void AdbManager_ParsesAuthorizedUnauthorizedAndOfflineDevices()
    {
        const string sample =
            "List of devices attached\n" +
            "R58X12345AB    device usb:1-2 product:RMX3830 model:Realme_C51 device:RE58C2\n" +
            "ABC999         unauthorized usb:1-3\n" +
            "XYZ000         offline\n";

        var parsed = AdbManager.ParseDevicesOutput(sample);
        Assert.Equal(3, parsed.Count);
        Assert.Equal(AdbDeviceAuthState.Authorized, parsed[0].AuthState);
        Assert.Equal("Realme C51", parsed[0].Model);
        Assert.Equal(AdbDeviceAuthState.Unauthorized, parsed[1].AuthState);
        Assert.Equal(AdbDeviceAuthState.Offline, parsed[2].AuthState);
    }

    [Fact]
    public void Win32SendInputBackend_ResolvesBattlegroundsVirtualKeys()
    {
        Assert.True(Win32SendInputBackend.TryResolveVirtualKey("Q", out ushort q) && q == 0x51);
        Assert.True(Win32SendInputBackend.TryResolveVirtualKey("D1", out ushort d1) && d1 == 0x31);
        Assert.True(Win32SendInputBackend.TryResolveVirtualKey("Space", out ushort sp) && sp == 0x20);
        Assert.True(Win32SendInputBackend.TryResolveVirtualKey("Tab", out ushort tab) && tab == 0x09);
    }
}
