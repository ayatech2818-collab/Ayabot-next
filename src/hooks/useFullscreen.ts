import { useCallback, useSyncExternalStore } from 'react';

function subscribe(listener: () => void) {
  document.addEventListener('fullscreenchange', listener);
  return () => document.removeEventListener('fullscreenchange', listener);
}

const getIsFullscreen = () => document.fullscreenElement !== null;
const getIsSupported = () => document.fullscreenEnabled === true;
const getServerFalse = () => false;

/** Browser fullscreen for the whole page; `supported` is false where the API is unavailable (e.g. iPhone Safari). */
export function useFullscreen() {
  const isFullscreen = useSyncExternalStore(subscribe, getIsFullscreen, getServerFalse);
  const supported = useSyncExternalStore(subscribe, getIsSupported, getServerFalse);

  /** Resolves true when the request went through (the browser may refuse, e.g. in embedded views). */
  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }, []);

  return { isFullscreen, supported, toggle };
}
