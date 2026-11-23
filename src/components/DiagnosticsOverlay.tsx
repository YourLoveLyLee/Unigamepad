import type {
  ButtonId,
  DPadState,
  GyroState,
  InputEventEntry,
  StickVector,
  TouchpadState,
} from '../types/controller';

interface DiagnosticsOverlayProps {
  activeButtons: ButtonId[];
  leftStick: StickVector;
  rightStick: StickVector;
  dpad: DPadState;
  touchpad: TouchpadState;
  gyro: GyroState;
  history: InputEventEntry[];
  onClose: () => void;
}

export function DiagnosticsOverlay({
  activeButtons,
  leftStick,
  rightStick,
  dpad,
  touchpad,
  gyro,
  history,
  onClose,
}: DiagnosticsOverlayProps) {
  const activeDpadList = [
    dpad.up ? 'UP' : null,
    dpad.down ? 'DOWN' : null,
    dpad.left ? 'LEFT' : null,
    dpad.right ? 'RIGHT' : null,
  ].filter(Boolean);

  return (
    <aside
      aria-label="Input Diagnostics"
      data-testid="diagnostics-overlay"
      className="pointer-events-auto fixed top-11 left-1/2 -translate-x-1/2 z-30 w-[min(92vw,560px)] rounded-xl border border-white/10 bg-[#0d0f13]/92 px-3.5 py-2.5 text-[11px] text-[#cfd5e2] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-2">
        <span className="font-display text-xs font-semibold tracking-wide text-[#e8eaed]">
          Input Diagnostics
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-[#949cad] hover:text-white px-2 py-0.5 rounded hover:bg-white/5 cursor-pointer"
        >
          Hide
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 font-mono-tabular">
        <div>
          <div className="text-[10px] text-[#7c8496]">Left Stick</div>
          <div data-testid="diag-left-stick" className="text-[#e8eaed]">
            {leftStick.x.toFixed(2)}, {leftStick.y.toFixed(2)}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-[#7c8496]">Right Stick</div>
          <div data-testid="diag-right-stick" className="text-[#e8eaed]">
            {rightStick.x.toFixed(2)}, {rightStick.y.toFixed(2)}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-[#7c8496]">Touchpad</div>
          <div data-testid="diag-touchpad" className="text-[#e8eaed]">
            {touchpad.lastX.toFixed(2)}, {touchpad.lastY.toFixed(2)} ·{' '}
            <span className="text-[#d4a853]">{touchpad.gesture}</span>
          </div>
        </div>

        <div>
          <div className="text-[10px] text-[#7c8496]">Gyroscope</div>
          <div data-testid="diag-gyro" className="text-[#e8eaed]">
            {gyro.supported
              ? `${gyro.deltaX.toFixed(2)}, ${gyro.deltaY.toFixed(2)}`
              : 'No sensor'}
          </div>
        </div>
      </div>

      <div className="mt-2 pt-1.5 border-t border-white/10 flex flex-wrap items-center gap-2 font-mono-tabular">
        <span className="text-[10px] text-[#7c8496]">Active:</span>
        <span data-testid="diag-active-buttons" className="text-[#e8eaed]">
          {activeButtons.length > 0 || activeDpadList.length > 0
            ? [...activeButtons, ...activeDpadList].join(' · ')
            : 'None'}
        </span>
      </div>

      <div className="mt-2 pt-1.5 border-t border-white/10 max-h-[74px] overflow-y-auto phantom-scroll font-mono-tabular space-y-0.5">
        {history.length === 0 ? (
          <div className="text-[10px] text-[#6d7485]">Waiting for input events</div>
        ) : (
          history.slice(0, 8).map((ev) => (
            <div
              key={ev.id}
              className="flex items-center justify-between text-[10px] text-[#a9b1c2]"
            >
              <span>
                <span className="text-[#d4a853]">{ev.source}</span> · {ev.detail}
              </span>
              <span className="text-[#6d7485]">{ev.timestamp}ms</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
