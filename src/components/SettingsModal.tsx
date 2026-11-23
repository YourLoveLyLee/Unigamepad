import { useState } from 'react';
import { X, RotateCcw, Sparkles, Zap, BrainCircuit } from 'lucide-react';
import type {
  ActionBinding,
  ButtonId,
  ControllerSettings,
  GyroState,
  HoldToAimTrigger,
} from '../types/controller';
import {
  ACTION_LABELS,
  PRESET_PROFILES,
} from '../utils/controllerMath';
import {
  HAPTIC_PATTERNS,
  isHapticsSupported,
  playHapticPattern,
  type HapticPatternId,
} from '../utils/haptics';

import type { CompanionBridgeSnapshot } from '../utils/companionBridge';

interface SettingsModalProps {
  settings: ControllerSettings;
  gyroState: GyroState;
  companionState: CompanionBridgeSnapshot;
  onUpdate: (next: ControllerSettings) => void;
  onReset: () => void;
  onCalibrateGyro: () => void;
  onRequestGyroPermission: () => void;
  onRequestFullscreen: () => void;
  onConnectCompanion: () => void;
  onDisconnectCompanion: () => void;
  onClose: () => void;
}

type SettingsTab = 'mappings' | 'sticks' | 'sensors' | 'diagnostics';

const MAPPABLE_BUTTONS: Array<{ id: ButtonId; label: string }> = [
  { id: 'L1', label: 'L1 Shoulder' },
  { id: 'R1', label: 'R1 Shoulder' },
  { id: 'L2', label: 'L2 Trigger' },
  { id: 'R2', label: 'R2 Trigger' },
  { id: 'TRIANGLE', label: 'Triangle' },
  { id: 'CIRCLE', label: 'Circle' },
  { id: 'CROSS', label: 'Cross' },
  { id: 'SQUARE', label: 'Square' },
  { id: 'TOUCHPAD_CLICK', label: 'Touchpad Click' },
];

const ACTION_BINDING_KEYS = Object.keys(ACTION_LABELS) as ActionBinding[];

