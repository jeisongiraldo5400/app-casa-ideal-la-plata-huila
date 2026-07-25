import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
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

type Warehouse = { id: string; name: string };

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
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [codeudor, setCodeudor] = useState<Customer | null>(null);
  const [location, setLocation] = useState('');
  const [items, setItems] = useState<NegocioItem[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [downPayment, setDownPayment] = useState('0');
  const [installments, setInstallments] = useState('3');
  const [frequency, setFrequency] = useState<CreditFrequency>('mensual');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [signature, setSignature] = useState('');
  const [sellerSignature, setSellerSignature] = useState('');
  const [guarantorSignature, setGuarantorSignature] = useState('');
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [pendingPrice, setPendingPrice] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [pickingCodeudor, setPickingCodeudor] = useState(false);

  useEffect(() => {
    fetchCreditSettings();
    (async () => {
      const [c, p, w] = await Promise.all([
        supabase
          .from('customers')
          .select('id, name, id_number')
          .is('deleted_at', null)
          .order('name')
          .limit(100),
        supabase
          .from('products')
          .select('id, name, sale_price')
          .is('deleted_at', null)
          .eq('status', true)
          .order('name')
          .limit(200),
        supabase
          .from('warehouses')
          .select('id, name')
          .is('deleted_at', null)
          .order('name'),
      ]);
      setCustomers(c.data || []);
      setProducts(p.data || []);
      setWarehouses(w.data || []);
      if (w.data?.[0]) setWarehouseId(w.data[0].id);
      if (creditSettings?.default_frequency) {
        setFrequency(creditSettings.default_frequency);
      }
    })();
  }, [fetchCreditSettings]);

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

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.id_number.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [customers, customerQuery]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [products, productQuery]);

  const pushItem = (p: Product, unit_price: number) => {
    setItems((prev) => [
      ...prev,
      {
        product_id: p.id,
        warehouse_id: warehouseId,
        quantity: 1,
        description: p.name,
        unit_price,
      },
    ]);
    setProductQuery('');
    setPendingProduct(null);
    setPendingPrice('');
  };

  const addProduct = (p: Product) => {
    if (!warehouseId) {
      Alert.alert('Seleccione bodega');
      return;
    }
    const catalogPrice = Number(p.sale_price) || 0;
    if (catalogPrice <= 0) {
      setPendingProduct(p);
      setPendingPrice('');
      return;
    }
    pushItem(p, catalogPrice);
  };

  const submit = async (activate: boolean) => {
    if (!customer) return Alert.alert('Seleccione cliente');
    if (!items.length) return Alert.alert('Agregue productos');
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
        'Listo',
        activate
          ? `Negocio #${result?.numero} activado. Se creó la orden de entrega.`
          : `Negocio #${result?.numero} guardado.`,
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/negocios') }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo crear el negocio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background.default }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <Text style={[styles.title, { color: colors.text.primary }]}>
        Nuevo negocio · Paso {step + 1}/4
      </Text>

      {step === 0 && (
        <View style={styles.block}>
          <Text style={{ color: colors.text.secondary }}>
            {pickingCodeudor ? 'Buscar codeudor' : 'Buscar cliente'}
          </Text>
          <TextInput
            style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
            placeholder="Nombre o cédula"
            placeholderTextColor={colors.text.secondary}
            value={customerQuery}
            onChangeText={setCustomerQuery}
          />
          {filteredCustomers.map((c) => (
            <Pressable
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
              style={[
                styles.option,
                (pickingCodeudor ? codeudor?.id : customer?.id) === c.id && {
                  backgroundColor: colors.primary.main + '22',
                },
              ]}
            >
              <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{c.name}</Text>
              <Text style={{ color: colors.text.secondary }}>{c.id_number}</Text>
            </Pressable>
          ))}

          <Text style={{ color: colors.text.secondary, marginTop: 8 }}>
            O crear cliente nuevo
          </Text>
          <TextInput
            style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
            placeholder="Nombre completo"
            placeholderTextColor={colors.text.secondary}
            value={newCustomerName}
            onChangeText={setNewCustomerName}
          />
          <TextInput
            style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
            placeholder="Cédula / NIT"
            placeholderTextColor={colors.text.secondary}
            value={newCustomerId}
            onChangeText={setNewCustomerId}
          />
          <TextInput
            style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
            placeholder="Teléfono"
            placeholderTextColor={colors.text.secondary}
            value={newCustomerPhone}
            onChangeText={setNewCustomerPhone}
          />
          <Pressable
            style={[styles.btn, { backgroundColor: colors.background.paper }]}
            onPress={async () => {
              if (!newCustomerName.trim() || !newCustomerId.trim()) {
                return Alert.alert('Nombre y documento requeridos');
              }
              const { data, error } = await supabase
                .from('customers')
                .insert({
                  name: newCustomerName.trim(),
                  id_number: newCustomerId.trim(),
                  phone: newCustomerPhone.trim() || null,
                })
                .select('id, name, id_number')
                .single();
              if (error) return Alert.alert('Error', error.message);
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
              Alert.alert('Cliente creado');
            }}
          >
            <Text style={{ color: colors.text.primary, fontWeight: '600' }}>
              Guardar cliente
            </Text>
          </Pressable>

          {customer && (
            <Text style={{ color: colors.primary.main }}>
              Cliente: {customer.name}
            </Text>
          )}
          <Pressable onPress={() => setPickingCodeudor(true)}>
            <Text style={{ color: colors.primary.main }}>
              {codeudor
                ? `Codeudor: ${codeudor.name} (cambiar)`
                : 'Agregar codeudor (opcional)'}
            </Text>
          </Pressable>

          <TextInput
            style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
            placeholder="Lugar"
            placeholderTextColor={colors.text.secondary}
            value={location}
            onChangeText={setLocation}
          />
        </View>
      )}

      {step === 1 && (
        <View style={styles.block}>
          <Text style={{ color: colors.text.secondary }}>Bodega</Text>
          <View style={styles.rowWrap}>
            {warehouses.map((w) => (
              <Pressable
                key={w.id}
                onPress={() => setWarehouseId(w.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      warehouseId === w.id ? colors.primary.main : colors.background.paper,
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      warehouseId === w.id
                        ? colors.primary.contrastText
                        : colors.text.primary,
                  }}
                >
                  {w.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
            placeholder="Buscar producto"
            placeholderTextColor={colors.text.secondary}
            value={productQuery}
            onChangeText={setProductQuery}
          />
          {filteredProducts.map((p) => (
            <Pressable key={p.id} onPress={() => addProduct(p)} style={styles.option}>
              <Text style={{ color: colors.text.primary, flex: 1 }}>{p.name}</Text>
              <Text style={{ color: colors.primary.main }}>
                {Number(p.sale_price) > 0
                  ? formatCOP(Number(p.sale_price))
                  : 'Sin precio'}
              </Text>
            </Pressable>
          ))}

          {pendingProduct && (
            <View style={[styles.summary, { backgroundColor: colors.background.paper }]}>
              <Text style={{ color: colors.text.primary, fontWeight: '600' }}>
                Precio para: {pendingProduct.name}
              </Text>
              <TextInput
                keyboardType="numeric"
                style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
                placeholder="Valor unitario (contado)"
                placeholderTextColor={colors.text.secondary}
                value={pendingPrice}
                onChangeText={setPendingPrice}
              />
              <View style={styles.rowWrap}>
                <Pressable
                  style={[styles.chip, { backgroundColor: colors.background.default }]}
                  onPress={() => {
                    setPendingProduct(null);
                    setPendingPrice('');
                  }}
                >
                  <Text style={{ color: colors.text.primary }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, { backgroundColor: colors.primary.main }]}
                  onPress={() => {
                    const unit_price = Number(pendingPrice.replace(/[^\d.-]/g, ''));
                    if (!unit_price || unit_price <= 0) {
                      Alert.alert('Indique un valor unitario válido');
                      return;
                    }
                    pushItem(pendingProduct, unit_price);
                  }}
                >
                  <Text style={{ color: colors.primary.contrastText }}>Agregar</Text>
                </Pressable>
              </View>
            </View>
          )}

          {items.map((item, idx) => (
            <View key={`${item.product_id}-${idx}`} style={styles.option}>
              <Text style={{ color: colors.text.primary, flex: 1 }}>
                {item.quantity} × {item.description}
              </Text>
              <TextInput
                keyboardType="numeric"
                style={{
                  minWidth: 100,
                  borderWidth: 1,
                  borderColor: colors.divider,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  color: colors.text.primary,
                  textAlign: 'right',
                }}
                value={String(item.unit_price)}
                onChangeText={(text) => {
                  const unit_price = Number(text.replace(/[^\d.-]/g, ''));
                  setItems((prev) =>
                    prev.map((row, i) =>
                      i === idx
                        ? { ...row, unit_price: Number.isFinite(unit_price) ? unit_price : 0 }
                        : row
                    )
                  );
                }}
              />
              <Pressable onPress={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
                <Text style={{ color: 'crimson', marginLeft: 8 }}>Quitar</Text>
              </Pressable>
            </View>
          ))}
          <Text style={{ fontWeight: '700', color: colors.text.primary }}>
            Subtotal: {formatCOP(subtotal)}
          </Text>
        </View>
      )}

      {step === 2 && (
        <View style={styles.block}>
          <Text style={{ color: colors.text.secondary }}>Cuota inicial</Text>
          <TextInput
            keyboardType="numeric"
            style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
            value={downPayment}
            onChangeText={setDownPayment}
          />
          <Text style={{ color: colors.text.secondary }}>N° cuotas</Text>
          <TextInput
            keyboardType="numeric"
            style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
            value={installments}
            onChangeText={setInstallments}
          />
          <Text style={{ color: colors.text.secondary }}>Primera cuota (AAAA-MM-DD)</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
            placeholder="2026-08-22"
            placeholderTextColor={colors.text.secondary}
            value={firstDueDate}
            onChangeText={setFirstDueDate}
          />
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
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      frequency === f
                        ? colors.primary.contrastText
                        : colors.text.primary,
                  }}
                >
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.summary, { backgroundColor: colors.background.paper }]}>
            <Text style={{ color: colors.text.primary }}>
              Total crédito: {formatCOP(calc.totalCredit)}
            </Text>
            <Text style={{ color: colors.text.primary }}>
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
          <Text style={{ color: colors.text.secondary, marginBottom: 8 }}>
            {customer?.name} · {formatCOP(calc.totalCredit)} · {installments} cuotas
          </Text>
          <Text style={{ color: colors.text.secondary, fontSize: 13, marginBottom: 4 }}>
            Pase el celular al cliente y toque Firmar. Se abre a pantalla completa.
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
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
              {creditSettings.legal_text}
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.nav}>
        {step > 0 && (
          <Pressable
            style={[styles.btn, { backgroundColor: colors.background.paper }]}
            onPress={() => setStep((s) => s - 1)}
          >
            <Text style={{ color: colors.text.primary }}>Atrás</Text>
          </Pressable>
        )}
        {step < 3 ? (
          <Pressable
            style={[styles.btn, { backgroundColor: colors.primary.main }]}
            onPress={() => {
              if (step === 0 && !customer) return Alert.alert('Seleccione cliente');
              if (step === 1) {
                if (!items.length) return Alert.alert('Agregue productos');
                if (items.some((i) => i.unit_price <= 0)) {
                  return Alert.alert('Cada producto debe tener valor unitario mayor a 0');
                }
              }
              if (step === 2 && !firstDueDate) return Alert.alert('Fecha requerida');
              setStep((s) => s + 1);
            }}
          >
            <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>
              Siguiente
            </Text>
          </Pressable>
        ) : saving ? (
          <ActivityIndicator color={colors.primary.main} />
        ) : (
          <View style={{ flex: 1, gap: 8 }}>
            <Pressable
              style={[styles.btn, { backgroundColor: colors.background.paper }]}
              onPress={() => submit(false)}
            >
              <Text style={{ color: colors.text.primary, fontWeight: '600' }}>
                Guardar borrador
              </Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { backgroundColor: colors.primary.main }]}
              onPress={() => submit(true)}
            >
              <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>
                Activar con firma
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
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
  summary: { padding: 12, borderRadius: 10, gap: 4, marginTop: 8 },
  nav: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  btn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
});
