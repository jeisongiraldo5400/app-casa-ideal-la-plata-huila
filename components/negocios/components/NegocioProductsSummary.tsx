import { View, Text, StyleSheet } from 'react-native';
import { formatCOP } from '@/lib/creditCalculator';

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

type ThemeColors = {
  text: { primary: string; secondary: string };
  background: { paper: string };
  divider: string;
  primary: { main: string };
};

type Props = {
  items: NegocioProductSummaryItem[];
  productsSubtotal?: number | null;
  colors: ThemeColors;
};

function itemLabel(item: NegocioProductSummaryItem) {
  return (
    item.description?.trim() ||
    item.product?.name?.trim() ||
    item.product?.sku?.trim() ||
    item.product_id
  );
}

export function NegocioProductsSummary({
  items,
  productsSubtotal,
  colors,
}: Props) {
  const computedSubtotal = items.reduce(
    (sum, item) => sum + Number(item.subtotal || 0),
    0
  );
  const total =
    productsSubtotal != null && Number.isFinite(Number(productsSubtotal))
      ? Number(productsSubtotal)
      : computedSubtotal;

  return (
    <View style={styles.root}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.section, { color: colors.text.primary }]}>Productos</Text>
        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
          {items.length} ítem{items.length === 1 ? '' : 's'}
        </Text>
      </View>

      {!items.length ? (
        <Text style={{ color: colors.text.secondary, fontStyle: 'italic' }}>
          Sin productos asignados
        </Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <View
              key={item.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.background.paper,
                  borderColor: colors.divider,
                },
              ]}
            >
              <View style={styles.cardTop}>
                <View
                  style={[
                    styles.qtyBadge,
                    { backgroundColor: `${colors.primary.main}18` },
                  ]}
                >
                  <Text style={{ color: colors.primary.main, fontWeight: '900' }}>
                    ×{Number(item.quantity)}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{ color: colors.text.primary, fontWeight: '700', fontSize: 14 }}
                    numberOfLines={2}
                  >
                    {itemLabel(item)}
                  </Text>
                  <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                    Bodega: {item.warehouse?.name || '—'}
                  </Text>
                </View>
              </View>
              <View style={[styles.amounts, { borderTopColor: colors.divider }]}>
                <View>
                  <Text style={styles.amountLabel}>UNITARIO</Text>
                  <Text style={[styles.amountValue, { color: colors.text.primary }]}>
                    {formatCOP(Number(item.unit_price))}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.amountLabel}>SUBTOTAL</Text>
                  <Text style={[styles.amountValue, { color: colors.text.primary }]}>
                    {formatCOP(Number(item.subtotal))}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          <View
            style={[
              styles.footer,
              {
                backgroundColor: colors.background.paper,
                borderColor: colors.divider,
              },
            ]}
          >
            <Text style={{ color: colors.text.secondary, fontWeight: '700' }}>
              Subtotal productos
            </Text>
            <Text style={{ color: colors.text.primary, fontWeight: '900', fontSize: 15 }}>
              {formatCOP(total)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  section: { fontWeight: '700', marginTop: 8 },
  list: { gap: 10 },
  card: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  qtyBadge: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  amounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  amountLabel: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  amountValue: { fontSize: 13, fontWeight: '900', marginTop: 3 },
  footer: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
