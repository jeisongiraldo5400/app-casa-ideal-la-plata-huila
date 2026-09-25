import { kickNotificationDispatch } from '@/components/notifications/infrastructure/services/dispatchNotifications';
import { logHandledError } from '@/lib/errorMessage';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalDb,
  fetchNegociosListFromLocal,
} from '@/lib/offline/repositories/offlineRepository';
import { fetchCreditSettingsFromLocal } from '@/lib/offline/repositories/catalogRepository';
import { requireLocalUserId } from '@/lib/offline/security/localSession';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import {
  enqueueNegocioCreateOffline,
  negocioLaneFor,
} from '@/lib/offline/sync/negocioCreateCommand';
import {
  calculateCredit,
  type CreditCalcResult,
  type CreditFrequency,
  type CreditSettingsInput,
} from '@/lib/creditCalculator';
import {
  isNewLocalSignature,
  removeNegocioSignatures,
  uploadNegocioSignature,
} from '@/lib/uploadSignature';
import { sellerSignatureRequiredError } from '@/lib/negocioSignatureRules';
import {
  downPaymentScheduleError,
  downPaymentScheduleTotal,
  financedAfterDownPayments,
  installmentPlanError,
  sortDownPaymentSchedule,
  type DownPaymentEntry,
} from '@/lib/negocios/negocioCreditRules';
import { computeRemainingBalance } from '@/lib/negocios/negocioBalance';
import {
  validateNegocioItemsInput,
  validateNegocioItemsStock,
  validateNegocioItemsStockLocal,
} from '../services/negociosStockService';
import { createIdempotencyKey } from '@/lib/idempotency';
import { negocioSkipsWarehouseStock } from '../services/negociosDeliveryOrdersService';
import type { Json } from '@/types/database.types';

export interface NegocioItem {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  description: string;
  unit_price: number;
}

interface NegociosState {
  list: any[];
  loading: boolean;
  fromCache: boolean;
  /** Mensaje del último fallo de `fetchList`; null cuando la carga fue exitosa. */
  error: string | null;
  /** Negocios donde el usuario autenticado es el vendedor (módulo "Mis negocios"). */
  myList: any[];
  myLoading: boolean;
  myFromCache: boolean;
  myError: string | null;
  creditSettings: (CreditSettingsInput & { legal_text?: string | null }) | null;
  fetchList: (search?: string) => Promise<void>;
  /** Carga los negocios de `sellerId`; se pasa explícito para no depender de red en modo offline. */
  fetchMyList: (sellerId: string, search?: string) => Promise<void>;
  fetchCreditSettings: () => Promise<void>;
  createAndActivate: (input: {
    deal_date: string;
    municipio_id: string;
    /** Vereda del municipio; opcional. */
    vereda_id?: string | null;
    direccion: string;
    customer_id: string;
    codeudor_customer_id?: string | null;
    remission_id?: string | null;
    source_delivery_order_id?: string | null;
    /**
     * Remisión `pending` en la que se anida la OE creada al activar (solo con
     * origen bodega: excluyente con `remission_id` / `source_delivery_order_id`).
     */
    target_remission_id?: string | null;
    items: NegocioItem[];
    /** Vendedor del negocio; por defecto el usuario autenticado. */
    seller_id?: string | null;
    /** Abonos iniciales pactados (vacío = sin cuota inicial). */
    down_payment_schedule: DownPaymentEntry[];
    /** 0 cuando los abonos iniciales cubren el valor de los productos. */
    installments_count: number;
    frequency: CreditFrequency;
    /** Obligatoria solo cuando hay plan de cuotas. */
    first_due_date?: string | null;
    notes?: string;
    customer_signature_data_url: string;
    guarantor_signature_data_url?: string;
    seller_signature_data_url?: string;
    activate: boolean;
    /** Nombre del cliente y del vendedor, para pintar el negocio pendiente sin red. */
    customer_name?: string;
    seller_name?: string | null;
    municipio_name?: string | null;
  }) => Promise<CreateNegocioResult | null>;
}

/**
 * Resultado de crear un negocio. Sin señal no hay número (lo asigna el
 * servidor) y el negocio queda `queued`: en la cola, pendiente de confirmar.
 */
export type CreateNegocioResult = {
  id: string;
  numero: number | null;
  queued: boolean;
};

