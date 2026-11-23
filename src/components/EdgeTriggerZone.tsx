import { useCallback, useRef, useState } from 'react';
import type { ActionBinding, TriggerId } from '../types/controller';
import { ACTION_LABELS } from '../utils/controllerMath';

interface RippleInstance {
  id: number;
  x: number;
  y: number;
}

interface EdgeTriggerZoneProps {
  id: TriggerId;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  binding: ActionBinding;
  pressed: boolean;
  cornerRipplesEnabled: boolean;
  illuminationIntensity: number;
  showMappingHint: boolean;
  accentTheme: 'crimson' | 'gold';
  onPressChange: (id: TriggerId, isPressed: boolean) => void;
}

export function EdgeTriggerZone({
  id,
  position,
  binding,
  pressed,
  cornerRipplesEnabled,
  illuminationIntensity,
  showMappingHint,
  accentTheme,
  onPressChange,
}: EdgeTriggerZoneProps) {
  const activePointersRef = useRef<Set<number>>(new Set());
  const rippleSeqRef = useRef(0);
  const [ripples, setRipples] = useState<RippleInstance[]>([]);

  const isTop = position.startsWith('top');
  const isLeft = position.endsWith('left');

  const spawnRipple = useCallback(
    (clientX: number, clientY: number, el: HTMLElement) => {
      if (!cornerRipplesEnabled) return;
      const rect = el.getBoundingClientRect();
      const x =
        clientX && rect.width > 0
          ? clientX - rect.left
          : isLeft
            ? 24
            : rect.width - 24;
      const y =
        clientY && rect.height > 0
          ? clientY - rect.top
          : isTop
            ? 20
            : rect.height - 20;
      const rippleId = ++rippleSeqRef.current;
      setRipples((prev) => [...prev.slice(-6), { id: rippleId, x, y }]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== rippleId));
      }, 500);
    },
    [cornerRipplesEnabled, isLeft, isTop],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Fallback for synthetic events without active pointer
    }
    const wasEmpty = activePointersRef.current.size === 0;
    activePointersRef.current.add(e.pointerId);
    spawnRipple(e.clientX, e.clientY, e.currentTarget);
    if (wasEmpty) {
      onPressChange(id, true);
    }
  };

  const handlePointerRelease = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size === 0) {
        onPressChange(id, false);
      }
    }
  };

  // Positioning classes for generous invisible capacitive corner touch zones
  const zonePlacement =
    position === 'top-left'
      ? 'top-0 left-0 w-[24vw] min-w-[132px] max-w-[270px] h-[24vh] min-h-[76px] max-h-[145px] items-start justify-start pt-3 pl-4 rounded-br-[36px]'
      : position === 'top-right'
        ? 'top-0 right-0 w-[24vw] min-w-[132px] max-w-[270px] h-[24vh] min-h-[76px] max-h-[145px] items-start justify-end pt-3 pr-4 rounded-bl-[36px]'
        : position === 'bottom-left'
          ? 'bottom-0 left-0 w-[24vw] min-w-[132px] max-w-[270px] h-[23vh] min-h-[76px] max-h-[140px] items-end justify-start pb-3 pl-4 rounded-tr-[36px]'
          : 'bottom-0 right-0 w-[24vw] min-w-[132px] max-w-[270px] h-[23vh] min-h-[76px] max-h-[140px] items-end justify-end pb-3 pr-4 rounded-tl-[36px]';

  const accentColor = accentTheme === 'gold' ? '#d4a853' : '#c81e32';
  const accentSoft =
    accentTheme === 'gold'
      ? `rgba(212, 168, 83, ${0.28 * illuminationIntensity})`
      : `rgba(200, 30, 50, ${0.28 * illuminationIntensity})`;

  const hintLabel =
    binding === 'mouse_left'
      ? 'L-CLICK'
      : binding === 'mouse_right'
        ? 'R-CLICK'
        : ACTION_LABELS[binding].split(' ')[0];

  return (
    <button
      type="button"
      data-testid={`trigger-${id}`}
      aria-label={`${id} Trigger (${ACTION_LABELS[binding]})`}
      aria-pressed={pressed}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
      onContextMenu={(e) => e.preventDefault()}
      className={`controller-surface absolute z-20 flex overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4a853]/60 transition-colors duration-100 ${zonePlacement}`}
      style={{
        background: pressed
          ? `radial-gradient(circle at ${isLeft ? '0%' : '100%'} ${isTop ? '0%' : '100%'}, ${accentSoft} 0%, rgba(18,20,25,0.22) 68%, transparent 100%)`
          : 'transparent',
      }}
    >
      {/* Multiple independent corner ripples */}
      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden="true"
          className="animate-corner-ripple pointer-events-none absolute w-28 h-28 rounded-full"
          style={{
            left: r.x,
            top: r.y,
            border: `1.5px solid ${accentColor}`,
            background: `radial-gradient(circle, ${accentSoft} 0%, transparent 70%)`,
          }}
        />
      ))}

      {/* Integrated hardware-etched shoulder / trigger contour */}
      <div
        className={`relative flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all duration-100 ${
          isTop ? 'mt-0.5' : 'mb-0.5'
        }`}
        style={{
          backgroundColor: pressed ? 'rgba(26, 28, 35, 0.92)' : 'rgba(17, 19, 24, 0.72)',
          borderColor: pressed
            ? accentColor
            : 'rgba(255, 255, 255, 0.08)',
          boxShadow: pressed
            ? `inset 0 1px 0 rgba(255,255,255,0.12), 0 0 18px ${accentSoft}`
            : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 12px rgba(0,0,0,0.45)',
          transform: pressed ? 'translateY(1.5px) scale(0.97)' : 'translateY(0) scale(1)',
        }}
      >
        {/* Subtle edge illumination bar */}
        <span
          aria-hidden="true"
          className={`w-1.5 h-4 rounded-full transition-opacity duration-100 ${
            isLeft ? 'order-first' : 'order-last'
          }`}
          style={{
            backgroundColor: pressed ? accentColor : 'rgba(255,255,255,0.16)',
            opacity: pressed ? 1 : 0.45,
          }}
        />

        <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
          <span className="font-display text-xs font-semibold tracking-wider text-[#e8eaed] leading-none">
            {id}
          </span>
          {showMappingHint && (
            <span className="font-mono-tabular text-[9px] tracking-wide text-[#8c93a3] mt-1 leading-none whitespace-nowrap">
              {hintLabel}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
