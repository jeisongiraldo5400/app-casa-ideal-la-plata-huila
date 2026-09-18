import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { DEFAULT_SHARE_LINK_HOURS, parseStoredShareLinkHours } from '@/lib/catalogos/shareLinks';
import { loadShareLinkHours, saveShareLinkHours } from '../../utils/shareLinkPreferences';

type ShareLinkHoursState = {
  hours: number;
  /** El usuario ya eligió: lo que llegue después del almacenamiento no lo pisa. */
  touched: boolean;
};

/**
 * Una sola fuente para «Nuevo enlace» y «Reemitir»: elegir la vigencia en una
 * se ve en la otra sin esperar a releer el almacenamiento.
 */
const useShareLinkHoursStore = create<ShareLinkHoursState>(() => ({ hours: DEFAULT_SHARE_LINK_HOURS, touched: false }));

let storedHoursRequest: Promise<void> | null = null;

function loadStoredHoursOnce(): void {
  if (storedHoursRequest) return;
  storedHoursRequest = loadShareLinkHours().then((stored) => {
    // Si el usuario ya eligió mientras se leía, se respeta su elección.
    if (!useShareLinkHoursStore.getState().touched) useShareLinkHoursStore.setState({ hours: stored });
  });
}

/** Solo para pruebas: vuelve al estado inicial y permite releer el almacenamiento. */
export function resetShareLinkHoursForTests(): void {
  storedHoursRequest = null;
  useShareLinkHoursStore.setState({ hours: DEFAULT_SHARE_LINK_HOURS, touched: false });
}

/** Vigencia del enlace como texto (lo que espera `OptionPickerField`), recordada entre sesiones. */
export function useShareLinkHours(): [string, (value: string) => void] {
  const hours = useShareLinkHoursStore((state) => state.hours);

  useEffect(() => {
    loadStoredHoursOnce();
  }, []);

  const setHours = useCallback((value: string) => {
    const next = parseStoredShareLinkHours(value);
    useShareLinkHoursStore.setState({ hours: next, touched: true });
    void saveShareLinkHours(next);
  }, []);

  return [String(hours), setHours];
}
