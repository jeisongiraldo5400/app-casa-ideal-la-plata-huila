import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SHARE_LINK_HOURS, parseStoredShareLinkHours } from '@/lib/catalogos/shareLinks';
import { loadShareLinkHours, saveShareLinkHours } from '../../utils/shareLinkPreferences';

/** Vigencia del enlace como texto (lo que espera `OptionPickerField`), recordada entre sesiones. */
export function useShareLinkHours(): [string, (value: string) => void] {
  const [hours, setHoursState] = useState(String(DEFAULT_SHARE_LINK_HOURS));
  const touched = useRef(false);

  useEffect(() => {
    let active = true;
    void loadShareLinkHours().then((stored) => {
      // Si el usuario ya eligió mientras se leía, se respeta su elección.
      if (active && !touched.current) setHoursState(String(stored));
    });
    return () => {
      active = false;
    };
  }, []);

  const setHours = useCallback((value: string) => {
    touched.current = true;
    const next = parseStoredShareLinkHours(value);
    setHoursState(String(next));
    void saveShareLinkHours(next);
  }, []);

  return [hours, setHours];
}
