import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Share,
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
import { parseDownPaymentSchedule } from '@/lib/negocios/negocioCreditRules';
import { buildNegocioContractHtml, NEGOCIO_CONTRACT_PDF_SIZE } from '@/lib/negocioContractHtml';
import { buildNegocioReceiptHtml } from '@/lib/negocioReceiptHtml';
import { LETTER_PDF_SIZE, pdfPrintOptions } from '@/lib/pdfPrintOptions';
import { useBluetoothPrinter } from '@/components/printing';
import { createIdempotencyKey } from '@/lib/idempotency';
import { MOBILE_PAYMENT_SITE, paymentSiteLabel } from '@/lib/paymentSite';
import { SignaturePad } from '@/components/negocios/components/SignaturePad';
import { NegocioProductsSummary } from '@/components/negocios/components/NegocioProductsSummary';
import { NegocioHero } from '@/components/negocios/components/NegocioHero';
import { InstallmentCard } from '@/components/negocios/components/InstallmentCard';
import { negocioSellerDiffersFromOwner } from '@/components/negocios/domain/negocioSellerOwner';
import { NegocioContactDetailsSheet } from '@/components/negocios/components/NegocioContactDetailsSheet';
import { canEditNegocioContactDetails } from '@/lib/negocios/negocioEditRules';
import { labelNegocioOrigen, resolveNegocioOrigen } from '@/lib/negocios/negocioOrigen';
import { useUserRoles } from '@/hooks/useUserRoles';
import { PaymentCard } from '@/components/negocios/components/PaymentCard';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { displayProfileName, fetchProfileNames } from '@/lib/profileNames';
import { getCachedProfileName, setCachedProfileName } from '@/lib/offline/security/secureKeys';
import { SignatureGallery } from '@/components/negocios/components/SignatureGallery';
import { RegisterPaymentSheet, type PagoSupportSource } from '@/components/negocios/components/RegisterPaymentSheet';
import {
  isNewLocalSignature,
  removeNegocioSignatures,
  resolveNegocioSignatureUrl,
  uploadNegocioSignature,
} from '@/lib/uploadSignature';
import {
  canRegisterCustomerSignatureLater,
  sellerSignatureRequiredError,
  signatureLoadWarning,
} from '@/lib/negocioSignatureRules';
import { computeRemainingBalance, remainingAfterPago, summarizePagos } from '@/lib/negocios/negocioBalance';
import {
  canOfferProntoPago,
  localPagoPermission,
  localProntoPagoPermission,
  canOfferPago,
  prontoPagoDecimalPlaces,
} from '@/lib/negocios/prontoPago';
import { canOfferVoidPago } from '@/lib/negocios/voidNegocioPago';
import { invalidateCartera } from '@/lib/cartera/carteraCache';
import { ProntoPagoSheet } from '@/components/negocios/components/ProntoPagoSheet';
import { VoidPagoSheet } from '@/components/negocios/components/VoidPagoSheet';
import {
  useProntoPago,
  type ProntoPagoRegistered,
} from '@/components/negocios/infrastructure/hooks/useProntoPago';
import { useNegocioPagoPermissions } from '@/components/negocios/infrastructure/hooks/useNegocioPagoPermissions';
import { useVoidNegocioPago } from '@/components/negocios/infrastructure/hooks/useVoidNegocioPago';
import { fetchRegisteredPagoReceipt } from '@/components/negocios/infrastructure/services/negocioPagosService';
import { runSync } from '@/lib/offline/sync/syncEngine';
import {
  openPagoSupport,
  uploadAndAttachPagoSupport,
  validatePagoSupportLocalFile,
  type PagoSupportLocalFile,
} from '@/lib/uploadPagoSupport';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalDb,
  deleteRejectedPagoLocal,
  fetchNegocioDetailFromLocal,
  listRejectedPagosFromLocal,
  queuePagoSupportUpload,
  registerPagoOffline,
  registerPagoWithFallback,
  type RejectedPagoRow,
} from '@/lib/offline/repositories/offlineRepository';
import { RejectedPagoCard } from '@/components/offline/RejectedPagoCard';
import {
  fetchNegocioRemisionVigente,
  labelRemisionVigente,
  type NegocioRemisionVigente,
} from '@/lib/negocios/negocioRemision';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import {
  buildRegisterPagoRpcCall,
  pagoAmountExceedsBalance,
  pagoAmountInputOptions,
  parsePagoAmountInput,
} from '@/lib/negocios/registerPagoRpc';
import {
  fetchPaymentMethods,
  type PaymentMethodOption,
} from '@/components/negocios/infrastructure/services/paymentMethodsService';
import { errorMessage } from '@/lib/errorMessage';

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
  /** Pagos que el servidor no aceptó y siguen guardados en el teléfono. */
  const [rejectedPagos, setRejectedPagos] = useState<RejectedPagoRow[]>([]);
  const [deletingRejectedId, setDeletingRejectedId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerMeta, setCustomerMeta] = useState<any>({});
  const [codeudorMeta, setCodeudorMeta] = useState<any>({});
  const [sellerName, setSellerName] = useState('');
  // Quien registró el negocio; no siempre es el vendedor.
  const [createdByName, setCreatedByName] = useState('');
  // Vendedor al que pertenece el CLIENTE (`customers.seller_id`), que puede no
  // ser el vendedor del negocio: en cartera se leía uno por el otro.
  const [customerSellerName, setCustomerSellerName] = useState<string | null>(null);
  /** Dueño del cliente: es el «Vendedor» del negocio (20261206120000). */
  const [customerSellerId, setCustomerSellerId] = useState<string | null>(null);
  /** Nombre del usuario actual: autor de los pagos que registre desde esta pantalla. */
  const [currentUserName, setCurrentUserName] = useState('');
  const [legalText, setLegalText] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  /** Número de la orden de la que salió la mercancía (remisión u OE de cliente). */
  const [originOrderNumber, setOriginOrderNumber] = useState<string | null>(null);
  /** Remisión en la que viaja hoy la orden del negocio; sin señal no se conoce. */
  const [remisionVigente, setRemisionVigente] = useState<NegocioRemisionVigente | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fromLocal, setFromLocal] = useState(false);
  const { user } = useAuth();
  const { isAdmin, isGestorCobro, isRecaudador } = useUserRoles();
  const online = useSyncStore((state) => state.online);
  const registeredByName = currentUserName || user?.email || null;
  const [contactSheetOpen, setContactSheetOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void getCachedProfileName().then((cached) => {
      if (active && cached) setCurrentUserName((current) => current || cached);
    });
    return () => {
      active = false;
    };
  }, [user?.id]);

  /** Texto del campo de valor tal como se pinta («93.333,33»). */
  const [payAmount, setPayAmount] = useState('');
  /**
   * Decimales admitidos en el valor del pago (`money_decimal_places` de la
   * configuración de crédito). Sin red se conserva el último conocido; por
   * defecto 2, porque las cuotas pueden tener centavos.
   */
  const [payMoneyDecimals, setPayMoneyDecimals] = useState<number | null>(null);
  const [payReceipt, setPayReceipt] = useState('');
  const [payMethodId, setPayMethodId] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
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
  const payAmountOptions = pagoAmountInputOptions(payMoneyDecimals);

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
      // Los productos ahora sí bajan en el pull (20261122120000): la tarjeta se
      // pinta con lo descargado en vez de ocultarse.
      setItems(local.items);
      setCuotas(local.cuotas);
      setPagos(local.pagos);
      setRejectedPagos(local.rejectedPagos);
      setInstallmentPage(0);
      setPaymentPage(0);
      setCustomerName(local.customer.name || '');
      setCustomerMeta(local.customer);
      setLegalText(null);
      setCustomerSignature('');
      setGuarantorSignature('');
      setSellerSignature('');
      setCodeudorMeta(local.codeudor || {});
      // El nombre del vendedor viaja resuelto en el pull: antes la pantalla
      // decía «Sin asignar» sin señal aunque el negocio sí tuviera vendedor.
      setSellerName(local.negocio.seller_name || '');
      // Quién creó el negocio viaja en el pull desde 20261128120000. Si no está
      // (datos bajados antes), el contrato imprime una raya en «CREADO POR» en
      // vez de dar por hecho que fue el vendedor.
      setCreatedByName(local.negocio.created_by_name || '');
      // El cliente baja con su `seller_id` y los usuarios bajan completos.
      setCustomerSellerName(local.customerSeller?.name ?? null);
      setCustomerSellerId(local.customerSeller?.id ?? null);
      setOrderNumber(null);
      setOriginOrderNumber(null);
      setRemisionVigente(null);
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
        .select('*, municipio:municipios(nombre, departamento:departamentos(nombre)), vereda:veredas(nombre)')
        .eq('id', id)
        .single();
      if (error) throw error;
      setNegocio(n);
      hasNegocioRef.current = true;
      setFromLocal(false);
      setSignaturesDirty(false);
      setLateCustomerSignature('');

      // Una firma que no se puede autorizar (borrada del almacenamiento o sin
      // permiso) no puede dejar el negocio sin abrir: se anota y se sigue.
      const signatureFailures: string[] = [];
      const signatureUrl = (label: string, stored: string | null | undefined) =>
        resolveNegocioSignatureUrl(stored).catch((signatureError) => {
          console.warn(`No se pudo autorizar la firma del ${label}`, signatureError);
          signatureFailures.push(label);
          return null;
        });

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
          .order('installment_number')
          .order('due_date'),
        supabase
          .from('negocio_pagos')
          // `cierre`: número del cierre de recaudo; un pago consolidado no se
          // anula (null si RLS no deja leer el cierre).
          .select('*, payment_method:payment_methods(name), cierre:recaudo_cierres(numero)')
          .eq('negocio_id', id)
          // Mismo desempate que `comparePagosOldestFirst`: con dos abonos a la
          // misma hora, ordenar solo por `paid_at` deja el orden indeterminado
          // y los recibos salen con el saldo cruzado.
          .order('paid_at', { ascending: false })
          .order('created_at', { ascending: false })
          .order('virtual_receipt_number', { ascending: false }),
        supabase
          .from('customers')
          .select('name, id_number, phone, email, address, seller_id')
          .eq('id', n.customer_id)
          .maybeSingle(),
        supabase
          .from('credit_settings')
          .select('legal_text, money_decimal_places')
          .is('deleted_at', null)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        signatureUrl('cliente', n.customer_signature_url),
        signatureUrl('fiador', n.guarantor_signature_url),
        signatureUrl('vendedor', n.seller_signature_url),
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
      const pagoRows = ((pagosRes.data || []) as {
        created_by: string | null;
        payment_method?: { name: string } | null;
        cierre?: { numero: string } | null;
      }[]).map(({ cierre, ...pago }) => ({
        ...pago,
        payment_method_name: pago.payment_method?.name ?? null,
        cierre_numero: cierre?.numero ?? null,
      }));
      // Un pago rechazado solo existe en el teléfono: el servidor nunca lo
      // devuelve, así que se lee aparte para que no desaparezca de la pantalla
      // al recuperar la conexión.
      setRejectedPagos(canUseLocalDb() ? await listRejectedPagosFromLocal(id).catch(() => []) : []);
      // Los pagos se pintan antes de resolver los nombres: el autor es un dato
      // decorativo y su consulta (tabla `profiles`, sujeta a RLS) no puede
      // dejar la lista de pagos sin actualizar si falla.
      setPagos(pagoRows);
      let profileNames = new Map<string, string>();
      try {
        profileNames = await fetchProfileNames([...pagoRows.map((pago) => pago.created_by), user?.id]);
        setPagos(
          pagoRows.map((pago) => ({
            ...pago,
            created_by_name: displayProfileName(profileNames, pago.created_by),
          }))
        );
      } catch {
        // Sin nombres, cada pago queda como "Sistema"; la lista sigue al día.
      }
      if (user?.id) {
        const myName = profileNames.get(user.id) || user.email || '';
        setCurrentUserName(myName);
        void setCachedProfileName(myName || null);
      }
      setInstallmentPage(0);
      setPaymentPage(0);
      setCustomerName(custRes.data?.name || '');
      setCustomerMeta(custRes.data || {});
      // Solo para nombrar al vendedor del cliente (se resuelve con los perfiles).
      const customerSellerId = custRes.data?.seller_id ?? null;
      setCustomerSellerId(customerSellerId);
      setLegalText(settingsRes.data?.legal_text || null);
      setPayMoneyDecimals(settingsRes.data?.money_decimal_places ?? null);
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

      // Vendedor, creador y vendedor del cliente en un solo viaje: suelen
      // repetirse, y aun cuando no lo hagan no hace falta consultar tres veces.
      const profileIds = [n.seller_id, n.created_by, customerSellerId].filter(Boolean) as string[];
      if (profileIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', [...new Set(profileIds)]);
        if (profilesError) throw profilesError;
        const byId = new Map((profiles || []).map((row) => [row.id, row.full_name || '']));
        setSellerName(n.seller_id ? byId.get(n.seller_id) || '' : '');
        setCreatedByName(n.created_by ? byId.get(n.created_by) || '' : '');
        setCustomerSellerName(customerSellerId ? byId.get(customerSellerId) || null : null);
      } else {
        setSellerName('');
        setCreatedByName('');
        setCustomerSellerName(null);
      }

      // Un solo viaje para los dos números que pinta la pantalla: el de la orden
      // del negocio y el de la orden de origen. En un negocio ya activo suelen
      // ser la misma fila (activate_negocio reutiliza la orden de origen), y en
      // un borrador solo existe la de origen; por eso se piden juntos con `in`
      // en vez de una consulta por campo.
      const origen = resolveNegocioOrigen(n);
      // Remisión vigente de la orden del negocio, en paralelo con los números.
      // Opcional: nunca lanza, y con un servidor sin la función (20261129120000)
      // la línea no aparece.
      const remisionPromise = n.delivery_order_id
        ? fetchNegocioRemisionVigente(supabase, n.id)
        : Promise.resolve(null);
      const orderIds = Array.from(
        new Set([n.delivery_order_id, origen.orderId].filter(Boolean) as string[])
      );
      if (orderIds.length) {
        const { data: oes, error: orderError } = await supabase
          .from('delivery_orders')
          .select('id, order_number')
          .in('id', orderIds);
        if (orderError) throw orderError;
        const numberById = new Map(
          (oes || []).map((oe) => [oe.id as string, (oe.order_number as string | null) || null])
        );
        setOrderNumber(n.delivery_order_id ? numberById.get(n.delivery_order_id) || null : null);
        setOriginOrderNumber(origen.orderId ? numberById.get(origen.orderId) || null : null);
      } else {
        // Borrador sin origen: nada que mostrar, y hay que limpiar lo del negocio anterior.
        setOrderNumber(null);
        setOriginOrderNumber(null);
      }
      setRemisionVigente(await remisionPromise);
      // mark_cuotas_en_mora exige can_manage_collection_for_negocio; un usuario
      // que solo puede ver el negocio recibe "Sin permiso" y no es un fallo real.
      const warnings = [
        moraError && !/sin permiso/i.test(moraError.message || '')
          ? 'No fue posible actualizar automáticamente las cuotas en mora.'
          : null,
        signatureLoadWarning(signatureFailures),
      ].filter((warning): warning is string => Boolean(warning));
      if (warnings.length) setLoadWarning(warnings.join(' '));
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
  }, [id, applyLocalDetail, user?.id, user?.email]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Cuando la cola de sincronización sube lo que quedó pendiente, el detalle
  // abierto tiene que enterarse: antes había que salir del negocio y volver a
  // entrar para ver el pago con su consecutivo definitivo y el saldo del
  // servidor. `useFocusEffect` solo dispara al enfocar la pantalla.
  //
  // Se recarga al vaciarse la cola (lo nuestro ya subió) y también cuando la
  // pantalla está mostrando datos del dispositivo y termina una sincronización,
  // que es justo el momento en que hay algo más fresco que enseñar. No se
  // recarga en cada ciclo de sincronización para no parpadear sin motivo.
  // El catálogo se carga al abrir la hoja: sin red cae a la copia descargada.
  useEffect(() => {
    if (!payModalOpen) return;
    let cancelled = false;
    setPaymentMethodsLoading(true);
    fetchPaymentMethods()
      .then((methods) => {
        if (cancelled) return;
        setPaymentMethods(methods);
      })
      .catch(() => {
        if (!cancelled) setPaymentMethods([]);
      })
      .finally(() => {
        if (!cancelled) setPaymentMethodsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payModalOpen]);

  const pendingCount = useSyncStore((state) => state.pendingCount);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const hadPendingRef = useRef(false);
  const lastSyncSeenRef = useRef<number | null>(null);
  useEffect(() => {
    const hadPending = hadPendingRef.current;
    hadPendingRef.current = pendingCount > 0;
    const syncChanged = lastSyncedAt !== null && lastSyncedAt !== lastSyncSeenRef.current;
    const firstRead = lastSyncSeenRef.current === null;
    lastSyncSeenRef.current = lastSyncedAt;
    if (firstRead) return;
    const colaVaciada = hadPending && pendingCount === 0;
    if (colaVaciada || (syncChanged && fromLocal)) void load();
  }, [pendingCount, lastSyncedAt, fromLocal, load]);

  const pendingBalance = useMemo(() => computeRemainingBalance(cuotas), [cuotas]);
  const serverPagoPermissions = useNegocioPagoPermissions({
    negocioId: negocio?.id,
    enabled: online && !fromLocal,
    reloadKey: negocio,
  });

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

  const choosePaySupport = (source: PagoSupportSource) => {
    if (source === 'camera') return void pickSupportFromCamera();
    if (source === 'gallery') return void pickSupportFromGallery();
    return void pickSupportDocument();
  };

  const printReceiptAfterPago = async (input: {
    receiptNumber: string;
    paidAt: string;
    amount: number;
    physicalReceiptNumber: string | null;
    paymentMethodName: string | null;
    /** Pronto pago: el saldo queda en 0 y el ticket lleva pendiente y descuento. */
    prontoPago?: { discountAmount: number; discountReason: string | null; expectedTotal: number };
    /** El pago salió de la cola sin conexión: el recibo lleva la leyenda. */
    pendingConfirmation?: boolean;
  }) => {
    if (!negocio) return false;
    return printPaymentIfReady({
      receiptNumber: input.receiptNumber,
      status: 'emitido',
      pendingConfirmation: input.pendingConfirmation,
      paidAt: input.paidAt,
      amount: input.amount,
      physicalReceiptNumber: input.physicalReceiptNumber,
      negocioNumero: negocio.numero,
      customerName,
      sellerName,
      registeredBy: registeredByName,
      paymentMethodName: input.paymentMethodName,
      // Este recibo se emite justo después de cobrar desde la app.
      paymentSiteName: paymentSiteLabel(MOBILE_PAYMENT_SITE),
      remainingBalance: input.prontoPago ? 0 : Math.max(pendingBalance - input.amount, 0),
      ...(input.prontoPago
        ? {
            paymentKind: 'pronto_pago',
            discountAmount: input.prontoPago.discountAmount,
            discountReason: input.prontoPago.discountReason,
            expectedTotal: input.prontoPago.expectedTotal,
          }
        : {}),
    });
  };

  /** Pide al motor de sincronización traer lo que cambió en el servidor. */
  const syncAfterOnlineChange = () => {
    if (canUseLocalDb()) void runSync('mutation');
  };

  const onProntoPagoRegistered = async ({ pagoId, values, paidAt, paymentMethodName }: ProntoPagoRegistered) => {
    await refreshAfterPago();
    syncAfterOnlineChange();

    let receiptNumber = values.receiptNumber || 'Provisional';
    let physicalReceiptNumber = values.receiptNumber;
    let persistedPaidAt = paidAt;
    let amount = values.netAmount;
    let discountAmount = values.discountAmount;
    let expectedTotal = values.pendingTotal;
    let discountReason = values.discountReason;
    try {
      const row = await fetchRegisteredPagoReceipt(pagoId);
      if (row?.virtual_receipt_number) {
        receiptNumber = row.virtual_receipt_number;
        physicalReceiptNumber = row.receipt_number;
      }
      if (row?.paid_at) persistedPaidAt = row.paid_at;
      if (row?.amount != null) amount = Number(row.amount);
      if (row?.discount_amount != null) discountAmount = Number(row.discount_amount);
      if (row?.expected_total != null) expectedTotal = Number(row.expected_total);
      if (row?.discount_reason) discountReason = row.discount_reason;
    } catch {
      // El pago ya está confirmado; el ticket sale con los valores confirmados en la hoja.
    }
    const printed = await printReceiptAfterPago({
      receiptNumber,
      paidAt: persistedPaidAt,
      amount,
      physicalReceiptNumber,
      paymentMethodName,
      prontoPago: { discountAmount, discountReason, expectedTotal },
    });
    notifyPagoResult(
      'Pronto pago registrado',
      routeStopId
        ? 'El negocio quedó saldado y la parada se completó.'
        : 'El negocio quedó saldado.',
      printed
    );
  };

  /**
   * Refresco posterior a un pago. Nunca propaga: si la recarga falla, el pago
   * ya está registrado y el recibo debe poder imprimirse igual. `load()` avisa
   * por su cuenta de lo que no pudo traer.
   */
  const refreshAfterPago = async (options?: { preferLocal?: boolean }) => {
    // Cartera guarda sus datos unos segundos para no reconsultar al volver: un
    // pago los deja viejos, así que se marcan para que se recarguen.
    invalidateCartera();
    try {
      await load(options);
    } catch {
      // load() ya gestiona y muestra sus propios errores.
    }
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
    const amount = parsePagoAmountInput(payAmount, payAmountOptions);
    if (!amount || amount <= 0) {
      return Alert.alert('Indique un valor válido');
    }
    if (!payMethodId) {
      return Alert.alert('Método de pago', 'Seleccione con qué método se recibió el pago.');
    }
    const paymentMethodLabel =
      paymentMethods.find((method) => method.id === payMethodId)?.name || null;
    if (pagoAmountExceedsBalance(amount, pendingBalance)) {
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
      // La clave y la fecha se fijan una sola vez por intento: si el cobro se
      // reintenta (o cae al camino sin conexión) el servidor lo reconoce como
      // el mismo pago y no lo duplica.
      const idempotencyKey = (paymentIdempotencyKey.current ||= createIdempotencyKey());
      paymentPaidAt.current ||= new Date().toISOString();
      const paidAt = paymentPaidAt.current;
      const registerOnline = async () => {
        const call = buildRegisterPagoRpcCall({
          negocioId: negocio.id,
          routeStopId: routeStopId || null,
          amount,
          paidAt,
          receiptNumber: payReceipt || null,
          notes: null,
          idempotencyKey,
          // Obligatorio en el servidor desde 20261018130000: sin él, el RPC rechaza el cobro.
          paymentMethodId: payMethodId,
        });
        const { data, error } = await supabase.rpc(call.name, call.args);
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
        setPayMethodId('');
        setPaySupportFile(null);
        setPayModalOpen(false);

        // El pago ya está confirmado por el servidor: la pantalla se refresca
        // aquí, antes de buscar el consecutivo, imprimir y avisar. Si la
        // recarga va después, queda atada a que la impresora responda y los
        // saldos se quedan viejos cuando no imprime.
        await refreshAfterPago();

        let receiptNumber = payReceipt || 'Provisional';
        let physicalReceiptNumber = payReceipt || null;
        let persistedPaidAt = paidAt;
        if (pagoId) {
          try {
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
          } catch {
            // El servidor ya aceptó el pago. Si la consulta del consecutivo se
            // corta por tiempo, el recibo sale como «Provisional»: propagar el
            // error haría caer el cobro al camino sin conexión y se guardaría
            // una segunda copia del mismo pago.
          }
        }
        const printed = await printReceiptAfterPago({
          receiptNumber,
          paidAt: persistedPaidAt,
          amount,
          physicalReceiptNumber,
          paymentMethodName: paymentMethodLabel,
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
      };

      const registerOffline = async () => {
        const offlineResult = await registerPagoOffline({
          negocioId: negocio.id,
          amount,
          paidAt,
          receiptNumber: payReceipt || null,
          paymentMethodId: payMethodId,
          paymentMethodName: paymentMethodLabel,
          idempotencyKey,
          routeStopId: routeStopId || null,
          supportFile: paySupportFile,
          registeredBy: registeredByName,
        });
        paymentIdempotencyKey.current = null;
        paymentPaidAt.current = null;
        setPayAmount('');
        setPayReceipt('');
        setPayMethodId('');
        setPaySupportFile(null);
        setPayModalOpen(false);

        // Igual que en la ruta con conexión: el pago ya está guardado en el
        // dispositivo, así que la pantalla se refresca antes de imprimir.
        await refreshAfterPago({ preferLocal: true });

        const printed = await printReceiptAfterPago({
          receiptNumber: payReceipt || 'Provisional',
          paidAt,
          amount,
          physicalReceiptNumber: payReceipt || null,
          paymentMethodName: paymentMethodLabel,
          // El recibo sale con la leyenda «PENDIENTE DE CONFIRMACIÓN».
          pendingConfirmation: true,
        });
        notifyPagoResult(
          'Pago guardado sin conexión',
          offlineResult.supportWarning
            ? `Se sincronizará cuando haya red. El recibo queda pendiente de confirmación.\n\nSoporte: ${offlineResult.supportWarning}`
            : 'Se sincronizará cuando haya red. El recibo queda pendiente de confirmación.',
          printed
        );
      };

      // Sin red conocida no se intenta el servidor: con señal débil la petición
      // tarda todo el tiempo límite antes de fallar y el cobrador espera de más.
      await registerPagoWithFallback({
        online: useSyncStore.getState().online,
        registerOnline,
        registerOffline,
      });
    } catch (e: any) {
      Alert.alert('Error', errorMessage(e, 'No se pudo registrar'));
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
        negocio.vereda?.nombre,
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
      customer_seller_name: customerSellerName,
      created_by_name: createdByName,
      products_subtotal: Number(negocio.products_subtotal),
      interest_amount: Number(negocio.interest_amount),
      total_credit: Number(negocio.total_credit),
      down_payment: Number(negocio.down_payment),
      down_payment_date: negocio.down_payment_date || null,
      down_payment_schedule: parseDownPaymentSchedule(negocio.down_payment_schedule, negocio),
      financed_amount: Number(negocio.financed_amount),
      installments_count: negocio.installments_count,
      installment_amount: Number(negocio.installment_amount),
      frequency: negocio.frequency,
      legal_text: legalText,
      customer_signature_url: customerSignature,
      guarantor_signature_url: guarantorSignature,
      seller_signature_url: sellerSignature,
      delivery_order_number: orderNumber,
      first_due_date: negocio.first_due_date || null,
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
        paid_amount: Number(c.paid_amount || 0),
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
        // Tamaño oficio: 216 x 330 mm = 612 x 935 puntos a 72 ppp (legal sería 612 x 1008).
        // La web imprime con este mismo tamaño (ver NEGOCIO_CONTRACT_PDF_SIZE).
        const { uri } = await Print.printToFileAsync(pdfPrintOptions(html, NEGOCIO_CONTRACT_PDF_SIZE));
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
      Alert.alert('Error', errorMessage(e, 'No se pudo compartir'));
    }
  };

  /** Campos del pronto pago para el recibo y el ticket de un pago existente. */
  const pagoReceiptExtras = (pago: any) => ({
    paymentKind: pago.payment_kind ?? null,
    discountAmount: pago.discount_amount == null ? null : Number(pago.discount_amount),
    discountReason: pago.discount_reason ?? null,
    expectedTotal: pago.expected_total == null ? null : Number(pago.expected_total),
    // Solo lo traen las filas locales todavía en la cola; los pagos que vienen
    // del servidor ya están confirmados y reimprimen sin leyenda.
    pendingConfirmation: Boolean(pago.pending_confirmation),
  });

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
      sellerName,
      registeredBy: pago.created_by_name,
      paymentMethodName: pago.payment_method_name,
      paymentSiteName: paymentSiteLabel(pago.payment_site),
      remainingBalance,
      ...pagoReceiptExtras(pago),
    });
    try {
      const Print = require('expo-print');
      const Sharing = require('expo-sharing');
      const { uri } = await Print.printToFileAsync(pdfPrintOptions(html, LETTER_PDF_SIZE));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: pago.virtual_receipt_number });
      }
    } catch (error: any) {
      Alert.alert('Error', errorMessage(error, 'No se pudo compartir el recibo'));
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
      registeredBy: pago.created_by_name,
      paymentMethodName: pago.payment_method_name,
      paymentSiteName: paymentSiteLabel(pago.payment_site),
      remainingBalance,
      ...pagoReceiptExtras(pago),
    });
  };

  /**
   * Borrar un pago no aceptado es siempre decisión de la persona: el cliente ya
   * tiene un recibo impreso en la mano, así que se pide confirmación expresa.
   */
  const confirmDeleteRejectedPago = (pago: RejectedPagoRow) => {
    Alert.alert(
      'Eliminar el pago del teléfono',
      `Se borrará el registro de ${formatCOP(Number(pago.amount))} que el servidor no aceptó. El cliente puede tener el recibo impreso: avise a la oficina antes de continuar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingRejectedId(pago.id);
              try {
                await deleteRejectedPagoLocal(pago.id);
                setRejectedPagos((current) => current.filter((row) => row.id !== pago.id));
              } catch (error: any) {
                Alert.alert('Error', errorMessage(error, 'No se pudo eliminar el pago'));
              } finally {
                setDeletingRejectedId(null);
              }
            })();
          },
        },
      ]
    );
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
      downPaymentDate: negocio.down_payment_date || null,
      downPaymentSchedule: parseDownPaymentSchedule(negocio.down_payment_schedule, negocio),
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
            vereda_id: negocio.vereda_id || null,
            direccion: negocio.direccion,
            customer_id: negocio.customer_id,
            codeudor_customer_id: negocio.codeudor_customer_id || null,
            seller_id: negocio.seller_id || null,
            products_subtotal: Number(negocio.products_subtotal),
            interest_amount: Number(negocio.interest_amount),
            total_credit: Number(negocio.total_credit),
            down_payment: Number(negocio.down_payment),
            down_payment_date: negocio.down_payment_date || null,
            down_payment_schedule: parseDownPaymentSchedule(negocio.down_payment_schedule, negocio),
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
      Alert.alert('Error', errorMessage(error, 'No se pudo activar el negocio'));
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

  const prontoPago = useProntoPago({
    negocioId: negocio?.id,
    routeStopId: routeStopId || null,
    online,
    fromLocal,
    onRegistered: onProntoPagoRegistered,
  });

  const voidPago = useVoidNegocioPago({
    pagos,
    onBlocked: (message) => Alert.alert('No se puede anular', message),
    onVoided: async (pago) => {
      await refreshAfterPago();
      syncAfterOnlineChange();
      Alert.alert(
        'Pago anulado',
        `${pago.virtual_receipt_number || 'El pago'} quedó anulado y su valor volvió a las cuotas.`
      );
    },
  });

  const confirmVoidPago = (reason: string) => {
    const receipt = voidPago.target?.virtual_receipt_number || 'este pago';
    Alert.alert('Confirmar anulación', `¿Anular ${receipt}? Esta acción no se puede deshacer.`, [
      { text: 'No', style: 'cancel' },
      { text: 'Anular', style: 'destructive', onPress: () => void voidPago.confirm(reason) },
    ]);
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

  const canActivate = ['borrador', 'por_firmar'].includes(negocio.status);
  const canRegisterLateSignature = !fromLocal && canRegisterCustomerSignatureLater(negocio);
  const activationSignatureError = canActivate
    ? sellerSignatureRequiredError(customerSignature, sellerSignature)
    : null;
  // «Pagado» es dinero recibido; los descuentos por pronto pago van aparte.
  const { paid: totalPaid, discount: totalDiscount } = summarizePagos(pagos);
  // Abonos: admin, gestor de cobro asignado o recaudador (cualquier negocio).
  // Pronto pago: admin o gestor asignado. El vendedor no, aunque sea el dueño
  // (20261111120000 y 20261113120000).
  const localPermissionInput = {
    isAdmin: isAdmin(),
    isGestorCobro: isGestorCobro(),
    isRecaudador: isRecaudador(),
    gestorCobroId: negocio.gestor_cobro_id,
    userId: user?.id,
  };
  const pagoAllowed = serverPagoPermissions.canRegisterPago ?? localPagoPermission(localPermissionInput);
  const prontoPagoAllowed =
    serverPagoPermissions.canRegisterProntoPago ?? localProntoPagoPermission(localPermissionInput);
  const canPay = canOfferPago({ status: negocio.status, allowed: pagoAllowed });
  const showProntoPago = canOfferProntoPago({
    status: negocio.status,
    pendingBalance,
    allowed: prontoPagoAllowed,
  });
  const prontoPagoDecimals = prontoPagoDecimalPlaces(negocio.formula_snapshot, payMoneyDecimals);
  const canVoidPagos = serverPagoPermissions.canVoidPago === true;
  const address =
    [negocio.direccion, negocio.vereda?.nombre, negocio.municipio?.nombre, negocio.municipio?.departamento?.nombre]
      .filter(Boolean)
      .join(', ') ||
    'Dirección no registrada';
  const downPaymentSchedule = parseDownPaymentSchedule(negocio.down_payment_schedule, negocio);
  const downPaymentLabel =
    Number(negocio.down_payment) > 0
      ? `Inicial ${formatCOP(Number(negocio.down_payment))}${
          downPaymentSchedule.length > 1
            ? ` en ${downPaymentSchedule.length} abonos`
            : downPaymentSchedule[0]
              ? ` (${downPaymentSchedule[0].due_date})`
              : ''
        }`
      : null;
  const cuotasLabel =
    Number(negocio.installments_count) > 0
      ? `${negocio.installments_count} cuotas de ${formatCOP(Number(negocio.installment_amount))}`
      : 'Sin cuotas';
  const planLabel =
    negocio.installments_count != null
      ? `${downPaymentLabel ? `${downPaymentLabel} · ` : ''}${cuotasLabel}${orderNumber ? ` · OE ${orderNumber}` : ''}`
      : downPaymentLabel;
  // El detalle local no descarga `remission_id` ni `source_delivery_order_id`:
  // sin ese dato el origen queda «desconocido» y la tarjeta no se pinta, en vez
  // de afirmar «Desde bodega» por omisión.
  const origen = resolveNegocioOrigen(negocio, { known: !fromLocal });
  const sellerDiffers = negocioSellerDiffersFromOwner(negocio.seller_id, customerSellerId);
  // Activo, entregado o cerrado: solo dirección, notas y gestor de cobro (el
  // servidor valida admin, vendedor dueño o gestor asignado). Solo con conexión.
  const contactDetailsEditable = canEditNegocioContactDetails(negocio.status);
  const canEditContactDetails = contactDetailsEditable && !fromLocal && online;
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
          totalDiscount={totalDiscount}
          pendingBalance={pendingBalance}
          planLabel={planLabel}
        />

        {showProntoPago ? (
          <Card variant="outlined" style={styles.prontoPagoCard}>
            <View style={styles.sellerRow}>
              <MaterialIcons name="bolt" size={IconSize.md} color={colors.primary.main} />
              <View style={styles.sellerCopy}>
                <Text style={[styles.sellerName, { color: colors.text.primary }]}>Liquidar con descuento</Text>
                <Text style={[styles.helper, { color: colors.text.secondary }]}>
                  Salda todo el crédito ({formatCOP(pendingBalance)}) con un descuento por pronto pago.
                </Text>
              </View>
            </View>
            <Button
              title="Registrar descuento pronto pago"
              variant="outline"
              icon="percent"
              onPress={prontoPago.open}
              disabled={Boolean(prontoPago.blockReason)}
            />
            {prontoPago.blockReason ? (
              <Text style={[styles.helper, { color: colors.warning.dark, fontWeight: '600' }]}>
                {prontoPago.blockReason}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {/* Sin señal el subtotal sale de la suma de los ítems descargados. */}
        <NegocioProductsSummary items={items} productsSubtotal={Number(negocio.products_subtotal)} />

        {/* La orden del negocio y de dónde salió la mercancía. Sin conexión no
            se conoce el origen y la tarjeta se omite. */}
        {origen.kind !== 'desconocido' ? (
          <Card variant="outlined" style={styles.sellerCard}>
            <View style={styles.sellerRow}>
              <MaterialIcons name="local-shipping" size={IconSize.md} color={colors.primary.main} />
              <View style={styles.sellerCopy}>
                <Text style={[styles.sellerLabel, { color: colors.text.secondary }]}>Orden de entrega</Text>
                <Text style={[styles.sellerName, { color: colors.text.primary }]} numberOfLines={1}>
                  {orderNumber || 'Se asigna al activar el negocio'}
                </Text>
                <Text style={[styles.helper, { color: colors.text.secondary }]}>
                  Origen: {labelNegocioOrigen(origen, originOrderNumber)}
                </Text>
                {remisionVigente && !fromLocal ? (
                  <Text style={[styles.helper, { color: colors.text.secondary }]}>
                    {labelRemisionVigente(remisionVigente)}
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>
        ) : null}

        <Card variant="outlined" style={styles.sellerCard}>
          <View style={styles.sellerRow}>
            <MaterialIcons name="badge" size={IconSize.md} color={colors.primary.main} />
            <View style={styles.sellerCopy}>
              <Text style={[styles.sellerLabel, { color: colors.text.secondary }]}>Vendedor (dueño del cliente)</Text>
              <Text testID="negocio-customer-seller" style={[styles.sellerName, { color: colors.text.primary }]} numberOfLines={1}>
                {customerSellerName || 'Sin asignar'}
              </Text>
              {/*
                El vendedor es el dueño del cliente (20261206120000); quien
                registró el negocio va aparte. Si el negocio guarda otro
                vendedor (anterior a la regla o cliente reasignado después), se
                dice cuál, para no confundir la cartera.
              */}
              <Text testID="negocio-registered-by" style={[styles.helper, { color: colors.text.secondary }]} numberOfLines={1}>
                Creado por: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{createdByName || '—'}</Text>
              </Text>
              {sellerDiffers ? (
                <Text testID="negocio-stored-seller" style={[styles.helper, { color: colors.text.secondary }]} numberOfLines={1}>
                  Vendedor registrado en el negocio: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{sellerName || '—'}</Text>
                </Text>
              ) : null}
            </View>
          </View>
        </Card>

        {contactDetailsEditable || negocio.notes ? (
          <Card variant="outlined" style={styles.sellerCard}>
            <View style={styles.sellerRow}>
              <MaterialIcons name="place" size={IconSize.md} color={colors.primary.main} />
              <View style={styles.sellerCopy}>
                <Text style={[styles.sellerLabel, { color: colors.text.secondary }]}>Dirección y notas</Text>
                <Text style={[styles.helper, { color: colors.text.primary }]}>{address}</Text>
                {negocio.notes ? (
                  <Text style={[styles.helper, { color: colors.text.secondary }]}>Notas: {negocio.notes}</Text>
                ) : null}
              </View>
              {canEditContactDetails ? (
                <Button
                  title="Editar"
                  variant="outline"
                  size="sm"
                  onPress={() => setContactSheetOpen(true)}
                  accessibilityLabel="Editar dirección y notas"
                />
              ) : null}
            </View>
          </Card>
        ) : null}

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
                  onVoid={
                    canOfferVoidPago({ canVoid: canVoidPagos, online, fromLocal, pago })
                      ? () => voidPago.request(pago)
                      : undefined
                  }
                />
              ))}
            </View>
            <Pagination page={paymentPage} pageSize={TABLE_PAGE_SIZE} total={pagos.length} onChange={setPaymentPage} itemLabel="pagos" />
          </View>
        ) : null}

        {rejectedPagos.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title="Pagos no aceptados"
              hint={`${rejectedPagos.length} registro${rejectedPagos.length === 1 ? '' : 's'}`}
            />
            <Text style={[styles.helper, { color: colors.text.secondary }]}>
              Estos pagos se tomaron en el teléfono y el servidor no los aceptó. No suman al saldo y
              se quedan aquí hasta que usted los elimine.
            </Text>
            <View style={styles.list}>
              {rejectedPagos.map((pago) => (
                <RejectedPagoCard
                  key={pago.id}
                  pago={pago}
                  deleting={deletingRejectedId === pago.id}
                  onDelete={() => confirmDeleteRejectedPago(pago)}
                />
              ))}
            </View>
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
        <Button
          title="PDF"
          variant="outline"
          icon="picture-as-pdf"
          iconOnly
          onPress={() => void sharePdf()}
          accessibilityLabel="Compartir contrato en PDF"
          style={styles.secondaryAction}
        />
        <Button
          title="Imprimir"
          variant="outline"
          icon="print"
          iconOnly
          onPress={() => void printNegocioTicket()}
          loading={printingTicket}
          accessibilityLabel="Imprimir negocio"
          style={styles.secondaryAction}
        />
      </ActionBar>


      {contactSheetOpen ? (
        <NegocioContactDetailsSheet
          visible
          negocio={{
            id: negocio.id,
            numero: negocio.numero,
            status: negocio.status,
            direccion: negocio.direccion,
            municipio_id: negocio.municipio_id,
            vereda_id: negocio.vereda_id,
            notes: negocio.notes,
            municipioNombre: negocio.municipio?.nombre,
            veredaNombre: negocio.vereda?.nombre,
          }}
          onClose={() => setContactSheetOpen(false)}
          onSaved={async (result) => {
            setContactSheetOpen(false);
            await load();
            syncAfterOnlineChange();
            Alert.alert('Listo', result.changed ? 'Dirección y notas actualizadas.' : 'No había cambios.');
          }}
        />
      ) : null}

      <ProntoPagoSheet
        visible={prontoPago.visible}
        onClose={prontoPago.close}
        subtitle={`${labelNegocioCodigo(negocio.numero)} · ${customerName}`}
        loading={prontoPago.loading}
        summary={prontoPago.summary}
        decimalPlaces={prontoPagoDecimals}
        paymentMethods={prontoPago.paymentMethods}
        paymentMethodsLoading={prontoPago.paymentMethodsLoading}
        saving={prontoPago.saving}
        blockedReason={prontoPago.blockReason}
        notice={prontoPago.notice}
        onSubmit={(values) => void prontoPago.submit(values)}
      />

      <VoidPagoSheet
        pago={voidPago.target}
        onClose={voidPago.close}
        saving={voidPago.saving}
        errorText={voidPago.errorText}
        onConfirm={confirmVoidPago}
      />

      <RegisterPaymentSheet
        visible={payModalOpen}
        onClose={closePaySheet}
        subtitle={`${labelNegocioCodigo(negocio.numero)} · ${customerName}`}
        pendingBalance={pendingBalance}
        amount={payAmount}
        onChangeAmount={(value) => {
          paymentIdempotencyKey.current = null;
          paymentPaidAt.current = null;
          setPayAmount(value);
        }}
        amountDecimalPlaces={payAmountOptions.decimalPlaces}
        receipt={payReceipt}
        onChangeReceipt={(value) => {
          paymentIdempotencyKey.current = null;
          paymentPaidAt.current = null;
          setPayReceipt(value);
        }}
        paymentMethods={paymentMethods}
        paymentMethodId={payMethodId}
        onChangePaymentMethod={(value) => {
          paymentIdempotencyKey.current = null;
          paymentPaidAt.current = null;
          setPayMethodId(value);
        }}
        paymentMethodsLoading={paymentMethodsLoading}
        supportFile={paySupportFile}
        onPickSupport={choosePaySupport}
        onRemoveSupport={() => setPaySupportFile(null)}
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
  sellerCard: { padding: Spacing.lg },
  prontoPagoCard: { padding: Spacing.lg, gap: Spacing.md },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sellerCopy: { flex: 1, gap: 2 },
  sellerLabel: { ...Typography.label },
  sellerName: { ...Typography.bodyStrong },
  primaryAction: { flex: 2 },
  secondaryAction: { flex: 1, paddingHorizontal: Spacing.md },
});
