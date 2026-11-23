import type { ControllerSettings } from '../types/controller';
import { DEFAULT_SETTINGS } from './controllerMath';

const STORAGE_KEY = 'phantom_controller_settings_v1';

export function loadSettings(): ControllerSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ControllerSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      mappings: {
        ...DEFAULT_SETTINGS.mappings,
        ...(parsed.mappings ?? {}),
      },
      sticks: {
        ...DEFAULT_SETTINGS.sticks,
        ...(parsed.sticks ?? {}),
      },
      gyro: {
        ...DEFAULT_SETTINGS.gyro,
        ...(parsed.gyro ?? {}),
      },
      haptics: {
        ...DEFAULT_SETTINGS.haptics,
        ...(parsed.haptics ?? {}),
      },
      visuals: {
        ...DEFAULT_SETTINGS.visuals,
        ...(parsed.visuals ?? {}),
      },
      companion: {
        ...DEFAULT_SETTINGS.companion,
        ...(parsed.companion ?? {}),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ControllerSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota or storage restriction errors silently
  }
}

export function clearSettings(): ControllerSettings {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
  return DEFAULT_SETTINGS;
}
