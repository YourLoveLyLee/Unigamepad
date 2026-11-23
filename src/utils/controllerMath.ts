import type {
  ActionBinding,
  ControllerSettings,
  DPadState,
  GyroOrientation,
  StickVector,
  TouchpadGesture,
} from '../types/controller';

export const ACTION_LABELS: Record<ActionBinding, string> = {
  mouse_left: 'Mouse Left Click',
  mouse_right: 'Mouse Right Click',
  fire: 'Primary Fire',
  aim_ads: 'Aim Down Sights',
  jump: 'Jump / Vault',
  crouch: 'Crouch / Slide',
  reload: 'Reload',
  interact: 'Interact / Loot',
  melee: 'Melee / Finisher',
  tactical: 'Tactical Gear',
  lethal: 'Lethal Grenade',
  sprint: 'Tactical Sprint',
  map: 'Tactical Map',
  inventory: 'Backpack / Inventory',
  scoreboard: 'Scoreboard',
  ping: 'World Ping',
  quick_heal: 'Quick Heal / Armor',
  weapon_swap: 'Swap Weapon',
  dpad_up: 'D-Pad Up',
  dpad_down: 'D-Pad Down',
  dpad_left: 'D-Pad Left',
  dpad_right: 'D-Pad Right',
};

export const DEFAULT_SETTINGS: ControllerSettings = {
  mappings: {
    L1: 'mouse_left',
    R1: 'fire',
    L2: 'mouse_right',
    R2: 'aim_ads',
    TRIANGLE: 'weapon_swap',
    CIRCLE: 'crouch',
    CROSS: 'jump',
    SQUARE: 'reload',
    UP: 'dpad_up',
    DOWN: 'dpad_down',
    LEFT: 'dpad_left',
    RIGHT: 'dpad_right',
    TOUCHPAD_CLICK: 'map',
    touchpadTap: 'ping',
    touchpadSwipeUp: 'scoreboard',
    touchpadSwipeDown: 'inventory',
    touchpadSwipeLeft: 'quick_heal',
    touchpadSwipeRight: 'tactical',
  },
  sticks: {
    leftSensitivity: 1.0,
    leftDeadzone: 0.08,
    rightSensitivity: 1.15,
    rightDeadzone: 0.06,
    stickSize: 1.0,
    invertRightY: false,
  },
  gyro: {
    enabled: false,
    sensitivity: 1.2,
    deadzone: 0.05,
    invertX: false,
    invertY: false,
    holdToAim: 'L2',
  },
  haptics: {
    enabled: true,
    buttonDurationMs: 14,
    triggerDurationMs: 22,
    touchpadDurationMs: 18,
  },
  visuals: {
    cornerRipples: true,
    illuminationIntensity: 0.85,
    showMappingHints: true,
    layoutSpread: 1.0,
    accentTheme: 'crimson',
  },
  companion: {
    url: 'ws://127.0.0.1:8765',
    autoConnect: false,
  },
  diagnosticsEnabled: false,
};

export const PRESET_PROFILES: Record<
  'fps_pro' | 'battle_royale' | 'gyro_sniper',
  { label: string; description: string; patch: Partial<ControllerSettings> }
> = {
  fps_pro: {
    label: 'FPS Competitive',
    description: 'L1 Mouse Left Click, R1 Primary Fire, L2 Mouse Right Click, tight aim deadzone.',
    patch: {
      mappings: {
        ...DEFAULT_SETTINGS.mappings,
        L1: 'mouse_left',
        R1: 'fire',
        L2: 'mouse_right',
        R2: 'aim_ads',
        CROSS: 'jump',
        CIRCLE: 'crouch',
        SQUARE: 'reload',
        TRIANGLE: 'weapon_swap',
      },
      sticks: {
        ...DEFAULT_SETTINGS.sticks,
        rightSensitivity: 1.3,
        rightDeadzone: 0.04,
      },
    },
  },
  battle_royale: {
    label: 'Battle Royale Claw',
    description: 'Quick armor & backpack touchpad swipes, L1/R1 triggers, fast looting layout.',
    patch: {
      mappings: {
        ...DEFAULT_SETTINGS.mappings,
        L1: 'aim_ads',
        R1: 'mouse_left',
        L2: 'mouse_right',
        R2: 'lethal',
        SQUARE: 'interact',
        touchpadSwipeUp: 'map',
        touchpadSwipeDown: 'inventory',
        touchpadSwipeLeft: 'quick_heal',
        touchpadTap: 'ping',
      },
      sticks: {
        ...DEFAULT_SETTINGS.sticks,
        leftSensitivity: 1.1,
        rightSensitivity: 1.25,
      },
    },
  },
  gyro_sniper: {
    label: 'Gyro Precision',
    description: 'Hold-to-aim gyro on L2 with micro-aim deadzone and damped right stick.',
    patch: {
      gyro: {
        enabled: true,
        sensitivity: 1.45,
        deadzone: 0.03,
        invertX: false,
        invertY: false,
        holdToAim: 'L2',
      },
      sticks: {
        ...DEFAULT_SETTINGS.sticks,
        rightSensitivity: 0.9,
        rightDeadzone: 0.08,
      },
    },
  },
};

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes normalized 360-degree analog stick coordinates with radial deadzone
 * rescaling and sensitivity response curve.
 */
