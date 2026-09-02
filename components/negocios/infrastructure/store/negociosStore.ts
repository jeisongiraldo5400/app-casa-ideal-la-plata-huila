import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalDb,
  fetchNegociosListFromLocal,
} from '@/lib/offline/repositories/offlineRepository';
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
import { computeRemainingBalance } from '@/lib/negocios/negocioBalance';
import {
  validateNegocioItemsInput,
  validateNegocioItemsStock,
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
  creditSettings: (CreditSettingsInput & { legal_text?: string | null }) | null;
  fetchList: () => Promise<void>;
  fetchCreditSettings: () => Promise<void>;
  createAndActivate: (input: {
    deal_date: string;
    municipio_id: string;
    direccion: string;
    customer_id: string;
    codeudor_customer_id?: string | null;
    remission_id?: string | null;
    source_delivery_order_id?: string | null;
    items: NegocioItem[];
    down_payment: number;
    installments_count: number;
    frequency: CreditFrequency;
    first_due_date: string;
    notes?: string;
    customer_signature_data_url: string;
    guarantor_signature_data_url?: string;
    seller_signature_data_url?: string;
    activate: boolean;
  }) => Promise<{ numero: number; id: string } | null>;
}

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

function createRequestFingerprint(input: {
  deal_date: string;
  municipio_id: string;
  direccion: string;
  customer_id: string;
  codeudor_customer_id?: string | null;
  remission_id?: string | null;
  source_delivery_order_id?: string | null;
  items: NegocioItem[];
  down_payment: number;
  installments_count: number;
  frequency: CreditFrequency;
  first_due_date: string;
  notes?: string;
  customer_signature_data_url: string;
  guarantor_signature_data_url?: string;
  seller_signature_data_url?: string;
  activate: boolean;
}): string {
  return JSON.stringify({
    deal_date: input.deal_date,
    municipio_id: input.municipio_id,
    direccion: input.direccion,
    customer_id: input.customer_id,
    codeudor_customer_id: input.codeudor_customer_id || null,
    remission_id: input.remission_id || null,
    source_delivery_order_id: input.source_delivery_order_id || null,
    items: input.items,
    down_payment: input.down_payment,
    installments_count: input.installments_count,
    frequency: input.frequency,
    first_due_date: input.first_due_date,
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
  list: [],
  loading: false,
  fromCache: false,
  error: null,
  creditSettings: null,

  fetchList: async () => {
    set({ loading: true, error: null });
    try {
      // `negocios` no tiene columna remaining_balance: se deriva de las cuotas.
      const { data, error } = await supabase
        .from('negocios')
        .select(
          '*, customer:customers!negocios_customer_id_fkey(name), negocio_cuotas(amount, paid_amount, late_fee_amount, status, deleted_at)'
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
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
      console.error(e);
      // Conservar la lista anterior: un fallo transitorio no debe vaciar la pantalla.
      set({ error: toUserError(e, 'No se pudieron cargar los negocios').message });
    } finally {
      set({ loading: false });
    }
  },

  fetchCreditSettings: async () => {
    const { data, error } = await supabase
      .from('credit_settings')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`No fue posible cargar la configuración de crédito: ${error.message}`);
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Sesión no válida');
    if (!input.customer_id) throw new Error('Seleccione un cliente');
    if (!input.municipio_id) throw new Error('Seleccione un municipio');
    if (!input.direccion.trim()) throw new Error('Ingrese la dirección del negocio');
    if (!isValidDateValue(input.deal_date)) throw new Error('Fecha del negocio inválida');
    if (!isValidDateValue(input.first_due_date)) throw new Error('Fecha de primera cuota inválida');
    validateNegocioItemsInput(input.items);

    const settings = get().creditSettings;
    if (!settings) throw new Error('La configuración de crédito aún no está disponible');
    if (!Number.isSafeInteger(input.installments_count)) throw new Error('El número de cuotas debe ser entero');
    // El vendedor define libremente la cantidad de cuotas: no se aplican los
    // topes min_installments/max_installments de credit_settings.
    if (input.installments_count < 1) throw new Error('El número de cuotas debe ser mayor a 0');
    if (!['mensual', 'quincenal', 'semanal'].includes(input.frequency)) throw new Error('Frecuencia de pago inválida');
    if (!Number.isSafeInteger(input.down_payment) || input.down_payment < 0) throw new Error('Cuota inicial inválida');

    if (!negocioSkipsWarehouseStock(input)) {
      const stockCheck = await validateNegocioItemsStock(input.items);
      if (!stockCheck.ok) {
        throw new Error(stockCheck.message);
      }
    }

    const productsSubtotal = input.items.reduce(
      (s, i) => s + i.unit_price * i.quantity,
      0
    );
    if (input.down_payment > productsSubtotal) throw new Error('La cuota inicial no puede superar el subtotal');
    const calc = calculateCredit({
      productsSubtotal,
      downPayment: input.down_payment,
      installmentsCount: input.installments_count,
      frequency: input.frequency,
      settings,
    });

    const requestFingerprint = createRequestFingerprint(input);
    let request = pendingCreateRequests.get(requestFingerprint);
    if (!request) {
      request = {
        draftId: createIdempotencyKey(),
        idempotencyKey: createIdempotencyKey(),
      };
      pendingCreateRequests.set(requestFingerprint, request);
      if (pendingCreateRequests.size > 20) {
        const oldestKey = pendingCreateRequests.keys().next().value;
        if (oldestKey) pendingCreateRequests.delete(oldestKey);
      }
    }

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

    if (!sameFormulaSnapshot(request.formulaSnapshot, calc.formulaSnapshot)) {
      request.formulaSnapshot = calc.formulaSnapshot;
    }

    const { data: negocioId, error } = await supabase.rpc('create_negocio', {
      p_negocio_id: request.draftId,
      p_idempotency_key: request.idempotencyKey,
      p_activate: input.activate,
      p_negocio: {
        deal_date: input.deal_date,
        municipio_id: input.municipio_id,
        direccion: input.direccion.trim(),
        customer_id: input.customer_id,
        codeudor_customer_id: input.codeudor_customer_id || null,
        remission_id: input.remission_id || null,
        source_delivery_order_id: input.source_delivery_order_id || input.remission_id || null,
        products_subtotal: calc.productsSubtotal,
        interest_amount: calc.interestAmount,
        total_credit: calc.totalCredit,
        down_payment: calc.downPayment,
        financed_amount: calc.financedAmount,
        installments_count: calc.installmentsCount,
        installment_amount: calc.installmentAmount,
        frequency: input.frequency,
        first_due_date: input.first_due_date,
        formula_snapshot: request.formulaSnapshot,
        customer_signature_url: request.signatureUrls.customer,
        guarantor_signature_url: request.signatureUrls.guarantor,
        seller_signature_url: request.signatureUrls.seller,
        notes: input.notes || null,
      } as unknown as Json,
      p_items: input.items.map((item) => ({
        ...item,
        subtotal: item.unit_price * item.quantity,
      })) as unknown as Json,
    });
    let createdId: string | null = negocioId ?? null;
    if (error || !createdId) {
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

    await get().fetchList();
    return { numero: negocio.numero, id: negocio.id };
  },
}));
