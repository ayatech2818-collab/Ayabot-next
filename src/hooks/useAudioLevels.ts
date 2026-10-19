import { useEffect, type RefObject } from 'react';

/**
 * Streams live mic and speaker levels into CSS custom properties on `targetRef`
 * (--user-level and --aya-level, both 0..1) without re-rendering React.
 */
export function useAudioLevels(
  targetRef: RefObject<HTMLElement | null>,
  getPlaybackLevel: () => number,
  getInputLevel: () => number,
  active: boolean,
) {
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    let frame = 0;
    let aya = 0;
    let user = 0;

    const write = () => {
      target.style.setProperty('--aya-level', aya.toFixed(3));
      target.style.setProperty('--user-level', user.toFixed(3));
    };

    if (!active) {
      write();
      return;
    }

    const tick = () => {
      // Playback RMS is roughly 0..0.2 for speech; mic RMS is in 16-bit units.
      const ayaTarget = Math.min(1, getPlaybackLevel() * 6);
      const userTarget = Math.min(1, getInputLevel() / 6000);
      aya += (ayaTarget - aya) * (ayaTarget > aya ? 0.45 : 0.12);
      user += (userTarget - user) * (userTarget > user ? 0.45 : 0.12);
      write();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      aya = 0;
      user = 0;
      write();
    };
  }, [targetRef, getPlaybackLevel, getInputLevel, active]);
}
