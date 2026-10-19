import { useCallback, useSyncExternalStore } from 'react';
import { SCENE_STORAGE_KEY } from '../constants/theme';

// The glass-city background scene can be switched off; the choice lives on <html data-scene>
// (set before first paint by THEME_INIT_SCRIPT) and in localStorage.
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => document.documentElement.dataset.scene !== 'off';
const getServerSnapshot = () => true;

export function useScene() {
  const sceneOn = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setSceneOn = useCallback((on: boolean) => {
    document.documentElement.dataset.scene = on ? 'on' : 'off';
    try {
      window.localStorage.setItem(SCENE_STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      // The choice still applies for this visit when storage is blocked.
    }
    listeners.forEach(listener => listener());
  }, []);

  return { sceneOn, setSceneOn };
}
