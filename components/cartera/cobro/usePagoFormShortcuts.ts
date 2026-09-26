import { useCallback, useEffect, useMemo, useRef } from 'react';
import { bogotaDateValue } from '@/lib/localDate';
import {
  pagoAmountShortcuts,
  pickDefaultPaymentMethod,
  type CuotaForShortcut,
  type PaymentMethodLike,
} from '@/lib/cartera/cobroFormDefaults';
import { readCashMethodIds, readLastPaymentMethod, saveLastPaymentMethod } from '@/lib/cartera/lastPaymentMethod';
import {
  formatMoneyParsed,
  moneyValueToDraft,
  parseMoneyText,
  roundMoney,
  type MoneyInputOptions,
} from '@/lib/moneyInput';

type Options = {
  userId: string | null | undefined;
  /** La hoja de cobro está abierta. */
  open: boolean;
  paymentMethods: PaymentMethodLike[];
  paymentMethodId: string;
  setPaymentMethodId: (id: string) => void;
  cuotas: CuotaForShortcut[];
  pendingBalance: number;
  amountOptions: MoneyInputOptions;
};

/**
 * Menos toques al cobrar: al abrir la hoja preselecciona el último método que
 * usó este usuario en el teléfono (o el de efectivo) y ofrece llenar el valor
 * con lo vencido o con la cuota actual. `remember` se llama tras un cobro
 * registrado.
 */
export function usePagoFormShortcuts({
  userId,
  open,
  paymentMethods,
  paymentMethodId,
  setPaymentMethodId,
  cuotas,
  pendingBalance,
  amountOptions,
}: Options) {
  // Solo una preselección por apertura: si la persona borra o cambia el método, se respeta.
  const appliedRef = useRef(false);
  useEffect(() => {
    if (!open) appliedRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open || appliedRef.current || paymentMethodId || !paymentMethods.length) return;
    appliedRef.current = true;
    let alive = true;
    void Promise.all([readLastPaymentMethod(userId), readCashMethodIds()]).then(([rememberedId, cashMethodIds]) => {
      if (!alive) return;
      const picked = pickDefaultPaymentMethod(paymentMethods, { rememberedId, cashMethodIds });
      if (picked) setPaymentMethodId(picked);
    });
    return () => {
      alive = false;
    };
  }, [open, paymentMethodId, paymentMethods, setPaymentMethodId, userId]);

  const shortcuts = useMemo(
    () => pagoAmountShortcuts(cuotas, bogotaDateValue(), pendingBalance),
    [cuotas, pendingBalance]
  );

  /** Texto del campo («93.333,33») para un valor de atajo, con los decimales permitidos. */
  const amountToDisplay = useCallback(
    (amount: number) => {
      const decimals = amountOptions.decimalPlaces;
      const value = decimals === 0 ? Math.min(Math.round(amount), Math.floor(pendingBalance + 0.009)) : roundMoney(amount, decimals);
      return formatMoneyParsed(parseMoneyText(moneyValueToDraft(value, amountOptions), amountOptions));
    },
    [amountOptions, pendingBalance]
  );

  const remember = useCallback((methodId: string | null | undefined) => saveLastPaymentMethod(userId, methodId), [userId]);

  return { shortcuts, amountToDisplay, remember };
}
