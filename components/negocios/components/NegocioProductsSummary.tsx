import { useTheme } from '@/components/theme';
import { ListCard, Metric, SectionHeader } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type NegocioProductSummaryItem = {
  id: string;
  quantity: number;
  description: string | null;
  product_id: string;
  unit_price: number;
  subtotal: number;
  warehouse?: { name: string | null } | null;
  product?: { name: string | null; sku?: string | null } | null;
};

type Props = {
  items: NegocioProductSummaryItem[];
  productsSubtotal?: number | null;
};

function itemLabel(item: NegocioProductSummaryItem) {
  return item.description?.trim() || item.product?.name?.trim() || item.product?.sku?.trim() || item.product_id;
}

/** Productos del negocio en solo lectura, con subtotal. */
export function NegocioProductsSummary({ items, productsSubtotal }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const computedSubtotal = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const total =
    productsSubtotal != null && Number.isFinite(Number(productsSubtotal)) ? Number(productsSubtotal) : computedSubtotal;

  return (
    <View style={styles.root}>
      <SectionHeader title="Productos" hint={`${items.length} ítem${items.length === 1 ? '' : 's'}`} />

      {!items.length ? (
        <Text style={[styles.empty, { color: colors.text.secondary }]}>Sin productos asignados</Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <ListCard key={item.id}>
              <View style={styles.top}>
                <View style={[styles.qty, { backgroundColor: `${colors.primary.main}18` }]}>
                  <Text style={[styles.qtyText, { color: colors.primary.main }]}>×{Number(item.quantity)}</Text>
                </View>
                <View style={styles.copy}>
                  <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={2}>{itemLabel(item)}</Text>
                  <Text style={[styles.warehouse, { color: colors.text.secondary }]}>Bodega: {item.warehouse?.name || '—'}</Text>
                </View>
              </View>
              <View style={[styles.amounts, { borderTopColor: colors.divider }]}>
                <Metric label="Unitario" value={formatCOP(Number(item.unit_price))} />
                <Metric label="Subtotal" value={formatCOP(Number(item.subtotal))} align="right" />
              </View>
            </ListCard>
          ))}

          <View style={[styles.footer, { backgroundColor: colors.surface.muted }]}>
            <Text style={[styles.footerLabel, { color: colors.text.secondary }]}>Subtotal productos</Text>
            <Text style={[styles.footerValue, { color: colors.text.primary }]}>{formatCOP(total)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.md },
  empty: { ...Typography.bodySmall, fontStyle: 'italic' },
  list: { gap: Spacing.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  qty: { minWidth: 40, height: 40, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.sm },
  qtyText: { ...Typography.bodySmallStrong, fontWeight: '800' },
  copy: { flex: 1, gap: 2 },
  name: { ...Typography.bodySmallStrong },
  warehouse: { ...Typography.metadata, fontWeight: '400' },
  amounts: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm, marginTop: Spacing.xs },
  footer: {
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLabel: { ...Typography.bodySmallStrong },
  footerValue: { ...Typography.bodyStrong, fontWeight: '800' },
});
