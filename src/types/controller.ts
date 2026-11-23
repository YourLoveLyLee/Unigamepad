export type TriggerId = 'L1' | 'R1' | 'L2' | 'R2';
export type FaceButtonId = 'TRIANGLE' | 'CIRCLE' | 'CROSS' | 'SQUARE';
export type DPadDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type StickId = 'LEFT' | 'RIGHT';

export type ButtonId =
  | TriggerId
  | FaceButtonId
  | DPadDirection
  | 'TOUCHPAD_CLICK';

export type TouchpadGesture =
  | 'IDLE'
  | 'TOUCH'
  | 'TAP'
  | 'DOUBLE_TAP'
  | 'SWIPE_UP'
  | 'SWIPE_DOWN'
  | 'SWIPE_LEFT'
  | 'SWIPE_RIGHT'
  | 'CLICK';

export type ActionBinding =
  | 'mouse_left'
  | 'mouse_right'
  | 'fire'
  | 'aim_ads'
  | 'jump'
  | 'crouch'
  | 'reload'
  | 'interact'
  | 'melee'
  | 'tactical'
  | 'lethal'
  | 'sprint'
  | 'map'
  | 'inventory'
  | 'scoreboard'
  | 'ping'
  | 'quick_heal'
  | 'weapon_swap'
  | 'dpad_up'
  | 'dpad_down'
  | 'dpad_left'
  | 'dpad_right';

export interface StickVector {
  x: number;
  y: number;
  rawX: number;
  rawY: number;
  magnitude: number;
  active: boolean;
}

export interface DPadState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface TouchpadContact {
  id: number;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface TouchpadState {
  contacts: TouchpadContact[];
  lastX: number;
  lastY: number;
  gesture: TouchpadGesture;
  clicked: boolean;
  lastGestureAt: number;
}

export interface GyroOrientation {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
}

export interface GyroState {
  supported: boolean;
  permissionState: 'unknown' | 'granted' | 'denied' | 'unavailable';
  active: boolean;
  raw: GyroOrientation;
  deltaX: number;
  deltaY: number;
  lastTimestamp: number | null;
}

export interface InputEventEntry {
  id: number;
  timestamp: number;
  source: string;
  detail: string;
}

export type HoldToAimTrigger = 'ALWAYS' | 'L2' | 'L1' | 'R1' | 'TOUCHPAD';

export interface ControllerSettings {
  mappings: Record<ButtonId, ActionBinding> & {
    touchpadTap: ActionBinding;
    touchpadSwipeUp: ActionBinding;
    touchpadSwipeDown: ActionBinding;
    touchpadSwipeLeft: ActionBinding;
    touchpadSwipeRight: ActionBinding;
  };
  sticks: {
    leftSensitivity: number;
    leftDeadzone: number;
    rightSensitivity: number;
    rightDeadzone: number;
    stickSize: number; // 0.8 to 1.25 scale
    invertRightY: boolean;
  };
  gyro: {
    enabled: boolean;
    sensitivity: number;
    deadzone: number;
    invertX: boolean;
    invertY: boolean;
    holdToAim: HoldToAimTrigger;
  };
  haptics: {
    enabled: boolean;
    buttonDurationMs: number;
    triggerDurationMs: number;
    touchpadDurationMs: number;
  };
  visuals: {
    cornerRipples: boolean;
    illuminationIntensity: number; // 0.3 to 1.0
    showMappingHints: boolean;
    layoutSpread: number; // 0.9 to 1.1
    accentTheme: 'crimson' | 'gold';
  };
  companion: {
    url: string;
    autoConnect: boolean;
  };
  diagnosticsEnabled: boolean;
}

export interface JoystickScreenBounds {
  left: { x: number; y: number; radius: number };
  right: { x: number; y: number; radius: number };
}
