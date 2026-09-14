import { useCallback, useEffect, useRef, useState } from 'react';
import { createIdempotencyKey } from '@/lib/idempotency';
import {
  PRONTO_PAGO_OFFLINE_MESSAGE,
  buildProntoPagoRpcCall,
  buildProntoPagoSummary,
  isProntoPagoBalanceChangedError,
  negocioPagoErrorMessage,
  prontoPagoBlockReason,
  prontoPagoRequestFingerprint,
  type ProntoPagoSummary,
} from '@/lib/negocios/prontoPago';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { hasUnsettledSyncForNegocio } from '@/lib/offline/repositories/offlineRepository';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import type { ProntoPagoFormValues, ProntoPagoNotice } from '../../components/ProntoPagoSheet';
import { fetchPaymentMethods, type PaymentMethodOption } from '../services/paymentMethodsService';
import { fetchProntoPagoCuotas, registerProntoPago } from '../services/negocioPagosService';

export type ProntoPagoRegistered = {
  pagoId: string;
  values: ProntoPagoFormValues;
  paidAt: string;
  paymentMethodName: string | null;
};

export const PRONTO_PAGO_NETWORK_RETRY_MESSAGE =
  'No se pudo confirmar el pronto pago por un problema de conexión. Reintente: si ya quedó registrado no se duplicará.';

type Options = {
  negocioId: string | null | undefined;
  routeStopId?: string | null;
  online: boolean;
  /** El detalle se cargó de la base local: no hay saldo del servidor. */
  fromLocal: boolean;
  onRegistered: (result: ProntoPagoRegistered) => Promise<void> | void;
};

type Attempt = { fingerprint: string; key: string; paidAt: string };

/**
 * Coordina el registro en línea del pronto pago: recarga de cuotas con la mora
 * del día, bloqueo sin red o con la cola pendiente, clave de idempotencia
 * reutilizada en reintentos por red y renovada tras «el saldo cambió».
 */
export function useProntoPago({ negocioId, routeStopId = null, online, fromLocal, onRegistered }: Options) {
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const [hasPendingSync, setHasPendingSync] = useState(false);
  const [visible, setVisible] = useState(false);
  const [summary, setSummary] = useState<ProntoPagoSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ProntoPagoNotice | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const attemptRef = useRef<Attempt | null>(null);
  const savingRef = useRef(false);

  const checkPendingSync = useCallback(async () => {
    if (!negocioId) return false;
    try {
      const pending = await hasUnsettledSyncForNegocio({ negocioId, routeStopId });
      setHasPendingSync(pending);
      return pending;
    } catch {
      setHasPendingSync(false);
      return false;
    }
  }, [negocioId, routeStopId]);

  useEffect(() => {
    void checkPendingSync();
  }, [checkPendingSync, pendingCount]);

  const blockReason = prontoPagoBlockReason({ online, fromLocal, hasPendingSync });

  const reloadCuotas = useCallback(async () => {
    if (!negocioId) return null;
    setLoading(true);
    try {
      const next = buildProntoPagoSummary(await fetchProntoPagoCuotas(negocioId));
      setSummary(next);
      return next;
    } catch (error) {
      setNotice({
        tone: 'error',
        text: isNetworkError(error)
          ? PRONTO_PAGO_OFFLINE_MESSAGE
          : negocioPagoErrorMessage(error, 'No se pudieron actualizar las cuotas'),
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [negocioId]);

  const open = useCallback(() => {
    if (!negocioId) return;
    attemptRef.current = null;
    setNotice(null);
    setSummary(null);
    setVisible(true);
    void checkPendingSync();
    void reloadCuotas();
    setPaymentMethodsLoading(true);
    fetchPaymentMethods()
      .then(setPaymentMethods)
      .catch(() => setPaymentMethods([]))
      .finally(() => setPaymentMethodsLoading(false));
  }, [negocioId, checkPendingSync, reloadCuotas]);

  const close = useCallback(() => {
    if (savingRef.current) return;
    setVisible(false);
  }, []);

  const submit = useCallback(
    async (values: ProntoPagoFormValues) => {
      if (!negocioId || savingRef.current) return;
      const pending = await checkPendingSync();
      const blocked = prontoPagoBlockReason({ online, fromLocal, hasPendingSync: pending });
      if (blocked) {
        setNotice({ tone: 'error', text: blocked });
        return;
      }

      const request = {
        negocioId,
        routeStopId,
        expectedTotal: values.pendingTotal,
        discountAmount: values.discountAmount,
        discountReason: values.discountReason,
        receiptNumber: values.receiptNumber,
        notes: null,
        paymentMethodId: values.paymentMethodId,
      };
      const fingerprint = prontoPagoRequestFingerprint(request);
      if (attemptRef.current?.fingerprint !== fingerprint) {
        attemptRef.current = {
          fingerprint,
          key: createIdempotencyKey(),
          paidAt: new Date().toISOString(),
        };
      }
      const attempt = attemptRef.current;

      savingRef.current = true;
      setSaving(true);
      setNotice(null);
      let pagoId: string;
      try {
        pagoId = await registerProntoPago(
          buildProntoPagoRpcCall({ ...request, idempotencyKey: attempt.key, paidAt: attempt.paidAt })
        );
      } catch (error) {
        const message = negocioPagoErrorMessage(error, 'No se pudo registrar el pronto pago');
        if (isProntoPagoBalanceChangedError(message)) {
          // El payload cambia (nuevo esperado): la próxima confirmación usa clave nueva.
          attemptRef.current = null;
          setNotice({
            tone: 'warning',
            text: `${message}. Se actualizaron las cuotas: revise el nuevo total a pagar y confirme de nuevo.`,
          });
          await reloadCuotas();
        } else if (isNetworkError(error)) {
          // Se conserva la clave: si el servidor alcanzó a registrarlo, el
          // reintento devuelve el mismo pago en vez de duplicarlo.
          setNotice({ tone: 'error', text: PRONTO_PAGO_NETWORK_RETRY_MESSAGE });
        } else {
          attemptRef.current = null;
          setNotice({ tone: 'error', text: message });
        }
        return;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }

      // Confirmado por el servidor: la hoja se cierra y la pantalla refresca,
      // imprime y avisa. Un fallo ahí ya no es un fallo del pronto pago.
      attemptRef.current = null;
      setVisible(false);
      try {
        await onRegistered({
          pagoId,
          values,
          paidAt: attempt.paidAt,
          paymentMethodName: paymentMethods.find((method) => method.id === values.paymentMethodId)?.name ?? null,
        });
      } catch (error) {
        console.warn('[pronto-pago] fallo posterior al registro', error);
      }
    },
    [negocioId, routeStopId, online, fromLocal, checkPendingSync, reloadCuotas, onRegistered, paymentMethods]
  );

  return {
    visible,
    open,
    close,
    submit,
    summary,
    loading,
    saving,
    notice,
    blockReason,
    hasPendingSync,
    paymentMethods,
    paymentMethodsLoading,
  };
}
