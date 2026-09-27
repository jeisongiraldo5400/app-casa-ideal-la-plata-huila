import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { AttachPagoSupportSheet } from '@/components/negocios/components/AttachPagoSupportSheet';
import { useAttachPagoSupport } from '@/components/negocios/infrastructure/hooks/useAttachPagoSupport';
import { usePaymentMethodsCatalog } from '@/components/negocios/infrastructure/hooks/usePaymentMethodsCatalog';
import type { MisCobroRow } from '@/lib/cartera/misCobros';
import { formatCOP } from '@/lib/creditCalculator';
import { invalidateCartera } from '@/lib/cartera/carteraCache';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { pagoSupportUiState } from '@/lib/pagoSupportRules';
import type { PagoSupportAttachOutcome } from '@/lib/pagoSupportAttach';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable } from 'react-native';

/**
 * «Adjuntar soporte» en una fila de Cobros. Solo en filas del servidor sin
 * soporte (`support_path === null`; las del teléfono no traen el dato), ni
 * anuladas ni pendientes/rechazadas. Quien ve la fila ya puede adjuntar según
 * `attach_negocio_pago_support`: la registró él («Realizados»), es el gestor
 * asignado («De mi cartera») o es admin; el servidor vuelve a validar.
 * En rojo si su método exige soporte, como «Adjuntar» en la web.
 */
export function MisCobroAttachSupport({ row }: { row: MisCobroRow }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const online = useSyncStore((state) => state.online);
  const [done, setDone] = useState<PagoSupportAttachOutcome | null>(null);
  const eligible =
    row.support_path === null && row.receipt_status !== 'anulado' && !row.local_state && done === null;
  const methods = usePaymentMethodsCatalog(eligible);
  const attach = useAttachPagoSupport({
    onDone: (outcome) => {
      setDone(outcome);
      if (outcome === 'attached') invalidateCartera();
    },
  });

  if (done === 'queued') {
    return <MaterialIcons name="cloud-upload" size={22} color={colors.warning.main} accessibilityLabel="Soporte pendiente de subir" />;
  }
  if (!eligible) return null;

  const required =
    pagoSupportUiState({
      pago: { id: row.payment_id, support_path: null, payment_method_id: row.payment_method_id },
      queuedPagoIds: new Set(),
      methods,
    }) === 'required_missing';

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={required ? 'Adjuntar soporte obligatorio del pago' : 'Adjuntar soporte del pago'}
        hitSlop={8}
        onPress={() =>
          attach.open({
            negocioId: row.negocio_id,
            pagoId: row.payment_id,
            title: `${formatCOP(row.amount)} · ${row.virtual_receipt_number || 'Provisional'}`,
            supportRequired: required,
            methodName: row.payment_method_name,
          })
        }>
        <MaterialIcons name="upload-file" size={22} color={required ? colors.error.main : colors.primary.main} />
      </Pressable>
      {attach.visible ? <AttachPagoSupportSheet attach={attach} online={online} /> : null}
    </>
  );
}
