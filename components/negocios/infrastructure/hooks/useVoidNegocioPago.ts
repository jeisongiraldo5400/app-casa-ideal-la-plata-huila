import { useCallback, useRef, useState } from 'react';
import { negocioPagoErrorMessage } from '@/lib/negocios/prontoPago';
import { validateVoidReason, voidBlockedMessage } from '@/lib/negocios/voidNegocioPago';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import type { PagoBalanceInput } from '@/lib/negocios/negocioBalance';
import type { VoidPagoTarget } from '../../components/VoidPagoSheet';
import { voidNegocioPago } from '../services/negocioPagosService';

type VoidablePago = VoidPagoTarget &
  PagoBalanceInput & { receipt_status?: string | null; cierre_id?: string | null; cierre_numero?: string | null };

type Options = {
  pagos: VoidablePago[];
  /** Refresco posterior (detalle y sincronización). */
  onVoided: (pago: VoidablePago) => Promise<void> | void;
  /** Aviso de un bloqueo detectado antes de abrir la hoja. */
  onBlocked: (message: string) => void;
};

/** Anulación en línea de un pago con motivo obligatorio. */
export function useVoidNegocioPago({ pagos, onVoided, onBlocked }: Options) {
  const [target, setTarget] = useState<VoidablePago | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const savingRef = useRef(false);

  const request = useCallback(
    (pago: VoidablePago) => {
      const blocked = voidBlockedMessage(pagos, pago);
      if (blocked) {
        onBlocked(blocked);
        return;
      }
      setErrorText(null);
      setTarget(pago);
    },
    [pagos, onBlocked]
  );

  const close = useCallback(() => {
    if (savingRef.current) return;
    setTarget(null);
    setErrorText(null);
  }, []);

  const confirm = useCallback(
    async (reason: string) => {
      if (!target || savingRef.current) return;
      const reasonError = validateVoidReason(reason);
      if (reasonError) {
        setErrorText(reasonError);
        return;
      }
      savingRef.current = true;
      setSaving(true);
      setErrorText(null);
      try {
        await voidNegocioPago(target.id, reason);
      } catch (error) {
        setErrorText(
          isNetworkError(error)
            ? 'Sin conexión: no se pudo confirmar la anulación. Revise el pago al recuperar la red antes de reintentar.'
            : negocioPagoErrorMessage(error, 'No se pudo anular el pago')
        );
        return;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
      const voided = target;
      setTarget(null);
      try {
        await onVoided(voided);
      } catch (error) {
        console.warn('[anular-pago] fallo posterior a la anulación', error);
      }
    },
    [target, onVoided]
  );

  return { target, request, close, confirm, saving, errorText };
}
