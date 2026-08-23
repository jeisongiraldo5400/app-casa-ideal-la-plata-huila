import { useCallback, useEffect, useRef, useState } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';

let activeLandscapeLeases = 0;

async function acquireLandscape() {
  activeLandscapeLeases += 1;
  try {
    if (activeLandscapeLeases === 1) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
  } catch (error) {
    activeLandscapeLeases = Math.max(activeLandscapeLeases - 1, 0);
    throw error;
  }
}

async function releaseLandscape() {
  activeLandscapeLeases = Math.max(activeLandscapeLeases - 1, 0);
  if (activeLandscapeLeases === 0) {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }
}

/** Owns the temporary landscape lock used exclusively by signature capture. */
export function useSignatureLandscape() {
  const leased = useRef(false);
  const mounted = useRef(true);
  const [preparing, setPreparing] = useState(false);

  const openLandscape = useCallback(async () => {
    if (leased.current || preparing) return false;
    setPreparing(true);
    try {
      await acquireLandscape();
      leased.current = true;
      return true;
    } finally {
      if (mounted.current) setPreparing(false);
    }
  }, [preparing]);

  const restorePortrait = useCallback(async () => {
    if (!leased.current) return;
    leased.current = false;
    await releaseLandscape();
  }, []);

  useEffect(() => {
    return () => {
      mounted.current = false;
      void restorePortrait().catch((error) => {
        console.warn('No se pudo restaurar la orientación vertical', error);
      });
    };
  }, [restorePortrait]);

  return { preparing, openLandscape, restorePortrait };
}
