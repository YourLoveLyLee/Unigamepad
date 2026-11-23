import { useRef } from 'react';
import type { DPadState } from '../types/controller';
import { computeDPadDirections } from '../utils/controllerMath';

interface DPadProps {
  state: DPadState;
  illuminationIntensity: number;
  accentTheme: 'crimson' | 'gold';
  onChange: (next: DPadState) => void;
}

export function DPad({
  state,
  illuminationIntensity,
  accentTheme,
  onChange,
}: DPadProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const pointerMapRef = useRef<Map<number, DPadState>>(new Map());

  const accentColor = accentTheme === 'gold' ? '#d4a853' : '#c81e32';

  const aggregatePointers = () => {
    const merged: DPadState = {
      up: false,
      down: false,
      left: false,
      right: false,
    };
    for (const s of pointerMapRef.current.values()) {
      merged.up = merged.up || s.up;
      merged.down = merged.down || s.down;
      merged.left = merged.left || s.left;
      merged.right = merged.right || s.right;
    }
    onChange(merged);
  };

  const evaluatePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const next = computeDPadDirections(
      e.clientX - cx,
      e.clientY - cy,
      rect.width / 2,
      0.18,
    );
    pointerMapRef.current.set(e.pointerId, next);
    aggregatePointers();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
    evaluatePointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerMapRef.current.has(e.pointerId)) return;
    evaluatePointer(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerMapRef.current.has(e.pointerId)) {
      pointerMapRef.current.delete(e.pointerId);
      aggregatePointers();
    }
  };

  // Compute subtle 3D physical rock/tilt of the unified cross pad
  const tiltX = (state.up ? 10 : 0) + (state.down ? -10 : 0);
  const tiltY = (state.right ? 10 : 0) + (state.left ? -10 : 0);
  const anyActive = state.up || state.down || state.left || state.right;

  return (
    <div className="relative flex items-center justify-center">
      {/* Recessed circular D-Pad housing */}
      <div
        ref={padRef}
        role="group"
        aria-label="Directional Pad"
        data-testid="controller-dpad"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="controller-surface relative w-[96px] h-[96px] sm:w-[114px] sm:h-[114px] md:w-[126px] md:h-[126px] rounded-full flex items-center justify-center cursor-pointer"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, #16181e 0%, #0d0f13 78%, #090a0d 100%)',
          boxShadow:
            'inset 0 4px 12px rgba(0,0,0,0.88), 0 1px 0 rgba(255,255,255,0.06)',
          perspective: '340px',
        }}
      >
        {/* Unified physical cross body */}
        <div
          className="relative w-[78px] h-[78px] sm:w-[92px] sm:h-[92px] md:w-[104px] md:h-[104px] transition-transform duration-75"
          style={{
            transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${anyActive ? 0.975 : 1})`,
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Vertical arm of unified cross */}
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 w-[28px] sm:w-[32px] md:w-[36px] h-full rounded-[9px] border border-white/10"
            style={{
              background:
                'linear-gradient(160deg, #252932 0%, #171a20 55%, #111318 100%)',
              boxShadow:
                '0 5px 12px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
          />
          {/* Horizontal arm of unified cross */}
          <div
            className="absolute top-1/2 left-0 -translate-y-1/2 h-[28px] sm:h-[32px] md:h-[36px] w-full rounded-[9px] border border-white/10"
            style={{
              background:
                'linear-gradient(160deg, #252932 0%, #171a20 55%, #111318 100%)',
              boxShadow:
                '0 5px 12px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
          />
          {/* Seamless center bridge mask so the cross reads as one sculpted piece */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[30px] h-[30px] sm:w-[34px] sm:h-[34px] md:w-[38px] md:h-[38px] rounded-full"
            style={{
              background:
                'radial-gradient(circle at 45% 40%, #1b1e25 0%, #14161c 75%)',
              boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.65)',
            }}
          />

          {/* Directional chevrons with subtle active illumination */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="D-Pad Up"
            aria-pressed={state.up}
            className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 w-6 h-6 flex items-center justify-center"
          >
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path
                d="M5 1L9 6.5H1L5 1Z"
                fill={state.up ? accentColor : 'rgba(255,255,255,0.28)'}
                style={{
                  filter: state.up
                    ? `drop-shadow(0 0 ${6 * illuminationIntensity}px ${accentColor})`
                    : 'none',
                }}
              />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="D-Pad Down"
            aria-pressed={state.down}
            className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-6 flex items-center justify-center"
          >
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path
                d="M5 7L1 1.5H9L5 7Z"
                fill={state.down ? accentColor : 'rgba(255,255,255,0.28)'}
                style={{
                  filter: state.down
                    ? `drop-shadow(0 0 ${6 * illuminationIntensity}px ${accentColor})`
                    : 'none',
                }}
              />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="D-Pad Left"
            aria-pressed={state.left}
            className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center"
          >
            <svg width="8" height="10" viewBox="0 0 8 10" fill="none">
              <path
                d="M1 5L6.5 1V9L1 5Z"
                fill={state.left ? accentColor : 'rgba(255,255,255,0.28)'}
                style={{
                  filter: state.left
                    ? `drop-shadow(0 0 ${6 * illuminationIntensity}px ${accentColor})`
                    : 'none',
                }}
              />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="D-Pad Right"
            aria-pressed={state.right}
            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center"
          >
            <svg width="8" height="10" viewBox="0 0 8 10" fill="none">
              <path
                d="M7 5L1.5 9V1L7 5Z"
                fill={state.right ? accentColor : 'rgba(255,255,255,0.28)'}
                style={{
                  filter: state.right
                    ? `drop-shadow(0 0 ${6 * illuminationIntensity}px ${accentColor})`
                    : 'none',
                }}
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
