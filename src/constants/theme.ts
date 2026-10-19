export const THEME_STORAGE_KEY = 'ayabot-theme';
export const SCENE_STORAGE_KEY = 'ayabot-scene';

/**
 * Runs in <head> before the first paint so the page never flashes the wrong theme or
 * background scene. Keep it in sync with applyTheme (hooks/useTheme.ts) and hooks/useScene.ts.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');if(p!=='light'&&p!=='dark')p='system';var r=p==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;var d=document.documentElement;d.dataset.theme=r;d.dataset.themePreference=p;d.style.colorScheme=r;d.dataset.scene=localStorage.getItem('${SCENE_STORAGE_KEY}')==='off'?'off':'on';}catch(e){document.documentElement.dataset.theme='dark';}})();`;
