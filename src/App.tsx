import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Settings } from 'lucide-react';
import { DiagnosticsOverlay } from './components/DiagnosticsOverlay';
import { DPad } from './components/DPad';
import { EdgeTriggerZone } from './components/EdgeTriggerZone';
import { FaceButtons } from './components/FaceButtons';
import { JoystickOverlayZone } from './components/JoystickOverlayZone';
import { SettingsModal } from './components/SettingsModal';
import { ThreeJoystickCanvas } from './components/ThreeJoystickCanvas';
import { TouchpadSurface } from './components/TouchpadSurface';
import type {
  ButtonId,
  ControllerSettings,
  DPadState,
  FaceButtonId,
  GyroOrientation,
  GyroState,
  InputEventEntry,
  JoystickScreenBounds,
  StickId,
  StickVector,
  TouchpadContact,
  TouchpadGesture,
  TouchpadState,
  TriggerId,
} from './types/controller';
import {
  ACTION_LABELS,
  computeGyroDelta,
} from './utils/controllerMath';
import {
  buildButtonEvent,
  buildDPadEvent,
  buildJoystickEvent,
  buildTouchpadEvent,
  buildTriggerEvent,
  CompanionWebSocketBridge,
  type CompanionBridgeSnapshot,
} from './utils/companionBridge';
import { triggerHaptic } from './utils/haptics';
import { clearSettings, loadSettings, saveSettings } from './utils/storage';

const ZERO_STICK: StickVector = {
  x: 0,
  y: 0,
  rawX: 0,
  rawY: 0,
  magnitude: 0,
  active: false,
};

