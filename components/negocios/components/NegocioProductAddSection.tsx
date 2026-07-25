import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { formatCOP } from '@/lib/creditCalculator';
import type { NegocioItem } from '@/components/negocios/infrastructure/store/negociosStore';
import {
  fetchProductWarehouseStock,
  getAddFormAvailability,
  parseNegocioMoney,
  parseNegocioQuantity,
  type ProductWarehouseStock,
} from '@/components/negocios/infrastructure/services/negociosStockService';

export type NegocioProduct = {
  id: string;
  name: string;
  sale_price: number;
};

type ThemeColors = {
  text: { primary: string; secondary: string };
  primary: { main: string; contrastText: string };
  background: { default: string; paper: string };
  divider: string;
};

type Props = {
  products: NegocioProduct[];
  productQuery: string;
  onProductQueryChange: (value: string) => void;
  items: NegocioItem[];
  onAdd: (item: NegocioItem) => void;
  onStockLoaded: (productId: string, stock: ProductWarehouseStock[]) => void;
  colors: ThemeColors;
};

export function NegocioProductAddSection({
  products,
  productQuery,
  onProductQueryChange,
  items,
  onAdd,
  onStockLoaded,
  colors,
}: Props) {
  const [selectedProduct, setSelectedProduct] = useState<NegocioProduct | null>(null);
  const [productStock, setProductStock] = useState<ProductWarehouseStock[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [qty, setQty] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [products, productQuery]);

  useEffect(() => {
    if (!selectedProduct) {
      setProductStock([]);
      setWarehouseId('');
      setLoadingStock(false);
      return;
    }

    let cancelled = false;
    setLoadingStock(true);

    fetchProductWarehouseStock(selectedProduct.id)
      .then((rows) => {
        if (cancelled) return;
        setProductStock(rows);
        setWarehouseId(rows[0]?.warehouse_id ?? '');
        onStockLoaded(selectedProduct.id, rows);
      })
      .catch((error: any) => {
        if (cancelled) return;
        Alert.alert('Error', error.message || 'No se pudo consultar stock');
        setProductStock([]);
        setWarehouseId('');
      })
      .finally(() => {
        if (!cancelled) setLoadingStock(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProduct, onStockLoaded]);

  const availability = useMemo(() => {
    if (!selectedProduct || !warehouseId) {
      return { total: 0, reserved: 0, available: 0 };
    }
    return getAddFormAvailability(
      productStock,
      items,
      selectedProduct.id,
      warehouseId
    );
  }, [selectedProduct, warehouseId, productStock, items]);

  const quantity = parseNegocioQuantity(qty);
  const price = parseNegocioMoney(unitPrice);
  const qtyExceedsStock =
    Number.isFinite(quantity) && quantity > availability.available;
  const hasStock = selectedProduct ? productStock.length > 0 : false;

  const canAdd =
    !!selectedProduct &&
    !!warehouseId &&
    hasStock &&
    availability.available > 0 &&
    Number.isFinite(quantity) &&
    quantity > 0 &&
    !qtyExceedsStock &&
    Number.isFinite(price) &&
    price > 0 &&
    !loadingStock;

  const pickProduct = (product: NegocioProduct) => {
    setSelectedProduct(product);
    const catalogPrice = Number(product.sale_price) || 0;
    setUnitPrice(catalogPrice > 0 ? String(catalogPrice) : '');
    setQty('1');
    onProductQueryChange('');
  };

  const handleWarehouseChange = (nextWarehouseId: string) => {
    setWarehouseId(nextWarehouseId);
    if (!selectedProduct) return;

    const nextAvailability = getAddFormAvailability(
      productStock,
      items,
      selectedProduct.id,
      nextWarehouseId
    );
    const currentQty = parseNegocioQuantity(qty);
    if (
      Number.isFinite(currentQty) &&
      currentQty > nextAvailability.available &&
      nextAvailability.available > 0
    ) {
      setQty(String(nextAvailability.available));
    }
  };

  const handleAdd = () => {
    if (!selectedProduct || !canAdd) return;

    onAdd({
      product_id: selectedProduct.id,
      warehouse_id: warehouseId,
      quantity,
      description: selectedProduct.name,
      unit_price: price,
    });

    setSelectedProduct(null);
    setProductStock([]);
    setWarehouseId('');
    setQty('1');
    setUnitPrice('');
  };

  return (
    <View style={styles.block}>
      <Text style={{ color: colors.text.secondary }}>Buscar producto</Text>
      <TextInput
        style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
        placeholder="Nombre del producto"
        placeholderTextColor={colors.text.secondary}
        value={productQuery}
        onChangeText={onProductQueryChange}
      />

      {!selectedProduct &&
        filteredProducts.map((p) => (
          <Pressable key={p.id} onPress={() => pickProduct(p)} style={styles.option}>
            <Text style={{ color: colors.text.primary, flex: 1 }}>{p.name}</Text>
            <Text style={{ color: colors.primary.main }}>
              {Number(p.sale_price) > 0
                ? formatCOP(Number(p.sale_price))
                : 'Sin precio'}
            </Text>
          </Pressable>
        ))}

      {selectedProduct && (
        <View style={[styles.summary, { backgroundColor: colors.background.paper }]}>
          <Text style={{ color: colors.text.primary, fontWeight: '600' }}>
            {selectedProduct.name}
          </Text>

          {loadingStock ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary.main} />
              <Text style={{ color: colors.text.secondary }}>Consultando stock…</Text>
            </View>
          ) : !hasStock ? (
            <Text style={{ color: 'crimson' }}>Sin stock en ninguna bodega</Text>
          ) : (
            <>
              <Text style={{ color: colors.text.secondary, marginTop: 4 }}>Bodega</Text>
              <View style={styles.rowWrap}>
                {productStock.map((row) => {
                  const disp = getAddFormAvailability(
                    productStock,
                    items,
                    selectedProduct.id,
                    row.warehouse_id
                  ).available;
                  const disabled = disp <= 0;
                  return (
                    <Pressable
                      key={row.warehouse_id}
                      disabled={disabled}
                      onPress={() => handleWarehouseChange(row.warehouse_id)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor:
                            warehouseId === row.warehouse_id
                              ? colors.primary.main
                              : colors.background.default,
                          opacity: disabled ? 0.45 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color:
                            warehouseId === row.warehouse_id
                              ? colors.primary.contrastText
                              : colors.text.primary,
                          fontSize: 12,
                        }}
                      >
                        {row.warehouse_name} ({disp})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={{ color: colors.text.secondary, marginTop: 8 }}>
                Cantidad (máx. {availability.available})
              </Text>
              <TextInput
                keyboardType="numeric"
                style={[
                  styles.input,
                  {
                    borderColor: qtyExceedsStock ? 'crimson' : colors.divider,
                    color: colors.text.primary,
                  },
                ]}
                value={qty}
                onChangeText={setQty}
                editable={hasStock && !loadingStock}
              />

              <Text style={{ color: colors.text.secondary, marginTop: 8 }}>
                Valor unitario (contado)
              </Text>
              <TextInput
                keyboardType="numeric"
                style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
                placeholder="Ej: 2227000"
                placeholderTextColor={colors.text.secondary}
                value={unitPrice}
                onChangeText={setUnitPrice}
              />
              {unitPrice ? (
                <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                  {formatCOP(parseNegocioMoney(unitPrice) || 0)}
                </Text>
              ) : null}
            </>
          )}

          <View style={[styles.rowWrap, { marginTop: 10 }]}>
            <Pressable
              style={[styles.chip, { backgroundColor: colors.background.default }]}
              onPress={() => {
                setSelectedProduct(null);
                setProductStock([]);
                setWarehouseId('');
                setQty('1');
                setUnitPrice('');
              }}
            >
              <Text style={{ color: colors.text.primary }}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[
                styles.chip,
                {
                  backgroundColor: canAdd ? colors.primary.main : colors.background.default,
                  opacity: canAdd ? 1 : 0.5,
                },
              ]}
              disabled={!canAdd}
              onPress={handleAdd}
            >
              <Text
                style={{
                  color: canAdd ? colors.primary.contrastText : colors.text.secondary,
                  fontWeight: '600',
                }}
              >
                Agregar
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  option: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  summary: { padding: 12, borderRadius: 10, gap: 4, marginTop: 4 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
});
