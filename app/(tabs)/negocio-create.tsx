import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { matchesDigits, matchesNormalized } from '@/lib/search/normalizeText';
import { MaterialIcons } from '@expo/vector-icons';
import { OptionPickerField } from '@/components/ui/OptionPickerField';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import {
  calculateCredit,
  formatCOP,
  type CreditFrequency,
} from '@/lib/creditCalculator';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import {
  useNegociosStore,
  type NegocioItem,
} from '@/components/negocios/infrastructure/store/negociosStore';
import { SignaturePad } from '@/components/negocios/components/SignaturePad';
import {
  negocioSaveBlockedBySignature,
  sellerSignatureRequiredError,
} from '@/lib/negocioSignatureRules';
import {
  createDownPaymentRow,
  downPaymentRowLabels,
  downPaymentRowsToSchedule,
  downPaymentScheduleError,
  downPaymentScheduleTotal,
  financedAfterDownPayments,
  installmentPlanError,
  requiresInstallmentPlan,
  sortDownPaymentSchedule,
  type DownPaymentRow,
} from '@/lib/negocios/negocioCreditRules';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { getCachedProfileName } from '@/lib/offline/security/secureKeys';
import {
  fetchSellerOptions,
  fetchVendedorOptions,
  withCurrentUserOption,
  type SellerOption,
} from '@/lib/users/sellersService';
import {
  buildNegocioSellerInput,
  negocioSellerBlockedReason,
  negocioSellerMode,
  negocioSellerOwnerHint,
  negocioSellerOwnerText,
} from '@/components/negocios/domain/negocioSellerOwner';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { NegocioProductAddSection } from '@/components/negocios/components/NegocioProductAddSection';
import { NegocioItemsList } from '@/components/negocios/components/NegocioItemsList';
import { NegocioDatePicker } from '@/components/negocios/components/NegocioDatePicker';
import { NegocioCreditSummary } from '@/components/negocios/components/NegocioCreditSummary';
import {
  availableQtyForItem,
  fetchStockForProductsWithSource,
  formatNegocioMoneyInput,
  itemsHaveValidStock,
  type ProductWarehouseStock,
} from '@/components/negocios/infrastructure/services/negociosStockService';
import {
  fetchPendingRemissions,
  fetchRemissionOriginProducts,
  stockMapFromDeliveryOrder,
  type DeliveryOrderItemOption,
  type DeliveryOrderOption,
  type PendingRemissionOption,
  type RemissionOriginGroup,
} from '@/components/negocios/infrastructure/services/negociosDeliveryOrdersService';
import {
  fetchLocalPendingRemissions,
  fetchLocalRemissionOriginGroups,
} from '@/components/negocios/infrastructure/services/negociosOfflineOrdersService';
import { buildNegocioOriginPayload } from '@/components/negocios/domain/negocioOrigin';
import {
  NegocioDeliveryModeSection,
  type NegocioDeliveryMode,
} from '@/components/negocios/components/NegocioDeliveryModeSection';
import { NegocioOriginGroupsSection } from '@/components/negocios/components/NegocioOriginGroupsSection';
import { NegocioOriginOrderPicker } from '@/components/negocios/components/NegocioOriginOrderPicker';
import { NegocioDraftBanner } from '@/components/negocios/components/NegocioDraftBanner';
import { NegocioPeopleLines } from '@/components/negocios/components/NegocioPeopleLines';
import {
  fetchCustomerSellerLookup,
  type CustomerSellerLookup,
} from '@/components/customers/infrastructure/services/customerSellerLookup';
import { hasNegocioDraft, negocioDraftSummary } from '@/components/negocios/domain/negocioDraft';
import { useOriginOrderSearch } from '@/components/negocios/infrastructure/hooks/useOriginOrderSearch';
import {
  clearAutoFilled,
  resolveNegocioLocation,
  type NegocioLocation,
} from '@/components/negocios/domain/negocioLocation';
import {
  createCustomer,
  fetchCustomerSavedLocation,
  findCustomerByIdNumber,
  isDuplicateCustomerIdNumber,
  searchCustomersForNegocio,
} from '@/components/customers';
import { duplicateCustomerPrompt } from '@/components/customers/domain/duplicateCustomer';
// Traductor común: la pantalla tenía una copia propia que devolvía el texto
// crudo de la base («duplicate key value violates…») en todos sus avisos.
import { errorMessage } from '@/lib/errorMessage';
import { expectedSellerIdOnCreate, roleNamesOf } from '@/components/customers/domain/customerCreationAssignment';
import { useUserRoles } from '@/hooks/useUserRoles';
import {
  productSearchNotice,
  searchProductsForNegocio,
  type NegocioProduct,
} from '@/components/negocios/infrastructure/services/negociosProductsService';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { canUseLocalDb } from '@/lib/offline/repositories/offlineRepository';
import {
  fetchLocationCatalogsFromLocal,
  localCatalogPulledAt,
} from '@/lib/offline/repositories/catalogRepository';
import { formatLastDownloadTime } from '@/lib/offline/sync/downloadData';
import { useOfflineSelection } from '@/components/offline/infrastructure/syncPrefsService';
import { useSyncStore } from '@/lib/offline/store/syncStore';

type Customer = {
  id: string;
  name: string;
  id_number: string;
};

type Product = NegocioProduct;
type Departamento = { id: string; nombre: string };
type Municipio = { id: string; nombre: string; departamento_id: string };
type Vereda = { id: string; nombre: string; municipio_id: string };

const WIZARD_STEPS = [
  { id: 0, label: 'Cliente', icon: 'person' },
  { id: 1, label: 'Productos', icon: 'shopping-cart' },
  { id: 2, label: 'Crédito', icon: 'calculate' },
  { id: 3, label: 'Firma', icon: 'draw' },
];


const localDateValue = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function NegocioCreateScreen() {
  return (
    <ScreenErrorBoundary screen="Crear negocio">
      <NegocioCreateScreenInner />
    </ScreenErrorBoundary>
  );
}

