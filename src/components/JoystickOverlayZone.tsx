import { useRef } from 'react';
import type { StickId, StickVector } from '../types/controller';
import { computeStickOutput } from '../utils/controllerMath';

interface JoystickOverlayZoneProps {
  id: StickId;
  bounds: { x: number; y: number; radius: number };
  deadzone: number;
  sensitivity: number;
  invertY?: boolean;
  onStickChange: (
    id: StickId,
    vector: StickVector,
    rawNormX: number,
    rawNormY: number,
  ) => void;
}

export function JoystickOverlayZone({
  id,
  bounds,
  deadzone,
  sensitivity,
  invertY = false,
  onStickChange,
}: JoystickOverlayZoneProps) {
  const activePointerRef = useRef<number | null>(null);

  const updateFromClient = (clientX: number, clientY: number) => {
    const dx = clientX - bounds.x;
    const dy = clientY - bounds.y;
    const maxThrow = Math.max(36, bounds.radius * 0.72);
    const vec = computeStickOutput(dx, dy, maxThrow, deadzone, sensitivity, invertY);
    onStickChange(id, vec, vec.rawX, vec.rawY);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (activePointerRef.current !== null) return;
    activePointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Fallback for synthetic pointer events
    }
    updateFromClient(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== e.pointerId) return;
    e.preventDefault();
    updateFromClient(e.clientX, e.clientY);
  };

  const handlePointerRelease = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== e.pointerId) return;
    e.preventDefault();
    activePointerRef.current = null;
    onStickChange(
      id,
      { x: 0, y: 0, rawX: 0, rawY: 0, magnitude: 0, active: false },
      0,
      0,
    );
  };

  // Hit target extends slightly outside outer bezel for comfortable thumb acquisition
  const diameter = Math.max(96, bounds.radius * 2.25);

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`${id === 'LEFT' ? 'Left Movement' : 'Right Aim'} Analog Stick`}
      aria-valuetext="Analog stick"
      data-testid={`stick-zone-${id}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
      onContextMenu={(e) => e.preventDefault()}
      className="controller-surface absolute z-10 rounded-full cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4a853]/70"
      style={{
        width: `${diameter}px`,
        height: `${diameter}px`,
        left: `${bounds.x - diameter / 2}px`,
        top: `${bounds.y - diameter / 2}px`,
      }}
    />
  );
}
