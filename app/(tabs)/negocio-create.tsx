import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import {
  calculateCredit,
  formatCOP,
  type CreditFrequency,
} from '@/lib/creditCalculator';
import {
  useNegociosStore,
  type NegocioItem,
} from '@/components/negocios/infrastructure/store/negociosStore';
import { SignaturePad } from '@/components/negocios/components/SignaturePad';
import { NegocioProductAddSection } from '@/components/negocios/components/NegocioProductAddSection';
import { NegocioItemsList } from '@/components/negocios/components/NegocioItemsList';
import {
  availableQtyForItem,
  fetchStockForProducts,
  itemsHaveValidStock,
  type ProductWarehouseStock,
} from '@/components/negocios/infrastructure/services/negociosStockService';

type Customer = {
  id: string;
  name: string;
  id_number: string;
};

type Product = {
  id: string;
  name: string;
  sale_price: number;
};

const WIZARD_STEPS = [
  { id: 0, label: 'Cliente', icon: 'person' },
  { id: 1, label: 'Productos', icon: 'shopping-cart' },
  { id: 2, label: 'Crédito', icon: 'calculate' },
  { id: 3, label: 'Firma', icon: 'draw' },
];

export default function NegocioCreateScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { fetchCreditSettings, creditSettings, createAndActivate } =
    useNegociosStore();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [codeudor, setCodeudor] = useState<Customer | null>(null);
  const [location, setLocation] = useState('');
  const [items, setItems] = useState<NegocioItem[]>([]);
  const [stockByProduct, setStockByProduct] = useState<
    Record<string, ProductWarehouseStock[]>
  >({});
  const [downPayment, setDownPayment] = useState('0');
  const [installments, setInstallments] = useState('3');
  const [frequency, setFrequency] = useState<CreditFrequency>('mensual');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [signature, setSignature] = useState('');
  const [sellerSignature, setSellerSignature] = useState('');
  const [guarantorSignature, setGuarantorSignature] = useState('');

  // Modal para crear nuevo cliente
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const [pickingCodeudor, setPickingCodeudor] = useState(false);

  useEffect(() => {
    fetchCreditSettings();
    (async () => {
      const [c, p] = await Promise.all([
        supabase
          .from('customers')
          .select('id, name, id_number')
          .is('deleted_at', null)
          .order('name')
          .limit(200),
        supabase
          .from('products')
          .select('id, name, sale_price')
          .is('deleted_at', null)
          .eq('status', true)
          .order('name')
          .limit(200),
      ]);
      setCustomers(c.data || []);
      setProducts(p.data || []);
    })();
  }, [fetchCreditSettings]);

  useEffect(() => {
    const productIds = [...new Set(items.map((i) => i.product_id))];
    if (!productIds.length) {
      setStockByProduct({});
      return;
    }

    let cancelled = false;
    fetchStockForProducts(productIds)
      .then((map) => {
        if (!cancelled) setStockByProduct(map);
      })
      .catch((error: any) => {
        if (!cancelled) {
          Alert.alert('Error', error.message || 'No se pudo consultar stock');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [items]);

  const handleStockLoaded = useCallback(
    (productId: string, stock: ProductWarehouseStock[]) => {
      setStockByProduct((prev) => ({ ...prev, [productId]: stock }));
    },
    []
  );

  const settings = creditSettings || {
    formula_type: 'financed_balance' as const,
    interest_rate_monthly_pct: 0,
    rounding_unit: 1000,
  };

  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const calc = calculateCredit({
    productsSubtotal: subtotal,
    downPayment: Number(downPayment) || 0,
    installmentsCount: Number(installments) || 1,
    settings,
  });

  // Búsqueda de clientes: VACÍA si no hay término de búsqueda
  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.id_number.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [customers, customerQuery]);

  const warehouseLabel = (productId: string, warehouseId: string) =>
    stockByProduct[productId]?.find((s) => s.warehouse_id === warehouseId)
      ?.warehouse_name || 'Bodega';

  const handleAddItem = (item: NegocioItem) => {
    setItems((prev) => [...prev, item]);
  };

  const updateItem = (
    index: number,
    patch: Partial<Pick<NegocioItem, 'quantity' | 'unit_price' | 'warehouse_id'>>
  ) => {
    setItems((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row));
      const updated = next[index];
      if (!updated) return next;

      if (patch.quantity !== undefined || patch.warehouse_id !== undefined) {
        const available = availableQtyForItem(
          stockByProduct,
          next,
          updated.product_id,
          updated.warehouse_id,
          index
        );
        if (updated.quantity > available) {
          Alert.alert(
            'Stock insuficiente',
            `Disponible en ${warehouseLabel(updated.product_id, updated.warehouse_id)}: ${available}`
          );
          return prev;
        }
      }

      return next;
    });
  };

  const canAdvanceProductsStep = () => {
    if (!items.length) return false;
    if (items.some((i) => i.unit_price <= 0 || i.quantity <= 0)) return false;
    return itemsHaveValidStock(items, stockByProduct);
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim() || !newCustomerId.trim()) {
      return Alert.alert('Campos requeridos', 'Ingrese el nombre y documento del cliente.');
    }
    try {
      setCreatingCustomer(true);
      const { data, error } = await supabase
        .from('customers')
        .insert({
          name: newCustomerName.trim(),
          id_number: newCustomerId.trim(),
          phone: newCustomerPhone.trim() || null,
        })
        .select('id, name, id_number')
        .single();

      if (error) throw error;

      setCustomers((prev) => [data, ...prev]);
      if (pickingCodeudor) {
        setCodeudor(data);
        setPickingCodeudor(false);
      } else {
        setCustomer(data);
      }
      setNewCustomerName('');
      setNewCustomerId('');
      setNewCustomerPhone('');
      setShowNewCustomerModal(false);
      Alert.alert('¡Éxito!', `Cliente ${data.name} creado y seleccionado.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo crear el cliente');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const submit = async (activate: boolean) => {
    if (!customer) return Alert.alert('Seleccione cliente');
    if (!items.length) return Alert.alert('Agregue productos');
    if (!itemsHaveValidStock(items, stockByProduct)) {
      return Alert.alert(
        'Stock insuficiente',
        'Revise la bodega y cantidad de cada producto.'
      );
    }
    if (!firstDueDate) return Alert.alert('Indique fecha primera cuota');
    if (activate && !signature) return Alert.alert('Firma del cliente requerida');

    try {
      setSaving(true);
      const result = await createAndActivate({
        deal_date: new Date().toISOString().slice(0, 10),
        location,
        customer_id: customer.id,
        codeudor_customer_id: codeudor?.id || null,
        items,
        down_payment: Number(downPayment) || 0,
        installments_count: Number(installments) || 1,
        frequency,
        first_due_date: firstDueDate,
        customer_signature_data_url: signature || '',
        guarantor_signature_data_url: guarantorSignature || undefined,
        seller_signature_data_url: sellerSignature || undefined,
        activate,
      });
      Alert.alert(
        '¡Éxito!',
        activate
          ? `Negocio #${result?.numero} activado. Se creó la orden de entrega.`
          : `Negocio #${result?.numero} guardado como borrador.`,
        [{ text: 'Aceptar', onPress: () => router.replace('/(tabs)/negocios') }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo crear el negocio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.default }}>
      {/* Wizard Steps Header */}
      <View style={[styles.wizardHeader, { backgroundColor: colors.background.paper, borderBottomColor: colors.divider }]}>
        {WIZARD_STEPS.map((s, idx) => {
          const isActive = step === s.id;
          const isDone = step > s.id;
          return (
            <View key={s.id} style={styles.wizardStepItem}>
              <View
                style={[
                  styles.wizardStepBadge,
                  {
                    backgroundColor: isActive
                      ? colors.primary.main
                      : isDone
                      ? colors.success.main
                      : colors.divider,
                  },
                ]}
              >
                {isDone ? (
                  <MaterialIcons name="check" size={14} color="#fff" />
                ) : (
                  <Text style={[styles.wizardStepNumber, { color: isActive ? colors.primary.contrastText : colors.text.secondary }]}>
                    {s.id + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.wizardStepLabel,
                  {
                    color: isActive
                      ? colors.primary.main
                      : isDone
                      ? colors.text.primary
                      : colors.text.secondary,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
                numberOfLines={1}
              >
                {s.label}
              </Text>
            </View>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}
      >
        {step === 0 && (
          <View style={styles.block}>
            {/* SECCIÓN CLIENTE */}
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
              {pickingCodeudor ? '1. Selección de Codeudor' : '1. Selección de Cliente'}
            </Text>

            {!pickingCodeudor && customer ? (
              /* Cliente Seleccionado Card */
              <View style={[styles.selectedCard, { backgroundColor: colors.primary.main + '12', borderColor: colors.primary.main }]}>
                <MaterialIcons name="check-circle" size={28} color={colors.primary.main} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary.main, textTransform: 'uppercase' }}>
                    Cliente Seleccionado
                  </Text>
                  <Text style={[styles.selectedCardTitle, { color: colors.text.primary }]}>
                    {customer.name}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.text.secondary }}>
                    Cédula / NIT: {customer.id_number}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.changeBtn, { borderColor: colors.primary.main }]}
                  onPress={() => setCustomer(null)}
                >
                  <Text style={{ color: colors.primary.main, fontSize: 12, fontWeight: '700' }}>Cambiar</Text>
                </TouchableOpacity>
              </View>
            ) : pickingCodeudor && codeudor ? (
              /* Codeudor Seleccionado Card */
              <View style={[styles.selectedCard, { backgroundColor: colors.info.main + '12', borderColor: colors.info.main }]}>
                <MaterialIcons name="person" size={28} color={colors.info.main} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.info.main, textTransform: 'uppercase' }}>
                    Codeudor Seleccionado
                  </Text>
                  <Text style={[styles.selectedCardTitle, { color: colors.text.primary }]}>
                    {codeudor.name}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.text.secondary }}>
                    Cédula / NIT: {codeudor.id_number}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.changeBtn, { borderColor: colors.info.main }]}
                  onPress={() => {
                    setCodeudor(null);
                    setPickingCodeudor(false);
                  }}
                >
                  <Text style={{ color: colors.info.main, fontSize: 12, fontWeight: '700' }}>Quitar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Buscador de Cliente / Codeudor */
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 13, color: colors.text.secondary }}>
                  {pickingCodeudor
                    ? 'Busque el codeudor por nombre o número de cédula:'
                    : 'Busque el cliente por nombre o número de cédula:'}
                </Text>
                <View style={styles.searchBox}>
                  <MaterialIcons name="search" size={20} color={colors.text.secondary} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text.primary }]}
                    placeholder="Nombre o cédula..."
                    placeholderTextColor={colors.text.secondary}
                    value={customerQuery}
                    onChangeText={setCustomerQuery}
                    autoFocus={pickingCodeudor}
                  />
                  {customerQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setCustomerQuery('')}>
                      <MaterialIcons name="close" size={18} color={colors.text.secondary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Resultados de Búsqueda */}
                {customerQuery.trim().length === 0 ? (
                  <View style={styles.searchHintBox}>
                    <MaterialIcons name="info-outline" size={20} color={colors.text.secondary} />
                    <Text style={{ fontSize: 13, color: colors.text.secondary }}>
                      Escriba en el buscador para ver coincidencias de clientes.
                    </Text>
                  </View>
                ) : filteredCustomers.length === 0 ? (
                  <View style={styles.searchHintBox}>
                    <MaterialIcons name="search-off" size={20} color={colors.text.secondary} />
                    <Text style={{ fontSize: 13, color: colors.text.secondary }}>
                      No se encontraron clientes con esa búsqueda.
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.resultsList, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
                    {filteredCustomers.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => {
                          if (pickingCodeudor) {
                            setCodeudor(c);
                            setPickingCodeudor(false);
                          } else {
                            setCustomer(c);
                          }
                          setCustomerQuery('');
                        }}
                        style={[styles.resultItem, { borderBottomColor: colors.divider }]}
                      >
                        <MaterialIcons name="person" size={22} color={colors.primary.main} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 14 }}>{c.name}</Text>
                          <Text style={{ color: colors.text.secondary, fontSize: 12 }}>Cédula: {c.id_number}</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={20} color={colors.text.secondary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Botón para Abrir Modal de Cliente Nuevo */}
                <TouchableOpacity
                  style={[styles.createCustomerActionBtn, { borderColor: colors.primary.main, backgroundColor: colors.background.paper }]}
                  onPress={() => setShowNewCustomerModal(true)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="person-add" size={22} color={colors.primary.main} />
                  <Text style={{ color: colors.primary.main, fontWeight: '700', fontSize: 14 }}>
                    + Crear cliente nuevo
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* SECCIÓN CODEUDOR & LUGAR */}
            {customer && !pickingCodeudor && (
              <View style={{ gap: 12, marginTop: 12 }}>
                {!codeudor ? (
                  <TouchableOpacity
                    style={[styles.codeudorBtn, { borderColor: colors.divider, backgroundColor: colors.background.paper }]}
                    onPress={() => setPickingCodeudor(true)}
                  >
                    <MaterialIcons name="group-add" size={20} color={colors.primary.main} />
                    <Text style={{ color: colors.primary.main, fontWeight: '600', fontSize: 13 }}>
                      + Agregar codeudor (opcional)
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary }}>
                    Lugar o municipio de venta:
                  </Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.divider, color: colors.text.primary, backgroundColor: colors.background.paper }]}
                    placeholder="Ej. La Plata, Huila"
                    placeholderTextColor={colors.text.secondary}
                    value={location}
                    onChangeText={setLocation}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {step === 1 && (
          <View style={styles.block}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
              2. Selección de Productos
            </Text>
            <NegocioProductAddSection
              products={products}
              productQuery={productQuery}
              onProductQueryChange={setProductQuery}
              items={items}
              onAdd={handleAddItem}
              onStockLoaded={handleStockLoaded}
              colors={colors}
            />

            <NegocioItemsList
              items={items}
              stockByProduct={stockByProduct}
              onUpdateItem={updateItem}
              onRemoveItem={(index) =>
                setItems((prev) => prev.filter((_, i) => i !== index))
              }
              colors={colors}
            />

            <View style={[styles.summaryCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
              <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text.primary }}>
                Subtotal Productos: {formatCOP(subtotal)}
              </Text>
              {items.length > 0 && !itemsHaveValidStock(items, stockByProduct) && (
                <Text style={{ color: colors.error.main, fontSize: 13, marginTop: 4 }}>
                  Hay productos con stock insuficiente. Revise la bodega y cantidad.
                </Text>
              )}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.block}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
              3. Condiciones de Crédito
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 13 }}>Cuota inicial (COP)</Text>
            <TextInput
              keyboardType="numeric"
              style={[styles.input, { borderColor: colors.divider, color: colors.text.primary, backgroundColor: colors.background.paper }]}
              value={downPayment}
              onChangeText={setDownPayment}
            />
            <Text style={{ color: colors.text.secondary, fontSize: 13 }}>Número de cuotas</Text>
            <TextInput
              keyboardType="numeric"
              style={[styles.input, { borderColor: colors.divider, color: colors.text.primary, backgroundColor: colors.background.paper }]}
              value={installments}
              onChangeText={setInstallments}
            />
            <Text style={{ color: colors.text.secondary, fontSize: 13 }}>Fecha primera cuota (AAAA-MM-DD)</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.divider, color: colors.text.primary, backgroundColor: colors.background.paper }]}
              placeholder="Ej. 2026-08-22"
              placeholderTextColor={colors.text.secondary}
              value={firstDueDate}
              onChangeText={setFirstDueDate}
            />
            <Text style={{ color: colors.text.secondary, fontSize: 13 }}>Frecuencia de pago</Text>
            <View style={styles.rowWrap}>
              {(['mensual', 'quincenal', 'semanal'] as CreditFrequency[]).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setFrequency(f)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        frequency === f ? colors.primary.main : colors.background.paper,
                      borderColor: colors.divider,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        frequency === f
                          ? colors.primary.contrastText
                          : colors.text.primary,
                      fontWeight: '700',
                      textTransform: 'capitalize',
                    }}
                  >
                    {f}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.summary, { backgroundColor: colors.background.paper, borderColor: colors.divider, borderWidth: 1 }]}>
              <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 15 }}>
                Total crédito: {formatCOP(calc.totalCredit)}
              </Text>
              <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 15 }}>
                Valor cuota: {formatCOP(calc.installmentAmount)}
              </Text>
              <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                Interés: {formatCOP(calc.interestAmount)} · {settings.formula_type}
              </Text>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.block}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
              4. Firmas y Confirmación
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '600' }}>
              Cliente: {customer?.name} · Total: {formatCOP(calc.totalCredit)} · {installments} cuotas
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 13, marginBottom: 8 }}>
              Pase el dispositivo al cliente para firmar en pantalla completa:
            </Text>
            <SignaturePad
              label="Firma del cliente *"
              value={signature}
              onChange={setSignature}
            />
            {codeudor && (
              <SignaturePad
                label="Firma del fiador"
                value={guarantorSignature}
                onChange={setGuarantorSignature}
              />
            )}
            <SignaturePad
              label="Firma del vendedor"
              value={sellerSignature}
              onChange={setSellerSignature}
            />
            {creditSettings?.legal_text ? (
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 8 }}>
                {creditSettings.legal_text}
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* FIXED NAVIGATION FOOTER */}
      <View style={[styles.fixedFooterNav, { backgroundColor: colors.background.paper, borderTopColor: colors.divider }]}>
        {step > 0 && (
          <TouchableOpacity
            style={[styles.footerBtnSecondary, { borderColor: colors.divider }]}
            onPress={() => setStep((s) => s - 1)}
          >
            <MaterialIcons name="arrow-back" size={18} color={colors.text.primary} />
            <Text style={{ color: colors.text.primary, fontWeight: '700' }}>Atrás</Text>
          </TouchableOpacity>
        )}
        {step < 3 ? (
          <TouchableOpacity
            style={[
              styles.footerBtnPrimary,
              {
                backgroundColor: colors.primary.main,
                opacity: step === 0 && !customer ? 0.5 : step === 1 && !canAdvanceProductsStep() ? 0.5 : 1,
              },
            ]}
            onPress={() => {
              if (step === 0 && !customer) return Alert.alert('Selección requerida', 'Por favor seleccione un cliente para continuar.');
              if (step === 1) {
                if (!items.length) return Alert.alert('Productos requeridos', 'Agregue al menos un producto.');
                if (items.some((i) => i.unit_price <= 0)) {
                  return Alert.alert('Valor inválido', 'Cada producto debe tener valor unitario mayor a 0');
                }
                if (!itemsHaveValidStock(items, stockByProduct)) {
                  return Alert.alert(
                    'Stock insuficiente',
                    'Revise la bodega y cantidad de cada producto.'
                  );
                }
              }
              if (step === 2 && !firstDueDate) return Alert.alert('Fecha requerida', 'Ingrese la fecha de la primera cuota.');
              setStep((s) => s + 1);
            }}
          >
            <Text style={{ color: colors.primary.contrastText, fontWeight: '700', fontSize: 15 }}>
              Siguiente
            </Text>
            <MaterialIcons name="arrow-forward" size={18} color={colors.primary.contrastText} />
          </TouchableOpacity>
        ) : saving ? (
          <ActivityIndicator color={colors.primary.main} style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1, flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[styles.footerBtnSecondary, { flex: 1, borderColor: colors.divider }]}
              onPress={() => submit(false)}
            >
              <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }}>
                Guardar borrador
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtnPrimary, { flex: 1, backgroundColor: colors.primary.main }]}
              onPress={() => submit(true)}
            >
              <Text style={{ color: colors.primary.contrastText, fontWeight: '700', fontSize: 14 }}>
                Activar con firma
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* MODAL CREAR CLIENTE NUEVO */}
      <Modal
        visible={showNewCustomerModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNewCustomerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background.paper }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                Crear cliente nuevo
              </Text>
              <TouchableOpacity onPress={() => setShowNewCustomerModal(false)}>
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }} contentContainerStyle={{ gap: 12 }}>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary }}>
                  Nombre completo *
                </Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
                  placeholder="Ej. Juan Carlos Pérez"
                  placeholderTextColor={colors.text.secondary}
                  value={newCustomerName}
                  onChangeText={setNewCustomerName}
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary }}>
                  Cédula / NIT *
                </Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
                  placeholder="Ej. 1080123456"
                  keyboardType="numeric"
                  placeholderTextColor={colors.text.secondary}
                  value={newCustomerId}
                  onChangeText={setNewCustomerId}
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary }}>
                  Teléfono / Celular (opcional)
                </Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
                  placeholder="Ej. 3101234567"
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.text.secondary}
                  value={newCustomerPhone}
                  onChangeText={setNewCustomerPhone}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalBtnSecondary, { borderColor: colors.divider }]}
                onPress={() => setShowNewCustomerModal(false)}
              >
                <Text style={{ color: colors.text.primary, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnPrimary, { backgroundColor: colors.primary.main }]}
                onPress={handleCreateCustomer}
                disabled={creatingCustomer}
              >
                {creatingCustomer ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>
                    Guardar cliente
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  wizardStepItem: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  wizardStepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wizardStepNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  wizardStepLabel: {
    fontSize: 11,
  },
  block: { gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  searchHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  resultsList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  createCustomerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 4,
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  selectedCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  changeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  codeudorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  summaryCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  summary: { padding: 14, borderRadius: 12, gap: 4, marginTop: 8 },
  fixedFooterNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  footerBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  footerBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 120,
    marginLeft: 'auto',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalBtnSecondary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalBtnPrimary: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