export default function App() {
  const [settings, setSettings] = useState<ControllerSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  const [triggers, setTriggers] = useState<Record<TriggerId, boolean>>({
    L1: false,
    R1: false,
    L2: false,
    R2: false,
  });

  const [faceButtons, setFaceButtons] = useState<Record<FaceButtonId, boolean>>({
    TRIANGLE: false,
    CIRCLE: false,
    CROSS: false,
    SQUARE: false,
  });

  const [dpad, setDpad] = useState<DPadState>({
    up: false,
    down: false,
    left: false,
    right: false,
  });

  const [touchpad, setTouchpad] = useState<TouchpadState>({
    contacts: [],
    lastX: 0.5,
    lastY: 0.5,
    gesture: 'IDLE',
    clicked: false,
    lastGestureAt: 0,
  });

  // High-frequency stick refs for zero-React-rerender 3D WebGL updates
  const leftStickTargetRef = useRef({ rawX: 0, rawY: 0, active: false });
  const rightStickTargetRef = useRef({ rawX: 0, rawY: 0, active: false });
  const renderTriggerRef = useRef<(() => void) | null>(null);

  // Throttled / diagnostics stick state
  const [leftStickDiag, setLeftStickDiag] = useState<StickVector>(ZERO_STICK);
  const [rightStickDiag, setRightStickDiag] = useState<StickVector>(ZERO_STICK);
  const lastDiagPushRef = useRef<number>(0);

  const [joystickBounds, setJoystickBounds] = useState<JoystickScreenBounds>({
    left: { x: 260, y: 520, radius: 75 },
    right: { x: 960, y: 520, radius: 75 },
  });

  // Gyroscope state (strictly from real DeviceOrientationEvent, never fabricated)
  const gyroZeroRef = useRef<GyroOrientation>({ alpha: null, beta: null, gamma: null });
  const latestGyroRawRef = useRef<GyroOrientation>({ alpha: null, beta: null, gamma: null });
  const [gyroState, setGyroState] = useState<GyroState>({
    supported: typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
    permissionState: 'unknown',
    active: false,
    raw: { alpha: null, beta: null, gamma: null },
    deltaX: 0,
    deltaY: 0,
    lastTimestamp: null,
  });

  const eventSeqRef = useRef(0);
  const [eventHistory, setEventHistory] = useState<InputEventEntry[]>([]);
  const bridgeRef = useRef<CompanionWebSocketBridge | null>(null);
  const [companionState, setCompanionState] = useState<CompanionBridgeSnapshot>({
    status: 'disconnected',
    url: 'ws://127.0.0.1:8765',
    rttMs: null,
    lastError: null,
    sentCount: 0,
  });

  useEffect(() => {
    const bridge = new CompanionWebSocketBridge((snap) => {
      setCompanionState(snap);
    });
    bridgeRef.current = bridge;
    if (settings.companion.autoConnect) {
      bridge.connect(settings.companion.url, true);
    }
    return () => {
      bridge.disconnect(true);
      bridgeRef.current = null;
    };
  }, []);

  const pushEvent = useCallback(
    (source: string, detail: string) => {
      const entry: InputEventEntry = {
        id: ++eventSeqRef.current,
        timestamp: Math.round(performance.now()),
        source,
        detail,
      };
      setEventHistory((prev) => [entry, ...prev.slice(0, 29)]);
    },
    [],
  );

  // Persist settings to localStorage whenever changed
  const updateSettings = useCallback((next: ControllerSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const handleResetSettings = useCallback(() => {
    const fresh = clearSettings();
    setSettings(fresh);
  }, []);

  // Track viewport orientation & fullscreen state
  useEffect(() => {
    const checkLayout = () => {
      setIsPortrait(window.innerHeight > window.innerWidth * 1.05);
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    checkLayout();
    window.addEventListener('resize', checkLayout);
    document.addEventListener('fullscreenchange', checkLayout);
    return () => {
      window.removeEventListener('resize', checkLayout);
      document.removeEventListener('fullscreenchange', checkLayout);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Some iFrames or browsers disallow fullscreen requests silently
    }
  }, []);

  // Determine whether gyro hold-to-aim condition is satisfied
  const gyroHoldSatisfied = useMemo(() => {
    if (!settings.gyro.enabled) return false;
    switch (settings.gyro.holdToAim) {
      case 'ALWAYS':
        return true;
      case 'L2':
        return triggers.L2;
      case 'L1':
        return triggers.L1;
      case 'R1':
        return triggers.R1;
      case 'TOUCHPAD':
        return touchpad.contacts.length > 0 || touchpad.clicked;
    }
  }, [settings.gyro.enabled, settings.gyro.holdToAim, triggers, touchpad.contacts.length, touchpad.clicked]);

  // Real DeviceOrientationEvent listener
  useEffect(() => {
    if (!settings.gyro.enabled || typeof window === 'undefined') {
      setGyroState((prev) => ({ ...prev, active: false, deltaX: 0, deltaY: 0 }));
      return;
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const raw: GyroOrientation = {
        alpha: e.alpha ?? null,
        beta: e.beta ?? null,
        gamma: e.gamma ?? null,
      };
      latestGyroRawRef.current = raw;

      if (
        gyroZeroRef.current.alpha === null &&
        raw.alpha !== null &&
        raw.beta !== null &&
        raw.gamma !== null
      ) {
        gyroZeroRef.current = { ...raw };
      }

      if (!gyroHoldSatisfied) {
        setGyroState((prev) => ({
          ...prev,
          supported: raw.alpha !== null,
          permissionState: raw.alpha !== null ? 'granted' : prev.permissionState,
          active: false,
          raw,
          deltaX: 0,
          deltaY: 0,
          lastTimestamp: Math.round(performance.now()),
        }));
        return;
      }

      const computed = computeGyroDelta(
        raw,
        gyroZeroRef.current,
        settings.gyro.deadzone,
        settings.gyro.sensitivity,
        settings.gyro.invertX,
        settings.gyro.invertY,
      );

      setGyroState({
        supported: computed.available,
        permissionState: computed.available ? 'granted' : 'unavailable',
        active: computed.available,
        raw,
        deltaX: computed.deltaX,
        deltaY: computed.deltaY,
        lastTimestamp: Math.round(performance.now()),
      });
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [
    settings.gyro.enabled,
    settings.gyro.deadzone,
    settings.gyro.sensitivity,
    settings.gyro.invertX,
    settings.gyro.invertY,
    gyroHoldSatisfied,
  ]);

  const requestGyroPermission = useCallback(async () => {
    try {
      const DevOrient = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (DevOrient && typeof DevOrient.requestPermission === 'function') {
        const res = await DevOrient.requestPermission();
        setGyroState((prev) => ({ ...prev, permissionState: res }));
        if (res === 'granted') {
          updateSettings({
            ...settings,
            gyro: { ...settings.gyro, enabled: true },
          });
        }
      } else {
        updateSettings({
          ...settings,
          gyro: { ...settings.gyro, enabled: true },
        });
      }
    } catch {
      setGyroState((prev) => ({ ...prev, permissionState: 'denied' }));
    }
  }, [settings, updateSettings]);

  const recalibrateGyro = useCallback(() => {
    gyroZeroRef.current = { ...latestGyroRawRef.current };
    pushEvent('GYRO', 'Recalibrated zero pose');
  }, [pushEvent]);

  // Trigger handlers
  const handleTriggerChange = useCallback(
    (id: TriggerId, isPressed: boolean) => {
      setTriggers((prev) => {
        if (prev[id] === isPressed) return prev;
        return { ...prev, [id]: isPressed };
      });
      if (id === 'L2' || id === 'R2') {
        bridgeRef.current?.sendEvent(buildTriggerEvent(id, isPressed));
      } else {
        bridgeRef.current?.sendEvent(buildButtonEvent(id, isPressed));
      }
      if (isPressed) {
        triggerHaptic(settings.haptics.triggerDurationMs, settings.haptics.enabled);
        pushEvent(id, `Pressed -> ${ACTION_LABELS[settings.mappings[id]]}`);
      } else {
        pushEvent(id, 'Released');
      }
    },
    [settings.haptics, settings.mappings, pushEvent],
  );

  // Face button handlers
  const handleFaceButtonChange = useCallback(
    (id: FaceButtonId, isPressed: boolean) => {
      setFaceButtons((prev) => {
        if (prev[id] === isPressed) return prev;
        return { ...prev, [id]: isPressed };
      });
      bridgeRef.current?.sendEvent(buildButtonEvent(id, isPressed));
      if (isPressed) {
        triggerHaptic(settings.haptics.buttonDurationMs, settings.haptics.enabled);
        pushEvent(id, `Pressed -> ${ACTION_LABELS[settings.mappings[id]]}`);
      } else {
        pushEvent(id, 'Released');
      }
    },
    [settings.haptics, settings.mappings, pushEvent],
  );

  // D-Pad handlers
  const handleDPadChange = useCallback(
    (next: DPadState) => {
      setDpad((prev) => {
        if (
          prev.up === next.up &&
          prev.down === next.down &&
          prev.left === next.left &&
          prev.right === next.right
        ) {
          return prev;
        }
        const activeDirs = [
          next.up ? 'UP' : null,
          next.down ? 'DOWN' : null,
          next.left ? 'LEFT' : null,
          next.right ? 'RIGHT' : null,
        ].filter(Boolean);
        if (activeDirs.length > 0) {
          triggerHaptic(settings.haptics.buttonDurationMs, settings.haptics.enabled);
          pushEvent('DPAD', activeDirs.join(' + '));
        } else {
          pushEvent('DPAD', 'Centered');
        }
        bridgeRef.current?.sendEvent(buildDPadEvent(next));
        return next;
      });
    },
    [settings.haptics, pushEvent],
  );

  // Analog stick handlers
  const handleStickChange = useCallback(
    (id: StickId, vec: StickVector, rawNormX: number, rawNormY: number) => {
      const targetRef = id === 'LEFT' ? leftStickTargetRef : rightStickTargetRef;
      targetRef.current.rawX = rawNormX;
      targetRef.current.rawY = rawNormY;
      targetRef.current.active = vec.active || Math.hypot(rawNormX, rawNormY) > 0.001;
      renderTriggerRef.current?.();
      bridgeRef.current?.sendEvent(buildJoystickEvent(id, vec.x, vec.y));

      const now = performance.now();
      if (!vec.active || now - lastDiagPushRef.current >= 40) {
        lastDiagPushRef.current = now;
        if (id === 'LEFT') {
          setLeftStickDiag(vec);
        } else {
          setRightStickDiag(vec);
        }
      }
    },
    [],
  );

  // Touchpad handlers
  const handleTouchpadContacts = useCallback((contacts: TouchpadContact[]) => {
    if (contacts.length > 0) {
      bridgeRef.current?.sendEvent(
        buildTouchpadEvent('move', contacts[0].x, contacts[0].y),
      );
    }
    setTouchpad((prev) => ({
      ...prev,
      contacts,
      lastX: contacts.length > 0 ? contacts[0].x : prev.lastX,
      lastY: contacts.length > 0 ? contacts[0].y : prev.lastY,
    }));
  }, []);

  const handleTouchpadGesture = useCallback(
    (gesture: TouchpadGesture, x: number, y: number) => {
      bridgeRef.current?.sendEvent(buildTouchpadEvent(gesture, x, y));
      setTouchpad((prev) => ({
        ...prev,
        lastX: x,
        lastY: y,
        gesture,
        lastGestureAt: Math.round(performance.now()),
      }));
      if (gesture !== 'TOUCH' && gesture !== 'IDLE') {
        const mapped =
          gesture === 'TAP' || gesture === 'DOUBLE_TAP'
            ? ACTION_LABELS[settings.mappings.touchpadTap]
            : gesture === 'SWIPE_UP'
              ? ACTION_LABELS[settings.mappings.touchpadSwipeUp]
              : gesture === 'SWIPE_DOWN'
                ? ACTION_LABELS[settings.mappings.touchpadSwipeDown]
                : gesture === 'SWIPE_LEFT'
                  ? ACTION_LABELS[settings.mappings.touchpadSwipeLeft]
                  : gesture === 'SWIPE_RIGHT'
                    ? ACTION_LABELS[settings.mappings.touchpadSwipeRight]
                    : ACTION_LABELS[settings.mappings.TOUCHPAD_CLICK];
        pushEvent('TOUCHPAD', `${gesture} -> ${mapped}`);
      }
    },
    [settings.mappings, pushEvent],
  );

  const handleTouchpadClick = useCallback(
    (clicked: boolean) => {
      setTouchpad((prev) => ({ ...prev, clicked }));
      bridgeRef.current?.sendEvent(buildButtonEvent('TOUCHPAD_CLICK', clicked));
      if (clicked) {
        triggerHaptic(settings.haptics.touchpadDurationMs, settings.haptics.enabled);
      }
    },
    [settings.haptics],
  );

  const activeButtonsList = useMemo(() => {
    const list: ButtonId[] = [];
    (['L1', 'R1', 'L2', 'R2'] as TriggerId[]).forEach((k) => {
      if (triggers[k]) list.push(k);
    });
    (['TRIANGLE', 'CIRCLE', 'CROSS', 'SQUARE'] as FaceButtonId[]).forEach((k) => {
      if (faceButtons[k]) list.push(k);
    });
    if (touchpad.clicked) list.push('TOUCHPAD_CLICK');
    return list;
  }, [triggers, faceButtons, touchpad.clicked]);

  const indicatorColor =
    companionState.status === 'connected'
      ? '#34d399'
      : companionState.status === 'connecting'
        ? '#d4a853'
        : settings.visuals.accentTheme === 'gold'
          ? '#d4a853'
          : '#c81e32';

  return (
    <main
      className="controller-surface relative w-screen h-screen overflow-hidden bg-[#090a0c] text-[#e8eaed]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Full-bleed WebGL Three.js 3D Analog Joysticks & Sculpted Chassis */}
      <ThreeJoystickCanvas
        leftStickRef={leftStickTargetRef}
        rightStickRef={rightStickTargetRef}
        stickSize={settings.sticks.stickSize}
        layoutSpread={settings.visuals.layoutSpread}
        accentTheme={settings.visuals.accentTheme}
        illuminationIntensity={settings.visuals.illuminationIntensity}
        onBoundsChange={setJoystickBounds}
        renderTriggerRef={renderTriggerRef}
      />

      {/* Minimal Top Center Utility Strip (Connection indicator + Fullscreen + Gear) */}
      <header className="pointer-events-none absolute top-2.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
        <div className="pointer-events-auto flex items-center gap-2.5 px-3 py-1 rounded-full bg-[#111318]/85 border border-white/10">
          <span
            aria-label={`Companion status: ${companionState.status}`}
            title={`Companion: ${companionState.status}`}
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: indicatorColor }}
          />
          <span className="font-display text-[11px] font-semibold tracking-[0.16em] text-[#cfd5e2] whitespace-nowrap">
            PHANTOM
          </span>
          <span className="h-3 w-px bg-white/10" aria-hidden="true" />
          <button
            type="button"
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            onClick={toggleFullscreen}
            className="p-1 rounded-md text-[#9ea6b8] hover:text-white hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4a853]"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            data-testid="settings-gear-btn"
            aria-label="Controller Settings"
            onClick={() => setSettingsOpen(true)}
            className="p-1 rounded-md text-[#9ea6b8] hover:text-white hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4a853]"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Four Corner Invisible Capacitive Edge Trigger Zones */}
      <EdgeTriggerZone
        id="L1"
        position="top-left"
        binding={settings.mappings.L1}
        pressed={triggers.L1}
        cornerRipplesEnabled={settings.visuals.cornerRipples}
        illuminationIntensity={settings.visuals.illuminationIntensity}
        showMappingHint={settings.visuals.showMappingHints}
        accentTheme={settings.visuals.accentTheme}
        onPressChange={handleTriggerChange}
      />
      <EdgeTriggerZone
        id="R1"
        position="top-right"
        binding={settings.mappings.R1}
        pressed={triggers.R1}
        cornerRipplesEnabled={settings.visuals.cornerRipples}
        illuminationIntensity={settings.visuals.illuminationIntensity}
        showMappingHint={settings.visuals.showMappingHints}
        accentTheme={settings.visuals.accentTheme}
        onPressChange={handleTriggerChange}
      />
      <EdgeTriggerZone
        id="L2"
        position="bottom-left"
        binding={settings.mappings.L2}
        pressed={triggers.L2}
        cornerRipplesEnabled={settings.visuals.cornerRipples}
        illuminationIntensity={settings.visuals.illuminationIntensity}
        showMappingHint={settings.visuals.showMappingHints}
        accentTheme={settings.visuals.accentTheme}
        onPressChange={handleTriggerChange}
      />
      <EdgeTriggerZone
        id="R2"
        position="bottom-right"
        binding={settings.mappings.R2}
        pressed={triggers.R2}
        cornerRipplesEnabled={settings.visuals.cornerRipples}
        illuminationIntensity={settings.visuals.illuminationIntensity}
        showMappingHint={settings.visuals.showMappingHints}
        accentTheme={settings.visuals.accentTheme}
        onPressChange={handleTriggerChange}
      />

      {/* Symmetrical DualSense Layout: Touchpad (top-center), D-Pad (left), Face Buttons (right) */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between px-4 sm:px-8 md:px-14 pt-12 pb-6">
        {/* Top-Center Touchpad Row */}
        <div className="flex justify-center">
          <div className="pointer-events-auto w-full flex justify-center">
            <TouchpadSurface
              illuminationIntensity={settings.visuals.illuminationIntensity}
              accentTheme={settings.visuals.accentTheme}
              lastGesture={touchpad.gesture}
              clicked={touchpad.clicked}
              onContactsChange={handleTouchpadContacts}
              onGesture={handleTouchpadGesture}
              onClickStateChange={handleTouchpadClick}
            />
          </div>
        </div>

        {/* Middle Ergonomic Row: Unified D-Pad on Left, Diamond Face Buttons on Right */}
        <div
          className="flex items-center justify-between px-2 sm:px-6 md:px-14 -mt-12 sm:-mt-14 md:-mt-16"
          style={{
            paddingLeft: `${Math.max(4, (1.15 - settings.visuals.layoutSpread) * 56)}px`,
            paddingRight: `${Math.max(4, (1.15 - settings.visuals.layoutSpread) * 56)}px`,
          }}
        >
          <div className="pointer-events-auto">
            <DPad
              state={dpad}
              illuminationIntensity={settings.visuals.illuminationIntensity}
              accentTheme={settings.visuals.accentTheme}
              onChange={handleDPadChange}
            />
          </div>

          <div className="pointer-events-auto">
            <FaceButtons
              pressed={faceButtons}
              mappings={settings.mappings}
              illuminationIntensity={settings.visuals.illuminationIntensity}
              showMappingHints={settings.visuals.showMappingHints}
              onPressChange={handleFaceButtonChange}
            />
          </div>
        </div>

        {/* Bottom Center Hardware Crest (between 3D Analog Joysticks) */}
        <div className="flex flex-col items-center justify-end pb-1">
          <div className="w-8 h-1 rounded-full bg-white/15 mb-1.5" aria-hidden="true" />
          <span className="font-mono-tabular text-[9px] tracking-[0.22em] text-[#5e6575]">
            {settings.gyro.enabled ? 'GYRO ARMED' : 'DUAL-AXIS'}
          </span>
        </div>
      </div>

      {/* Pixel-Synced Multi-Touch Analog Stick Capture Overlays */}
      <JoystickOverlayZone
        id="LEFT"
        bounds={joystickBounds.left}
        deadzone={settings.sticks.leftDeadzone}
        sensitivity={settings.sticks.leftSensitivity}
        onStickChange={handleStickChange}
      />
      <JoystickOverlayZone
        id="RIGHT"
        bounds={joystickBounds.right}
        deadzone={settings.sticks.rightDeadzone}
        sensitivity={settings.sticks.rightSensitivity}
        invertY={settings.sticks.invertRightY}
        onStickChange={handleStickChange}
      />

      {/* Subtle Portrait Hint on Narrow Mobile Screens */}
      {isPortrait && (
        <div className="pointer-events-none fixed bottom-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-lg bg-[#14171f]/90 border border-white/10 text-[10px] text-[#a5adbe] whitespace-nowrap">
          Rotate to landscape for optimal two-thumb ergonomics
        </div>
      )}

      {/* Optional Compact Diagnostics HUD (Hidden by Default) */}
      {settings.diagnosticsEnabled && (
        <DiagnosticsOverlay
          activeButtons={activeButtonsList}
          leftStick={leftStickDiag}
          rightStick={rightStickDiag}
          dpad={dpad}
          touchpad={touchpad}
          gyro={gyroState}
          history={eventHistory}
          onClose={() =>
            updateSettings({ ...settings, diagnosticsEnabled: false })
          }
        />
      )}

      {/* Compact Settings Overlay Modal */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          gyroState={gyroState}
          companionState={companionState}
          onUpdate={updateSettings}
          onReset={handleResetSettings}
          onCalibrateGyro={recalibrateGyro}
          onRequestGyroPermission={requestGyroPermission}
          onRequestFullscreen={toggleFullscreen}
          onConnectCompanion={() =>
            bridgeRef.current?.connect(settings.companion.url, true)
          }
          onDisconnectCompanion={() => bridgeRef.current?.disconnect(true)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  );
}
