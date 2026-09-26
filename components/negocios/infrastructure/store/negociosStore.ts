import { kickNotificationDispatch } from '@/components/notifications/infrastructure/services/dispatchNotifications';
import { logHandledError } from '@/lib/errorMessage';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { canUseLocalDb } from '@/lib/offline/repositories/offlineRepository';
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
import {
  validateNegocioItemsInput,
  validateNegocioItemsStock,
  validateNegocioItemsStockLocal,
} from '../services/negociosStockService';
import { createIdempotencyKey } from '@/lib/idempotency';
import { negocioSkipsWarehouseStock } from '../services/negociosDeliveryOrdersService';
import type { Json } from '@/types/database.types';
import { NEGOCIO_SELLER_RULE } from '../../domain/negocioSellerOwner';

export interface NegocioItem {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  description: string;
  unit_price: number;
}

interface NegociosState {
  creditSettings: (CreditSettingsInput & { legal_text?: string | null }) | null;
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
    /**
     * Vendedor enviado al servidor; por defecto el usuario autenticado. El
     * servidor lo sustituye por el dueño del cliente cuando lo tiene
     * (20261206120000): el vendedor del negocio es el dueño del cliente.
     */
    seller_id?: string | null;
    /**
     * Solo admin, cliente sin dueño: el servidor asigna el cliente a
     * `seller_id` en la misma transacción (con historial).
     */
    assign_customer_seller?: boolean;
    /** Vendedor con el que se pinta el negocio pendiente sin señal (dueño del cliente). */
    local_seller_id?: string | null;
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
  /**
   * Solo en `queued`: el negocio se activará solo al sincronizar (la red se
   * cayó a mitad de un guardado CON activación y el reenvío debe ser idéntico).
   */
  activatesOnSync?: boolean;
  /** Solo en `queued`: aviso para la persona, acorde a `activatesOnSync`. */
  queuedNotice?: string;
};

/**
 * Aviso tras guardar un negocio en la cola. Si se encoló con activación, NO
 * se puede decir «podrá activarlo desde su ficha»: se activará solo al volver
 * la señal (y el servidor aún puede rechazarlo).
 */
export function queuedNegocioNotice(activatesOnSync: boolean): string {
  const base =
    'El negocio quedó guardado sin conexión y se enviará solo cuando vuelva la señal. Todavía NO tiene número: lo asigna el servidor al confirmarlo, y podría rechazarlo (por ejemplo, si ya no hay existencias).';
  return activatesOnSync
    ? `${base} Al confirmarlo quedará activado automáticamente (se creará la orden de entrega); no hace falta activarlo desde su ficha.`
    : `${base} Podrá activarlo desde su ficha cuando esté confirmado.`;
}

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

export const useNegociosStore = create<NegociosState>((set, get) => ({
  creditSettings: null,

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
      // Solo cuando el admin eligió vendedor para un cliente sin dueño: los
      // demás payloads conservan la forma de siempre.
      ...(input.assign_customer_seller ? { assign_customer_seller: true } : {}),
      // Marca de la regla «vendedor = dueño del cliente» (20261207120000):
      // con ella el servidor exige al admin elegir vendedor para un cliente
      // sin dueño. Va siempre, con y sin señal.
      seller_rule: NEGOCIO_SELLER_RULE,
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
          veredaId: input.vereda_id || null,
          sellerId: input.local_seller_id || input.seller_id || userId,
          sellerName: input.seller_name ?? null,
          createdBy: userId,
        },
      });
      pendingCreateRequests.delete(requestFingerprint);
      return {
        id: activeRequest.draftId,
        numero: null,
        queued: true,
        activatesOnSync: activate,
        queuedNotice: queuedNegocioNotice(activate),
      };
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

    return { numero: negocio.numero, id: negocio.id, queued: false };
    }
  },
}));
