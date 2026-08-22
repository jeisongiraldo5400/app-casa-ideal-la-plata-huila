import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { formatCOP } from '@/lib/creditCalculator';
import type { NegocioItem } from '@/components/negocios/infrastructure/store/negociosStore';
import {
  availableQtyForItem,
  formatNegocioMoneyInput,
  parseNegocioMoney,
  parseNegocioQuantity,
  type ProductWarehouseStock,
} from '@/components/negocios/infrastructure/services/negociosStockService';

type ThemeColors = {
  text: { primary: string; secondary: string };
  primary: { main: string; contrastText: string };
  background: { default: string; paper: string };
  divider: string;
};

type Props = {
  items: NegocioItem[];
  stockByProduct: Record<string, ProductWarehouseStock[]>;
  warehouseLocked?: boolean;
  onUpdateItem: (
    index: number,
    patch: Partial<Pick<NegocioItem, 'quantity' | 'unit_price' | 'warehouse_id'>>
  ) => void;
  onRemoveItem: (index: number) => void;
  colors: ThemeColors;
};

function EditableMoneyInput({
  value,
  label,
  colors,
  onChange,
}: {
  value: number;
  label: string;
  colors: ThemeColors;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => formatNegocioMoneyInput(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(formatNegocioMoneyInput(value));
  }, [focused, value]);

  const handleChange = (text: string) => {
    const formatted = formatNegocioMoneyInput(text);
    setDraft(formatted);

    const parsed = parseNegocioMoney(formatted);
    if (Number.isSafeInteger(parsed) && parsed >= 0) onChange(parsed);
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseNegocioMoney(draft);
    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      onChange(parsed);
      setDraft(formatNegocioMoneyInput(parsed));
    } else {
      setDraft(formatNegocioMoneyInput(value));
    }
  };

  return (
    <TextInput
      accessibilityLabel={label}
      keyboardType="numeric"
      selectTextOnFocus
      style={[
        styles.input,
        { borderColor: colors.divider, color: colors.text.primary },
      ]}
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onChangeText={handleChange}
    />
  );
}

export function NegocioItemsList({
  items,
  stockByProduct,
  warehouseLocked = false,
  onUpdateItem,
  onRemoveItem,
  colors,
}: Props) {
  if (!items.length) {
    return (
      <Text style={{ color: colors.text.secondary, fontStyle: 'italic' }}>
        Sin productos agregados
      </Text>
    );
  }

  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      {items.map((item, idx) => {
        const stockOptions = stockByProduct[item.product_id] || [];
        const maxQty = availableQtyForItem(
          stockByProduct,
          items,
          item.product_id,
          item.warehouse_id,
          idx
        );
        const qtyIssue = item.quantity > maxQty;
        const warehouseName =
          stockOptions.find((s) => s.warehouse_id === item.warehouse_id)
            ?.warehouse_name || 'Bodega';

        return (
          <View
            key={`${item.product_id}-${item.warehouse_id}-${idx}`}
            style={[styles.card, { backgroundColor: colors.background.paper }]}
          >
            <Text style={{ color: colors.text.primary, fontWeight: '600' }}>
              {item.description}
            </Text>

            <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 4 }}>
              Bodega
            </Text>
            {warehouseLocked ? (
              <Text style={{ color: colors.text.primary, fontSize: 13 }}>
                {warehouseName}
              </Text>
            ) : stockOptions.length === 0 ? (
              <Text style={{ color: 'crimson', fontSize: 12 }}>Sin stock</Text>
            ) : (
              <View style={styles.rowWrap}>
                {stockOptions.map((row) => {
                  const disp = availableQtyForItem(
                    stockByProduct,
                    items,
                    item.product_id,
                    row.warehouse_id,
                    idx
                  );
                  const canSelect = disp >= item.quantity;
                  return (
                    <Pressable
                      key={row.warehouse_id}
                      disabled={!canSelect}
                      onPress={() =>
                        onUpdateItem(idx, { warehouse_id: row.warehouse_id })
                      }
                      style={[
                        styles.chip,
                        {
                          backgroundColor:
                            item.warehouse_id === row.warehouse_id
                              ? colors.primary.main
                              : colors.background.default,
                          opacity: canSelect ? 1 : 0.45,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color:
                            item.warehouse_id === row.warehouse_id
                              ? colors.primary.contrastText
                              : colors.text.primary,
                          fontSize: 11,
                        }}
                      >
                        {row.warehouse_name} ({disp})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12 }}>Cant.</Text>
                <TextInput
                  keyboardType="numeric"
                  style={[
                    styles.input,
                    {
                      borderColor: qtyIssue ? 'crimson' : colors.divider,
                      color: colors.text.primary,
                    },
                  ]}
                  value={String(item.quantity)}
                  onChangeText={(text) => {
                    const quantity = parseNegocioQuantity(text);
                    if (Number.isSafeInteger(quantity) && quantity > 0) {
                      onUpdateItem(idx, { quantity });
                    }
                  }}
                />
                {qtyIssue ? (
                  <Text style={{ color: 'crimson', fontSize: 11 }}>Máx: {maxQty}</Text>
                ) : (
                  <Text style={{ color: colors.text.secondary, fontSize: 11 }}>
                    Disp: {maxQty}
                  </Text>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                  Vr. unitario
                </Text>
                <EditableMoneyInput
                  value={item.unit_price}
                  label={`Valor unitario de ${item.description}`}
                  colors={colors}
                  onChange={(unit_price) => onUpdateItem(idx, { unit_price })}
                />
              </View>
            </View>

            <View style={styles.footerRow}>
              <Text style={{ color: colors.text.primary }}>
                {formatCOP(item.unit_price * item.quantity)}
              </Text>
              <Pressable onPress={() => onRemoveItem(idx)}>
                <Text style={{ color: 'crimson' }}>Quitar</Text>
              </Pressable>
            </View>

            <Text style={{ color: colors.text.secondary, fontSize: 11 }}>
              {warehouseName}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 10, gap: 4 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  rowFields: { flexDirection: 'row', gap: 10, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
});
