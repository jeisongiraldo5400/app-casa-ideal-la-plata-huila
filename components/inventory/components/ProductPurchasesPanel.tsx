import { useTheme } from '@/components/theme';
import { Button, HelpHint } from '@/components/ui';
import { Radius, Spacing, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { COST_HELP } from '@/lib/costos/costHelp';
import { errorMessage } from '@/lib/errorMessage';
import {
  MOBILE_PURCHASES_LIMIT,
  formatPurchaseDate,
  parseProductPurchases,
  supplierLabel,
  type ProductPurchases,
} from '@/lib/costos/productPurchases';
import { supabase } from '@/lib/supabase';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type Props = {
  productId: string;
  /** Con señal; sin ella no se consulta y se avisa. */
  online: boolean;
};

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ProductPurchases };

const money = (value: number | null) => (value === null ? '—' : formatCOP(value));

async function fetchPurchases(productId: string): Promise<ProductPurchases> {
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    params: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>)('cost_product_purchases', {
    p_product_id: productId,
    p_limit: MOBILE_PURCHASES_LIMIT,
    p_offset: 0,
  });
  // errorMessage traduce las caídas de red («Network request failed»).
  if (error) throw new Error(errorMessage(error, 'No se pudieron consultar las compras.'));
  const parsed = parseProductPurchases(data);
  if (!parsed) throw new Error('Respuesta inválida del servidor.');
  return parsed;
}

/**
 * Botón «Últimas compras» de la tarjeta del producto (propuesta 4). Solo se
 * monta para el perfil «costos». Despliega las 5 recepciones más recientes
 * por orden de compra con costo y proveedor. Requiere conexión y no guarda
 * nada en el teléfono.
 */
export function ProductPurchasesPanel({ productId, online }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: 'idle' });

  const load = () => {
    setState({ status: 'loading' });
    fetchPurchases(productId)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) =>
        setState({ status: 'error', message: error instanceof Error ? error.message : 'No se pudieron consultar las compras.' })
      );
  };

  const toggle = () => setOpen((value) => !value);

  // Al abrir (o al volver la señal con el panel abierto) se consulta una vez.
  useEffect(() => {
    if (open && online && state.status === 'idle') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, online, state.status]);

  return (
    <View style={[styles.root, { borderTopColor: colors.divider }]} testID={`product-purchases-${productId}`}>
      <Button
        title={open ? 'Ocultar últimas compras' : 'Últimas compras'}
        icon="shopping-cart"
        variant="ghost"
        size="sm"
        onPress={toggle}
        accessibilityLabel="Últimas compras"
      />
      {open ? (
        !online ? (
          <Text style={[styles.note, { color: colors.warning.dark }]} testID="product-purchases-offline">
            Sin señal: las últimas compras se consultan con conexión.
          </Text>
        ) : state.status === 'loading' || state.status === 'idle' ? (
          <ActivityIndicator size="small" color={colors.primary.main} style={styles.loader} />
        ) : state.status === 'error' ? (
          <Text style={[styles.note, { color: colors.error.main }]} onPress={load} accessibilityRole="button">
            {state.message} Toca para reintentar.
          </Text>
        ) : (
          <View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summary, { color: colors.text.secondary }]}>Último {money(state.data.lastUnitCost)}</Text>
              <HelpHint term="Último costo" text={COST_HELP.ultimo_costo} size={13} />
              <Text style={[styles.summary, { color: colors.text.secondary }]}>· Promedio {money(state.data.avgUnitCost)}</Text>
              <HelpHint term="Costo promedio" text={COST_HELP.costo_promedio} size={13} />
              <Text style={[styles.summary, { color: colors.text.secondary }]}>
                · Mín. {money(state.data.minUnitCost)} · Máx. {money(state.data.maxUnitCost)}
              </Text>
            </View>
            {state.data.rows.length === 0 ? (
              <Text style={[styles.note, { color: colors.text.secondary }]}>Sin compras recibidas por orden de compra.</Text>
            ) : (
              state.data.rows.map((row) => (
                <View
                  key={row.entryId}
                  style={[styles.row, { backgroundColor: colors.surface.sunken, borderRadius: Radius.chip }]}
                  testID={`product-purchase-row-${row.entryId}`}
                >
                  <View style={styles.rowLine}>
                    <Text style={[styles.rowTitle, { color: colors.text.primary }]} numberOfLines={1}>
                      {formatPurchaseDate(row.createdAt)} · {row.orderNumber ?? 'Sin orden'}
                    </Text>
                    <Text style={[styles.rowCost, { color: colors.text.primary }]}>
                      {row.unitCost === null ? 'Sin costear' : money(row.unitCost)}
                    </Text>
                  </View>
                  <Text style={[styles.rowDetail, { color: colors.text.secondary }]} numberOfLines={2}>
                    {supplierLabel(row)} · {row.warehouseName ?? 'Sin bodega'} · ×{row.quantity}
                    {row.totalCost !== null ? ` = ${money(row.totalCost)}` : ''}
                    {row.receivedByName ? ` · Recibió ${row.receivedByName}` : ''}
                  </Text>
                </View>
              ))
            )}
            {state.data.total > state.data.rows.length ? (
              <Text style={[styles.note, { color: colors.text.secondary }]}>
                Mostrando las {state.data.rows.length} más recientes de {state.data.total}. El historial completo está en la web.
              </Text>
            ) : null}
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: Spacing.sm, paddingTop: Spacing.xs, borderTopWidth: StyleSheet.hairlineWidth },
  loader: { marginVertical: Spacing.sm },
  note: { fontSize: 12, marginTop: Spacing.xs },
  summary: { fontSize: 12 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, marginBottom: Spacing.xs },
  row: { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm, marginTop: Spacing.xs },
  rowLine: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  rowTitle: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  rowCost: { fontSize: 13, fontWeight: '700' },
  rowDetail: { fontSize: 12, marginTop: 2 },
});
