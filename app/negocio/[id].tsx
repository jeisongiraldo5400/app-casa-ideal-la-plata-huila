import { useCallback, useRef, useState } from 'react';
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
  Image,
  Modal,
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
import { buildNegocioReceiptHtml } from '@/lib/negocioReceiptHtml';
import { createIdempotencyKey } from '@/lib/idempotency';
import { SvgUri } from 'react-native-svg';
import { SignaturePad } from '@/components/negocios/components/SignaturePad';
import { uploadNegocioSignature } from '@/lib/uploadSignature';

const TABLE_PAGE_SIZE = 5;

const formatPaymentInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 12);
  if (!digits) return '';

  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(digits));
};

export default function NegocioDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  const [loading, setLoading] = useState(true);
  const [negocio, setNegocio] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [cuotas, setCuotas] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerMeta, setCustomerMeta] = useState<any>({});
  const [codeudorMeta, setCodeudorMeta] = useState<any>({});
  const [sellerName, setSellerName] = useState('');
  const [legalText, setLegalText] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const [payAmount, setPayAmount] = useState('');
  const [payReceipt, setPayReceipt] = useState('');
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [installmentPage, setInstallmentPage] = useState(0);
  const [paymentPage, setPaymentPage] = useState(0);
  const [customerSignature, setCustomerSignature] = useState('');
  const [guarantorSignature, setGuarantorSignature] = useState('');
  const [sellerSignature, setSellerSignature] = useState('');
  const [signaturesDirty, setSignaturesDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const paymentIdempotencyKey = useRef<string | null>(null);
  const activateIdempotencyKey = useRef<string | null>(null);
  const cancelIdempotencyKey = useRef<string | null>(null);

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
        .select('*, municipio:municipios(nombre, departamento:departamentos(nombre))')
        .eq('id', id)
        .single();
      if (error) throw error;
      setNegocio(n);
      setCustomerSignature(n.customer_signature_url || '');
      setGuarantorSignature(n.guarantor_signature_url || '');
      setSellerSignature(n.seller_signature_url || '');
      setSignaturesDirty(false);

      const [itemsRes, cuotasRes, pagosRes, custRes, settingsRes] = await Promise.all([
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
          .from('negocio_pagos')
          .select('*')
          .eq('negocio_id', id)
          .order('paid_at', { ascending: false }),
        supabase
          .from('customers')
          .select('name, id_number, phone, email, address')
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
      setPagos(pagosRes.data || []);
      setInstallmentPage(0);
      setPaymentPage(0);
      setCustomerName(custRes.data?.name || '');
      setCustomerMeta(custRes.data || {});
      setLegalText(settingsRes.data?.legal_text || null);

      if (n.codeudor_customer_id) {
        const { data: codeudor } = await supabase
          .from('customers')
          .select('name, id_number, phone, email, address')
          .eq('id', n.codeudor_customer_id)
          .maybeSingle();
        setCodeudorMeta(codeudor || {});
      } else {
        setCodeudorMeta({});
      }

      if (n.seller_id) {
        const { data: seller } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', n.seller_id)
          .maybeSingle();
        setSellerName(seller?.full_name || '');
      } else {
        setSellerName('');
      }

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
      paymentIdempotencyKey.current ||= createIdempotencyKey();
      const { error } = await supabase.rpc('register_negocio_pago', {
        p_negocio_id: negocio.id,
        p_amount: amount,
        p_paid_at: new Date().toISOString().slice(0, 10),
        p_receipt_number: payReceipt || null,
        p_cuota_id: null,
        p_notes: null,
        p_idempotency_key: paymentIdempotencyKey.current,
      });
      if (error) throw error;
      paymentIdempotencyKey.current = null;
      setPayAmount('');
      setPayReceipt('');
      setPayModalOpen(false);
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
      location: [
        negocio.direccion,
        negocio.municipio?.nombre,
        negocio.municipio?.departamento?.nombre,
      ].filter(Boolean).join(', '),
      status: negocio.status,
      customer_name: customerName || 'Cliente',
      customer_id_number: customerMeta.id_number,
      customer_phone: customerMeta.phone,
      customer_email: customerMeta.email,
      customer_address: customerMeta.address || negocio.direccion,
      codeudor_name: codeudorMeta.name,
      codeudor_id_number: codeudorMeta.id_number,
      codeudor_phone: codeudorMeta.phone,
      codeudor_email: codeudorMeta.email,
      codeudor_address: codeudorMeta.address,
      seller_name: sellerName,
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

  const shareReceipt = async (pago: any) => {
    if (!negocio) return;
    const remainingBalance = Math.max(
      cuotas.reduce((total, cuota) => total + Math.max(
        Number(cuota.amount) + Number(cuota.late_fee_amount || 0) - Number(cuota.paid_amount || 0),
        0
      ), 0),
      0
    );
    const html = buildNegocioReceiptHtml({
      receiptNumber: pago.virtual_receipt_number,
      status: pago.receipt_status,
      paidAt: pago.paid_at,
      amount: Number(pago.amount),
      physicalReceiptNumber: pago.receipt_number,
      negocioNumero: negocio.numero,
      customerName,
      remainingBalance,
    });
    try {
      const Print = require('expo-print');
      const Sharing = require('expo-sharing');
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: pago.virtual_receipt_number });
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo compartir el recibo');
    }
  };

  const activateDraft = async () => {
    if (!customerSignature) {
      return Alert.alert('Firma requerida', 'El cliente debe firmar antes de activar el negocio.');
    }
    try {
      setActionSaving(true);
      activateIdempotencyKey.current ||= createIdempotencyKey();
      let error: any = null;

      if (signaturesDirty) {
        const [customerUrl, guarantorUrl, sellerUrl] = await Promise.all([
          uploadNegocioSignature(customerSignature, { negocioId: negocio.id, role: 'cliente' }),
          uploadNegocioSignature(guarantorSignature, { negocioId: negocio.id, role: 'fiador' }),
          uploadNegocioSignature(sellerSignature, { negocioId: negocio.id, role: 'vendedor' }),
        ]);
        const result = await supabase.rpc('update_negocio', {
          p_negocio_id: negocio.id,
          p_idempotency_key: activateIdempotencyKey.current,
          p_activate: true,
          p_negocio: {
            deal_date: negocio.deal_date,
            municipio_id: negocio.municipio_id,
            direccion: negocio.direccion,
            customer_id: negocio.customer_id,
            codeudor_customer_id: negocio.codeudor_customer_id || null,
            products_subtotal: Number(negocio.products_subtotal),
            interest_amount: Number(negocio.interest_amount),
            total_credit: Number(negocio.total_credit),
            down_payment: Number(negocio.down_payment),
            financed_amount: Number(negocio.financed_amount),
            installments_count: Number(negocio.installments_count),
            installment_amount: Number(negocio.installment_amount),
            frequency: negocio.frequency,
            first_due_date: negocio.first_due_date,
            formula_snapshot: negocio.formula_snapshot || {},
            customer_signature_url: customerUrl,
            guarantor_signature_url: guarantorUrl,
            seller_signature_url: sellerUrl,
            notes: negocio.notes || null,
          },
          p_items: items.map((item) => ({
            product_id: item.product_id,
            warehouse_id: item.warehouse_id,
            quantity: Number(item.quantity),
            description: item.description,
            unit_price: Number(item.unit_price),
            subtotal: Number(item.subtotal),
          })),
        });
        error = result.error;
      } else {
        const result = await supabase.rpc('activate_negocio', {
          p_negocio_id: negocio.id,
          p_idempotency_key: activateIdempotencyKey.current,
        });
        error = result.error;
      }
      if (error) throw error;
      activateIdempotencyKey.current = null;
      setSignaturesDirty(false);
      await load();
      Alert.alert('Listo', 'Negocio activado y orden de entrega creada.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo activar el negocio');
    } finally {
      setActionSaving(false);
    }
  };

  const cancelNegocio = async () => {
    const reason = cancelReason.trim();
    if (!reason) {
      return Alert.alert('Motivo requerido', 'Ingrese el motivo de la anulación.');
    }

    try {
      setActionSaving(true);
      cancelIdempotencyKey.current ||= createIdempotencyKey();
      const { error } = await supabase.rpc('cancel_negocio', {
        p_negocio_id: negocio.id,
        p_reason: reason,
        p_idempotency_key: cancelIdempotencyKey.current,
      });
      if (error) throw error;
      cancelIdempotencyKey.current = null;
      setCancelModalOpen(false);
      setCancelReason('');
      await load();
      Alert.alert('Negocio anulado', 'El motivo quedó registrado en el historial del negocio.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo anular el negocio');
    } finally {
      setActionSaving(false);
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
  const canActivate = ['borrador', 'por_firmar'].includes(negocio.status);
  const canCancel = !['cerrado', 'anulado'].includes(negocio.status);

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
          {(negocio.direccion || negocio.municipio?.nombre) && (
            <Text style={{ color: colors.text.secondary }}>
              {[negocio.direccion, negocio.municipio?.nombre, negocio.municipio?.departamento?.nombre]
                .filter(Boolean)
                .join(', ')}
            </Text>
          )}
          <Text style={{ color: colors.text.primary }}>
            Total {formatCOP(Number(negocio.total_credit))} ·{' '}
            {negocio.installments_count} cuotas de{' '}
            {formatCOP(Number(negocio.installment_amount))}
          </Text>

          <View style={styles.sectionHeader}>
            <Text style={[styles.section, { color: colors.text.primary }]}>Cuotas</Text>
            {canPay && (
              <Pressable
                style={[styles.payAction, { backgroundColor: colors.primary.main }]}
                onPress={() => setPayModalOpen(true)}
              >
                <MaterialIcons name="payments" size={18} color={colors.primary.contrastText} />
                <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>
                  Registrar pago
                </Text>
              </Pressable>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={[styles.installmentsTable, { borderColor: colors.divider }]}>
              <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
                <Text style={[styles.cellNumber, styles.headerCell, { color: colors.text.primary }]}>#</Text>
                <Text style={[styles.cellDate, styles.headerCell, { color: colors.text.primary }]}>Vencimiento</Text>
                <Text style={[styles.cellMoney, styles.headerCell, { color: colors.text.primary }]}>Valor</Text>
                <Text style={[styles.cellMoney, styles.headerCell, { color: colors.text.primary }]}>Pagado</Text>
                <Text style={[styles.cellMoney, styles.headerCell, { color: colors.text.primary }]}>Saldo</Text>
                <Text style={[styles.cellStatus, styles.headerCell, { color: colors.text.primary }]}>Estado</Text>
              </View>
              {cuotas
                .slice(
                  installmentPage * TABLE_PAGE_SIZE,
                  installmentPage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE
                )
                .map((c) => {
                const late = Number(c.late_fee_amount || 0);
                const saldo = Math.max(Number(c.amount) + late - Number(c.paid_amount), 0);
                return (
                  <View key={c.id} style={[styles.tableRow, { borderColor: colors.divider }]}>
                    <Text style={[styles.cellNumber, { color: colors.text.primary }]}>{c.installment_number}</Text>
                    <Text style={[styles.cellDate, { color: colors.text.secondary }]}>{c.due_date}</Text>
                    <Text style={[styles.cellMoney, { color: colors.text.primary }]}>{formatCOP(Number(c.amount))}</Text>
                    <Text style={[styles.cellMoney, { color: colors.text.secondary }]}>{formatCOP(Number(c.paid_amount))}</Text>
                    <Text style={[styles.cellMoney, { color: colors.text.primary, fontWeight: '700' }]}>{formatCOP(saldo)}</Text>
                    <Text
                      style={[
                        styles.cellStatus,
                        {
                          color: c.status === 'mora' ? colors.error.main : colors.text.secondary,
                          fontWeight: c.status === 'mora' ? '700' : '500',
                        },
                      ]}
                    >
                      {c.status}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.pagination}>
            <Text style={[styles.paginationSummary, { color: colors.text.secondary }]}>
              {cuotas.length
                ? `${installmentPage * TABLE_PAGE_SIZE + 1}–${Math.min(
                    (installmentPage + 1) * TABLE_PAGE_SIZE,
                    cuotas.length
                  )} de ${cuotas.length}`
                : '0 registros'}
            </Text>
            <Pressable
              style={[
                styles.pageButton,
                { borderColor: colors.divider },
                installmentPage === 0 && styles.pageButtonDisabled,
              ]}
              disabled={installmentPage === 0}
              onPress={() => setInstallmentPage((page) => Math.max(page - 1, 0))}
            >
              <Text style={{ color: colors.text.primary }}>Anterior</Text>
            </Pressable>
            <Text style={{ color: colors.text.secondary }}>
              Página {installmentPage + 1} de {Math.max(Math.ceil(cuotas.length / TABLE_PAGE_SIZE), 1)}
            </Text>
            <Pressable
              style={[
                styles.pageButton,
                { borderColor: colors.divider },
                installmentPage + 1 >= Math.ceil(cuotas.length / TABLE_PAGE_SIZE) &&
                  styles.pageButtonDisabled,
              ]}
              disabled={installmentPage + 1 >= Math.ceil(cuotas.length / TABLE_PAGE_SIZE)}
              onPress={() => setInstallmentPage((page) => page + 1)}
            >
              <Text style={{ color: colors.text.primary }}>Siguiente</Text>
            </Pressable>
          </View>

          {canActivate && (
            <View style={[styles.signingCard, { borderColor: colors.divider }]}>
              <Text style={[styles.section, { color: colors.text.primary }]}>
                Firmas para activar
              </Text>
              <Text style={{ color: colors.text.secondary, fontSize: 13 }}>
                La firma del cliente es obligatoria. Cada firma se abre en pantalla completa.
              </Text>
              <SignaturePad
                label="Firma del cliente *"
                value={customerSignature}
                onChange={(value) => {
                  setCustomerSignature(value);
                  setSignaturesDirty(true);
                  activateIdempotencyKey.current = null;
                }}
              />
              {negocio.codeudor_customer_id && (
                <SignaturePad
                  label="Firma del fiador"
                  value={guarantorSignature}
                  onChange={(value) => {
                    setGuarantorSignature(value);
                    setSignaturesDirty(true);
                    activateIdempotencyKey.current = null;
                  }}
                />
              )}
              <SignaturePad
                label="Firma del vendedor"
                value={sellerSignature}
                onChange={(value) => {
                  setSellerSignature(value);
                  setSignaturesDirty(true);
                  activateIdempotencyKey.current = null;
                }}
              />
            </View>
          )}

          {(canActivate || canCancel) && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {canActivate && (
                <Pressable style={[styles.btn, { flex: 1, backgroundColor: colors.primary.main }]} onPress={activateDraft} disabled={actionSaving}>
                  <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>Activar negocio</Text>
                </Pressable>
              )}
              {canCancel && (
                <Pressable style={[styles.btn, { flex: 1, backgroundColor: colors.error.main }]} onPress={() => setCancelModalOpen(true)} disabled={actionSaving}>
                  <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>Anular</Text>
                </Pressable>
              )}
            </View>
          )}

          {pagos.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.section, { color: colors.text.primary }]}>Pagos y recibos</Text>
                <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                  {pagos.length} registro{pagos.length === 1 ? '' : 's'}
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={[styles.paymentsTable, { borderColor: colors.divider }]}>
                  <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
                    <Text style={[styles.paymentDate, styles.headerCell, { color: colors.text.primary }]}>Fecha</Text>
                    <Text style={[styles.paymentAmount, styles.headerCell, { color: colors.text.primary }]}>Valor</Text>
                    <Text style={[styles.paymentReceipt, styles.headerCell, { color: colors.text.primary }]}>Recibo virtual</Text>
                    <Text style={[styles.paymentPhysical, styles.headerCell, { color: colors.text.primary }]}>Físico</Text>
                    <Text style={[styles.paymentPdf, styles.headerCell, { color: colors.text.primary }]}>Archivo</Text>
                  </View>
                  {pagos
                    .slice(
                      paymentPage * TABLE_PAGE_SIZE,
                      paymentPage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE
                    )
                    .map((pago) => (
                    <View key={pago.id} style={[styles.tableRow, { borderColor: colors.divider }]}>
                      <Text style={[styles.paymentDate, { color: colors.text.secondary }]}>{pago.paid_at}</Text>
                      <Text style={[styles.paymentAmount, { color: colors.text.primary, fontWeight: '700' }]}>{formatCOP(Number(pago.amount))}</Text>
                      <Text style={[styles.paymentReceipt, { color: colors.text.secondary }]}>{pago.virtual_receipt_number}</Text>
                      <Text style={[styles.paymentPhysical, { color: colors.text.secondary }]}>{pago.receipt_number || '—'}</Text>
                      <Pressable style={styles.paymentPdf} onPress={() => shareReceipt(pago)}>
                        <Text style={{ color: colors.primary.main, fontWeight: '700' }}>PDF</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
              <View style={styles.pagination}>
                <Text style={[styles.paginationSummary, { color: colors.text.secondary }]}>
                  {paymentPage * TABLE_PAGE_SIZE + 1}–{Math.min(
                    (paymentPage + 1) * TABLE_PAGE_SIZE,
                    pagos.length
                  )} de {pagos.length}
                </Text>
                <Pressable
                  style={[
                    styles.pageButton,
                    { borderColor: colors.divider },
                    paymentPage === 0 && styles.pageButtonDisabled,
                  ]}
                  disabled={paymentPage === 0}
                  onPress={() => setPaymentPage((page) => Math.max(page - 1, 0))}
                >
                  <Text style={{ color: colors.text.primary }}>Anterior</Text>
                </Pressable>
                <Text style={{ color: colors.text.secondary }}>
                  Página {paymentPage + 1} de {Math.max(Math.ceil(pagos.length / TABLE_PAGE_SIZE), 1)}
                </Text>
                <Pressable
                  style={[
                    styles.pageButton,
                    { borderColor: colors.divider },
                    paymentPage + 1 >= Math.ceil(pagos.length / TABLE_PAGE_SIZE) &&
                      styles.pageButtonDisabled,
                  ]}
                  disabled={paymentPage + 1 >= Math.ceil(pagos.length / TABLE_PAGE_SIZE)}
                  onPress={() => setPaymentPage((page) => page + 1)}
                >
                  <Text style={{ color: colors.text.primary }}>Siguiente</Text>
                </Pressable>
              </View>
            </>
          )}

          {!canActivate && (negocio.customer_signature_url || negocio.guarantor_signature_url || negocio.seller_signature_url) && (
            <>
              <Text style={[styles.section, { color: colors.text.primary }]}>Firmas</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {[
                  ['Cliente', negocio.customer_signature_url],
                  ['Fiador', negocio.guarantor_signature_url],
                  ['Vendedor', negocio.seller_signature_url],
                ].filter(([, url]) => Boolean(url)).map(([label, url]) => (
                  <View key={label as string}>
                    {(url as string).toLowerCase().includes('.svg') ? (
                      <View style={styles.signature}>
                        <SvgUri uri={url as string} width="100%" height="100%" />
                      </View>
                    ) : (
                      <Image source={{ uri: url as string }} style={styles.signature} resizeMode="contain" />
                    )}
                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{label}</Text>
                  </View>
                ))}
              </View>
            </>
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

        <Modal
          visible={payModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => !saving && setPayModalOpen(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.background.paper }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Registrar pago</Text>
                <Pressable
                  onPress={() => setPayModalOpen(false)}
                  disabled={saving}
                  hitSlop={10}
                >
                  <MaterialIcons name="close" size={24} color={colors.text.secondary} />
                </Pressable>
              </View>
              <Text style={{ color: colors.text.secondary }}>
                Negocio #{negocio.numero} · {customerName}
              </Text>
              <TextInput
                placeholder="0,00"
                keyboardType="numeric"
                value={formatPaymentInput(payAmount)}
                selection={{
                  start: formatPaymentInput(payAmount).split(',')[0].length,
                  end: formatPaymentInput(payAmount).split(',')[0].length,
                }}
                onChangeText={(value) => {
                  paymentIdempotencyKey.current = null;
                  setPayAmount(value.split(',')[0].replace(/\D/g, '').slice(0, 12));
                }}
                style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
                placeholderTextColor={colors.text.secondary}
                autoFocus
              />
              <TextInput
                placeholder="Recibo físico (opcional)"
                value={payReceipt}
                onChangeText={(value) => {
                  paymentIdempotencyKey.current = null;
                  setPayReceipt(value);
                }}
                style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
                placeholderTextColor={colors.text.secondary}
              />
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalButton, { borderColor: colors.divider }]}
                  onPress={() => setPayModalOpen(false)}
                  disabled={saving}
                >
                  <Text style={{ color: colors.text.primary, fontWeight: '600' }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, { backgroundColor: colors.primary.main }]}
                  onPress={registerPago}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.primary.contrastText} />
                  ) : (
                    <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>Guardar pago</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={cancelModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => !actionSaving && setCancelModalOpen(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.background.paper }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Anular negocio</Text>
                <Pressable
                  onPress={() => setCancelModalOpen(false)}
                  disabled={actionSaving}
                  hitSlop={10}
                >
                  <MaterialIcons name="close" size={24} color={colors.text.secondary} />
                </Pressable>
              </View>
              <Text style={{ color: colors.text.secondary }}>
                Se anularán las cuotas pendientes y la orden de entrega no despachada.
              </Text>
              <TextInput
                placeholder="Motivo de la anulación *"
                value={cancelReason}
                onChangeText={(value) => {
                  setCancelReason(value);
                  cancelIdempotencyKey.current = null;
                }}
                multiline
                numberOfLines={4}
                maxLength={500}
                style={[
                  styles.input,
                  styles.reasonInput,
                  { borderColor: colors.divider, color: colors.text.primary },
                ]}
                placeholderTextColor={colors.text.secondary}
                editable={!actionSaving}
                autoFocus
              />
              <Text style={{ color: colors.text.secondary, fontSize: 12, textAlign: 'right' }}>
                {cancelReason.trim().length}/500
              </Text>
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalButton, { borderColor: colors.divider }]}
                  onPress={() => setCancelModalOpen(false)}
                  disabled={actionSaving}
                >
                  <Text style={{ color: colors.text.primary, fontWeight: '600' }}>Volver</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalButton,
                    { backgroundColor: colors.error.main },
                    !cancelReason.trim() && styles.pageButtonDisabled,
                  ]}
                  onPress={cancelNegocio}
                  disabled={actionSaving || !cancelReason.trim()}
                >
                  {actionSaving ? (
                    <ActivityIndicator color={colors.primary.contrastText} />
                  ) : (
                    <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>
                      Confirmar anulación
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  payAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  installmentsTable: {
    minWidth: 760,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableHeader: { minHeight: 40 },
  headerCell: { fontWeight: '700', fontSize: 12 },
  cellNumber: { width: 44, paddingHorizontal: 8, textAlign: 'center' },
  cellDate: { width: 110, paddingHorizontal: 8 },
  cellMoney: { width: 145, paddingHorizontal: 8, textAlign: 'right' },
  cellStatus: { width: 110, paddingHorizontal: 8, textTransform: 'capitalize' },
  paymentsTable: {
    minWidth: 700,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  paymentDate: { width: 105, paddingHorizontal: 8 },
  paymentAmount: { width: 140, paddingHorizontal: 8, textAlign: 'right' },
  paymentReceipt: { width: 180, paddingHorizontal: 8 },
  paymentPhysical: { width: 155, paddingHorizontal: 8 },
  paymentPdf: { width: 80, paddingHorizontal: 8, alignItems: 'center' },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 12,
  },
  paginationSummary: { marginRight: 'auto', fontSize: 12 },
  pageButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pageButtonDisabled: { opacity: 0.4 },
  signingCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 14,
  },
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
  reasonInput: { minHeight: 100, textAlignVertical: 'top' },
  btn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  signature: { width: 140, height: 70, borderWidth: 1, borderColor: '#d0d7de' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalCard: {
    borderRadius: 16,
    padding: 20,
    gap: 14,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  modalButton: {
    minWidth: 120,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