function NegocioCreateScreenInner() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { user } = useAuth();
  const { roles: userRoles, isAdmin, isVendedor } = useUserRoles();
  const { fetchCreditSettings, creditSettings, createAndActivate } =
    useNegociosStore();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const frequencyInitializedRef = useRef(false);
  const [loadingInitialData, setLoadingInitialData] = useState(true);
  const [initialDataError, setInitialDataError] = useState('');
  /** Los catálogos salieron del teléfono (última descarga), no del servidor. */
  const [usingLocalData, setUsingLocalData] = useState(false);
  /** Momento de la última descarga del catálogo de producto. */
  const [catalogPulledAt, setCatalogPulledAt] = useState<number | null>(null);
  const online = useSyncStore((state) => state.online);
  const [initialDataReload, setInitialDataReload] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  /** Término cuya búsqueda de productos ya terminó (para no avisar a medias). */
  const [productSearchedQuery, setProductSearchedQuery] = useState('');
  /** Productos «ninguno» en Preparar el teléfono: sin señal no hay catálogo a propósito. */
  const noProductsOnPhone = useOfflineSelection('productos').mode === 'ninguno';
  const noProductsOnPhoneRef = useRef(noProductsOnPhone);
  noProductsOnPhoneRef.current = noProductsOnPhone;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [codeudor, setCodeudor] = useState<Customer | null>(null);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [veredas, setVeredas] = useState<Vereda[]>([]);
  const [departamentoId, setDepartamentoId] = useState('');
  const [municipioId, setMunicipioId] = useState('');
  const [veredaId, setVeredaId] = useState('');
  const [direccion, setDireccion] = useState('');
  const [items, setItems] = useState<NegocioItem[]>([]);
  const [stockByProduct, setStockByProduct] = useState<
    Record<string, ProductWarehouseStock[]>
  >({});
  /** Las existencias mostradas salieron de la última descarga, no del servidor. */
  const [stockFromLocal, setStockFromLocal] = useState(false);
  /** Abonos iniciales pactados (vacío = sin cuota inicial). */
  const [downPayments, setDownPayments] = useState<DownPaymentRow[]>([]);
  /**
   * Vendedor que un administrador asigna a un cliente SIN dueño ('' = ninguno).
   * Con dueño no se elige: el vendedor del negocio es el dueño del cliente.
   */
  const [sellerId, setSellerId] = useState('');
  /** Perfiles (para nombres, p. ej. «Creado por»). */
  const [sellerOptions, setSellerOptions] = useState<SellerOption[]>([]);
  /** Solo usuarios con rol vendedor, para el selector del admin (con señal). */
  const [vendedorOptions, setVendedorOptions] = useState<SellerOption[]>([]);
  /** Vendedor dueño del cliente elegido; `null` mientras se consulta. */
  const [customerSeller, setCustomerSeller] = useState<CustomerSellerLookup | null>(null);
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
  const [newCustomerDepartamentoId, setNewCustomerDepartamentoId] = useState('');
  const [newCustomerMunicipioId, setNewCustomerMunicipioId] = useState('');
  const [newCustomerVeredaId, setNewCustomerVeredaId] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const [pickingCodeudor, setPickingCodeudor] = useState(false);
  const [originType, setOriginType] = useState<'bodega' | 'orden_entrega'>('bodega');
  // Sin señal, «Orden de entrega existente» lista las órdenes llevadas en el
  // teléfono (las que se marcaron con señal) en vez de consultar el servidor.
  const originOrderSearch = useOriginOrderSearch(
    originType === 'orden_entrega',
    !online || usingLocalData
  );
  const [selectedDeliveryOrder, setSelectedDeliveryOrder] = useState<DeliveryOrderOption | null>(null);
  /** Origen bodega: retiro directo o la OE viaja en una remisión pendiente. */
  const [deliveryMode, setDeliveryMode] = useState<NegocioDeliveryMode>('directo');
  const [pendingRemissions, setPendingRemissions] = useState<PendingRemissionOption[]>([]);
  const [targetRemission, setTargetRemission] = useState<PendingRemissionOption | null>(null);
  /** Origen remisión: grupo elegido (propios o una OE hija). */
  const [originGroups, setOriginGroups] = useState<RemissionOriginGroup[]>([]);
  const [originGroupsLoading, setOriginGroupsLoading] = useState(false);
  const [selectedOriginGroup, setSelectedOriginGroup] = useState<RemissionOriginGroup | null>(null);

  /**
   * La pantalla vive en Tabs (href: null) y no se desmonta al navegar: sin
   * este reset, al volver a "Nuevo" el wizard reaparece lleno en el último
   * paso y un segundo "Activar" crearía un negocio duplicado.
   */
  const resetForm = useCallback(() => {
    setStep(0);
    setCustomers([]);
    setProducts([]);
    setCustomerQuery('');
    setProductQuery('');
    setProductSearchedQuery('');
    setCustomer(null);
    setCodeudor(null);
    setDepartamentoId('');
    setMunicipioId('');
    setVeredaId('');
    setDireccion('');
    setItems([]);
    autoFilledLocationRef.current = null;
    originOrderSearch.setQuery('');
    setStockByProduct({});
    setDownPayments([]);
    setSellerId('');
    setInstallments('3');
    setFrequency(creditSettings?.default_frequency || 'mensual');
    setFirstDueDate('');
    setSignature('');
    setSellerSignature('');
    setGuarantorSignature('');
    setShowNewCustomerModal(false);
    setNewCustomerName('');
    setNewCustomerId('');
    setNewCustomerPhone('');
    setNewCustomerDepartamentoId('');
    setNewCustomerMunicipioId('');
    setNewCustomerVeredaId('');
    setNewCustomerAddress('');
    setPickingCodeudor(false);
    setOriginType('bodega');
    setSelectedDeliveryOrder(null);
    setDeliveryMode('directo');
    setTargetRemission(null);
    setSelectedOriginGroup(null);
    // Las OE disponibles cambian tras vincular una: se recargan.
    setLoadingInitialData(true);
    setInitialDataReload((value) => value + 1);
  }, [creditSettings?.default_frequency]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Nada se descarga solo (contrato v2): el catálogo baja únicamente al
      // pulsar «Descargar» en Preparar el teléfono.
      try {
        const [, d, m, v, sellers, cachedName, pending] = await Promise.all([
          fetchCreditSettings(),
        supabase
          .from('departamentos')
          .select('id, nombre')
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('nombre'),
        supabase
          .from('municipios')
          .select('id, nombre, departamento_id')
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('nombre'),
        supabase
          .from('veredas')
          .select('id, nombre, municipio_id')
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('nombre'),
        fetchSellerOptions().catch(() => [] as SellerOption[]),
        getCachedProfileName().catch(() => null),
        // Si la consulta falla por red se usa la lista ligera del teléfono.
        fetchPendingRemissions().catch(() =>
          fetchLocalPendingRemissions().catch(() => [] as PendingRemissionOption[])
        ),
        ]);
        if (d.error) throw d.error;
        if (m.error) throw m.error;
        if (v.error) throw v.error;
        if (!cancelled) {
          setDepartamentos(d.data || []);
          setMunicipios(m.data || []);
          setVeredas(v.data || []);
          setPendingRemissions(pending || []);
          setSellerOptions(
            withCurrentUserOption(
              sellers || [],
              user?.id ? { id: user.id, name: cachedName || user.email || null } : null
            )
          );
          setUsingLocalData(false);
          setInitialDataError('');
        }
      } catch (error: unknown) {
        // Sin señal el asistente ya no se queda bloqueado en el primer paso:
        // los departamentos, municipios y veredas salen de la última descarga
        // (la configuración de crédito la resuelve el store por su cuenta).
        if (!isNetworkError(error) || !canUseLocalDb()) {
          if (!cancelled) setInitialDataError(errorMessage(error, 'No fue posible cargar los datos requeridos'));
          return;
        }
        try {
          const [locales, cachedName, sellers, localRemissions] = await Promise.all([
            fetchLocationCatalogsFromLocal(),
            getCachedProfileName().catch(() => null),
            // Sin red devuelve los perfiles descargados; el resultado de la
            // tanda anterior se perdió al rechazar la primera promesa.
            fetchSellerOptions().catch(() => [] as SellerOption[]),
            // «Enviar en remisión» sin señal: la lista ligera de remisiones
            // pendientes que bajó con la última descarga.
            fetchLocalPendingRemissions().catch(() => [] as PendingRemissionOption[]),
          ]);
          if (cancelled) return;
          if (!locales.departamentos.length || !locales.municipios.length) {
            setInitialDataError(
              'Sin conexión y sin datos descargados. Conéctese y pulse «Descargar información» para poder crear negocios sin señal.'
            );
            return;
          }
          setDepartamentos(locales.departamentos);
          setMunicipios(locales.municipios);
          setVeredas(locales.veredas);
          setPendingRemissions(localRemissions);
          setSellerOptions(
            withCurrentUserOption(
              sellers || [],
              user?.id ? { id: user.id, name: cachedName || user.email || null } : null
            )
          );
          setUsingLocalData(true);
          setInitialDataError('');
        } catch (localError: unknown) {
          if (!cancelled) {
            setInitialDataError(errorMessage(localError, 'No fue posible cargar los datos requeridos'));
          }
        }
      } finally {
        if (!cancelled) setLoadingInitialData(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchCreditSettings, initialDataReload, user?.id, user?.email]);

  // Hora de la última descarga del catálogo: es la fecha de las existencias
  // que se ven sin señal, y la pantalla la dice en vez de dejarlo a la fe.
  // Se vuelve a leer tras cada sincronización: la pantalla es una pestaña que
  // sigue viva, y antes mostraba la hora de cuando se abrió, no la de ahora.
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  useEffect(() => {
    let cancelled = false;
    void localCatalogPulledAt()
      .then((value) => {
        if (!cancelled) setCatalogPulledAt(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialDataReload, loadingInitialData, lastSyncedAt]);

  /** Sin señal (o con datos locales): nada de lo que se ve es definitivo. */
  const sinRed = !online || usingLocalData;
  const ultimaDescarga = formatLastDownloadTime(catalogPulledAt);
  // Sin señal el buscador mira solo lo que bajó al teléfono: si no aparece,
  // se dice por qué en vez de dejar la lista vacía.
  const productSearchMiss = productSearchNotice({
    offline: sinRed,
    noProductsOnPhone,
    query: productQuery,
    searchedQuery: productSearchedQuery,
    resultsCount: products.length,
  });

  /**
   * La pantalla es una pestaña y sigue viva al salir. Si se sale con un negocio
   * a medias, al volver se pregunta si continuar o empezar de nuevo: antes se
   * podía arrancar un negocio «nuevo» con el cliente y los productos del
   * anterior sin darse cuenta.
   */
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // La app se dibuja de borde a borde en Android (app.json: edgeToEdgeEnabled),
  // así que el pie fijo tiene que apartarse él mismo de la barra de navegación:
  // si no, «Guardar sin señal» queda debajo de los botones del sistema y no se
  // puede pulsar. Mismo criterio que components/ui/ActionBar.
  const insets = useSafeAreaInsets();
  const footerPaddingBottom = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 12);
  const hasDraft = hasNegocioDraft({
    step,
    customerId: customer?.id,
    itemsCount: items.length,
    selectedOrderId: selectedDeliveryOrder?.id,
    direccion,
  });
  const hasDraftRef = useRef(hasDraft);
  hasDraftRef.current = hasDraft;
  const leftWithDraftRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (leftWithDraftRef.current && hasDraftRef.current) {
        setShowDraftBanner(true);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
      return () => {
        leftWithDraftRef.current = hasDraftRef.current;
      };
    }, [])
  );

  useEffect(() => {
    if (!hasDraft) setShowDraftBanner(false);
  }, [hasDraft]);

  // Ubicación siempre al día: el relleno automático llega tras una consulta y
  // no debe pisar lo que se escribió mientras tanto.
  const locationRef = useRef({ departamentoId, municipioId, veredaId, direccion });
  locationRef.current = { departamentoId, municipioId, veredaId, direccion };
  /** Lo último que se rellenó solo: al cambiar de cliente se reemplaza. */
  const autoFilledLocationRef = useRef<NegocioLocation | null>(null);

  /**
   * Al fijarse el cliente —por búsqueda, al crearlo, al elegir una orden de
   * entrega o un grupo de remisión— se rellena la ubicación con su vivienda
   * guardada y, si no tiene, con la de la orden de cliente elegida. Antes nunca
   * se rellenaba y el asistente se quedaba pidiendo departamento y municipio.
   */
  useEffect(() => {
    const customerId = customer?.id;
    if (!customerId) return;
    const orderLocation =
      selectedDeliveryOrder?.order_type === 'customer' && selectedDeliveryOrder.customer_id === customerId
        ? {
            municipioId: selectedDeliveryOrder.municipio_id,
            veredaId: selectedDeliveryOrder.vereda_id,
            address: selectedDeliveryOrder.delivery_address,
          }
        : null;
    let cancelled = false;
    (async () => {
      // Sin señal la lee de la base local (última descarga o alta sin señal).
      // Si no la encuentra devuelve null (no lanza): el vendedor elige la
      // ubicación a mano y el paso sigue funcionando.
      const saved = await fetchCustomerSavedLocation(customerId);
      if (cancelled) return;
      const current = locationRef.current;
      const next = resolveNegocioLocation({
        current: clearAutoFilled(current, autoFilledLocationRef.current),
        customer: saved,
        order: orderLocation,
        municipios,
      });
      autoFilledLocationRef.current = next;
      if (next.departamentoId !== current.departamentoId) setDepartamentoId(next.departamentoId);
      if (next.municipioId !== current.municipioId) setMunicipioId(next.municipioId);
      if (next.veredaId !== current.veredaId) setVeredaId(next.veredaId);
      if (next.direccion !== current.direccion) setDireccion(next.direccion);
    })();
    return () => {
      cancelled = true;
    };
  }, [customer?.id, selectedDeliveryOrder, municipios]);

  // El dueño del cliente es el vendedor del negocio (20261206120000). Al
  // cambiar de cliente se descarta el vendedor que el admin hubiera elegido.
  useEffect(() => {
    const customerId = customer?.id;
    setCustomerSeller(null);
    setSellerId('');
    if (!customerId) return;
    let cancelled = false;
    fetchCustomerSellerLookup(customerId)
      .then((lookup) => { if (!cancelled) setCustomerSeller(lookup); })
      .catch(() => { if (!cancelled) setCustomerSeller({ status: 'unknown' }); });
    return () => { cancelled = true; };
  }, [customer?.id]);

  useEffect(() => {
    const query = customerQuery.trim();
    if (!query) { setCustomers([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rows = await searchCustomersForNegocio(query);
        if (!cancelled) setCustomers(rows);
      } catch {
        if (!cancelled) {
          Alert.alert('Error', 'No fue posible buscar clientes');
          setCustomers([]);
        }
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [customerQuery]);

  useEffect(() => {
    const query = productQuery.trim();
    if (!query) { setProducts([]); setProductSearchedQuery(''); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rows = await searchProductsForNegocio(query);
        if (!cancelled) {
          setProducts(rows);
          setProductSearchedQuery(query);
        }
      } catch (error) {
        if (!cancelled) {
          // Con productos «ninguno» el aviso va en el buscador, no en una alerta.
          if (!noProductsOnPhoneRef.current) {
            Alert.alert('Error', errorMessage(error, 'No fue posible buscar productos'));
          }
          setProducts([]);
          setProductSearchedQuery('');
        }
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [productQuery]);

  useEffect(() => {
    if (!frequencyInitializedRef.current && creditSettings?.default_frequency) {
      setFrequency(creditSettings.default_frequency);
      frequencyInitializedRef.current = true;
    }
  }, [creditSettings]);

  const stockProductIdsKey = [...new Set(items.map((i) => i.product_id))].sort().join(',');

  const originIsRemission =
    originType === 'orden_entrega' && selectedDeliveryOrder?.order_type === 'remission';
  const selectedRemissionId = originIsRemission ? selectedDeliveryOrder?.id ?? null : null;

  // Con una remisión como origen, los productos y el stock aparente vienen del
  // grupo elegido (propios o una OE hija), no de la remisión completa.
  const originItems: DeliveryOrderItemOption[] = originIsRemission
    ? selectedOriginGroup?.items ?? []
    : selectedDeliveryOrder?.items ?? [];

  useEffect(() => {
    if (!selectedRemissionId) {
      setOriginGroups([]);
      setOriginGroupsLoading(false);
      return;
    }
    let cancelled = false;
    setOriginGroupsLoading(true);
    // Remisión llevada en el teléfono: los grupos salen de su foto, restando
    // lo que ya tomaron negocios de este teléfono aún no enviados.
    const loadGroups = selectedDeliveryOrder?.from_local
      ? fetchLocalRemissionOriginGroups
      : fetchRemissionOriginProducts;
    loadGroups(selectedRemissionId)
      .then((groups) => {
        if (!cancelled) setOriginGroups(groups);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOriginGroups([]);
          Alert.alert('Error', errorMessage(error, 'No se pudieron cargar los productos de la remisión'));
        }
      })
      .finally(() => {
        if (!cancelled) setOriginGroupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRemissionId, selectedDeliveryOrder?.from_local]);

  useEffect(() => {
    if (originType === 'orden_entrega') {
      try {
        setStockByProduct(
          stockMapFromDeliveryOrder(originIsRemission ? selectedOriginGroup : selectedDeliveryOrder)
        );
      } catch (error: unknown) {
        setStockByProduct({});
        Alert.alert('Error', errorMessage(error, 'No se pudieron cargar los productos de la orden'));
      }
      return;
    }

    const productIds = stockProductIdsKey ? stockProductIdsKey.split(',') : [];
    if (!productIds.length) {
      setStockByProduct({});
      return;
    }

    let cancelled = false;
    fetchStockForProductsWithSource(productIds)
      .then(({ stock, fromLocal }) => {
        if (cancelled) return;
        setStockByProduct(stock);
        setStockFromLocal(fromLocal);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          Alert.alert('Error', errorMessage(error, 'No se pudo consultar stock'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [stockProductIdsKey, originType, selectedDeliveryOrder, originIsRemission, selectedOriginGroup]);

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
  const installmentsNumber = Number(installments);
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const downPaymentSchedule = downPaymentRowsToSchedule(downPayments);
  // La numeración es la misma del resumen y la que guardará la base (por fecha),
  // no la posición en la que se agregó la fila.
  const downPaymentLabels = downPaymentRowLabels(downPayments);
  const downPaymentError = downPaymentScheduleError(downPaymentSchedule, localDateValue(), subtotal);
  const downPaymentTotal = downPaymentScheduleTotal(downPaymentSchedule);
  // Si los abonos cubren el valor de los productos no hay plan de cuotas.
  const planRequired = requiresInstallmentPlan(subtotal, downPaymentSchedule);
  // Con saldo, el vendedor define libremente la cantidad de cuotas: solo se
  // exige un entero mayor a 0, sin tope superior.
  const installmentsValid =
    !planRequired || (Number.isSafeInteger(installmentsNumber) && installmentsNumber >= 1);
  const effectiveInstallmentsCount =
    planRequired && Number.isSafeInteger(installmentsNumber) ? installmentsNumber : 0;
  const planError = installmentPlanError(
    financedAfterDownPayments(subtotal, downPaymentSchedule),
    effectiveInstallmentsCount,
    firstDueDate,
    localDateValue()
  );
  // Antes los dos botones del último paso quedaban habilitados sin firmas: al
  // pulsarlos saltaba una alerta que repetía el aviso ya visible en pantalla,
  // así que parecía que no hacían nada. Ahora se deshabilitan y el texto dice
  // qué falta. "Guardar borrador" incluido: la base exige la firma al insertar.
  const saveBlockedReason = negocioSaveBlockedBySignature(signature, sellerSignature);
  const createdByName =
    sellerOptions.find((option) => option.id === user?.id)?.full_name || user?.email || null;
  const sellerMode = negocioSellerMode({
    hasCustomer: Boolean(customer),
    lookup: customerSeller,
    isAdmin: isAdmin(),
    isVendedor: isVendedor(),
    online: !sinRed,
  });
  const chosenSellerName =
    vendedorOptions.find((option) => option.id === sellerId)?.full_name ?? null;
  const sellerOwnerText = negocioSellerOwnerText({
    mode: sellerMode,
    lookup: customerSeller,
    chosenSellerName,
    createdByName,
  });
  // Admin con cliente sin dueño: debe elegir vendedor (con señal) o no puede
  // guardar (sin señal). El servidor lo exige igual (`seller_rule`).
  const sellerBlockedReason = negocioSellerBlockedReason({
    mode: sellerMode,
    chosenSellerId: sellerId,
  });
  const sellerOwnerHint = negocioSellerOwnerHint(sellerMode);

  // Selector del admin: solo usuarios con rol vendedor y solo con señal.
  useEffect(() => {
    if (sellerMode !== 'admin-choose' || vendedorOptions.length) return;
    let cancelled = false;
    fetchVendedorOptions()
      .then((options) => { if (!cancelled) setVendedorOptions(options); })
      .catch(() => { if (!cancelled) setVendedorOptions([]); });
    return () => { cancelled = true; };
  }, [sellerMode, vendedorOptions.length]);
  const calc = calculateCredit({
    productsSubtotal: subtotal,
    downPayment: downPaymentTotal,
    installmentsCount: effectiveInstallmentsCount,
    frequency,
    settings,
  });
  const addDownPayment = () =>
    setDownPayments((rows) => [
      ...rows,
      createDownPaymentRow({ dueDate: rows.length === 0 ? localDateValue() : '' }),
    ]);
  const updateDownPayment = (key: string, patch: Partial<Pick<DownPaymentRow, 'amount' | 'dueDate'>>) =>
    setDownPayments((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const removeDownPayment = (key: string) =>
    setDownPayments((rows) => rows.filter((row) => row.key !== key));

  // Búsqueda de clientes: VACÍA si no hay término de búsqueda. El servidor ya
  // filtró sin tildes; aquí se repasa con el mismo criterio para no esconder lo
  // que sí devolvió (antes este segundo filtro descartaba «MUÑOZ» si el
  // vendedor había escrito «munoz»).
  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim();
    if (!q) return [];
    return customers
      .filter((c) => matchesNormalized(q, c.name, c.id_number) || matchesDigits(q, c.id_number))
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
    const current = items[index];
    if (!current) return;
    const updated = { ...current, ...patch };
    const next = items.map((row, i) => (i === index ? updated : row));

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
        return;
      }
    }

    setItems(next);
  };

  /** Opciones de vereda de un municipio; vacío si el municipio no tiene veredas. */
  const veredasForMunicipio = useCallback(
    (targetMunicipioId: string) =>
      veredas
        .filter((vereda) => vereda.municipio_id === targetMunicipioId)
        .map((vereda) => ({ value: vereda.id, label: vereda.nombre || 'Vereda' })),
    [veredas]
  );

  const municipiosForDepartamento = useCallback(
    (targetDepartamentoId: string) =>
      municipios
        .filter((municipio) => municipio.departamento_id === targetDepartamentoId)
        .map((municipio) => ({ value: municipio.id, label: municipio.nombre || 'Municipio' })),
    [municipios]
  );

  const closeNewCustomerModal = useCallback(() => {
    setShowNewCustomerModal(false);
    setNewCustomerName('');
    setNewCustomerId('');
    setNewCustomerPhone('');
    setNewCustomerDepartamentoId('');
    setNewCustomerMunicipioId('');
    setNewCustomerVeredaId('');
    setNewCustomerAddress('');
  }, []);

  const customerLocked =
    (originType === 'orden_entrega' && selectedDeliveryOrder?.order_type === 'customer') ||
    (originIsRemission && selectedOriginGroup?.kind === 'child');

  /** Paso 1: falta algo del origen/destino elegido (además del cliente y la ubicación). */
  const originStepError = (): string | null => {
    if (originType === 'orden_entrega' && !selectedDeliveryOrder) {
      return 'Seleccione una orden de entrega.';
    }
    if (originIsRemission && (!selectedOriginGroup || selectedOriginGroup.hasNegocio)) {
      return 'Seleccione qué productos de la remisión toma el negocio.';
    }
    if (originType === 'bodega' && deliveryMode === 'remision' && !targetRemission) {
      return 'Seleccione la remisión en la que se enviará el negocio.';
    }
    return null;
  };

  const handleSelectOriginGroup = (group: RemissionOriginGroup) => {
    if (group.hasNegocio) return;
    setSelectedOriginGroup(group);
    setItems([]);
    if (group.kind === 'child' && group.customerId) {
      setCustomer({
        id: group.customerId,
        name: group.customerName || 'Cliente',
        id_number: '',
      });
    }
  };

  /** Origen del negocio: idéntico con señal y sin ella (ver `buildNegocioOriginPayload`). */
  const buildOriginPayload = () =>
    buildNegocioOriginPayload({
      originType,
      deliveryMode,
      targetRemissionId: targetRemission?.id,
      selectedOrder: selectedDeliveryOrder,
      selectedGroup: selectedOriginGroup,
    });

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
      const data = await createCustomer({
        name: newCustomerName.trim(),
        idNumber: newCustomerId.trim(),
        phone: newCustomerPhone.trim() || null,
        address: newCustomerAddress.trim() || null,
        municipioId: newCustomerMunicipioId || null,
        veredaId: newCustomerVeredaId || null,
        expectedSellerId: expectedSellerIdOnCreate(user?.id, roleNamesOf(userRoles)),
      });

      setCustomers((prev) => [data, ...prev]);
      if (pickingCodeudor) {
        setCodeudor(data);
        setPickingCodeudor(false);
      } else {
        setCustomer(data);
      }
      closeNewCustomerModal();
      Alert.alert('¡Éxito!', `Cliente ${data.name} creado y seleccionado.`);
    } catch (e: unknown) {
      if (isDuplicateCustomerIdNumber(e)) {
        const idNumber = newCustomerId.trim();
        const existing = await findCustomerByIdNumber(idNumber);
        const prompt = duplicateCustomerPrompt(existing, idNumber);
        if (existing && prompt.canUse) {
          const useExisting = () => {
            const chosen = { id: existing.id, name: existing.name, id_number: existing.id_number };
            if (pickingCodeudor) {
              setCodeudor(chosen);
              setPickingCodeudor(false);
            } else {
              setCustomer(chosen);
            }
            closeNewCustomerModal();
          };
          Alert.alert(prompt.title, prompt.message, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Usar este cliente', onPress: useExisting },
          ]);
        } else {
          Alert.alert(prompt.title, prompt.message);
        }
        return;
      }
      Alert.alert('Error', errorMessage(e, 'No se pudo crear el cliente'));
    } finally {
      setCreatingCustomer(false);
    }
  };

  const submit = async (activate: boolean) => {
    if (savingRef.current) return;
    if (!customer) return Alert.alert('Seleccione cliente');
    if (!departamentoId) return Alert.alert('Seleccione departamento');
    if (!municipioId) return Alert.alert('Seleccione municipio');
    if (!direccion.trim()) return Alert.alert('Ingrese la dirección de la vivienda');
    if (!items.length) return Alert.alert('Agregue productos');
    if (items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !Number.isSafeInteger(item.unit_price) || item.unit_price <= 0)) {
      return Alert.alert('Productos inválidos', 'Revise cantidades y valores unitarios.');
    }
    if (!itemsHaveValidStock(items, stockByProduct)) {
      return Alert.alert(
        originType === 'orden_entrega' ? 'Cantidad no disponible' : 'Stock insuficiente',
        originType === 'orden_entrega'
          ? 'Revise la cantidad respecto a la orden de entrega.'
          : 'Revise la bodega y cantidad de cada producto.'
      );
    }
    if (downPaymentError) return Alert.alert('Abonos iniciales', downPaymentError);
    if (planError) return Alert.alert('Plan de cuotas', planError);
    const signatureError = sellerSignatureRequiredError(signature, sellerSignature);
    if (signatureError) return Alert.alert('Firma requerida', signatureError);
    const originError = originStepError();
    if (originError) return Alert.alert('Origen del negocio', originError);
    if (sellerBlockedReason) return Alert.alert('Vendedor del cliente', sellerBlockedReason);

    try {
      savingRef.current = true;
      setSaving(true);
      const numeroLabel = (numero: number | null | undefined) => formatNegocioCodigo(numero);
      const originPayload = buildOriginPayload();
      // Se arma una sola vez por envío: el payload es lo que el servidor
      // hashea contra la clave de idempotencia.
      const { local_seller_id, seller_name, ...sellerArgs } = buildNegocioSellerInput({
        mode: sellerMode,
        lookup: customerSeller,
        chosenSellerId: sellerId,
        chosenSellerName,
        createdByName,
        userId: user?.id ?? null,
      });
      const sellerInput = { ...sellerArgs, local_seller_id, seller_name };
      const result = await createAndActivate({
        deal_date: localDateValue(),
        municipio_id: municipioId,
        vereda_id: veredaId || null,
        direccion,
        customer_id: customer.id,
        codeudor_customer_id: codeudor?.id || null,
        ...sellerInput,
        ...originPayload,
        items,
        down_payment_schedule: sortDownPaymentSchedule(downPaymentSchedule),
        installments_count: effectiveInstallmentsCount,
        frequency,
        first_due_date: planRequired ? firstDueDate : null,
        customer_signature_data_url: signature || '',
        guarantor_signature_data_url: guarantorSignature || undefined,
        seller_signature_data_url: sellerSignature || undefined,
        activate,
        // Para poder pintar el negocio pendiente sin volver a preguntar.
        customer_name: customer.name,
        municipio_name: municipios.find((m) => m.id === municipioId)?.nombre ?? null,
      });
      if (result?.queued) {
        // Sin señal no hay número ni confirmación: se dice tal cual, y el
        // negocio queda en «Cambios sin sincronizar» hasta que suba.
        resetForm();
        Alert.alert(
          'Guardado en el teléfono',
          'El negocio quedó guardado sin conexión y se enviará solo cuando vuelva la señal. Todavía NO tiene número: lo asigna el servidor al confirmarlo, y podría rechazarlo (por ejemplo, si ya no hay existencias). Podrá activarlo desde su ficha cuando esté confirmado.',
          [{ text: 'Aceptar', onPress: () => router.replace('/(tabs)/negocios') }]
        );
        return;
      }
      const fromDeliveryOrder = originType === 'orden_entrega';
      const sentByRemission = Boolean(originPayload.target_remission_id);
      const remissionLabel = targetRemission?.order_number || 'la remisión';
      resetForm();
      Alert.alert(
        '¡Éxito!',
        activate
          ? fromDeliveryOrder
            ? `Negocio ${numeroLabel(result?.numero)} activado. Se vinculó la orden de entrega existente.`
            : sentByRemission
            ? `Negocio ${numeroLabel(result?.numero)} activado. Se creó la orden de entrega y se anidó en ${remissionLabel}.`
            : `Negocio ${numeroLabel(result?.numero)} activado. Se creó la orden de entrega.`
          : `Negocio ${numeroLabel(result?.numero)} guardado como borrador.`,
        [{ text: 'Aceptar', onPress: () => router.replace('/(tabs)/negocios') }]
      );
    } catch (e: unknown) {
      Alert.alert('Error', errorMessage(e, 'No se pudo crear el negocio'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.default }} edges={['bottom', 'left', 'right']}>
      {loadingInitialData && (
        <View style={{ padding: 12, flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary.main} />
          <Text style={{ color: colors.text.secondary }}>Cargando configuración…</Text>
        </View>
      )}
      {initialDataError ? (
        <View style={{ padding: 12, backgroundColor: colors.error.main + '18' }}>
          <Text style={{ color: colors.error.main, textAlign: 'center' }}>{initialDataError}</Text>
          <TouchableOpacity
            onPress={() => {
              setLoadingInitialData(true);
              setInitialDataError('');
              setInitialDataReload((value) => value + 1);
            }}
            style={{ alignSelf: 'center', padding: 8 }}
          >
            <Text style={{ color: colors.primary.main, fontWeight: '700' }}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {/* Sin señal: lo que se ve es la última descarga y nada es definitivo
          hasta que el servidor confirme el negocio. */}
      {sinRed && !initialDataError && !loadingInitialData ? (
        <View style={{ padding: 12, backgroundColor: colors.warning.main + '18' }} testID="negocio-create-sin-red">
          <Text style={{ color: colors.text.primary, fontWeight: '700', textAlign: 'center' }}>
            Sin conexión · negocio pendiente de confirmar
          </Text>
          <Text style={{ color: colors.text.secondary, fontSize: 12, textAlign: 'center', marginTop: 2 }}>
            {ultimaDescarga
              ? `Se está trabajando con los datos de la última descarga (${ultimaDescarga}). `
              : 'Se está trabajando con los datos descargados. '}
            El negocio se guarda en el teléfono y se envía solo al volver la señal; el número lo
            asigna el servidor.
          </Text>
        </View>
      ) : null}
      {/* Wizard Steps Header */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 + footerPaddingBottom }}
        keyboardShouldPersistTaps="handled"
      >
        {showDraftBanner && hasDraft && (
          <NegocioDraftBanner
            summary={negocioDraftSummary({
              customerName: customer?.name,
              stepLabel: WIZARD_STEPS[step]?.label ?? 'Cliente',
              itemsCount: items.length,
            })}
            onContinue={() => setShowDraftBanner(false)}
            onRestart={() => {
              setShowDraftBanner(false);
              resetForm();
            }}
            colors={colors}
          />
        )}
        {step === 0 && (
          <View style={styles.block}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
              Origen del inventario
            </Text>
            <View style={styles.rowWrap}>
              {([
                { id: 'bodega' as const, label: 'Sacar de bodegas' },
                { id: 'orden_entrega' as const, label: 'Orden de entrega existente' },
              ]).map((option) => (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    setOriginType(option.id);
                    setSelectedDeliveryOrder(null);
                    setSelectedOriginGroup(null);
                    setDeliveryMode('directo');
                    setTargetRemission(null);
                    setItems([]);
                    if (option.id === 'bodega') {
                      setStockByProduct({});
                    }
                  }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        originType === option.id ? colors.primary.main : colors.background.paper,
                      borderColor: colors.divider,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        originType === option.id
                          ? colors.primary.contrastText
                          : colors.text.primary,
                      fontWeight: '700',
                      fontSize: 12,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
              {originType === 'bodega'
                ? 'Se genera una orden de entrega nueva y se reserva stock.'
                : 'Se usan productos ya salidos o reservados. No se vuelve a descontar stock.'}
            </Text>
            {originType === 'bodega' && (
              <NegocioDeliveryModeSection
                mode={deliveryMode}
                onModeChange={(mode) => {
                  setDeliveryMode(mode);
                  if (mode === 'directo') setTargetRemission(null);
                }}
                remissions={pendingRemissions}
                selectedRemission={targetRemission}
                onSelectRemission={setTargetRemission}
                offline={sinRed}
                colors={colors}
              />
            )}
            {originType === 'orden_entrega' && (
              <NegocioOriginOrderPicker
                query={originOrderSearch.query}
                onQueryChange={originOrderSearch.setQuery}
                orders={originOrderSearch.orders}
                loading={originOrderSearch.loading}
                error={originOrderSearch.error}
                selectedOrder={selectedDeliveryOrder}
                onSelect={(order) => {
                  setSelectedDeliveryOrder(order);
                  setSelectedOriginGroup(null);
                  setItems([]);
                  if (order.order_type === 'customer' && order.customer_id) {
                    setCustomer({
                      id: order.customer_id,
                      name: order.customer_name || 'Cliente',
                      id_number: order.customer_id_number || '',
                    });
                  }
                }}
                onClearSelection={() => {
                  setSelectedDeliveryOrder(null);
                  setSelectedOriginGroup(null);
                  setItems([]);
                }}
                fromLocal={originOrderSearch.fromLocal}
                snapshotLabel={formatLastDownloadTime(originOrderSearch.snapshotAt)}
                showOfflineToggle={!sinRed}
                colors={colors}
              />
            )}
            {originIsRemission && (
              <NegocioOriginGroupsSection
                groups={originGroups}
                loading={originGroupsLoading}
                selectedGroup={selectedOriginGroup}
                onSelectGroup={handleSelectOriginGroup}
                colors={colors}
              />
            )}

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
                  disabled={customerLocked}
                >
                  <Text style={{ color: colors.primary.main, fontSize: 12, fontWeight: '700' }}>
                    {customerLocked ? (originIsRemission ? 'Fijado por la OE hija' : 'Fijado por la OE') : 'Cambiar'}
                  </Text>
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

                <View style={{ gap: 6 }} testID="negocio-create-seller">
                  {sellerMode === 'admin-choose' ? (
                    <>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary }}>
                        Vendedor (dueño del cliente) *
                      </Text>
                      <OptionPickerField
                        value={sellerId}
                        onValueChange={setSellerId}
                        options={vendedorOptions.map((seller) => ({
                          value: seller.id,
                          label: seller.full_name,
                        }))}
                        placeholder="Seleccione vendedor"
                        modalTitle="Vendedor (dueño del cliente)"
                        colors={colors}
                      />
                    </>
                  ) : null}
                  <NegocioPeopleLines
                    createdByName={createdByName}
                    sellerOwnerText={sellerMode === 'admin-choose' ? null : sellerOwnerText}
                    colors={colors}
                  />
                  {sellerOwnerHint ? (
                    <Text
                      style={{
                        fontSize: 12,
                        color: sellerMode === 'admin-offline' ? colors.error.main : colors.text.secondary,
                      }}
                    >
                      {sellerOwnerHint}
                    </Text>
                  ) : null}
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary }}>
                    Departamento *
                  </Text>
                  <OptionPickerField
                    value={departamentoId}
                    onValueChange={(next) => {
                      setDepartamentoId(next);
                      setMunicipioId('');
                      setVeredaId('');
                    }}
                    options={departamentos.map((departamento) => ({
                      value: departamento.id,
                      label: departamento.nombre || 'Departamento',
                    }))}
                    placeholder="Seleccione departamento"
                    modalTitle="Departamento"
                    colors={colors}
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary }}>
                    Municipio *
                  </Text>
                  <OptionPickerField
                    value={municipioId}
                    onValueChange={(next) => {
                      setMunicipioId(next);
                      setVeredaId('');
                    }}
                    options={municipios
                      .filter((municipio) => municipio.departamento_id === departamentoId)
                      .map((municipio) => ({
                        value: municipio.id,
                        label: municipio.nombre || 'Municipio',
                      }))}
                    placeholder="Seleccione municipio"
                    modalTitle="Municipio"
                    colors={colors}
                    disabled={!departamentoId}
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary }}>
                    Vereda (opcional)
                  </Text>
                  <OptionPickerField
                    value={veredaId}
                    onValueChange={setVeredaId}
                    options={veredasForMunicipio(municipioId)}
                    placeholder={
                      municipioId && veredasForMunicipio(municipioId).length === 0
                        ? 'El municipio no tiene veredas'
                        : 'Sin vereda'
                    }
                    modalTitle="Vereda"
                    colors={colors}
                    disabled={!municipioId || veredasForMunicipio(municipioId).length === 0}
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary }}>
                    Dirección de la vivienda *
                  </Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.divider, color: colors.text.primary, backgroundColor: colors.background.paper }]}
                    placeholder="Ej. Carrera 5 # 12-30, barrio San Rafael"
                    placeholderTextColor={colors.text.secondary}
                    value={direccion}
                    onChangeText={setDireccion}
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
            {/* Lo que se ve como disponible no es el stock de ahora: es el de
                la última descarga. El servidor lo vuelve a mirar al activar. */}
            {(stockFromLocal || sinRed) && originType === 'bodega' ? (
              <View
                style={{ padding: 10, borderRadius: 8, backgroundColor: colors.warning.main + '18' }}
                testID="negocio-create-stock-local"
              >
                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>
                  Existencias de la última descarga
                  {ultimaDescarga ? ` (${ultimaDescarga})` : ''}
                </Text>
                <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }}>
                  Puede que en la bodega ya no esté lo que aquí aparece. El stock real se comprueba
                  en el servidor cuando se active el negocio.
                </Text>
              </View>
            ) : null}
            {originType === 'orden_entrega' ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 13 }}>
                  {!selectedDeliveryOrder
                    ? 'Regrese y seleccione una orden de entrega.'
                    : originIsRemission
                    ? selectedOriginGroup
                      ? `Orden #${selectedDeliveryOrder.order_number} · ${selectedOriginGroup.label}`
                      : 'Regrese y elija qué productos de la remisión toma el negocio.'
                    : `Productos de la orden #${selectedDeliveryOrder.order_number}`}
                </Text>
                {originItems.map((remItem) => {
                  const alreadyAdded = items.find(
                    (i) =>
                      i.product_id === remItem.product_id &&
                      i.warehouse_id === remItem.warehouse_id
                  );
                  return (
                    <View
                      key={`${remItem.product_id}-${remItem.warehouse_id}`}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.divider,
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: colors.text.primary, fontWeight: '600' }}>
                          {remItem.product_name}
                        </Text>
                        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                          {remItem.warehouse_name} · Disp: {remItem.available_quantity}
                        </Text>
                      </View>
                      <TouchableOpacity
                        disabled={Boolean(alreadyAdded)}
                        onPress={() =>
                          handleAddItem({
                            product_id: remItem.product_id,
                            warehouse_id: remItem.warehouse_id,
                            quantity: 1,
                            description: remItem.product_name,
                            // Sin precio de venta: el usuario escribe el
                            // valor unitario en la lista de productos.
                            unit_price: 0,
                          })
                        }
                        style={[
                          styles.chip,
                          {
                            backgroundColor: alreadyAdded
                              ? colors.background.paper
                              : colors.primary.main,
                            borderWidth: 1,
                            borderColor: colors.divider,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: alreadyAdded
                              ? colors.text.secondary
                              : colors.primary.contrastText,
                            fontWeight: '700',
                            fontSize: 12,
                          }}
                        >
                          {alreadyAdded ? 'Agregado' : '+ Agregar'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ) : (
              <NegocioProductAddSection
                products={products}
                productQuery={productQuery}
                onProductQueryChange={setProductQuery}
                items={items}
                onAdd={handleAddItem}
                onStockLoaded={handleStockLoaded}
                emptyMessage={productSearchMiss}
                colors={colors}
              />
            )}

            <NegocioItemsList
              items={items}
              stockByProduct={stockByProduct}
              warehouseLocked={originType === 'orden_entrega'}
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
            <Text style={{ color: colors.text.secondary, fontSize: 13 }}>Abonos iniciales</Text>
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
              Registre la cuota inicial y los demás abonos pactados antes del plan de cuotas.
              Cada abono queda pendiente en cartera hasta que el cliente lo pague.
            </Text>
            {downPayments.map((row, index) => (
              <View
                key={row.key}
                style={[
                  styles.abonoCard,
                  { borderColor: colors.divider, backgroundColor: colors.background.paper },
                ]}
              >
                <View style={styles.abonoHeader}>
                  <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 14 }}>
                    {downPaymentLabels[index]}
                  </Text>
                  <Pressable
                    onPress={() => removeDownPayment(row.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${downPaymentLabels[index].toLowerCase()}`}
                    hitSlop={8}
                  >
                    <MaterialIcons name="delete-outline" size={22} color={colors.error.main} />
                  </Pressable>
                </View>
                <Text style={{ color: colors.text.secondary, fontSize: 13 }}>Valor (COP)</Text>
                <TextInput
                  keyboardType="numeric"
                  style={[styles.input, { borderColor: colors.divider, color: colors.text.primary, backgroundColor: colors.background.default }]}
                  value={row.amount}
                  onChangeText={(value) =>
                    updateDownPayment(row.key, { amount: formatNegocioMoneyInput(value) })
                  }
                />
                <Text style={{ color: colors.text.secondary, fontSize: 13 }}>Fecha de pago</Text>
                <NegocioDatePicker
                  value={row.dueDate}
                  onChange={(value) => updateDownPayment(row.key, { dueDate: value })}
                  colors={colors}
                />
              </View>
            ))}
            <TouchableOpacity
              onPress={addDownPayment}
              style={[styles.abonoAddBtn, { borderColor: colors.primary.main }]}
              accessibilityRole="button"
            >
              <MaterialIcons name="add" size={18} color={colors.primary.main} />
              <Text style={{ color: colors.primary.main, fontWeight: '700' }}>
                {downPayments.length === 0 ? 'Agregar cuota inicial' : 'Agregar otro abono'}
              </Text>
            </TouchableOpacity>
            <Text style={{ color: downPaymentError ? colors.error.main : colors.text.secondary, fontSize: 12 }}>
              {downPaymentError ||
                (downPayments.length > 0
                  ? `Total abonos: ${formatCOP(downPaymentTotal)} · saldo a financiar: ${formatCOP(
                      Math.max(0, subtotal - downPaymentTotal)
                    )}`
                  : 'Sin cuota inicial todo el valor se financia en cuotas.')}
            </Text>
            {planRequired ? (
              <>
                <Text style={{ color: colors.text.secondary, fontSize: 13 }}>Número de cuotas</Text>
                <TextInput
                  keyboardType="numeric"
                  style={[styles.input, { borderColor: colors.divider, color: colors.text.primary, backgroundColor: colors.background.paper }]}
                  value={installments}
                  onChangeText={setInstallments}
                />
                {!installmentsValid && (
                  <Text style={{ color: colors.error.main, fontSize: 12 }}>
                    Ingrese un número entero mayor a 0. El vendedor define la cantidad de cuotas.
                  </Text>
                )}
                <Text style={{ color: colors.text.secondary, fontSize: 13 }}>Fecha de la primera cuota</Text>
                <NegocioDatePicker
                  value={firstDueDate}
                  onChange={setFirstDueDate}
                  colors={colors}
                />
                {planError && installmentsValid ? (
                  <Text style={{ color: colors.error.main, fontSize: 12 }}>{planError}</Text>
                ) : null}
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
              </>
            ) : (
              <Text style={{ color: colors.text.secondary, fontSize: 13 }}>
                Los abonos iniciales cubren el valor de los productos: el negocio no lleva cuotas ni
                fecha de primera cuota.
              </Text>
            )}
            <NegocioCreditSummary
              calc={calc}
              settings={settings}
              schedule={downPaymentSchedule}
              frequency={frequency}
              firstDueDate={planRequired ? firstDueDate : null}
              colors={colors}
            />
          </View>
        )}

        {step === 3 && (
          <View style={styles.block}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
              4. Firmas y Confirmación
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '600' }}>
              Cliente: {customer?.name} · Total: {formatCOP(calc.totalCredit)} ·{' '}
              {planRequired ? `${installments} cuotas` : 'sin cuotas'}
            </Text>
            <NegocioPeopleLines
              createdByName={createdByName}
              sellerOwnerText={sellerOwnerText}
              colors={colors}
            />
            <Text style={{ color: colors.text.secondary, fontSize: 13, marginBottom: 8 }}>
              Puede dibujar las firmas en pantalla o subir un PNG transparente. Si el cliente no firma
              ahora, la firma del vendedor del negocio es obligatoria; la firma del cliente podrá registrarse
              después desde el detalle, incluso con el negocio activo.
            </Text>
            {saveBlockedReason ? (
              <Text style={{ color: colors.warning.dark, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
                {saveBlockedReason}
              </Text>
            ) : null}
            <SignaturePad
              label="Firma del cliente"
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
              label={
                signature
                  ? 'Firma del vendedor del negocio'
                  : 'Firma del vendedor del negocio (obligatoria)'
              }
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
      <View
        testID="negocio-create-pie"
        style={[
          styles.fixedFooterNav,
          { backgroundColor: colors.background.paper, borderTopColor: colors.divider, paddingBottom: footerPaddingBottom },
        ]}
      >
        {step > 0 && (
          <TouchableOpacity
            style={[
              styles.footerBtnSecondary,
              step === 3 && styles.footerBtnIconOnly,
              { borderColor: colors.divider },
            ]}
            onPress={() => setStep((s) => s - 1)}
            accessibilityRole="button"
            accessibilityLabel="Atrás"
          >
            <MaterialIcons name="arrow-back" size={18} color={colors.text.primary} />
            {step < 3 && <Text style={{ color: colors.text.primary, fontWeight: '700' }}>Atrás</Text>}
          </TouchableOpacity>
        )}
        {step < 3 ? (
          <TouchableOpacity
            style={[
              styles.footerBtnPrimary,
              {
                backgroundColor: colors.primary.main,
                opacity:
                  loadingInitialData || initialDataError
                    ? 0.5
                    : step === 0 && (Boolean(originStepError()) || !customer || Boolean(sellerBlockedReason) || !departamentoId || !municipioId || !direccion.trim())
                    ? 0.5
                    : step === 1 && !canAdvanceProductsStep()
                    ? 0.5
                    : step === 2 && (Boolean(downPaymentError) || Boolean(planError))
                    ? 0.5
                    : 1,
              },
            ]}
            disabled={loadingInitialData || Boolean(initialDataError)}
            onPress={() => {
              if (step === 0) {
                const originError = originStepError();
                if (originError) {
                  return Alert.alert('Selección requerida', originError);
                }
                if (!customer) return Alert.alert('Selección requerida', 'Por favor seleccione un cliente para continuar.');
                if (sellerBlockedReason) return Alert.alert('Vendedor del cliente', sellerBlockedReason);
                if (!departamentoId) return Alert.alert('Campo requerido', 'Seleccione un departamento.');
                if (!municipioId) return Alert.alert('Campo requerido', 'Seleccione un municipio.');
                if (!direccion.trim()) return Alert.alert('Campo requerido', 'Ingrese la dirección de la vivienda.');
              }
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
              if (step === 2) {
                if (downPaymentError) return Alert.alert('Abonos iniciales', downPaymentError);
                if (planError) return Alert.alert('Plan de cuotas', planError);
              }
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
          <View style={styles.footerActions}>
            <TouchableOpacity
              style={[
                styles.footerBtnSecondary,
                styles.footerBtnCompact,
                { borderColor: colors.divider },
                saveBlockedReason ? { opacity: 0.45 } : null,
              ]}
              onPress={() => submit(false)}
              disabled={Boolean(saveBlockedReason)}
              accessibilityRole="button"
              accessibilityState={{ disabled: Boolean(saveBlockedReason) }}
              accessibilityHint={saveBlockedReason || undefined}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }}
              >
                {sinRed ? 'Guardar sin señal' : 'Guardar borrador'}
              </Text>
            </TouchableOpacity>
            {/* Activar descuenta stock y crea la orden de entrega: eso sólo
                puede decidirlo el servidor, así que sin señal se deshabilita y
                el negocio se guarda firmado para activarlo después. */}
            <TouchableOpacity
              style={[
                styles.footerBtnPrimary,
                styles.footerBtnCompact,
                { backgroundColor: colors.primary.main },
                saveBlockedReason || sinRed ? { opacity: 0.45 } : null,
              ]}
              onPress={() => {
                if (sinRed) {
                  return Alert.alert(
                    'Sin conexión',
                    'Activar el negocio descuenta existencias y crea la orden de entrega, y eso necesita servidor. Guárdelo ahora y actívelo desde su ficha cuando vuelva la señal.'
                  );
                }
                submit(true);
              }}
              disabled={Boolean(saveBlockedReason)}
              accessibilityRole="button"
              accessibilityState={{ disabled: Boolean(saveBlockedReason) }}
              accessibilityHint={saveBlockedReason || undefined}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={{ color: colors.primary.contrastText, fontWeight: '700', fontSize: 13 }}
              >
                Activar negocio
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      </KeyboardAvoidingView>

      {/* MODAL CREAR CLIENTE NUEVO */}
      <Modal
        visible={showNewCustomerModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeNewCustomerModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.background.paper }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                Crear cliente nuevo
              </Text>
              <TouchableOpacity onPress={closeNewCustomerModal}>
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ gap: 12 }}
              keyboardShouldPersistTaps="handled"
            >
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

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary }}>
                  Departamento (opcional)
                </Text>
                <OptionPickerField
                  value={newCustomerDepartamentoId}
                  onValueChange={(next) => {
                    setNewCustomerDepartamentoId(next);
                    setNewCustomerMunicipioId('');
                    setNewCustomerVeredaId('');
                  }}
                  options={departamentos.map((departamento) => ({
                    value: departamento.id,
                    label: departamento.nombre || 'Departamento',
                  }))}
                  placeholder="Sin departamento"
                  modalTitle="Departamento"
                  colors={colors}
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary }}>
                  Municipio (opcional)
                </Text>
                <OptionPickerField
                  value={newCustomerMunicipioId}
                  onValueChange={(next) => {
                    setNewCustomerMunicipioId(next);
                    setNewCustomerVeredaId('');
                  }}
                  options={municipiosForDepartamento(newCustomerDepartamentoId)}
                  placeholder="Sin municipio"
                  modalTitle="Municipio"
                  colors={colors}
                  disabled={!newCustomerDepartamentoId}
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary }}>
                  Vereda (opcional)
                </Text>
                <OptionPickerField
                  value={newCustomerVeredaId}
                  onValueChange={setNewCustomerVeredaId}
                  options={veredasForMunicipio(newCustomerMunicipioId)}
                  placeholder={
                    newCustomerMunicipioId && veredasForMunicipio(newCustomerMunicipioId).length === 0
                      ? 'El municipio no tiene veredas'
                      : 'Sin vereda'
                  }
                  modalTitle="Vereda"
                  colors={colors}
                  disabled={
                    !newCustomerMunicipioId || veredasForMunicipio(newCustomerMunicipioId).length === 0
                  }
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary }}>
                  Dirección de la vivienda (opcional)
                </Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.divider, color: colors.text.primary }]}
                  placeholder="Ej. Carrera 5 # 12-30, barrio San Rafael"
                  placeholderTextColor={colors.text.secondary}
                  value={newCustomerAddress}
                  onChangeText={setNewCustomerAddress}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalBtnSecondary, { borderColor: colors.divider }]}
                onPress={closeNewCustomerModal}
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
        </KeyboardAvoidingView>
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
  abonoCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  abonoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  abonoAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
  },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  fixedFooterNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  /** Último paso: "Atrás" solo con ícono para dejar espacio a las dos acciones. */
  footerBtnIconOnly: { paddingHorizontal: 12 },
  footerActions: { flex: 1, flexDirection: 'row', gap: 8, minWidth: 0 },
  /** Acciones finales lado a lado: sin ancho mínimo ni padding ancho para que
   * quepan en pantallas angostas sin partir el texto en dos líneas. */
  footerBtnCompact: {
    flex: 1,
    minWidth: 0,
    marginLeft: 0,
    paddingHorizontal: 8,
    paddingVertical: 11,
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
