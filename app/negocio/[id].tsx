import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { formatCOP } from '@/lib/creditCalculator';
import { buildNegocioContractHtml } from '@/lib/negocioContractHtml';

export default function NegocioDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  const [loading, setLoading] = useState(true);
  const [negocio, setNegocio] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [cuotas, setCuotas] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [legalText, setLegalText] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const [payAmount, setPayAmount] = useState('');
  const [payReceipt, setPayReceipt] = useState('');
  const [saving, setSaving] = useState(false);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      await supabase.rpc('mark_cuotas_en_mora', { p_negocio_id: id });

      const { data: n, error } = await supabase
        .from('negocios')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      setNegocio(n);

      const [itemsRes, cuotasRes, custRes, settingsRes] = await Promise.all([
        supabase
          .from('negocio_items')
          .select('*')
          .eq('negocio_id', id)
          .is('deleted_at', null),
        supabase
          .from('negocio_cuotas')
          .select('*')
          .eq('negocio_id', id)
          .is('deleted_at', null)
          .order('installment_number'),
        supabase
          .from('customers')
          .select('name, id_number, phone, address')
          .eq('id', n.customer_id)
          .maybeSingle(),
        supabase
          .from('credit_settings')
          .select('legal_text')
          .is('deleted_at', null)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setItems(itemsRes.data || []);
      setCuotas(cuotasRes.data || []);
      setCustomerName(custRes.data?.name || '');
      setLegalText(settingsRes.data?.legal_text || null);

      if (n.delivery_order_id) {
        const { data: oe } = await supabase
          .from('delivery_orders')
          .select('order_number')
          .eq('id', n.delivery_order_id)
          .maybeSingle();
        setOrderNumber(oe?.order_number || null);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const registerPago = async () => {
    if (!negocio) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      return Alert.alert('Indique un valor válido');
    }
    try {
      setSaving(true);
      const { error } = await supabase.rpc('register_negocio_pago', {
        p_negocio_id: negocio.id,
        p_amount: amount,
        p_paid_at: new Date().toISOString().slice(0, 10),
        p_receipt_number: payReceipt || null,
        p_cuota_id: null,
        p_notes: null,
      });
      if (error) throw error;
      setPayAmount('');
      setPayReceipt('');
      Alert.alert('Listo', 'Pago registrado');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo registrar');
    } finally {
      setSaving(false);
    }
  };

  const sharePdf = async () => {
    if (!negocio) return;
    const html = buildNegocioContractHtml({
      numero: negocio.numero,
      deal_date: negocio.deal_date,
      location: negocio.location,
      status: negocio.status,
      customer_name: customerName || 'Cliente',
      products_subtotal: Number(negocio.products_subtotal),
      interest_amount: Number(negocio.interest_amount),
      total_credit: Number(negocio.total_credit),
      down_payment: Number(negocio.down_payment),
      financed_amount: Number(negocio.financed_amount),
      installments_count: negocio.installments_count,
      installment_amount: Number(negocio.installment_amount),
      frequency: negocio.frequency,
      legal_text: legalText,
      customer_signature_url: negocio.customer_signature_url,
      guarantor_signature_url: negocio.guarantor_signature_url,
      seller_signature_url: negocio.seller_signature_url,
      delivery_order_number: orderNumber,
      items: items.map((i) => ({
        quantity: Number(i.quantity),
        description: i.description || 'Producto',
        unit_price: Number(i.unit_price),
        subtotal: Number(i.subtotal),
      })),
      cuotas: cuotas.map((c) => ({
        installment_number: c.installment_number,
        due_date: c.due_date,
        amount: Number(c.amount),
        status: c.status,
      })),
    });

    try {
      // Prefer expo-print if available
      let Print: any;
      let Sharing: any;
      try {
        Print = require('expo-print');
        Sharing = require('expo-sharing');
      } catch {
        Print = null;
      }

      if (Print?.printToFileAsync && Sharing?.shareAsync) {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Negocio #${negocio.numero}`,
          });
          return;
        }
      }

      await Share.share({
        message: `Negocio #${negocio.numero} — ${customerName} — Total ${formatCOP(
          Number(negocio.total_credit)
        )}\n\n(Abra la web para imprimir el PDF completo)`,
        title: `Negocio #${negocio.numero}`,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo compartir');
    }
  };

  if (loading || !negocio) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background.default }]}>
        <ActivityIndicator color={colors.primary.main} />
      </SafeAreaView>
    );
  }

  const canPay = ['activo', 'entregado'].includes(negocio.status);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.default }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.headerBar, { borderBottomColor: colors.divider }]}>
          <TouchableOpacity style={styles.backBtn} onPress={handleGoBack}>
            <MaterialIcons name="arrow-back" size={24} color={colors.primary.main} />
            <Text style={[styles.backText, { color: colors.primary.main }]}>Volver</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
            Negocio #{negocio.numero}
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1, backgroundColor: colors.background.default }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
        >
          <Text style={{ color: colors.text.secondary }}>
            {negocio.status} · {customerName}
            {orderNumber ? ` · OE ${orderNumber}` : ''}
          </Text>
          <Text style={{ color: colors.text.primary }}>
            Total {formatCOP(Number(negocio.total_credit))} ·{' '}
            {negocio.installments_count} cuotas de{' '}
            {formatCOP(Number(negocio.installment_amount))}
          </Text>

          <Text style={[styles.section, { color: colors.text.primary }]}>Cuotas</Text>
          {cuotas.map((c) => {
            const late = Number(c.late_fee_amount || 0);
            const saldo = Math.max(Number(c.amount) + late - Number(c.paid_amount), 0);
            return (
              <View
                key={c.id}
                style={[styles.row, { borderColor: colors.divider }]}
              >
                <Text style={{ color: colors.text.primary }}>
                  #{c.installment_number} · {c.due_date}
                </Text>
                <Text style={{ color: colors.text.secondary }}>
                  {formatCOP(saldo)} · {c.status}
                </Text>
              </View>
            );
          })}

          {canPay && (
            <View style={{ gap: 8, marginTop: 8 }}>
              <Text style={[styles.section, { color: colors.text.primary }]}>
                Registrar pago
              </Text>
              <TextInput
                placeholder="Valor"
                keyboardType="numeric"
                value={payAmount}
                onChangeText={setPayAmount}
                style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
                placeholderTextColor={colors.text.secondary}
              />
              <TextInput
                placeholder="Nº recibo"
                value={payReceipt}
                onChangeText={setPayReceipt}
                style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
                placeholderTextColor={colors.text.secondary}
              />
              <Pressable
                style={[styles.btn, { backgroundColor: colors.primary.main }]}
                onPress={registerPago}
                disabled={saving}
              >
                <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>
                  {saving ? 'Guardando…' : 'Guardar pago'}
                </Text>
              </Pressable>
            </View>
          )}

          <Pressable
            style={[styles.btn, { backgroundColor: colors.background.paper, marginTop: 8 }]}
            onPress={sharePdf}
          >
            <Text style={{ color: colors.text.primary, fontWeight: '700' }}>
              Compartir / PDF
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  title: { fontSize: 22, fontWeight: '700' },
  section: { fontWeight: '700', marginTop: 8 },
  row: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
});
