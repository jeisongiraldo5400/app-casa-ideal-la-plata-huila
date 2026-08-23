import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Share,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '@/components/theme';
import { BackButton } from '@/components/ui/BackButton';
import { getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { formatCOP } from '@/lib/creditCalculator';
import { labelNegocioCodigo } from '@/lib/negocioLabels';
import { buildNegocioContractHtml } from '@/lib/negocioContractHtml';
import { buildNegocioReceiptHtml } from '@/lib/negocioReceiptHtml';
import { useBluetoothPrinter } from '@/components/printing';
import { createIdempotencyKey } from '@/lib/idempotency';
import { formatPaymentDateTime } from '@/lib/localDate';
import { SvgUri } from 'react-native-svg';
import { SignaturePad } from '@/components/negocios/components/SignaturePad';
import { NegocioProductsSummary } from '@/components/negocios/components/NegocioProductsSummary';
import {
  resolveNegocioSignatureUrl,
  uploadNegocioSignature,
} from '@/lib/uploadSignature';
import {
  openPagoSupport,
  uploadAndAttachPagoSupport,
  validatePagoSupportLocalFile,
  type PagoSupportLocalFile,
} from '@/lib/uploadPagoSupport';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalDb,
  fetchNegocioDetailFromLocal,
  queuePagoSupportUpload,
  registerPagoOffline,
} from '@/lib/offline/repositories/offlineRepository';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';

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
  const { id, routeStopId } = useLocalSearchParams<{ id: string; routeStopId?: string }>();
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
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const [payAmount, setPayAmount] = useState('');
  const [payReceipt, setPayReceipt] = useState('');
  const [paySupportFile, setPaySupportFile] = useState<PagoSupportLocalFile | null>(null);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [installmentPage, setInstallmentPage] = useState(0);
  const [paymentPage, setPaymentPage] = useState(0);
  const [customerSignature, setCustomerSignature] = useState('');
  const [guarantorSignature, setGuarantorSignature] = useState('');
  const [sellerSignature, setSellerSignature] = useState('');
  const [signaturesDirty, setSignaturesDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const { printPayment, printPaymentIfReady, printNegocio, printing: printingTicket } = useBluetoothPrinter();
  const paymentIdempotencyKey = useRef<string | null>(null);
  const paymentPaidAt = useRef<string | null>(null);
  const activateIdempotencyKey = useRef<string | null>(null);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else if (routeStopId) {
      router.replace('/(tabs)/ruta-cobros' as any);
    } else {
      router.replace('/(tabs)');
    }
  };

  const applyLocalDetail = useCallback(
    (local: NonNullable<Awaited<ReturnType<typeof fetchNegocioDetailFromLocal>>>) => {
      setNegocio(local.negocio);
      setSignaturesDirty(false);
      setItems([]);
      setCuotas(local.cuotas);
      setPagos(local.pagos);
      setInstallmentPage(0);
      setPaymentPage(0);
      setCustomerName(local.customer.name || '');
      setCustomerMeta(local.customer);
      setLegalText(null);
      setCustomerSignature('');
      setGuarantorSignature('');
      setSellerSignature('');
      setCodeudorMeta(local.codeudor || {});
      setSellerName('');
      setOrderNumber(null);
      setLoadWarning(formatLocalDataLabel(useSyncStore.getState().lastSyncedAt));
    },
    []
  );

  const load = useCallback(async (options?: { preferLocal?: boolean }) => {
    if (!id) return;
    setLoading(true);
    setLoadWarning(null);
    if (options?.preferLocal && canUseLocalDb()) {
      const local = await fetchNegocioDetailFromLocal(id);
      if (local) {
        applyLocalDetail(local);
        setLoading(false);
        return;
      }
    }
    try {
      const { error: moraError } = await supabase.rpc('mark_cuotas_en_mora', {
        p_negocio_id: id,
      });

      const { data: n, error } = await supabase
        .from('negocios')
        .select('*, municipio:municipios(nombre, departamento:departamentos(nombre))')
        .eq('id', id)
        .single();
      if (error) throw error;
      setNegocio(n);
      setSignaturesDirty(false);

      const [
        itemsRes,
        cuotasRes,
        pagosRes,
        custRes,
        settingsRes,
        customerSignatureUrl,
        guarantorSignatureUrl,
        sellerSignatureUrl,
      ] = await Promise.all([
        supabase
          .from('negocio_items')
          .select('*, warehouse:warehouses(name), product:products(name, sku)')
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
        resolveNegocioSignatureUrl(n.customer_signature_url),
        resolveNegocioSignatureUrl(n.guarantor_signature_url),
        resolveNegocioSignatureUrl(n.seller_signature_url),
      ]);

      const sectionErrors = [
        ['productos', itemsRes.error],
        ['cuotas', cuotasRes.error],
        ['pagos', pagosRes.error],
        ['cliente', custRes.error],
        ['configuración', settingsRes.error],
      ].filter((entry): entry is [string, NonNullable<typeof itemsRes.error>] => Boolean(entry[1]));
      if (sectionErrors.length) {
        throw new Error(
          `No se pudieron cargar ${sectionErrors.map(([section]) => section).join(', ')}`
        );
      }

      setItems(itemsRes.data || []);
      setCuotas(cuotasRes.data || []);
      setPagos(pagosRes.data || []);
      setInstallmentPage(0);
      setPaymentPage(0);
      setCustomerName(custRes.data?.name || '');
      setCustomerMeta(custRes.data || {});
      setLegalText(settingsRes.data?.legal_text || null);
      setCustomerSignature(customerSignatureUrl || '');
      setGuarantorSignature(guarantorSignatureUrl || '');
      setSellerSignature(sellerSignatureUrl || '');

      if (n.codeudor_customer_id) {
        const { data: codeudor, error: codeudorError } = await supabase
          .from('customers')
          .select('name, id_number, phone, email, address')
          .eq('id', n.codeudor_customer_id)
          .maybeSingle();
        if (codeudorError) throw codeudorError;
        setCodeudorMeta(codeudor || {});
      } else {
        setCodeudorMeta({});
      }

      if (n.seller_id) {
        const { data: seller, error: sellerError } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', n.seller_id)
          .maybeSingle();
        if (sellerError) throw sellerError;
        setSellerName(seller?.full_name || '');
      } else {
        setSellerName('');
      }

      if (n.delivery_order_id) {
        const { data: oe, error: orderError } = await supabase
          .from('delivery_orders')
          .select('order_number')
          .eq('id', n.delivery_order_id)
          .maybeSingle();
        if (orderError) throw orderError;
        setOrderNumber(oe?.order_number || null);
      }
      if (moraError) {
        setLoadWarning('No fue posible actualizar automáticamente las cuotas en mora.');
      }
    } catch (e: any) {
      if (isNetworkError(e) && canUseLocalDb()) {
        const local = await fetchNegocioDetailFromLocal(id);
        if (local) {
          applyLocalDetail(local);
          return;
        }
        Alert.alert(
          'Sin datos locales',
          'No hay datos locales de este negocio. Conéctese y pulse Descargar información.'
        );
        return;
      }
      Alert.alert('Error', e.message || 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  }, [id, applyLocalDetail]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pendingBalance = useMemo(
    () =>
      cuotas
        .filter((cuota) => cuota.status !== 'anulada')
        .reduce(
          (total, cuota) =>
            total +
            Math.max(
              Number(cuota.amount) +
                Number(cuota.late_fee_amount || 0) -
                Number(cuota.paid_amount || 0),
              0
            ),
          0
        ),
    [cuotas]
  );

  const pickSupportFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Activa la cámara para capturar el soporte.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const file: PagoSupportLocalFile = {
      uri: asset.uri,
      mimeType: asset.mimeType || 'image/jpeg',
      name: asset.fileName || `soporte-${Date.now()}.jpg`,
      size: asset.fileSize,
    };
    const validationError = validatePagoSupportLocalFile(file);
    if (validationError) return Alert.alert('Archivo inválido', validationError);
    setPaySupportFile(file);
  };

  const pickSupportFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Activa la galería para adjuntar el soporte.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const file: PagoSupportLocalFile = {
      uri: asset.uri,
      mimeType: asset.mimeType || 'image/jpeg',
      name: asset.fileName || `soporte-${Date.now()}.jpg`,
      size: asset.fileSize,
    };
    const validationError = validatePagoSupportLocalFile(file);
    if (validationError) return Alert.alert('Archivo inválido', validationError);
    setPaySupportFile(file);
  };

  const pickSupportDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const file: PagoSupportLocalFile = {
      uri: asset.uri,
      mimeType: asset.mimeType || 'application/pdf',
      name: asset.name || `soporte-${Date.now()}.pdf`,
      size: asset.size,
    };
    const validationError = validatePagoSupportLocalFile(file);
    if (validationError) return Alert.alert('Archivo inválido', validationError);
    setPaySupportFile(file);
  };

  const choosePaySupport = () => {
    const options = [
      { label: 'Tomar foto', action: () => void pickSupportFromCamera() },
      { label: 'Galería', action: () => void pickSupportFromGallery() },
      { label: 'Archivo / PDF', action: () => void pickSupportDocument() },
      ...(paySupportFile
        ? [{ label: 'Quitar soporte', action: () => setPaySupportFile(null) }]
        : []),
    ];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...options.map((item) => item.label), 'Cancelar'],
          cancelButtonIndex: options.length,
          destructiveButtonIndex: paySupportFile ? options.length - 1 : undefined,
        },
        (index) => {
          if (index == null || index >= options.length) return;
          options[index].action();
        }
      );
      return;
    }

    Alert.alert(
      'Soporte de pago',
      'Selecciona una opción',
      [
        ...options.map((item) => ({ text: item.label, onPress: item.action })),
        { text: 'Cancelar', style: 'cancel' as const },
      ]
    );
  };

  const printReceiptAfterPago = async (input: {
    receiptNumber: string;
    paidAt: string;
    amount: number;
    physicalReceiptNumber: string | null;
  }) => {
    if (!negocio) return false;
    return printPaymentIfReady({
      receiptNumber: input.receiptNumber,
      status: 'emitido',
      paidAt: input.paidAt,
      amount: input.amount,
      physicalReceiptNumber: input.physicalReceiptNumber,
      negocioNumero: negocio.numero,
      customerName,
      sellerName,
      remainingBalance: Math.max(pendingBalance - input.amount, 0),
    });
  };

  const notifyPagoResult = (title: string, body: string, printed: boolean) => {
    Alert.alert(
      title,
      printed
        ? `${body}\n\nRecibo impreso.`
        : `${body}\n\nLa impresora no está conectada. Puede imprimir el recibo desde Pagos.`
    );
  };

  const registerPago = async () => {
    if (!negocio) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      return Alert.alert('Indique un valor válido');
    }
    if (amount - pendingBalance > 0.009) {
      return Alert.alert(
        'Valor supera el saldo',
        `El saldo pendiente es ${formatCOP(pendingBalance)}.`
      );
    }
    if (paySupportFile) {
      const validationError = validatePagoSupportLocalFile(paySupportFile);
      if (validationError) return Alert.alert('Archivo inválido', validationError);
    }
    try {
      setSaving(true);
      paymentIdempotencyKey.current ||= createIdempotencyKey();
      paymentPaidAt.current ||= new Date().toISOString();
      const paidAt = paymentPaidAt.current;
      try {
        const { data, error } = routeStopId
          ? await supabase.rpc('register_collection_route_payment', {
              p_stop_id: routeStopId,
              p_amount: amount,
              p_paid_at: paidAt,
              p_receipt_number: payReceipt || null,
              p_cuota_id: null,
              p_notes: null,
              p_idempotency_key: paymentIdempotencyKey.current,
            })
          : await supabase.rpc('register_negocio_pago', {
              p_negocio_id: negocio.id,
              p_amount: amount,
              p_paid_at: paidAt,
              p_receipt_number: payReceipt || null,
              p_cuota_id: null,
              p_notes: null,
              p_idempotency_key: paymentIdempotencyKey.current,
            });
        if (error) throw error;
        const pagoId = String(data || '');
        paymentIdempotencyKey.current = null;
        paymentPaidAt.current = null;

        let supportWarning = '';
        if (paySupportFile && pagoId) {
          try {
            await uploadAndAttachPagoSupport({
              negocioId: negocio.id,
              pagoId,
              file: paySupportFile,
            });
          } catch (supportError: any) {
            if (canUseLocalDb()) {
              try {
                await queuePagoSupportUpload({
                  negocioId: negocio.id,
                  pagoLocalId: null,
                  pagoServerId: pagoId,
                  file: paySupportFile,
                });
                supportWarning =
                  'El pago quedó registrado. El soporte se adjuntará automáticamente cuando se recupere la conexión.';
              } catch (queueError: unknown) {
                supportWarning =
                  (queueError instanceof Error ? queueError.message : '') ||
                  supportError?.message ||
                  'El pago quedó registrado, pero no se pudo conservar el soporte.';
              }
            } else {
              supportWarning =
                supportError?.message ||
                'El pago quedó registrado, pero no se adjuntó el soporte.';
            }
          }
        }

        const hadSupport = Boolean(paySupportFile) && !supportWarning;
        setPayAmount('');
        setPayReceipt('');
        setPaySupportFile(null);
        setPayModalOpen(false);

        let receiptNumber = payReceipt || 'Provisional';
        let physicalReceiptNumber = payReceipt || null;
        let persistedPaidAt = paidAt;
        if (pagoId) {
          const { data: pagoRow } = await supabase
            .from('negocio_pagos')
            .select('virtual_receipt_number, receipt_number, paid_at')
            .eq('id', pagoId)
            .maybeSingle();
          if (pagoRow?.virtual_receipt_number) {
            receiptNumber = pagoRow.virtual_receipt_number;
            physicalReceiptNumber = pagoRow.receipt_number;
          }
          if (pagoRow?.paid_at) persistedPaidAt = pagoRow.paid_at;
        }
        const printed = await printReceiptAfterPago({
          receiptNumber,
          paidAt: persistedPaidAt,
          amount,
          physicalReceiptNumber,
        });

        const successBody = routeStopId
          ? hadSupport
            ? 'Pago con soporte registrado y parada completada.'
            : 'Pago registrado y parada completada.'
          : hadSupport
            ? 'Pago registrado con soporte.'
            : 'Pago registrado.';
        if (supportWarning) {
          notifyPagoResult('Pago registrado', supportWarning, printed);
        } else {
          notifyPagoResult('Listo', successBody, printed);
        }
        await load();
      } catch (onlineError: any) {
        if (!isNetworkError(onlineError) || !canUseLocalDb()) throw onlineError;
        const offlineResult = await registerPagoOffline({
          negocioId: negocio.id,
          amount,
          paidAt,
          receiptNumber: payReceipt || null,
          idempotencyKey: paymentIdempotencyKey.current,
          routeStopId: routeStopId || null,
          supportFile: paySupportFile,
        });
        paymentIdempotencyKey.current = null;
        paymentPaidAt.current = null;
        setPayAmount('');
        setPayReceipt('');
        setPaySupportFile(null);
        setPayModalOpen(false);
        const printed = await printReceiptAfterPago({
          receiptNumber: payReceipt || 'Provisional',
          paidAt,
          amount,
          physicalReceiptNumber: payReceipt || null,
        });
        notifyPagoResult(
          'Pago guardado sin conexión',
          offlineResult.supportWarning
            ? `Se sincronizará cuando haya red. El recibo quedará provisional hasta confirmarse.\n\nSoporte: ${offlineResult.supportWarning}`
            : 'Se sincronizará cuando haya red. El recibo quedará provisional hasta confirmarse.',
          printed
        );
        await load({ preferLocal: true });
      }
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
      customer_signature_url: customerSignature,
      guarantor_signature_url: guarantorSignature,
      seller_signature_url: sellerSignature,
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
            dialogTitle: labelNegocioCodigo(negocio.numero),
          });
          return;
        }
      }

      await Share.share({
        message: `${labelNegocioCodigo(negocio.numero)} — ${customerName} — Total ${formatCOP(
          Number(negocio.total_credit)
        )}\n\n(Abra la web para imprimir el PDF completo)`,
        title: labelNegocioCodigo(negocio.numero),
      });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo compartir');
    }
  };

  const shareReceipt = async (pago: any) => {
    if (!negocio) return;
    const remainingBalance = Math.max(
      cuotas
        .filter((cuota) => cuota.status !== 'anulada')
        .reduce((total, cuota) => total + Math.max(
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

  const printReceipt = async (pago: any) => {
    if (!negocio) return;
    const remainingBalance = Math.max(
      cuotas
        .filter((cuota) => cuota.status !== 'anulada')
        .reduce((total, cuota) => total + Math.max(
          Number(cuota.amount) + Number(cuota.late_fee_amount || 0) - Number(cuota.paid_amount || 0),
          0
        ), 0),
      0
    );
    await printPayment({
      receiptNumber: pago.virtual_receipt_number,
      status: pago.receipt_status,
      paidAt: pago.paid_at,
      amount: Number(pago.amount),
      physicalReceiptNumber: pago.receipt_number,
      negocioNumero: negocio.numero,
      customerName,
      sellerName,
      remainingBalance,
    });
  };

  const printNegocioTicket = async () => {
    if (!negocio) return;
    await printNegocio({
      numero: negocio.numero,
      dealDate: negocio.deal_date,
      status: negocio.status,
      customerName: customerName || 'Cliente',
      customerIdNumber: customerMeta.id_number,
      sellerName,
      productsSubtotal: Number(negocio.products_subtotal),
      interestAmount: Number(negocio.interest_amount),
      totalCredit: Number(negocio.total_credit),
      downPayment: Number(negocio.down_payment),
      financedAmount: Number(negocio.financed_amount),
      installmentsCount: negocio.installments_count,
      installmentAmount: Number(negocio.installment_amount),
      frequency: negocio.frequency,
      items: items.map((item) => ({
        quantity: Number(item.quantity),
        description: item.description || 'Producto',
        subtotal: Number(item.subtotal),
      })),
    });
  };

  const activateDraft = async () => {
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

  if (loading || !negocio) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background.default }]}>
        <ActivityIndicator color={colors.primary.main} />
      </SafeAreaView>
    );
  }

  const canPay = ['activo', 'entregado'].includes(negocio.status);
  const canActivate = ['borrador', 'por_firmar'].includes(negocio.status);
  const totalPaid = pagos
    .filter((pago) => pago.receipt_status !== 'anulado')
    .reduce((total, pago) => total + Number(pago.amount || 0), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.default }} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.headerBar, { borderBottomColor: colors.divider, backgroundColor: colors.background.paper }]}>
          <BackButton onPress={handleGoBack} style={styles.headerBackButton} />
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
            {labelNegocioCodigo(negocio.numero)}
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1, backgroundColor: colors.background.default }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
        >
          {loadWarning && (
            <View style={[styles.warningCard, { borderColor: colors.warning.main }]}>
              <Text style={{ color: colors.warning.main }}>{loadWarning}</Text>
            </View>
          )}
          <View style={[styles.creditHero, { backgroundColor: colors.primary.main }]}>
            <View style={styles.creditHeroTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroEyebrow}>CLIENTE</Text>
                <Text style={styles.heroCustomer}>{customerName}</Text>
                <Text style={styles.heroAddress} numberOfLines={2}>
                  {[negocio.direccion, negocio.municipio?.nombre, negocio.municipio?.departamento?.nombre]
                    .filter(Boolean).join(', ') || 'Dirección no registrada'}
                </Text>
              </View>
              <View style={styles.businessStatus}><Text style={styles.businessStatusText}>{negocio.status}</Text></View>
            </View>
            <View style={styles.creditMetrics}>
              <View style={styles.creditMetric}><Text style={styles.heroEyebrow}>CRÉDITO</Text><Text style={styles.heroMetricValue}>{formatCOP(Number(negocio.total_credit))}</Text></View>
              <View style={styles.creditMetric}><Text style={styles.heroEyebrow}>PAGADO</Text><Text style={styles.heroMetricValue}>{formatCOP(totalPaid)}</Text></View>
              <View style={styles.creditMetric}><Text style={styles.heroEyebrow}>SALDO</Text><Text style={styles.heroMetricValue}>{formatCOP(pendingBalance)}</Text></View>
            </View>
            <Text style={styles.heroPlan}>{negocio.installments_count} cuotas de {formatCOP(Number(negocio.installment_amount))}{orderNumber ? ` · OE ${orderNumber}` : ''}</Text>
          </View>

          <NegocioProductsSummary
            items={items}
            productsSubtotal={Number(negocio.products_subtotal)}
            colors={colors}
          />

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
          <View style={styles.mobileCardList}>
            {cuotas
              .slice(installmentPage * TABLE_PAGE_SIZE, installmentPage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE)
              .map((c) => {
                const late = Number(c.late_fee_amount || 0);
                const saldo = Math.max(Number(c.amount) + late - Number(c.paid_amount), 0);
                const statusColor = c.status === 'pagada' ? colors.success.main : c.status === 'mora' ? colors.error.main : c.status === 'parcial' ? colors.warning.main : colors.info.main;
                return (
                  <View key={c.id} style={[styles.installmentCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
                    <View style={styles.installmentTop}>
                      <View style={[styles.installmentNumber, { backgroundColor: `${statusColor}18` }]}><Text style={{ color: statusColor, fontWeight: '900' }}>#{c.installment_number}</Text></View>
                      <View style={{ flex: 1 }}><Text style={[styles.installmentTitle, { color: colors.text.primary }]}>Cuota {c.installment_number}</Text><Text style={{ color: colors.text.secondary, fontSize: 12 }}>Vence {c.due_date}</Text></View>
                      <View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}><Text style={{ color: statusColor, fontSize: 11, fontWeight: '900', textTransform: 'capitalize' }}>{c.status}</Text></View>
                    </View>
                    <View style={[styles.installmentAmounts, { borderTopColor: colors.divider }]}>
                      <View><Text style={styles.amountLabel}>VALOR</Text><Text style={[styles.amountValue, { color: colors.text.primary }]}>{formatCOP(Number(c.amount) + late)}</Text>{late > 0 && <Text style={{ color: colors.error.main, fontSize: 10 }}>Incluye mora {formatCOP(late)}</Text>}</View>
                      <View><Text style={styles.amountLabel}>PAGADO</Text><Text style={[styles.amountValue, { color: colors.success.main }]}>{formatCOP(Number(c.paid_amount))}</Text></View>
                      <View style={{ alignItems: 'flex-end' }}><Text style={styles.amountLabel}>SALDO</Text><Text style={[styles.amountValue, { color: saldo > 0 ? colors.text.primary : colors.success.main }]}>{formatCOP(saldo)}</Text></View>
                    </View>
                  </View>
                );
              })}
          </View>
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
                Las firmas son opcionales. Puede dibujarlas o subir un PNG transparente.
              </Text>
              <SignaturePad
                label="Firma del cliente"
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

          {canActivate && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable style={[styles.btn, { flex: 1, backgroundColor: colors.primary.main }]} onPress={activateDraft} disabled={actionSaving}>
                <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>Activar negocio</Text>
              </Pressable>
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
              <View style={styles.mobileCardList}>
                {pagos.slice(paymentPage * TABLE_PAGE_SIZE, paymentPage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE).map((pago) => (
                  <View key={pago.id} style={[styles.paymentCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
                    <View style={[styles.paymentIcon, { backgroundColor: `${colors.success.main}18` }]}><MaterialIcons name="receipt-long" size={23} color={colors.success.main} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.paymentValue, { color: colors.text.primary }]}>{formatCOP(Number(pago.amount))}</Text>
                      <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{formatPaymentDateTime(pago.paid_at)} · {pago.virtual_receipt_number}</Text>
                      <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 2 }}>Recibo físico: {pago.receipt_number || 'No registrado'}</Text>
                      <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 2 }}>
                        Soporte: {pago.support_path ? (pago.support_file_name || 'Adjunto') : 'Sin adjunto'}
                      </Text>
                    </View>
                    <View style={{ gap: 6, alignItems: 'flex-end' }}>
                      {pago.support_path ? (
                        <Pressable
                          style={[styles.receiptButton, { backgroundColor: `${colors.primary.main}12` }]}
                          onPress={() => {
                            void openPagoSupport(pago.support_path).catch((error: any) =>
                              Alert.alert('Error', error?.message || 'No se pudo abrir el soporte')
                            );
                          }}
                        >
                          <MaterialIcons name="attach-file" size={20} color={colors.primary.main} />
                          <Text style={{ color: colors.primary.main, fontWeight: '800', fontSize: 11 }}>Soporte</Text>
                        </Pressable>
                      ) : null}
                      <Pressable style={[styles.receiptButton, { backgroundColor: `${colors.primary.main}12` }]} onPress={() => shareReceipt(pago)}>
                        <MaterialIcons name="picture-as-pdf" size={20} color={colors.primary.main} />
                        <Text style={{ color: colors.primary.main, fontWeight: '800', fontSize: 11 }}>PDF</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.receiptButton, { backgroundColor: `${colors.primary.main}12` }]}
                        onPress={() => void printReceipt(pago)}
                        disabled={printingTicket}
                      >
                        <MaterialIcons name="print" size={20} color={colors.primary.main} />
                        <Text style={{ color: colors.primary.main, fontWeight: '800', fontSize: 11 }}>Imprimir</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
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

          {!canActivate && (customerSignature || guarantorSignature || sellerSignature) && (
            <>
              <Text style={[styles.section, { color: colors.text.primary }]}>Firmas</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {[
                  ['Cliente', customerSignature],
                  ['Fiador', guarantorSignature],
                  ['Vendedor', sellerSignature],
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

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable
              style={[styles.btn, { flex: 1, backgroundColor: colors.background.paper }]}
              onPress={sharePdf}
            >
              <Text style={{ color: colors.text.primary, fontWeight: '700' }}>
                Compartir / PDF
              </Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { flex: 1, backgroundColor: colors.primary.main }]}
              onPress={() => void printNegocioTicket()}
              disabled={printingTicket}
            >
              <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>
                {printingTicket ? 'Imprimiendo...' : 'Imprimir negocio'}
              </Text>
            </Pressable>
          </View>
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
                {labelNegocioCodigo(negocio.numero)} · {customerName}
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
                  paymentPaidAt.current = null;
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
                  paymentPaidAt.current = null;
                  setPayReceipt(value);
                }}
                style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
                placeholderTextColor={colors.text.secondary}
              />
              <Pressable
                onPress={choosePaySupport}
                disabled={saving}
                style={[
                  styles.input,
                  {
                    borderColor: colors.divider,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  },
                ]}
              >
                <Text
                  style={{ color: paySupportFile ? colors.text.primary : colors.text.secondary, flex: 1 }}
                  numberOfLines={1}
                >
                  {paySupportFile
                    ? paySupportFile.name
                    : 'Soporte de pago (opcional)'}
                </Text>
                <MaterialIcons
                  name={paySupportFile ? 'check-circle' : 'attach-file'}
                  size={20}
                  color={paySupportFile ? colors.success.main : colors.text.secondary}
                />
              </Pressable>
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

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  warningCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBackButton: { marginLeft: 0 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    marginLeft: 12,
  },
  creditHero: { borderRadius: 20, padding: 17, gap: 15 },
  creditHeroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  heroEyebrow: { color: '#bfdbfe', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  heroCustomer: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 3 },
  heroAddress: { color: '#dbeafe', fontSize: 12, lineHeight: 17, marginTop: 4 },
  businessStatus: { backgroundColor: '#ffffff22', borderRadius: 13, paddingHorizontal: 9, paddingVertical: 5 },
  businessStatusText: { color: '#fff', fontWeight: '900', fontSize: 10, textTransform: 'uppercase' },
  creditMetrics: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ffffff44', paddingTop: 13 },
  creditMetric: { flex: 1 },
  heroMetricValue: { color: '#fff', fontSize: 14, fontWeight: '900', marginTop: 3 },
  heroPlan: { color: '#dbeafe', fontSize: 12, fontWeight: '700' },
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
  mobileCardList: { gap: 10 },
  installmentCard: { borderWidth: 1, borderRadius: 16, padding: 13 },
  installmentTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  installmentNumber: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  installmentTitle: { fontWeight: '900', fontSize: 15 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 11 },
  installmentAmounts: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, marginTop: 11 },
  amountLabel: { color: '#64748b', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  amountValue: { fontSize: 13, fontWeight: '900', marginTop: 3 },
  paymentCard: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  paymentIcon: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  paymentValue: { fontSize: 17, fontWeight: '900' },
  receiptButton: { minWidth: 48, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 1 },
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