export function SettingsModal({
  settings,
  gyroState,
  companionState,
  onUpdate,
  onReset,
  onCalibrateGyro,
  onRequestGyroPermission,
  onRequestFullscreen,
  onConnectCompanion,
  onDisconnectCompanion,
  onClose,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('mappings');
  const [aiQuery, setAiQuery] = useState('Apex Legends mobile claw with fast ADS');
  const [aiMode, setAiMode] = useState<'fast' | 'deep'>('fast');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAdvice, setAiAdvice] = useState<{
    summary: string;
    recommendedPatch?: Partial<ControllerSettings>;
  } | null>(null);

  const hapticsAvailable = isHapticsSupported();

  const updateMapping = (key: keyof ControllerSettings['mappings'], value: ActionBinding) => {
    onUpdate({
      ...settings,
      mappings: {
        ...settings.mappings,
        [key]: value,
      },
    });
  };

  const applyPreset = (presetKey: keyof typeof PRESET_PROFILES) => {
    const patch = PRESET_PROFILES[presetKey].patch;
    onUpdate({
      ...settings,
      mappings: { ...settings.mappings, ...(patch.mappings ?? {}) },
      sticks: { ...settings.sticks, ...(patch.sticks ?? {}) },
      gyro: { ...settings.gyro, ...(patch.gyro ?? {}) },
    });
  };

  const askAiTuner = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/tuner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiQuery.trim(),
          mode: aiMode,
          currentSettings: settings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to reach tuning assistant.');
      }
      setAiAdvice(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiRecommendation = () => {
    if (!aiAdvice?.recommendedPatch) return;
    const p = aiAdvice.recommendedPatch;
    onUpdate({
      ...settings,
      mappings: { ...settings.mappings, ...(p.mappings ?? {}) },
      sticks: { ...settings.sticks, ...(p.sticks ?? {}) },
      gyro: { ...settings.gyro, ...(p.gyro ?? {}) },
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Controller Settings"
      data-testid="settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[660px] max-h-[88vh] flex flex-col rounded-2xl border border-white/10 bg-[#12141a] text-[#e8eaed] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-base font-semibold tracking-tight">
              Phantom Configuration
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#9ea6b8] hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              aria-label="Close Settings"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#9ea6b8] hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Segmented Navigation */}
        <div
          role="tablist"
          aria-label="Settings Categories"
          className="flex items-center gap-1 px-5 py-2.5 border-b border-white/10 bg-[#0e1015] overflow-x-auto"
        >
          {(
            [
              ['mappings', 'Mappings'],
              ['sticks', 'Sticks & Layout'],
              ['sensors', 'Gyro & Haptics'],
              ['diagnostics', 'Diagnostics & AI'],
            ] as Array<[SettingsTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                tab === id
                  ? 'bg-[#c81e32] text-white'
                  : 'text-[#9ea6b8] hover:text-white hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto phantom-scroll p-5 space-y-5">
          {tab === 'mappings' && (
            <div className="space-y-5">
              {/* Quick Presets */}
              <div>
                <div className="text-xs font-medium text-[#9ea6b8] mb-2">
                  Hardware Presets
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(Object.keys(PRESET_PROFILES) as Array<keyof typeof PRESET_PROFILES>).map(
                    (key) => {
                      const preset = PRESET_PROFILES[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyPreset(key)}
                          className="text-left p-3 rounded-xl border border-white/10 bg-[#181b22] hover:border-[#d4a853]/60 transition-colors cursor-pointer"
                        >
                          <div className="text-xs font-semibold text-[#e8eaed]">
                            {preset.label}
                          </div>
                          <div className="text-[11px] text-[#8c93a3] mt-1 leading-snug">
                            {preset.description}
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Trigger & Face Button Bindings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MAPPABLE_BUTTONS.map(({ id, label }) => (
                  <label
                    key={id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-[#181b22] border border-white/10"
                  >
                    <span className="text-xs font-medium text-[#d4d8e2]">
                      {label}
                    </span>
                    <select
                      aria-label={`${label} Action`}
                      data-testid={`map-select-${id}`}
                      value={settings.mappings[id]}
                      onChange={(e) =>
                        updateMapping(id, e.target.value as ActionBinding)
                      }
                      className="bg-[#0e1015] border border-white/15 rounded-lg px-2.5 py-1 text-xs text-[#e8eaed] focus:outline-none focus:border-[#d4a853]"
                    >
                      {ACTION_BINDING_KEYS.map((actionKey) => (
                        <option key={actionKey} value={actionKey}>
                          {ACTION_LABELS[actionKey]}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {/* Touchpad Gesture Bindings */}
              <div>
                <div className="text-xs font-medium text-[#9ea6b8] mb-2">
                  Touchpad Gestures
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      ['touchpadTap', 'Single Tap'],
                      ['touchpadSwipeUp', 'Swipe Up'],
                      ['touchpadSwipeDown', 'Swipe Down'],
                      ['touchpadSwipeLeft', 'Swipe Left'],
                      ['touchpadSwipeRight', 'Swipe Right'],
                    ] as Array<[keyof ControllerSettings['mappings'], string]>
                  ).map(([field, label]) => (
                    <label
                      key={field}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-[#181b22] border border-white/10"
                    >
                      <span className="text-xs font-medium text-[#d4d8e2]">
                        {label}
                      </span>
                      <select
                        value={settings.mappings[field]}
                        onChange={(e) =>
                          updateMapping(field, e.target.value as ActionBinding)
                        }
                        className="bg-[#0e1015] border border-white/15 rounded-lg px-2.5 py-1 text-xs text-[#e8eaed] focus:outline-none focus:border-[#d4a853]"
                      >
                        {ACTION_BINDING_KEYS.map((actionKey) => (
                          <option key={actionKey} value={actionKey}>
                            {ACTION_LABELS[actionKey]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'sticks' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SliderField
                  label="Left Stick Sensitivity"
                  value={settings.sticks.leftSensitivity}
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  format={(v) => `${v.toFixed(2)}x`}
                  onChange={(v) =>
                    onUpdate({
                      ...settings,
                      sticks: { ...settings.sticks, leftSensitivity: v },
                    })
                  }
                />
                <SliderField
                  label="Left Stick Deadzone"
                  testId="slider-left-deadzone"
                  value={settings.sticks.leftDeadzone}
                  min={0}
                  max={0.35}
                  step={0.01}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) =>
                    onUpdate({
                      ...settings,
                      sticks: { ...settings.sticks, leftDeadzone: v },
                    })
                  }
                />
                <SliderField
                  label="Right Stick Sensitivity"
                  value={settings.sticks.rightSensitivity}
                  min={0.5}
                  max={2.2}
                  step={0.05}
                  format={(v) => `${v.toFixed(2)}x`}
                  onChange={(v) =>
                    onUpdate({
                      ...settings,
                      sticks: { ...settings.sticks, rightSensitivity: v },
                    })
                  }
                />
                <SliderField
                  label="Right Stick Deadzone"
                  value={settings.sticks.rightDeadzone}
                  min={0}
                  max={0.35}
                  step={0.01}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) =>
                    onUpdate({
                      ...settings,
                      sticks: { ...settings.sticks, rightDeadzone: v },
                    })
                  }
                />
                <SliderField
                  label="Joystick Physical Size"
                  testId="slider-stick-size"
                  value={settings.sticks.stickSize}
                  min={0.8}
                  max={1.25}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) =>
                    onUpdate({
                      ...settings,
                      sticks: { ...settings.sticks, stickSize: v },
                    })
                  }
                />
                <SliderField
                  label="Layout Width Spread"
                  value={settings.visuals.layoutSpread}
                  min={0.88}
                  max={1.12}
                  step={0.02}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) =>
                    onUpdate({
                      ...settings,
                      visuals: { ...settings.visuals, layoutSpread: v },
                    })
                  }
                />
                <SliderField
                  label="Illumination Intensity"
                  value={settings.visuals.illuminationIntensity}
                  min={0.25}
                  max={1.0}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) =>
                    onUpdate({
                      ...settings,
                      visuals: { ...settings.visuals, illuminationIntensity: v },
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <ToggleRow
                  label="Invert Right Stick Y-Axis"
                  checked={settings.sticks.invertRightY}
                  onChange={(checked) =>
                    onUpdate({
                      ...settings,
                      sticks: { ...settings.sticks, invertRightY: checked },
                    })
                  }
                />
                <ToggleRow
                  label="Corner Edge Ripples"
                  checked={settings.visuals.cornerRipples}
                  onChange={(checked) =>
                    onUpdate({
                      ...settings,
                      visuals: { ...settings.visuals, cornerRipples: checked },
                    })
                  }
                />
                <ToggleRow
                  label="Subtle Keycap Hints"
                  checked={settings.visuals.showMappingHints}
                  onChange={(checked) =>
                    onUpdate({
                      ...settings,
                      visuals: { ...settings.visuals, showMappingHints: checked },
                    })
                  }
                />

                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#181b22] border border-white/10">
                  <span className="text-xs font-medium text-[#d4d8e2]">
                    Accent Finish
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate({
                          ...settings,
                          visuals: { ...settings.visuals, accentTheme: 'crimson' },
                        })
                      }
                      className={`px-2.5 py-1 rounded-md text-xs cursor-pointer ${
                        settings.visuals.accentTheme === 'crimson'
                          ? 'bg-[#c81e32] text-white'
                          : 'bg-[#0e1015] text-[#9ea6b8]'
                      }`}
                    >
                      Crimson
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate({
                          ...settings,
                          visuals: { ...settings.visuals, accentTheme: 'gold' },
                        })
                      }
                      className={`px-2.5 py-1 rounded-md text-xs cursor-pointer ${
                        settings.visuals.accentTheme === 'gold'
                          ? 'bg-[#d4a853] text-[#0b0c0e] font-semibold'
                          : 'bg-[#0e1015] text-[#9ea6b8]'
                      }`}
                    >
                      Gold
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={onRequestFullscreen}
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-[#1b1f28] border border-white/10 hover:border-[#d4a853]/60 text-[#e8eaed] cursor-pointer"
                >
                  Enter Landscape Fullscreen
                </button>
              </div>
            </div>
          )}

          {tab === 'sensors' && (
            <div className="space-y-5">
              {/* Gyroscope Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-[#e8eaed]">
                      Gyroscope Aiming
                    </div>
                    <div className="text-[11px] text-[#8c93a3]">
                      Sensor status: {gyroState.permissionState}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onRequestGyroPermission}
                      className="px-2.5 py-1 rounded-lg text-xs bg-[#1b1f28] border border-white/10 hover:border-white/25 cursor-pointer"
                    >
                      Enable Sensor
                    </button>
                    <button
                      type="button"
                      onClick={onCalibrateGyro}
                      className="px-2.5 py-1 rounded-lg text-xs bg-[#1b1f28] border border-white/10 hover:border-[#d4a853]/60 cursor-pointer"
                    >
                      Recalibrate Zero
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ToggleRow
                    label="Enable Gyro Aiming"
                    checked={settings.gyro.enabled}
                    onChange={(checked) =>
                      onUpdate({
                        ...settings,
                        gyro: { ...settings.gyro, enabled: checked },
                      })
                    }
                  />
                  <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-[#181b22] border border-white/10">
                    <span className="text-xs font-medium text-[#d4d8e2]">
                      Hold-to-Aim Mode
                    </span>
                    <select
                      value={settings.gyro.holdToAim}
                      onChange={(e) =>
                        onUpdate({
                          ...settings,
                          gyro: {
                            ...settings.gyro,
                            holdToAim: e.target.value as HoldToAimTrigger,
                          },
                        })
                      }
                      className="bg-[#0e1015] border border-white/15 rounded-lg px-2.5 py-1 text-xs text-[#e8eaed]"
                    >
                      <option value="ALWAYS">Always Active</option>
                      <option value="L2">Hold L2</option>
                      <option value="L1">Hold L1</option>
                      <option value="R1">Hold R1</option>
                      <option value="TOUCHPAD">Touchpad Contact</option>
                    </select>
                  </label>
                  <SliderField
                    label="Gyro Sensitivity"
                    value={settings.gyro.sensitivity}
                    min={0.3}
                    max={2.5}
                    step={0.05}
                    format={(v) => `${v.toFixed(2)}x`}
                    onChange={(v) =>
                      onUpdate({
                        ...settings,
                        gyro: { ...settings.gyro, sensitivity: v },
                      })
                    }
                  />
                  <SliderField
                    label="Gyro Deadzone"
                    value={settings.gyro.deadzone}
                    min={0}
                    max={0.25}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) =>
                      onUpdate({
                        ...settings,
                        gyro: { ...settings.gyro, deadzone: v },
                      })
                    }
                  />
                  <ToggleRow
                    label="Invert Gyro X"
                    checked={settings.gyro.invertX}
                    onChange={(checked) =>
                      onUpdate({
                        ...settings,
                        gyro: { ...settings.gyro, invertX: checked },
                      })
                    }
                  />
                  <ToggleRow
                    label="Invert Gyro Y"
                    checked={settings.gyro.invertY}
                    onChange={(checked) =>
                      onUpdate({
                        ...settings,
                        gyro: { ...settings.gyro, invertY: checked },
                      })
                    }
                  />
                </div>
              </div>

              {/* Haptics Section */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-[#e8eaed]">
                      Android Tactile Haptics
                    </div>
                    <div className="text-[11px] text-[#8c93a3]">
                      {hapticsAvailable
                        ? 'Web Vibration API detected'
                        : 'Vibration hardware unavailable in this browser'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ToggleRow
                    label="Enable Haptic Feedback"
                    checked={settings.haptics.enabled}
                    onChange={(checked) =>
                      onUpdate({
                        ...settings,
                        haptics: { ...settings.haptics, enabled: checked },
                      })
                    }
                  />
                  <SliderField
                    label="Face / D-Pad Duration"
                    value={settings.haptics.buttonDurationMs}
                    min={5}
                    max={45}
                    step={1}
                    format={(v) => `${v}ms`}
                    onChange={(v) =>
                      onUpdate({
                        ...settings,
                        haptics: { ...settings.haptics, buttonDurationMs: v },
                      })
                    }
                  />
                  <SliderField
                    label="Trigger Duration"
                    value={settings.haptics.triggerDurationMs}
                    min={8}
                    max={60}
                    step={1}
                    format={(v) => `${v}ms`}
                    onChange={(v) =>
                      onUpdate({
                        ...settings,
                        haptics: { ...settings.haptics, triggerDurationMs: v },
                      })
                    }
                  />
                  <SliderField
                    label="Touchpad Click Duration"
                    value={settings.haptics.touchpadDurationMs}
                    min={6}
                    max={50}
                    step={1}
                    format={(v) => `${v}ms`}
                    onChange={(v) =>
                      onUpdate({
                        ...settings,
                        haptics: { ...settings.haptics, touchpadDurationMs: v },
                      })
                    }
                  />
                </div>

                <div>
                  <div className="text-[11px] text-[#8c93a3] mb-2">
                    Test Vibration Patterns
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(HAPTIC_PATTERNS) as HapticPatternId[]).map((pid) => (
                      <button
                        key={pid}
                        type="button"
                        onClick={() => playHapticPattern(pid, settings.haptics.enabled)}
                        className="px-3 py-1.5 rounded-lg text-xs bg-[#181b22] border border-white/10 hover:border-[#d4a853]/60 text-[#e8eaed] cursor-pointer"
                      >
                        {HAPTIC_PATTERNS[pid].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'diagnostics' && (
            <div className="space-y-5">
              {/* USB / ADB Companion Bridge */}
              <div className="p-3.5 rounded-xl bg-[#181b22] border border-white/10 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[#e8eaed]">
                      Windows Companion Bridge (ADB Reverse)
                    </div>
                    <div className="text-[11px] text-[#8c93a3]">
                      Status: {companionState.status}
                      {companionState.rttMs !== null ? ` · RTT ${companionState.rttMs}ms` : ''}
                      {companionState.sentCount > 0 ? ` · ${companionState.sentCount} events` : ''}
                    </div>
                  </div>
                  {companionState.status === 'connected' || companionState.status === 'connecting' ? (
                    <button
                      type="button"
                      onClick={onDisconnectCompanion}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1f242f] border border-white/15 hover:border-white/30 text-[#e8eaed] cursor-pointer"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid="btn-connect-companion"
                      onClick={onConnectCompanion}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#c81e32] hover:bg-[#b2192b] text-white cursor-pointer"
                    >
                      Connect USB
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1 text-[11px] text-[#9ea6b8]">
                    <span>WebSocket Endpoint</span>
                    <input
                      type="text"
                      value={settings.companion.url}
                      onChange={(e) =>
                        onUpdate({
                          ...settings,
                          companion: { ...settings.companion, url: e.target.value },
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-[#0e1015] border border-white/15 text-xs font-mono-tabular text-[#e8eaed] focus:outline-none focus:border-[#d4a853]"
                    />
                  </label>
                  <ToggleRow
                    label="Auto-Connect on Launch"
                    checked={settings.companion.autoConnect}
                    onChange={(checked) =>
                      onUpdate({
                        ...settings,
                        companion: { ...settings.companion, autoConnect: checked },
                      })
                    }
                  />
                </div>

                {companionState.lastError && (
                  <div className="text-[11px] text-[#f3b6be]">
                    {companionState.lastError}
                  </div>
                )}
              </div>

              <ToggleRow
                label="Show Input Diagnostics Overlay"
                testId="toggle-diagnostics"
                checked={settings.diagnosticsEnabled}
                onChange={(checked) =>
                  onUpdate({ ...settings, diagnosticsEnabled: checked })
                }
              />

              {/* AI Profile & Sensitivity Tuner */}
              <div className="pt-3 border-t border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#d4a853]" />
                    <span className="text-xs font-semibold text-[#e8eaed]">
                      Profile & Sensitivity Advisor
                    </span>
                  </div>
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0e1015] border border-white/10">
                    <button
                      type="button"
                      onClick={() => setAiMode('fast')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] cursor-pointer ${
                        aiMode === 'fast'
                          ? 'bg-[#1e222b] text-[#e8eaed]'
                          : 'text-[#8c93a3]'
                      }`}
                    >
                      <Zap className="w-3 h-3 text-[#d4a853]" />
                      <span>Fast</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiMode('deep')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] cursor-pointer ${
                        aiMode === 'deep'
                          ? 'bg-[#1e222b] text-[#e8eaed]'
                          : 'text-[#8c93a3]'
                      }`}
                    >
                      <BrainCircuit className="w-3 h-3 text-[#c81e32]" />
                      <span>Deep Analysis</span>
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    placeholder="Describe game genre, claw style, or recoil feel..."
                    className="flex-1 px-3 py-2 rounded-xl bg-[#0e1015] border border-white/15 text-xs text-[#e8eaed] placeholder:text-[#6d7485] focus:outline-none focus:border-[#d4a853]"
                  />
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={askAiTuner}
                    className="px-4 py-2 rounded-xl text-xs font-medium bg-[#c81e32] hover:bg-[#b2192b] disabled:opacity-50 text-white whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {aiLoading ? 'Tuning...' : 'Generate'}
                  </button>
                </div>

                {aiError && (
                  <div className="p-3 rounded-xl bg-[#c81e32]/15 border border-[#c81e32]/40 text-xs text-[#f3b6be]">
                    {aiError}
                  </div>
                )}

                {aiAdvice && (
                  <div className="p-3.5 rounded-xl bg-[#181b22] border border-white/10 space-y-2.5">
                    <p className="text-xs text-[#d4d8e2] leading-relaxed">
                      {aiAdvice.summary}
                    </p>
                    {aiAdvice.recommendedPatch && (
                      <button
                        type="button"
                        onClick={applyAiRecommendation}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#d4a853] text-[#090a0c] hover:bg-[#e0b666] cursor-pointer"
                      >
                        Apply Recommended Tuning
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (val: number) => string;
  onChange: (val: number) => void;
  testId?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 p-3 rounded-xl bg-[#181b22] border border-white/10">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#d4d8e2]">{label}</span>
        <span className="font-mono-tabular text-[#d4a853]">{format(value)}</span>
      </div>
      <input
        type="range"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#c81e32] cursor-pointer"
      />
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#181b22] border border-white/10 cursor-pointer">
      <span className="text-xs font-medium text-[#d4d8e2]">{label}</span>
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-[#c81e32] cursor-pointer"
      />
    </label>
  );
}
