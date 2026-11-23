import type {
  ButtonId,
  DPadState,
  StickId,
  TouchpadGesture,
} from '../types/controller';

export type CompanionConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface CompanionBridgeSnapshot {
  status: CompanionConnectionStatus;
  url: string;
  rttMs: number | null;
  lastError: string | null;
  sentCount: number;
}

export type OutgoingProtocolEvent =
  | {
      type: 'button';
      button: ButtonId;
      pressed: boolean;
      timestamp: number;
    }
  | {
      type: 'joystick';
      stick: 'left' | 'right';
      x: number;
      y: number;
      timestamp: number;
    }
  | {
      type: 'trigger';
      trigger: 'L2' | 'R2';
      value: number;
      timestamp: number;
    }
  | {
      type: 'dpad';
      up: boolean;
      down: boolean;
      left: boolean;
      right: boolean;
      timestamp: number;
    }
  | {
      type: 'touchpad';
      action: string;
      x: number;
      y: number;
      timestamp: number;
    }
  | {
      type: 'ping';
      timestamp: number;
    };

export function clampUnit(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Number(Math.max(-1, Math.min(1, val)).toFixed(4));
}

export function clampZeroOne(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Number(Math.max(0, Math.min(1, val)).toFixed(4));
}

export function buildButtonEvent(
  button: ButtonId,
  pressed: boolean,
  timestamp = Date.now(),
): OutgoingProtocolEvent {
  return {
    type: 'button',
    button,
    pressed: Boolean(pressed),
    timestamp: Math.round(timestamp),
  };
}

export function buildTriggerEvent(
  trigger: 'L2' | 'R2',
  pressed: boolean,
  timestamp = Date.now(),
): OutgoingProtocolEvent {
  return {
    type: 'trigger',
    trigger,
    value: pressed ? 1 : 0,
    timestamp: Math.round(timestamp),
  };
}

export function buildJoystickEvent(
  stick: StickId,
  x: number,
  y: number,
  timestamp = Date.now(),
): OutgoingProtocolEvent {
  return {
    type: 'joystick',
    stick: stick === 'LEFT' ? 'left' : 'right',
    x: clampUnit(x),
    y: clampUnit(y),
    timestamp: Math.round(timestamp),
  };
}

export function buildDPadEvent(
  dpad: DPadState,
  timestamp = Date.now(),
): OutgoingProtocolEvent {
  return {
    type: 'dpad',
    up: Boolean(dpad.up),
    down: Boolean(dpad.down),
    left: Boolean(dpad.left),
    right: Boolean(dpad.right),
    timestamp: Math.round(timestamp),
  };
}

export function buildTouchpadEvent(
  action: TouchpadGesture | 'move' | 'down' | 'up',
  x: number,
  y: number,
  timestamp = Date.now(),
): OutgoingProtocolEvent {
  return {
    type: 'touchpad',
    action: String(action).toLowerCase(),
    x: clampZeroOne(x),
    y: clampZeroOne(y),
    timestamp: Math.round(timestamp),
  };
}

export function isValidLocalWebSocketUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return (
      (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    );
  } catch {
    return false;
  }
}

export class CompanionWebSocketBridge {
  private ws: WebSocket | null = null;
  private url = 'ws://127.0.0.1:8765';
  private status: CompanionConnectionStatus = 'disconnected';
  private rttMs: number | null = null;
  private lastError: string | null = null;
  private sentCount = 0;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private autoReconnect = false;
  private onUpdate: (snap: CompanionBridgeSnapshot) => void;

  constructor(onUpdate: (snap: CompanionBridgeSnapshot) => void) {
    this.onUpdate = onUpdate;
  }

  public getSnapshot(): CompanionBridgeSnapshot {
    return {
      status: this.status,
      url: this.url,
      rttMs: this.rttMs,
      lastError: this.lastError,
      sentCount: this.sentCount,
    };
  }

  private emit() {
    this.onUpdate(this.getSnapshot());
  }

  public connect(targetUrl: string, autoReconnect = true) {
    if (!isValidLocalWebSocketUrl(targetUrl)) {
      this.status = 'error';
      this.lastError = 'Only ws://127.0.0.1:<port> or localhost URLs are permitted.';
      this.emit();
      return;
    }

    this.disconnect(false);
    this.url = targetUrl.trim();
    this.autoReconnect = autoReconnect;
    this.status = 'connecting';
    this.lastError = null;
    this.emit();

    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.status = 'connected';
        this.lastError = null;
        this.emit();
        this.startHeartbeat();
      };

      ws.onmessage = (msg) => {
        if (this.ws !== ws || typeof msg.data !== 'string') return;
        try {
          const parsed = JSON.parse(msg.data) as { type?: string; timestamp?: number };
          if (parsed.type === 'pong' && typeof parsed.timestamp === 'number') {
            this.rttMs = Math.max(0, Math.round(performance.now() - parsed.timestamp));
            this.emit();
          }
        } catch {
          // Ignore non-JSON or unrelated messages
        }
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        this.lastError = 'Unable to reach Phantom Companion on ' + this.url;
        this.status = 'error';
        this.emit();
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.stopHeartbeat();
        this.ws = null;
        if (this.status !== 'error') {
          this.status = 'disconnected';
        }
        this.emit();
        if (this.autoReconnect) {
          this.reconnectTimer = window.setTimeout(() => {
            if (this.autoReconnect) {
              this.connect(this.url, true);
            }
          }, 2500);
        }
      };
    } catch (err) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : 'WebSocket connection failed.';
      this.emit();
    }
  }

  public disconnect(disableReconnect = true) {
    if (disableReconnect) {
      this.autoReconnect = false;
    }
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnected');
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
    this.status = 'disconnected';
    this.rttMs = null;
    this.emit();
  }

  public sendEvent(event: OutgoingProtocolEvent) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(event));
      this.sentCount += 1;
    } catch {
      // Handled via onerror/onclose
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = window.setInterval(() => {
      this.sendEvent({ type: 'ping', timestamp: Math.round(performance.now()) });
    }, 2000);
  }

  private stopHeartbeat() {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