export type CreateNegocioInput = Parameters<NegociosState['createAndActivate']>[0];

interface PendingCreateRequest {
  draftId: string;
  idempotencyKey: string;
  signatureUrls?: {
    customer: string | null;
    guarantor: string | null;
    seller: string | null;
  };
  signaturePromise?: Promise<{
    customer: string | null;
    guarantor: string | null;
    seller: string | null;
  }>;
  /**
   * Snapshot de fórmula fijado en el primer intento. `calculated_at` cambia en
   * cada cálculo y el servidor hashea `p_negocio` completo contra la
   * idempotency key: reutilizarlo evita "clave usada con datos diferentes".
   */
  formulaSnapshot?: CreditCalcResult['formulaSnapshot'];
}

function sameFormulaSnapshot(
  a: CreditCalcResult['formulaSnapshot'] | undefined,
  b: CreditCalcResult['formulaSnapshot']
): boolean {
  if (!a) return false;
  const { calculated_at: _a, ...restA } = a;
  const { calculated_at: _b, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

const pendingCreateRequests = new Map<string, PendingCreateRequest>();

function toUserError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message.trim()) {
    return error;
  }
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return new Error(message);
    }
  }
  return new Error(fallback);
}

function createRequestFingerprint(input: CreateNegocioInput): string {
  return JSON.stringify({
    deal_date: input.deal_date,
    municipio_id: input.municipio_id,
    vereda_id: input.vereda_id || null,
    direccion: input.direccion,
    customer_id: input.customer_id,
    codeudor_customer_id: input.codeudor_customer_id || null,
    seller_id: input.seller_id || null,
    remission_id: input.remission_id || null,
    source_delivery_order_id: input.source_delivery_order_id || null,
    target_remission_id: input.target_remission_id || null,
    items: input.items,
    down_payment_schedule: sortDownPaymentSchedule(input.down_payment_schedule),
    installments_count: input.installments_count,
    frequency: input.frequency,
    first_due_date: input.first_due_date || null,
    notes: input.notes || null,
    activate: input.activate,
    customer_signature_source: input.customer_signature_data_url || null,
    guarantor_signature_source: input.guarantor_signature_data_url || null,
    seller_signature_source: input.seller_signature_data_url || null,
  });
}

const isValidDateValue = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

/** Ningún negocio: un uuid que no existe, para no devolver la lista entera. */
const SIN_COINCIDENCIAS = 'id.eq.00000000-0000-0000-0000-000000000000';

/**
 * Columnas del listado de negocios (lo comparten «Negocios» y «Mis negocios»).
 *
 * Los tres embebidos de `delivery_orders` traen la orden del negocio y la de
 * origen en la MISMA consulta, sin una consulta extra por fila. Hay que nombrar
 * la llave foránea porque `negocios` apunta cuatro veces a `delivery_orders`
 * (orden, remisión, origen y remisión destino) y PostgREST no sabría cuál es.
 */
const NEGOCIO_LIST_SELECT =
  // `id_number`: la búsqueda por documento la resuelve el servidor, pero el
  // filtro local de la lista descartaba el resultado por no tener el dato.
  '*, customer:customers!negocios_customer_id_fkey(name, id_number), negocio_cuotas(amount, paid_amount, late_fee_amount, status, deleted_at), delivery_order:delivery_orders!negocios_delivery_order_id_fkey(order_number), remission:delivery_orders!negocios_remission_id_fkey(order_number), source_delivery_order:delivery_orders!negocios_source_delivery_order_id_fkey(order_number)';

/**
 * Filtro de PostgREST para buscar negocios en el servidor.
 *
 * El número se resuelve con `search_negocio_ids_by_numero` (encuentra «003» en
 * el 20260003) y el cliente con `search_customers`, que compara sin tildes.
 * Antes la lista traía las 50 filas más recientes y se filtraba en el teléfono:
 * un negocio viejo salía como «Sin coincidencias» aunque existiera.
 *
 * Devuelve null si no hay término (la lista sale sin filtrar).
 */