export function computeStickOutput(
  dx: number,
  dy: number,
  maxRadius: number,
  deadzone: number,
  sensitivity: number,
  invertY = false,
): StickVector {
  if (maxRadius <= 0) {
    return { x: 0, y: 0, rawX: 0, rawY: 0, magnitude: 0, active: false };
  }

  const rawNormX = dx / maxRadius;
  // Screen dy is +down, controller Y is +up unless inverted
  const rawNormY = (invertY ? 1 : -1) * (dy / maxRadius);

  const rawMag = Math.hypot(rawNormX, rawNormY);
  const clampedRawMag = Math.min(1, rawMag);
  const dirX = rawMag > 1e-6 ? rawNormX / rawMag : 0;
  const dirY = rawMag > 1e-6 ? rawNormY / rawMag : 0;

  const clampedRawX = dirX * clampedRawMag;
  const clampedRawY = dirY * clampedRawMag;

  const safeDz = clamp(deadzone, 0, 0.65);
  if (clampedRawMag <= safeDz) {
    return {
      x: 0,
      y: 0,
      rawX: Number(clampedRawX.toFixed(4)),
      rawY: Number(clampedRawY.toFixed(4)),
      magnitude: 0,
      active: false,
    };
  }

  const rescaled = (clampedRawMag - safeDz) / (1 - safeDz);
  const curved = clamp(Math.pow(rescaled, 1.1) * sensitivity, 0, 1);

  return {
    x: Number(clamp(dirX * curved, -1, 1).toFixed(4)),
    y: Number(clamp(dirY * curved, -1, 1).toFixed(4)),
    rawX: Number(clampedRawX.toFixed(4)),
    rawY: Number(clampedRawY.toFixed(4)),
    magnitude: Number(curved.toFixed(4)),
    active: true,
  };
}

/**
 * Computes 8-way D-Pad state (cardinals + diagonals) from a pointer offset
 * relative to the D-Pad center.
 */
export function computeDPadDirections(
  dx: number,
  dy: number,
  radius: number,
  centerDeadzoneRatio = 0.22,
): DPadState {
  if (radius <= 0) {
    return { up: false, down: false, left: false, right: false };
  }
  const dist = Math.hypot(dx, dy);
  if (dist < radius * centerDeadzoneRatio) {
    return { up: false, down: false, left: false, right: false };
  }

  // Angle in degrees where 0 = right, 90 = down, -90 = up, 180/-180 = left
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Each cardinal sector spans +-67.5 deg around its axis, creating 45 deg diagonal overlap bands
  const right = angleDeg >= -67.5 && angleDeg <= 67.5;
  const down = angleDeg >= 22.5 && angleDeg <= 157.5;
  const left = angleDeg >= 112.5 || angleDeg <= -112.5;
  const up = angleDeg <= -22.5 && angleDeg >= -157.5;

  return { up, down, left, right };
}

/**
 * Wraps an angular delta into [-180, 180] degrees so 359 -> 1 transitions smoothly.
 */
export function normalizeAngleDelta(currentDeg: number, zeroDeg: number): number {
  let diff = ((currentDeg - zeroDeg + 180) % 360 + 360) % 360 - 180;
  if (diff < -180) diff += 360;
  return diff;
}

/**
 * Converts DeviceOrientationEvent reading relative to calibrated zero pose into
 * separate normalized gyroscope aim deltas. Never fabricates readings if sensors are null.
 */
export function computeGyroDelta(
  current: GyroOrientation,
  zero: GyroOrientation,
  deadzone: number,
  sensitivity: number,
  invertX: boolean,
  invertY: boolean,
): { deltaX: number; deltaY: number; available: boolean } {
  if (
    current.alpha === null ||
    current.gamma === null ||
    current.beta === null ||
    zero.alpha === null ||
    zero.gamma === null ||
    zero.beta === null
  ) {
    return { deltaX: 0, deltaY: 0, available: false };
  }

  // In landscape phone orientation, alpha (yaw) and beta/gamma map to aim axes
  const rawYaw = normalizeAngleDelta(current.alpha, zero.alpha);
  const rawPitch = normalizeAngleDelta(current.beta, zero.beta);

  // Normalize ~30 degrees tilt/turn to full scale 1.0 before sensitivity
  const normX = clamp(-rawYaw / 30, -1.5, 1.5);
  const normY = clamp(rawPitch / 30, -1.5, 1.5);

  const safeDz = clamp(deadzone, 0, 0.5);
  const applyAxis = (val: number, invert: boolean): number => {
    const abs = Math.abs(val);
    if (abs <= safeDz) return 0;
    const scaled = ((abs - safeDz) / (1 - safeDz)) * sensitivity;
    const signed = Math.sign(val) * clamp(scaled, 0, 1);
    return Number((invert ? -signed : signed).toFixed(4));
  };

  return {
    deltaX: applyAxis(normX, invertX),
    deltaY: applyAxis(normY, invertY),
    available: true,
  };
}

/**
 * Classifies touchpad release into tap, double-tap, or directional swipe.
 */
export function classifyTouchpadGesture(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  durationMs: number,
  isDoubleTap: boolean,
): TouchpadGesture {
  const dx = endX - startX;
  const dy = endY - startY;
  const dist = Math.hypot(dx, dy);

  // Normalized coordinates (0..1 across touchpad)
  if (dist >= 0.16 && durationMs <= 500) {
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'SWIPE_RIGHT' : 'SWIPE_LEFT';
    }
    return dy > 0 ? 'SWIPE_DOWN' : 'SWIPE_UP';
  }

  if (dist < 0.08 && durationMs <= 280) {
    return isDoubleTap ? 'DOUBLE_TAP' : 'TAP';
  }

  return 'TOUCH';
}
