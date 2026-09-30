import { useCallback, useMemo } from 'react';
import type { TransferDetail } from '../../utils/transferModel';
import {
  draftFitsDetail,
  initialDispatchDraft,
  initialReceiveDraft,
  initialReturnDraft,
  type DispatchDraft,
  type ReceiveDraft,
  type ReturnDraft,
} from '../../utils/transferRules';
import { transferDraftKey, useTransferDraftStore } from '../store/transferDraftStore';

type DraftByKind = { dispatch: DispatchDraft; receive: ReceiveDraft; return: ReturnDraft };

const INITIAL: { [K in keyof DraftByKind]: (detail: TransferDetail) => DraftByKind[K] } = {
  dispatch: initialDispatchDraft,
  receive: initialReceiveDraft,
  return: initialReturnDraft,
};

/**
 * Borrador en memoria de una acción sobre el traslado. Si lo guardado ya no
 * calza con el traslado recargado (otra persona recibió parte, cambió lo
 * reservado…) se vuelve a empezar desde los valores iniciales.
 */
export function useTransferDraft<K extends keyof DraftByKind>(detail: TransferDetail, kind: K) {
  const transferOrderId = detail.order.id;
  const stored = useTransferDraftStore((state) => state.drafts[transferDraftKey(transferOrderId, kind)]);
  const setStored = useTransferDraftStore((state) => state.setDraft);
  const clearStored = useTransferDraftStore((state) => state.clearDraft);

  const draft = useMemo<DraftByKind[K]>(() => {
    if (stored && stored.kind === kind && draftFitsDetail(stored, detail)) return stored as DraftByKind[K];
    return INITIAL[kind](detail);
  }, [detail, kind, stored]);

  const setDraft = useCallback(
    (next: DraftByKind[K]) => setStored(transferOrderId, next),
    [setStored, transferOrderId]
  );
  const clearDraft = useCallback(() => clearStored(transferOrderId, kind), [clearStored, kind, transferOrderId]);

  return { draft, setDraft, clearDraft };
}
