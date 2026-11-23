export type HapticPatternId = 'tap' | 'double' | 'burst' | 'heavy';

export const HAPTIC_PATTERNS: Record<
  HapticPatternId,
  { label: string; sequence: number[] }
> = {
  tap: { label: 'Single Pulse', sequence: [18] },
  double: { label: 'Double Click', sequence: [16, 45, 20] },
  burst: { label: '3-Round Burst', sequence: [14, 38, 14, 38, 22] },
  heavy: { label: 'Trigger Detent', sequence: [36] },
};

interface PhantomNativeBridge {
  vibrate?: (durationMs: number) => void;
}

function getNativeBridge(): PhantomNativeBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { PhantomNative?: PhantomNativeBridge }).PhantomNative;
}

export function isHapticsSupported(): boolean {
  if (getNativeBridge()?.vibrate) return true;
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  );
}

export function triggerHaptic(durationMs: number, enabled: boolean): boolean {
  if (!enabled || durationMs <= 0 || !isHapticsSupported()) {
    return false;
  }
  const clamped = Math.min(120, Math.max(4, Math.round(durationMs)));
  const native = getNativeBridge();
  if (native?.vibrate) {
    try {
      native.vibrate(clamped);
      return true;
    } catch {
      // Fallback to navigator.vibrate
    }
  }
  try {
    return navigator.vibrate(clamped);
  } catch {
    return false;
  }
}

export function playHapticPattern(
  patternId: HapticPatternId,
  enabled: boolean,
): boolean {
  if (!enabled || !isHapticsSupported()) {
    return false;
  }
  const sequence = HAPTIC_PATTERNS[patternId].sequence;
  const native = getNativeBridge();
  if (native?.vibrate) {
    try {
      native.vibrate(sequence[0] ?? 18);
      return true;
    } catch {
      // Fallback
    }
  }
  try {
    return navigator.vibrate(sequence);
  } catch {
    return false;
  }
}
