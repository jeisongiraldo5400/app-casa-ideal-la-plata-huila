import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Share,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '@/components/theme';
import {
  ActionBar,
  BackButton,
  Button,
  Card,
  Pagination,
  ScreenErrorBoundary,
  ScreenState,
  SectionHeader,
} from '@/components/ui';
import { IconSize, Spacing, Typography, getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { formatCOP } from '@/lib/creditCalculator';
import { labelNegocioCodigo } from '@/lib/negocioLabels';
import { buildNegocioContractHtml } from '@/lib/negocioContractHtml';
import { buildNegocioReceiptHtml } from '@/lib/negocioReceiptHtml';
import { useBluetoothPrinter } from '@/components/printing';
import { createIdempotencyKey } from '@/lib/idempotency';
import { SignaturePad } from '@/components/negocios/components/SignaturePad';
import { NegocioProductsSummary } from '@/components/negocios/components/NegocioProductsSummary';
import { NegocioHero } from '@/components/negocios/components/NegocioHero';
import { InstallmentCard } from '@/components/negocios/components/InstallmentCard';
import { PaymentCard } from '@/components/negocios/components/PaymentCard';
import { SignatureGallery } from '@/components/negocios/components/SignatureGallery';
import { RegisterPaymentSheet } from '@/components/negocios/components/RegisterPaymentSheet';
import {
  isNewLocalSignature,
  removeNegocioSignatures,
  resolveNegocioSignatureUrl,
  uploadNegocioSignature,
} from '@/lib/uploadSignature';
import {
  canRegisterCustomerSignatureLater,
  sellerSignatureRequiredError,
} from '@/lib/negocioSignatureRules';
import { computeRemainingBalance, remainingAfterPago } from '@/lib/negocios/negocioBalance';
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
import { formatNegocioMoneyInput } from '@/components/negocios/infrastructure/services/negociosStockService';

const TABLE_PAGE_SIZE = 5;

export default function NegocioDetailScreen() {
  return (
    <ScreenErrorBoundary screen="Detalle de negocio">
      <NegocioDetailScreenInner />
    </ScreenErrorBoundary>
  );
}

function NegocioDetailScreenInner() {
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fromLocal, setFromLocal] = useState(false);

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
  /** Firma del cliente dibujada para un negocio ya activo sin firma. */
  const [lateCustomerSignature, setLateCustomerSignature] = useState('');
  const [signatureSaving, setSignatureSaving] = useState(false);
  /** Ruta ya subida para la firma tardía en curso; se reutiliza en reintentos. */
  const lateSignatureUpload = useRef<{ source: string; path: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const { printPayment, printPaymentIfReady, printNegocio, printing: printingTicket } = useBluetoothPrinter();
  const paymentIdempotencyKey = useRef<string | null>(null);
  const paymentPaidAt = useRef<string | null>(null);
  const activateIdempotencyKey = useRef<string | null>(null);
  /**
   * Rutas de firma ya subidas para el intento de activación en curso. Se
   * reutilizan en reintentos: el servidor hashea `p_negocio` contra la
   * idempotency key y cada subida genera un nombre distinto.
   */
  const activateSignatureUploads = useRef<{
    customer: string | null;
    guarantor: string | null;
    seller: string | null;
    uploadedNew: string[];
  } | null>(null);
  const activatingRef = useRef(false);
  const hasNegocioRef = useRef(false);
  const formattedPayAmount = formatNegocioMoneyInput(payAmount);

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
      hasNegocioRef.current = true;
      setFromLocal(true);
      setLoadError(null);
      setSignaturesDirty(false);
      setLateCustomerSignature('');
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
    setLoadError(null);
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
      hasNegocioRef.current = true;
      setFromLocal(false);
      setSignaturesDirty(false);
      setLateCustomerSignature('');

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
      // mark_cuotas_en_mora exige can_manage_collection_for_negocio; un usuario
      // que solo puede ver el negocio recibe "Sin permiso" y no es un fallo real.
      if (moraError && !/sin permiso/i.test(moraError.message || '')) {
        setLoadWarning('No fue posible actualizar automáticamente las cuotas en mora.');
      }
    } catch (e: any) {
      let message = e?.message || 'No se pudo cargar';
      if (isNetworkError(e) && canUseLocalDb()) {
        const local = await fetchNegocioDetailFromLocal(id);
        if (local) {
          applyLocalDetail(local);
          return;
        }
        message = 'No hay datos locales de este negocio. Conéctese y pulse Descargar información.';
      }
      if (hasNegocioRef.current) {
        Alert.alert('Error', message);
      } else {
        setLoadError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [id, applyLocalDetail]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pendingBalance = useMemo(() => computeRemainingBalance(cuotas), [cuotas]);

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
    // Saldo que quedó tras ese pago, no el saldo actual del negocio.
    const remainingBalance = remainingAfterPago(cuotas, pagos, pago);
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
    const remainingBalance = remainingAfterPago(cuotas, pagos, pago);
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

  /** Descarta firmas subidas para un intento que ya no se reintentará. */
  const discardPendingSignatureUploads = () => {
    const pending = activateSignatureUploads.current;
    activateSignatureUploads.current = null;
    activateIdempotencyKey.current = null;
    if (pending?.uploadedNew.length) {
      void removeNegocioSignatures(pending.uploadedNew).catch((cleanupError) => {
        console.error('No se pudieron limpiar firmas huérfanas', cleanupError);
      });
    }
  };

  const activateDraft = async () => {
    if (activatingRef.current || !negocio) return;
    const signatureError = sellerSignatureRequiredError(customerSignature, sellerSignature);
    if (signatureError) {
      Alert.alert('Firma requerida', signatureError);
      return;
    }
    try {
      activatingRef.current = true;
      setActionSaving(true);
      activateIdempotencyKey.current ||= createIdempotencyKey();
      let error: any = null;

      if (signaturesDirty) {
        if (!activateSignatureUploads.current) {
          console.info('[negocio.activate] subiendo firmas', { negocioId: negocio.id });
          const [customerUrl, guarantorUrl, sellerUrl] = await Promise.all([
            uploadNegocioSignature(customerSignature, { negocioId: negocio.id, role: 'cliente' }),
            uploadNegocioSignature(guarantorSignature, { negocioId: negocio.id, role: 'fiador' }),
            uploadNegocioSignature(sellerSignature, { negocioId: negocio.id, role: 'vendedor' }),
          ]);
          activateSignatureUploads.current = {
            customer: customerUrl,
            guarantor: guarantorUrl,
            seller: sellerUrl,
            uploadedNew: [
              isNewLocalSignature(customerSignature) ? customerUrl : null,
              isNewLocalSignature(guarantorSignature) ? guarantorUrl : null,
              isNewLocalSignature(sellerSignature) ? sellerUrl : null,
            ].filter((path): path is string => Boolean(path)),
          };
        }
        const uploads = activateSignatureUploads.current;
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
            customer_signature_url: uploads.customer,
            guarantor_signature_url: uploads.guarantor,
            seller_signature_url: uploads.seller,
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
        console.info('[negocio.activate] actualización terminada', { negocioId: negocio.id, hasError: Boolean(result.error) });
        error = result.error;
      } else {
        console.info('[negocio.activate] activando sin cambios de firma', { negocioId: negocio.id });
        const result = await supabase.rpc('activate_negocio', {
          p_negocio_id: negocio.id,
          p_idempotency_key: activateIdempotencyKey.current,
        });
        console.info('[negocio.activate] activación terminada', { negocioId: negocio.id, hasError: Boolean(result.error) });
        error = result.error;
      }
      if (error) throw error;
      activateIdempotencyKey.current = null;
      activateSignatureUploads.current = null;
      setSignaturesDirty(false);
      await load();
      Alert.alert('Listo', 'Negocio activado y orden de entrega creada.');
    } catch (error: any) {
      console.error('[negocio.activate] falló la activación', { negocioId: negocio?.id, message: error?.message, error });
      // El servidor pudo activar aunque el cliente no recibiera respuesta.
      const { data: current } = await supabase
        .from('negocios')
        .select('status')
        .eq('id', negocio.id)
        .maybeSingle();
      if (current && !['borrador', 'por_firmar'].includes(current.status)) {
        activateIdempotencyKey.current = null;
        activateSignatureUploads.current = null;
        setSignaturesDirty(false);
        await load();
        Alert.alert('Listo', 'Negocio activado y orden de entrega creada.');
        return;
      }
      // Sigue en borrador: se conservan key y firmas subidas para reintentar
      // con el mismo payload.
      Alert.alert('Error', error.message || 'No se pudo activar el negocio');
    } finally {
      activatingRef.current = false;
      setActionSaving(false);
    }
  };

  /** Registra la firma del cliente en un negocio ya activo (RPC dedicado). */
  const registerCustomerSignature = async () => {
    if (!negocio || signatureSaving) return;
    const source = lateCustomerSignature.trim();
    if (!source) {
      Alert.alert('Firma requerida', 'Dibuje o suba la firma del cliente.');
      return;
    }
    let uploadedNow: string | null = null;
    try {
      setSignatureSaving(true);
      let path =
        lateSignatureUpload.current?.source === source ? lateSignatureUpload.current.path : null;
      if (!path) {
        path = await uploadNegocioSignature(source, { negocioId: negocio.id, role: 'cliente' });
        if (!path) throw new Error('No se pudo subir la firma del cliente');
        uploadedNow = isNewLocalSignature(source) ? path : null;
        lateSignatureUpload.current = { source, path };
      }
      const { error } = await supabase.rpc('register_negocio_customer_signature', {
        p_negocio_id: negocio.id,
        p_customer_signature_url: path,
      });
      if (error) throw error;
      lateSignatureUpload.current = null;
      setLateCustomerSignature('');
      await load();
      Alert.alert('Listo', 'Firma del cliente registrada.');
    } catch (error: any) {
      // El servidor pudo registrar la firma aunque el cliente no recibiera respuesta.
      if (uploadedNow) {
        const { data: current } = await supabase
          .from('negocios')
          .select('customer_signature_url')
          .eq('id', negocio.id)
          .maybeSingle();
        if (current?.customer_signature_url === uploadedNow) {
          lateSignatureUpload.current = null;
          setLateCustomerSignature('');
          await load();
          Alert.alert('Listo', 'Firma del cliente registrada.');
          return;
        }
        await removeNegocioSignatures([uploadedNow]).catch((cleanupError) => {
          console.error('No se pudo limpiar la firma huérfana', cleanupError);
        });
        lateSignatureUpload.current = null;
      }
      Alert.alert('Error', error?.message || 'No se pudo registrar la firma del cliente');
    } finally {
      setSignatureSaving(false);
    }
  };

  const headerTitle = negocio ? labelNegocioCodigo(negocio.numero) : 'Negocio';
  const screenOptions = {
    title: headerTitle,
    headerLeft: () => <BackButton onPress={handleGoBack} />,
  };

  if (!loading && !negocio) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
        <Stack.Screen options={screenOptions} />
        <View style={styles.centered}>
          <ScreenState
            tone="error"
            title="No se pudo cargar el negocio"
            description={loadError || 'Inténtalo de nuevo en unos segundos.'}
            actionLabel="Reintentar"
            onAction={() => void load()}
          />
        </View>
      </View>
    );
  }

  if (loading || !negocio) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
        <Stack.Screen options={screenOptions} />
        <View style={styles.centered}>
          <ScreenState loading title="Cargando negocio…" variant="inline" />
        </View>
      </View>
    );
  }

  const canPay = ['activo', 'entregado'].includes(negocio.status);
  const canActivate = ['borrador', 'por_firmar'].includes(negocio.status);
  const canRegisterLateSignature = !fromLocal && canRegisterCustomerSignatureLater(negocio);
  const activationSignatureError = canActivate
    ? sellerSignatureRequiredError(customerSignature, sellerSignature)
    : null;
  const totalPaid = pagos
    .filter((pago) => pago.receipt_status !== 'anulado')
    .reduce((total, pago) => total + Number(pago.amount || 0), 0);
  const address =
    [negocio.direccion, negocio.municipio?.nombre, negocio.municipio?.departamento?.nombre].filter(Boolean).join(', ') ||
    'Dirección no registrada';
  const planLabel =
    negocio.installments_count != null
      ? `${negocio.installments_count} cuotas de ${formatCOP(Number(negocio.installment_amount))}${orderNumber ? ` · OE ${orderNumber}` : ''}`
      : null;
  const pageCuotas = cuotas.slice(installmentPage * TABLE_PAGE_SIZE, (installmentPage + 1) * TABLE_PAGE_SIZE);
  const pagePagos = pagos.slice(paymentPage * TABLE_PAGE_SIZE, (paymentPage + 1) * TABLE_PAGE_SIZE);
  const readOnlySignatures = [
    { label: 'Cliente', url: customerSignature },
    { label: 'Fiador', url: guarantorSignature },
    { label: 'Vendedor', url: sellerSignature },
  ].filter((entry) => Boolean(entry.url));

  const closePaySheet = () => {
    if (!saving) setPayModalOpen(false);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
      <Stack.Screen options={screenOptions} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loadWarning ? (
          <Card variant="muted" style={styles.warning}>
            <MaterialIcons name="info-outline" size={IconSize.md} color={colors.warning.dark} />
            <Text style={[styles.warningText, { color: colors.text.primary }]}>{loadWarning}</Text>
          </Card>
        ) : null}

        <NegocioHero
          customerName={customerName || 'Cliente'}
          address={address}
          status={negocio.status}
          totalCredit={Number(negocio.total_credit)}
          totalPaid={totalPaid}
          pendingBalance={pendingBalance}
          planLabel={planLabel}
        />

        {/* El detalle local no incluye ítems ni subtotal de productos. */}
        {!fromLocal ? <NegocioProductsSummary items={items} productsSubtotal={Number(negocio.products_subtotal)} /> : null}

        <View style={styles.section}>
          <SectionHeader title="Cuotas" hint={`${cuotas.length} cuota${cuotas.length === 1 ? '' : 's'}`} />
          {cuotas.length ? (
            <View style={styles.list}>
              {pageCuotas.map((cuota) => (
                <InstallmentCard key={cuota.id} cuota={cuota} />
              ))}
            </View>
          ) : (
            <Text style={[styles.empty, { color: colors.text.secondary }]}>Sin cuotas registradas</Text>
          )}
          <Pagination page={installmentPage} pageSize={TABLE_PAGE_SIZE} total={cuotas.length} onChange={setInstallmentPage} itemLabel="cuotas" />
        </View>

        {canActivate ? (
          <Card variant="outlined" style={styles.signingCard}>
            <SectionHeader title="Firmas para activar" />
            <Text style={[styles.helper, { color: colors.text.secondary }]}>
              Puede dibujar las firmas o subir un PNG transparente. Si el cliente no firma ahora, la
              firma del vendedor es obligatoria; la firma del cliente podrá registrarse después, incluso
              con el negocio activo.
            </Text>
            {activationSignatureError ? (
              <Text style={[styles.helper, { color: colors.warning.dark, fontWeight: '600' }]}>
                {activationSignatureError}
              </Text>
            ) : null}
            <SignaturePad
              label="Firma del cliente"
              value={customerSignature}
              onChange={(value) => {
                setCustomerSignature(value);
                setSignaturesDirty(true);
                discardPendingSignatureUploads();
              }}
            />
            {negocio.codeudor_customer_id ? (
              <SignaturePad
                label="Firma del fiador"
                value={guarantorSignature}
                onChange={(value) => {
                  setGuarantorSignature(value);
                  setSignaturesDirty(true);
                  discardPendingSignatureUploads();
                }}
              />
            ) : null}
            <SignaturePad
              label={customerSignature ? 'Firma del vendedor' : 'Firma del vendedor (obligatoria)'}
              value={sellerSignature}
              onChange={(value) => {
                setSellerSignature(value);
                setSignaturesDirty(true);
                discardPendingSignatureUploads();
              }}
            />
          </Card>
        ) : null}

        {pagos.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Pagos y recibos" hint={`${pagos.length} registro${pagos.length === 1 ? '' : 's'}`} />
            <View style={styles.list}>
              {pagePagos.map((pago) => (
                <PaymentCard
                  key={pago.id}
                  pago={pago}
                  printing={printingTicket}
                  onOpenSupport={(path) => {
                    void openPagoSupport(path).catch((error: any) =>
                      Alert.alert('Error', error?.message || 'No se pudo abrir el soporte')
                    );
                  }}
                  onShare={() => void shareReceipt(pago)}
                  onPrint={() => void printReceipt(pago)}
                />
              ))}
            </View>
            <Pagination page={paymentPage} pageSize={TABLE_PAGE_SIZE} total={pagos.length} onChange={setPaymentPage} itemLabel="pagos" />
          </View>
        ) : null}

        {!canActivate && readOnlySignatures.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Firmas" />
            <SignatureGallery signatures={readOnlySignatures} />
          </View>
        ) : null}

        {canRegisterLateSignature ? (
          <Card variant="outlined" style={styles.signingCard}>
            <SectionHeader title="Firma del cliente pendiente" />
            <Text style={[styles.helper, { color: colors.text.secondary }]}>
              El negocio se activó sin la firma del cliente. Puede dibujarla o subir un PNG
              transparente para dejarla registrada en el contrato.
            </Text>
            <SignaturePad
              label="Firma del cliente"
              value={lateCustomerSignature}
              onChange={(value) => {
                setLateCustomerSignature(value);
                lateSignatureUpload.current = null;
              }}
            />
            <Button
              title="Guardar firma del cliente"
              icon="draw"
              onPress={() => void registerCustomerSignature()}
              loading={signatureSaving}
              disabled={!lateCustomerSignature}
            />
          </Card>
        ) : null}
      </ScrollView>

      <ActionBar>
        {canPay ? (
          <Button title="Registrar pago" icon="payments" onPress={() => setPayModalOpen(true)} style={styles.primaryAction} />
        ) : null}
        {canActivate ? (
          <Button
            title="Activar negocio"
            icon="check-circle"
            onPress={() => void activateDraft()}
            loading={actionSaving}
            style={styles.primaryAction}
          />
        ) : null}
        <Button title="PDF" variant="outline" icon="picture-as-pdf" onPress={() => void sharePdf()} accessibilityLabel="Compartir contrato en PDF" style={styles.secondaryAction} />
        <Button
          title="Imprimir"
          variant="outline"
          icon="print"
          onPress={() => void printNegocioTicket()}
          loading={printingTicket}
          accessibilityLabel="Imprimir negocio"
          style={styles.secondaryAction}
        />
      </ActionBar>

      <RegisterPaymentSheet
        visible={payModalOpen}
        onClose={closePaySheet}
        subtitle={`${labelNegocioCodigo(negocio.numero)} · ${customerName}`}
        pendingBalance={pendingBalance}
        amount={formattedPayAmount}
        onChangeAmount={(value) => {
          paymentIdempotencyKey.current = null;
          paymentPaidAt.current = null;
          setPayAmount(value.replace(/\D/g, '').slice(0, 12));
        }}
        receipt={payReceipt}
        onChangeReceipt={(value) => {
          paymentIdempotencyKey.current = null;
          paymentPaidAt.current = null;
          setPayReceipt(value);
        }}
        supportFile={paySupportFile}
        onPickSupport={choosePaySupport}
        saving={saving}
        onSubmit={() => void registerPago()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxl, gap: Spacing.xxl },
  centered: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  section: { gap: Spacing.md },
  list: { gap: Spacing.md },
  empty: { ...Typography.bodySmall, fontStyle: 'italic' },
  helper: { ...Typography.caption },
  warning: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  warningText: { ...Typography.bodySmall, flex: 1 },
  signingCard: { gap: Spacing.lg },
  primaryAction: { flex: 2 },
  secondaryAction: { flex: 1, paddingHorizontal: Spacing.md },
});
