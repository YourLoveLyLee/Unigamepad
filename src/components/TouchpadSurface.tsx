import { useRef, useState } from 'react';
import type { TouchpadContact, TouchpadGesture } from '../types/controller';
import { classifyTouchpadGesture } from '../utils/controllerMath';

interface TouchpadSurfaceProps {
  illuminationIntensity: number;
  accentTheme: 'crimson' | 'gold';
  lastGesture: TouchpadGesture;
  clicked: boolean;
  onContactsChange: (contacts: TouchpadContact[]) => void;
  onGesture: (gesture: TouchpadGesture, x: number, y: number) => void;
  onClickStateChange: (clicked: boolean) => void;
}

interface PointerTrack {
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastY: number;
}

interface PingEffect {
  id: number;
  xPct: number;
  yPct: number;
}

export function TouchpadSurface({
  illuminationIntensity,
  accentTheme,
  lastGesture,
  clicked,
  onContactsChange,
  onGesture,
  onClickStateChange,
}: TouchpadSurfaceProps) {
  const tracksRef = useRef<Map<number, PointerTrack>>(new Map());
  const lastTapTimeRef = useRef<number>(0);
  const pingSeqRef = useRef(0);
  const [contacts, setContacts] = useState<TouchpadContact[]>([]);
  const [pings, setPings] = useState<PingEffect[]>([]);

  const accentHex = accentTheme === 'gold' ? '#d4a853' : '#c81e32';
  const activeCount = contacts.length;

  const getNormalizedCoords = (
    e: React.PointerEvent<HTMLDivElement>,
    el: HTMLDivElement,
  ) => {
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) };
  };

  const syncContacts = () => {
    const list: TouchpadContact[] = Array.from(tracksRef.current.entries()).map(
      ([id, t]) => ({ id, x: t.lastX, y: t.lastY }),
    );
    setContacts(list);
    onContactsChange(list);
  };

  const spawnPing = (x: number, y: number) => {
    const pingId = ++pingSeqRef.current;
    setPings((prev) => [...prev.slice(-4), { id: pingId, xPct: x * 100, yPct: y * 100 }]);
    window.setTimeout(() => {
      setPings((prev) => prev.filter((p) => p.id !== pingId));
    }, 380);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
    const { x, y } = getNormalizedCoords(e, e.currentTarget);
    tracksRef.current.set(e.pointerId, {
      startX: x,
      startY: y,
      startTime: performance.now(),
      lastX: x,
      lastY: y,
    });
    syncContacts();
    onGesture('TOUCH', x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = tracksRef.current.get(e.pointerId);
    if (!track) return;
    const { x, y } = getNormalizedCoords(e, e.currentTarget);
    track.lastX = x;
    track.lastY = y;
    syncContacts();
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = tracksRef.current.get(e.pointerId);
    if (!track) return;
    const { x, y } = getNormalizedCoords(e, e.currentTarget);
    const duration = performance.now() - track.startTime;
    const now = performance.now();
    const isDoubleTap = now - lastTapTimeRef.current < 320;

    const gesture = classifyTouchpadGesture(
      track.startX,
      track.startY,
      x,
      y,
      duration,
      isDoubleTap,
    );

    if (gesture === 'TAP') {
      lastTapTimeRef.current = now;
      spawnPing(x, y);
    } else if (gesture === 'DOUBLE_TAP') {
      lastTapTimeRef.current = 0;
      spawnPing(x, y);
    }

    tracksRef.current.delete(e.pointerId);
    syncContacts();
    onGesture(gesture, x, y);
  };

  const triggerTouchpadClick = (isDown: boolean) => {
    onClickStateChange(isDown);
    if (isDown) {
      onGesture('CLICK', 0.5, 0.5);
    }
  };

  return (
    <div className="relative flex flex-col items-center w-full max-w-[230px] sm:max-w-[290px] md:max-w-[350px]">
      {/* DualSense-proportioned wide rectangular capacitive touchpad */}
      <div
        role="region"
        aria-label="Controller Touchpad"
        data-testid="controller-touchpad"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={() => {
          triggerTouchpadClick(true);
          window.setTimeout(() => triggerTouchpadClick(false), 120);
        }}
        className="controller-surface relative w-full h-[50px] sm:h-[64px] md:h-[84px] rounded-[16px] border overflow-hidden cursor-crosshair transition-transform duration-100"
        style={{
          background:
            'linear-gradient(180deg, #17191f 0%, #121419 55%, #0e1014 100%)',
          borderColor:
            activeCount > 0 || clicked
              ? accentHex
              : 'rgba(255, 255, 255, 0.09)',
          boxShadow: clicked
            ? `inset 0 4px 14px rgba(0,0,0,0.85), 0 0 18px rgba(200,30,50,${0.25 * illuminationIntensity})`
            : 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -6px 14px rgba(0,0,0,0.55), 0 10px 24px rgba(0,0,0,0.5)',
          transform: clicked ? 'translateY(2px) scale(0.992)' : 'translateY(0) scale(1)',
        }}
      >
        {/* Subtle micro-dot hardware surface pattern */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.35) 0.75px, transparent 0.75px)',
            backgroundSize: '8px 8px',
          }}
        />

        {/* Restrained DualSense upper light bar */}
        <div
          aria-hidden="true"
          className="absolute top-0 left-5 right-5 h-[2.5px] rounded-b-full transition-all duration-150"
          style={{
            backgroundColor:
              activeCount > 0 || clicked ? accentHex : 'rgba(212, 168, 83, 0.28)',
            opacity:
              activeCount > 0 || clicked
                ? Math.min(1, 0.55 + illuminationIntensity * 0.45)
                : 0.35,
            boxShadow:
              activeCount > 0 || clicked
                ? `0 2px 10px ${accentHex}`
                : 'none',
          }}
        />

        {/* Multi-touch contact indicators */}
        {contacts.map((c) => (
          <span
            key={c.id}
            aria-hidden="true"
            className="pointer-events-none absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{
              left: `${c.x * 100}%`,
              top: `${c.y * 100}%`,
              borderColor: accentHex,
              background: `radial-gradient(circle, rgba(212,168,83,0.28) 0%, transparent 72%)`,
            }}
          />
        ))}

        {/* Tap ping ripples */}
        {pings.map((p) => (
          <span
            key={p.id}
            aria-hidden="true"
            className="animate-touchpad-ping pointer-events-none absolute w-10 h-10 rounded-full border"
            style={{
              left: `${p.xPct}%`,
              top: `${p.yPct}%`,
              borderColor: accentHex,
            }}
          />
        ))}

        {/* Restrained center micro-etching */}
        <div className="absolute inset-x-0 bottom-1.5 flex items-center justify-center pointer-events-none">
          <span className="font-mono-tabular text-[9px] tracking-[0.18em] text-[#6d7485]">
            {activeCount > 0
              ? `${activeCount} PT`
              : lastGesture !== 'IDLE'
                ? lastGesture.replace('_', ' ')
                : 'TOUCHPAD'}
          </span>
        </div>
      </div>

      {/* Tactile mechanical click bar underneath touchpad */}
      <button
        type="button"
        data-testid="touchpad-click-btn"
        aria-label="Touchpad Click"
        aria-pressed={clicked}
        onPointerDown={(e) => {
          e.preventDefault();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          triggerTouchpadClick(true);
        }}
        onPointerUp={() => triggerTouchpadClick(false)}
        onPointerCancel={() => triggerTouchpadClick(false)}
        className="controller-surface mt-1.5 px-4 py-1 rounded-b-lg text-[9px] font-mono-tabular tracking-[0.2em] text-[#7b8294] hover:text-[#c7ccd8] bg-[#13151b]/90 border border-white/10 active:translate-y-[1px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4a853]"
      >
        PAD CLICK
      </button>
    </div>
  );
}
