import { useRef } from 'react';
import type { ActionBinding, FaceButtonId } from '../types/controller';
import { ACTION_LABELS } from '../utils/controllerMath';

interface FaceButtonsProps {
  pressed: Record<FaceButtonId, boolean>;
  mappings: Record<FaceButtonId, ActionBinding>;
  illuminationIntensity: number;
  showMappingHints: boolean;
  onPressChange: (id: FaceButtonId, isPressed: boolean) => void;
}

const FACE_BUTTON_META: Array<{
  id: FaceButtonId;
  label: string;
  posClass: string;
  accent: string;
}> = [
  {
    id: 'TRIANGLE',
    label: 'Triangle',
    posClass: 'top-0 left-1/2 -translate-x-1/2',
    accent: '#4aa888',
  },
  {
    id: 'CIRCLE',
    label: 'Circle',
    posClass: 'right-0 top-1/2 -translate-y-1/2',
    accent: '#c83e4d',
  },
  {
    id: 'CROSS',
    label: 'Cross',
    posClass: 'bottom-0 left-1/2 -translate-x-1/2',
    accent: '#5d84b8',
  },
  {
    id: 'SQUARE',
    label: 'Square',
    posClass: 'left-0 top-1/2 -translate-y-1/2',
    accent: '#b46f96',
  },
];

function FaceSymbol({ id, color }: { id: FaceButtonId; color: string }) {
  switch (id) {
    case 'TRIANGLE':
      return (
        <svg width="16" height="15" viewBox="0 0 18 16" fill="none">
          <path
            d="M9 2L16 14H2L9 2Z"
            stroke={color}
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'CIRCLE':
      return (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="6.2" stroke={color} strokeWidth="1.75" />
        </svg>
      );
    case 'CROSS':
      return (
        <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
          <path
            d="M4 4L14 14M14 4L4 14"
            stroke={color}
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'SQUARE':
      return (
        <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
          <rect
            x="3.5"
            y="3.5"
            width="11"
            height="11"
            rx="1.2"
            stroke={color}
            strokeWidth="1.75"
          />
        </svg>
      );
  }
}

export function FaceButtons({
  pressed,
  mappings,
  illuminationIntensity,
  showMappingHints,
  onPressChange,
}: FaceButtonsProps) {
  const pointersByBtnRef = useRef<Record<FaceButtonId, Set<number>>>({
    TRIANGLE: new Set(),
    CIRCLE: new Set(),
    CROSS: new Set(),
    SQUARE: new Set(),
  });

  const handleDown = (
    id: FaceButtonId,
    e: React.PointerEvent<HTMLButtonElement>,
  ) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
    const set = pointersByBtnRef.current[id];
    const wasEmpty = set.size === 0;
    set.add(e.pointerId);
    if (wasEmpty) {
      onPressChange(id, true);
    }
  };

  const handleUp = (
    id: FaceButtonId,
    e: React.PointerEvent<HTMLButtonElement>,
  ) => {
    e.preventDefault();
    const set = pointersByBtnRef.current[id];
    if (set.has(e.pointerId)) {
      set.delete(e.pointerId);
      if (set.size === 0) {
        onPressChange(id, false);
      }
    }
  };

  return (
    <div
      role="group"
      aria-label="Action Face Buttons"
      className="relative w-[112px] h-[112px] sm:w-[132px] sm:h-[132px] md:w-[146px] md:h-[146px]"
    >
      {/* Subtle circular recessed pad ring */}
      <div
        aria-hidden="true"
        className="absolute inset-3 rounded-full border border-white/[0.04] bg-[#0c0d11]/60 pointer-events-none"
      />

      {FACE_BUTTON_META.map((btn) => {
        const isDown = pressed[btn.id];
        const bindingLabel = ACTION_LABELS[mappings[btn.id]].split(' ')[0];

        return (
          <button
            key={btn.id}
            type="button"
            data-testid={`face-${btn.id}`}
            aria-label={`${btn.label} (${ACTION_LABELS[mappings[btn.id]]})`}
            aria-pressed={isDown}
            onPointerDown={(e) => handleDown(btn.id, e)}
            onPointerUp={(e) => handleUp(btn.id, e)}
            onPointerCancel={(e) => handleUp(btn.id, e)}
            onContextMenu={(e) => e.preventDefault()}
            className={`controller-surface absolute w-[40px] h-[40px] sm:w-[46px] sm:h-[46px] md:w-[50px] md:h-[50px] rounded-full flex flex-col items-center justify-center cursor-pointer transition-all duration-75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4a853] ${btn.posClass}`}
            style={{
              background: isDown
                ? 'radial-gradient(circle at 50% 55%, #16181f 0%, #101217 100%)'
                : 'radial-gradient(circle at 38% 30%, #2a2e38 0%, #181b22 60%, #111318 100%)',
              border: `1px solid ${isDown ? btn.accent : 'rgba(255,255,255,0.12)'}`,
              boxShadow: isDown
                ? `inset 0 3px 8px rgba(0,0,0,0.85), 0 0 ${14 * illuminationIntensity}px ${btn.accent}44`
                : '0 6px 14px rgba(0,0,0,0.72), inset 0 1px 1px rgba(255,255,255,0.14)',
              transform: isDown
                ? 'translateY(2px) scale(0.94)'
                : 'translateY(0) scale(1)',
            }}
          >
            <FaceSymbol id={btn.id} color={isDown ? '#f3f4f6' : btn.accent} />
            {showMappingHints && (
              <span className="font-mono-tabular text-[7.5px] leading-none text-[#7b8294] mt-0.5 tracking-tight">
                {bindingLabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