async function negocioSearchFilter(search: string | undefined): Promise<string | null> {
  const term = (search || '').trim();
  if (!term) return null;

  const [porNumero, porCliente] = await Promise.all([
    supabase.rpc('search_negocio_ids_by_numero', { p_term: term, p_limit: 200 }),
    supabase.rpc('search_customers', { search_term: term, limit_count: 200 }),
  ]);

  const filtros: string[] = [];
  const negocioIds = ((porNumero.data || []) as { id: string }[]).map((row) => row.id);
  if (negocioIds.length) filtros.push(`id.in.(${negocioIds.join(',')})`);
  const customerIds = ((porCliente.data || []) as { id: string }[]).map((row) => row.id);
  if (customerIds.length) filtros.push(`customer_id.in.(${customerIds.join(',')})`);

  return filtros.length ? filtros.join(',') : SIN_COINCIDENCIAS;
}

export const useNegociosStore = create<NegociosState>((set, get) => ({
  list: [],
  loading: false,
  fromCache: false,
  error: null,
  myList: [],
  myLoading: false,
  myFromCache: false,
  myError: null,
  creditSettings: null,

  fetchList: async (search) => {
    set({ loading: true, error: null });
    try {
      // `negocios` no tiene columna remaining_balance: se deriva de las cuotas.
      let query = supabase
        .from('negocios')
        .select(NEGOCIO_LIST_SELECT)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      // Con término, la búsqueda la hace el servidor: antes se filtraban en el
      // teléfono las 50 filas más recientes, así que un negocio viejo salía
      // como «Sin coincidencias» aunque existiera.
      const filtroBusqueda = await negocioSearchFilter(search);
      if (filtroBusqueda) query = query.or(filtroBusqueda);
      const { data, error } = await query;
      if (error) throw error;
      const list = (data || []).map(({ negocio_cuotas, ...negocio }) => ({
        ...negocio,
        remaining_balance: computeRemainingBalance(negocio_cuotas),
        has_mora: (negocio_cuotas || []).some(
          (cuota: { status: string; deleted_at: string | null }) =>
            cuota.status === 'mora' && !cuota.deleted_at
        ),
      }));
      set({ list, fromCache: false, error: null });
    } catch (e) {
      if (isNetworkError(e) && canUseLocalDb()) {
        const local = await fetchNegociosListFromLocal();
        set({ list: local, fromCache: true, error: null });
        return;
      }
      logHandledError('No se pudieron cargar los negocios', e);
      // Conservar la lista anterior: un fallo transitorio no debe vaciar la pantalla.
      set({ error: toUserError(e, 'No se pudieron cargar los negocios').message });
    } finally {
      set({ loading: false });
    }
  },

  fetchMyList: async (sellerId, search) => {
    set({ myLoading: true, myError: null });
    try {
      let query = supabase
        .from('negocios')
        .select(NEGOCIO_LIST_SELECT)
        .is('deleted_at', null)
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false })
        .limit(100);
      const filtroBusqueda = await negocioSearchFilter(search);
      if (filtroBusqueda) query = query.or(filtroBusqueda);
      const { data, error } = await query;
      if (error) throw error;
      const myList = (data || []).map(({ negocio_cuotas, ...negocio }) => ({
        ...negocio,
        remaining_balance: computeRemainingBalance(negocio_cuotas),
        has_mora: (negocio_cuotas || []).some(
          (cuota: { status: string; deleted_at: string | null }) =>
            cuota.status === 'mora' && !cuota.deleted_at
        ),
      }));
      set({ myList, myFromCache: false, myError: null });
    } catch (e) {
      if (isNetworkError(e) && canUseLocalDb()) {
        const local = await fetchNegociosListFromLocal();
        const myList = local.filter((item: any) => item.seller_id === sellerId);
        set({ myList, myFromCache: true, myError: null });
        return;
      }
      logHandledError('No se pudieron cargar tus negocios', e);
      set({ myError: toUserError(e, 'No se pudieron cargar tus negocios').message });
    } finally {
      set({ myLoading: false });
    }
  },

  fetchCreditSettings: async () => {
    let data: Record<string, any> | null = null;
    try {
      const response = await supabase
        .from('credit_settings')
        .select('*')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (response.error) {
        throw new Error(`No fue posible cargar la configuración de crédito: ${response.error.message}`);
      }
      data = response.data;
    } catch (error) {
      // Sin señal se usa la configuración de la última descarga: sin ella el
      // asistente ni siquiera abría, y es un dato que cambia muy de vez en cuando.
      if (!isNetworkError(error) || !canUseLocalDb()) throw error;
      data = await fetchCreditSettingsFromLocal();
      if (!data) {
        throw new Error(
          'Sin conexión y sin configuración de crédito descargada. Conéctese y pulse «Descargar información».'
        );
      }
    }
    if (!data) throw new Error('No existe una configuración de crédito activa');

    const formulaType = data.formula_type as CreditSettingsInput['formula_type'];
    const defaultFrequency = data.default_frequency as CreditFrequency;
    const numericSettings = [
      data.interest_rate_monthly_pct,
      data.rounding_unit,
      data.late_fee_rate_pct,
      data.money_decimal_places,
      data.min_installments,
      data.max_installments,
    ].map(Number);
    if (
      !['cash_includes_interest', 'simple_markup', 'financed_balance'].includes(formulaType) ||
      !['mensual', 'quincenal', 'semanal'].includes(defaultFrequency) ||
      numericSettings.some((value) => !Number.isFinite(value)) ||
      Number(data.min_installments) < 1 ||
      Number(data.max_installments) < Number(data.min_installments)
    ) throw new Error('La configuración de crédito activa contiene valores inválidos');

    set({
      creditSettings: {
          formula_type: formulaType,
          interest_rate_monthly_pct: Number(data.interest_rate_monthly_pct),
          rounding_unit: Number(data.rounding_unit),
          late_fee_rate_pct: Number(data.late_fee_rate_pct),
          money_decimal_places: Number(data.money_decimal_places),
          min_installments: Number(data.min_installments),
          max_installments: Number(data.max_installments),
          default_frequency: defaultFrequency,
          legal_text: data.legal_text,
      },
    });
  },

  createAndActivate: async (input) => {
    await get().fetchCreditSettings();
    // Sesión local: `auth.getUser()` pide red y sin señal tumbaba la creación
    // entera antes de validar nada.
    const userId = await requireLocalUserId();
    if (!input.customer_id) throw new Error('Seleccione un cliente');
    if (!input.municipio_id) throw new Error('Seleccione un municipio');
    if (!input.direccion.trim()) throw new Error('Ingrese la dirección del negocio');
    if (!isValidDateValue(input.deal_date)) throw new Error('Fecha del negocio inválida');
    if (input.target_remission_id && negocioSkipsWarehouseStock(input)) {
      throw new Error('Enviar en remisión solo aplica a negocios con origen «Sacar de bodegas»');
    }
    validateNegocioItemsInput(input.items);
    const signatureError = sellerSignatureRequiredError(
      input.customer_signature_data_url,
      input.seller_signature_data_url
    );
    if (signatureError) throw new Error(signatureError);

    const settings = get().creditSettings;
    if (!settings) throw new Error('La configuración de crédito aún no está disponible');
    if (!['mensual', 'quincenal', 'semanal'].includes(input.frequency)) throw new Error('Frecuencia de pago inválida');
    // Abonos iniciales y plan de cuotas: mismas reglas que la base de datos
    // (normalize_negocio_down_payment_schedule / assert_negocio_installment_plan).
    // El vendedor define libremente la cantidad de cuotas cuando hay saldo.
    const productsSubtotal = input.items.reduce(
      (s, i) => s + i.unit_price * i.quantity,
      0
    );
    const schedule = sortDownPaymentSchedule(input.down_payment_schedule);
    const scheduleError = downPaymentScheduleError(schedule, input.deal_date, productsSubtotal);
    if (scheduleError) throw new Error(scheduleError);
    const planError = installmentPlanError(
      financedAfterDownPayments(productsSubtotal, schedule),
      input.installments_count,
      input.first_due_date,
      input.deal_date
    );
    if (planError) throw new Error(planError);

    // Sin señal el stock que se puede mirar es el de la última descarga, y no
    // es una promesa: el servidor vuelve a mirarlo al activar el negocio.
    const offline = !useSyncStore.getState().online && canUseLocalDb();
    if (!negocioSkipsWarehouseStock(input)) {
      const stockCheck = offline
        ? await validateNegocioItemsStockLocal(input.items)
        : await validateNegocioItemsStock(input.items).catch(async (error) => {
            if (!isNetworkError(error) || !canUseLocalDb()) throw error;
            return validateNegocioItemsStockLocal(input.items);
          });
      if (!stockCheck.ok) {
        throw new Error(stockCheck.message);
      }
    }

    const calc = calculateCredit({
      productsSubtotal,
      downPayment: downPaymentScheduleTotal(schedule),
      installmentsCount: input.installments_count,
      frequency: input.frequency,
      settings,
    });

    const requestFingerprint = createRequestFingerprint(input);
    const request: PendingCreateRequest =
      pendingCreateRequests.get(requestFingerprint) ?? {
        draftId: createIdempotencyKey(),
        idempotencyKey: createIdempotencyKey(),
      };
    if (!pendingCreateRequests.has(requestFingerprint)) {
      pendingCreateRequests.set(requestFingerprint, request);
      if (pendingCreateRequests.size > 20) {
        const oldestKey = pendingCreateRequests.keys().next().value;
        if (oldestKey) pendingCreateRequests.delete(oldestKey);
      }
    }

    if (!sameFormulaSnapshot(request.formulaSnapshot, calc.formulaSnapshot)) {
      request.formulaSnapshot = calc.formulaSnapshot;
    }

    // Argumentos del RPC, idénticos con red y sin ella (las firmas se añaden
    // después): el servidor hashea `p_negocio` contra la clave de idempotencia,
    // así que este objeto no puede cambiar entre intentos.
    const negocioArgs = {
      deal_date: input.deal_date,
      municipio_id: input.municipio_id,
      vereda_id: input.vereda_id || null,
      direccion: input.direccion.trim(),
      customer_id: input.customer_id,
      codeudor_customer_id: input.codeudor_customer_id || null,
      seller_id: input.seller_id || userId,
      remission_id: input.remission_id || null,
      source_delivery_order_id: input.source_delivery_order_id || input.remission_id || null,
      target_remission_id: input.target_remission_id || null,
      products_subtotal: calc.productsSubtotal,
      interest_amount: calc.interestAmount,
      total_credit: calc.totalCredit,
      down_payment: calc.downPayment,
      down_payment_date: schedule[0]?.due_date ?? null,
      down_payment_schedule: schedule,
      financed_amount: calc.financedAmount,
      installments_count: calc.installmentsCount,
      installment_amount: calc.installmentAmount,
      frequency: input.frequency,
      first_due_date: calc.installmentsCount > 0 ? input.first_due_date || null : null,
      formula_snapshot: request.formulaSnapshot,
      notes: input.notes || null,
    };
    const itemsArgs = input.items.map((item) => ({
      ...item,
      subtotal: item.unit_price * item.quantity,
    }));

    /**
     * Sin señal: el negocio queda en la cola con sus firmas delante y se
     * enviará solo al volver la red. Nunca se activa aquí (activar mueve
     * stock), así que sale como borrador firmado, «pendiente de confirmar».
     */
    const queueOffline = async (activate: boolean): Promise<CreateNegocioResult> => {
      const activeRequest = request;
      const lane = await negocioLaneFor(activeRequest.draftId, [
        input.customer_id,
        input.codeudor_customer_id || null,
      ]);
      await enqueueNegocioCreateOffline({
        negocioId: activeRequest.draftId,
        idempotencyKey: activeRequest.idempotencyKey,
        activate,
        negocio: negocioArgs,
        items: itemsArgs,
        lane,
        signatures: [
          // Si un intento con red ya subió la firma, se reutiliza su ruta: el
          // hash de idempotencia no puede cambiar entre intentos.
          { role: 'cliente', value: activeRequest.signatureUrls?.customer || input.customer_signature_data_url },
          { role: 'fiador', value: activeRequest.signatureUrls?.guarantor || input.guarantor_signature_data_url },
          { role: 'vendedor', value: activeRequest.signatureUrls?.seller || input.seller_signature_data_url },
        ],
        local: {
          dealDate: input.deal_date,
          totalCredit: calc.totalCredit,
          customerId: input.customer_id,
          customerName: input.customer_name || 'Cliente',
          codeudorCustomerId: input.codeudor_customer_id || null,
          direccion: input.direccion.trim(),
          municipioId: input.municipio_id,
          municipioName: input.municipio_name ?? null,
          sellerId: input.seller_id || userId,
          sellerName: input.seller_name ?? null,
          createdBy: userId,
        },
      });
      pendingCreateRequests.delete(requestFingerprint);
      return { id: activeRequest.draftId, numero: null, queued: true };
    };

    // Empezando sin señal nunca se activa: activar descuenta stock y crea la
    // orden de entrega, y eso sólo puede hacerlo el servidor con los datos de
    // hoy. El negocio queda firmado y «pendiente de confirmar»; se activa
    // después desde su ficha, ya con red.
    if (offline) return queueOffline(false);

    try {
      return await createOnServer();
    } catch (error) {
      // La red se cayó en mitad del guardado: en vez de perder la venta, se
      // encola. Aquí sí se conserva `activate`: el RPC pudo llegar al servidor
      // y el reenvío debe ser idéntico, o la clave de idempotencia se
      // rechazaría por «datos diferentes».
      if (isNetworkError(error) && canUseLocalDb()) return queueOffline(input.activate);
      throw error;
    }

    /** Camino con red de siempre: sube firmas, llama al RPC y recarga la lista. */
    async function createOnServer(): Promise<CreateNegocioResult> {
    if (!request.signatureUrls) {
      request.signaturePromise ??= Promise.all([
        uploadNegocioSignature(input.customer_signature_data_url, { negocioId: request.draftId, role: 'cliente' }),
        uploadNegocioSignature(input.guarantor_signature_data_url, { negocioId: request.draftId, role: 'fiador' }),
        uploadNegocioSignature(input.seller_signature_data_url, { negocioId: request.draftId, role: 'vendedor' }),
      ]).then(([customer, guarantor, seller]) => ({ customer, guarantor, seller }));
      try {
        request.signatureUrls = await request.signaturePromise;
      } catch (error) {
        request.signaturePromise = undefined;
        throw error;
      }
    }

    const { data: negocioId, error } = await supabase.rpc('create_negocio', {
      p_negocio_id: request.draftId,
      p_idempotency_key: request.idempotencyKey,
      p_activate: input.activate,
      p_negocio: {
        ...negocioArgs,
        customer_signature_url: request.signatureUrls.customer,
        guarantor_signature_url: request.signatureUrls.guarantor,
        seller_signature_url: request.signatureUrls.seller,
      } as unknown as Json,
      p_items: itemsArgs as unknown as Json,
    });
    let createdId: string | null = negocioId ?? null;
    if (error || !createdId) {
      // Sin red la petición no llegó: no se borran las firmas ya subidas ni se
      // suelta la clave de idempotencia, porque el negocio se va a encolar con
      // exactamente los mismos datos.
      if (isNetworkError(error)) throw toUserError(error, 'No se pudo crear el negocio');
      // El RPC pudo completarse en servidor aunque el cliente no recibiera la
      // respuesta (timeout): si el negocio existe, se trata como éxito.
      const { data: persisted } = await supabase
        .from('negocios')
        .select('id')
        .eq('id', request.draftId)
        .maybeSingle();
      if (persisted) {
        createdId = persisted.id;
      } else {
        const uploaded = [
          isNewLocalSignature(input.customer_signature_data_url) ? request.signatureUrls.customer : null,
          isNewLocalSignature(input.guarantor_signature_data_url) ? request.signatureUrls.guarantor : null,
          isNewLocalSignature(input.seller_signature_data_url) ? request.signatureUrls.seller : null,
        ];
        await removeNegocioSignatures(uploaded).catch((cleanupError) => {
          console.error('No se pudieron limpiar firmas huérfanas', cleanupError);
        });
        request.signatureUrls = undefined;
        request.signaturePromise = undefined;
        pendingCreateRequests.delete(requestFingerprint);
        throw toUserError(error, 'No se pudo crear el negocio');
      }
    }

    const { data: negocio, error: loadError } = await supabase
      .from('negocios')
      .select('id, numero')
      .eq('id', createdId)
      .single();
    if (loadError || !negocio) {
      throw toUserError(loadError, 'No se pudo cargar el negocio creado');
    }

    pendingCreateRequests.delete(requestFingerprint);

    // Adelanta el aviso a los administradores. Activar genera además la orden
    // de entrega, así que puede haber dos avisos que despachar.
    kickNotificationDispatch();

    await get().fetchList();
    return { numero: negocio.numero, id: negocio.id, queued: false };
    }
  },
}));
