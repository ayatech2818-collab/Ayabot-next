import { useCallback, useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY } from '../constants/theme';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  const stored = document.documentElement.dataset.themePreference;
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(preference: ThemePreference) {
  const resolved = preference === 'system' ? systemTheme() : preference;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const onSystemChange = () => {
    if (readPreference() === 'system') applyTheme('system');
  };
  media.addEventListener('change', onSystemChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', onSystemChange);
  };
}

const getPreferenceSnapshot = () => readPreference();
const getResolvedSnapshot = (): ResolvedTheme => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
const getServerPreference = (): ThemePreference => 'system';
const getServerResolved = (): ResolvedTheme => 'dark';

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, getPreferenceSnapshot, getServerPreference);
  const resolved = useSyncExternalStore(subscribe, getResolvedSnapshot, getServerResolved);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      if (next === 'system') {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // The choice still applies for this visit when storage is blocked.
    }
    applyTheme(next);
  }, []);

  return { preference, resolved, setPreference };
}
