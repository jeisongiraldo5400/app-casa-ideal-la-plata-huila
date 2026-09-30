/**
 * Borradores de despacho / recepción / devolución, SOLO en memoria.
 *
 * Primera versión con señal (como salidas y entradas): no hay cola offline,
 * pero si la red se cae a mitad del conteo lo marcado no se pierde al salir y
 * volver a la pantalla. Se borra al confirmar con éxito o al cerrar la app.
 */
import { create } from 'zustand';
import type { TransferDraft } from '../../utils/transferRules';

type DraftKey = `${string}:${TransferDraft['kind']}`;

type TransferDraftState = {
  drafts: Record<DraftKey, TransferDraft>;
  setDraft: (transferOrderId: string, draft: TransferDraft) => void;
  clearDraft: (transferOrderId: string, kind: TransferDraft['kind']) => void;
  reset: () => void;
};

export const transferDraftKey = (transferOrderId: string, kind: TransferDraft['kind']): DraftKey =>
  `${transferOrderId}:${kind}`;

export const useTransferDraftStore = create<TransferDraftState>((set) => ({
  drafts: {},
  setDraft: (transferOrderId, draft) =>
    set((state) => ({ drafts: { ...state.drafts, [transferDraftKey(transferOrderId, draft.kind)]: draft } })),
  clearDraft: (transferOrderId, kind) =>
    set((state) => {
      const drafts = { ...state.drafts };
      delete drafts[transferDraftKey(transferOrderId, kind)];
      return { drafts };
    }),
  reset: () => set({ drafts: {} }),
}));
