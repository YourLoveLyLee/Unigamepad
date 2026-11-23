# End-to-End Verification Procedure

Follow these numbered checks on a real Windows 10/11 PC + Realme C51 phone:

1. **Unit Tests**: Execute `dotnet test PhantomCompanion\PhantomCompanion.sln` and verify all `InputCoreTests` pass.
2. **ADB Reverse Setup**: Connect Realme C51 via USB, confirm `Connection` tab shows `Authorized` and `USB forward active -> tcp:8765`.
3. **Loopback WebSocket Link**: Tap **Connect USB** on the phone controller; verify Companion `Controller` screen shows `1. PHONE LINK: True` and `2. INPUT STREAM: True` as you move sticks and press L1/R1.
4. **Mode B (`BATTLEGROUNDS`) Live Verification**:
   - Select `BATTLEGROUNDS` profile (`Keyboard & Mouse`).
   - Tilt Left Stick -> verify `W/A/S/D` keystrokes in Notepad or target game.
   - Tilt Right Stick -> verify smooth relative mouse camera motion.
   - Press `L1` -> verify `Q`, press `R1` -> verify Left Mouse Click (`M1`), press `Square/Triangle/Circle/Cross` -> verify `1/2/3/4`.
5. **Mode A (`Universal Gamepad`) Verification (when signed `PhantomVhfDriver` is installed)**:
   - Switch to `Default Controller` (`Universal Gamepad`).
   - Open `Diagnostics -> Probe Windows HID & Driver` and confirm `VID_1209 PID_7A3E` enumerated and `Reports Submitted` increments cleanly.
   - Verify axis & button response in `joy.cpl` (`Set up USB game controllers`).
6. **Disconnect Safety Check**: Unplug the USB cable mid-press (`W` or `L1` held); confirm Companion immediately releases all held keys/buttons and zeroes axes.
