import { useEffect, useState } from 'react';
import { fetchPaymentMethods, type PaymentMethodOption } from '../services/paymentMethodsService';

const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; methods: PaymentMethodOption[] } | null = null;
let inflight: Promise<PaymentMethodOption[]> | null = null;

function loadPaymentMethods(): Promise<PaymentMethodOption[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.methods);
  inflight ||= fetchPaymentMethods()
    .then((methods) => {
      cache = { at: Date.now(), methods };
      return methods;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Solo pruebas. */
export function resetPaymentMethodsCatalogCache() {
  cache = null;
  inflight = null;
}

/**
 * Catálogo de métodos de pago para PINTAR listas de pagos (qué pago sin
 * soporte lo exige). Una consulta compartida por todas las tarjetas, guardada
 * unos minutos; sin red cae al catálogo descargado. Si falla, lista vacía:
 * ningún pago se marca como obligatorio, pero se puede adjuntar igual.
 */
export function usePaymentMethodsCatalog(enabled = true): PaymentMethodOption[] {
  const [methods, setMethods] = useState<PaymentMethodOption[]>(() => cache?.methods ?? []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadPaymentMethods()
      .then((next) => {
        if (active) setMethods(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled]);
  return methods;
}
