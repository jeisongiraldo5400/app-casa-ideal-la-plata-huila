import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import {
  calculateCredit,
  type CreditFrequency,
  type CreditSettingsInput,
} from '@/lib/creditCalculator';
import { uploadNegocioSignature } from '@/lib/uploadSignature';

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
  creditSettings: (CreditSettingsInput & { legal_text?: string | null }) | null;
  fetchList: () => Promise<void>;
  fetchCreditSettings: () => Promise<void>;
  createAndActivate: (input: {
    deal_date: string;
    location: string;
    customer_id: string;
    codeudor_customer_id?: string | null;
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

const defaultSettings: CreditSettingsInput & { legal_text?: string | null } = {
  formula_type: 'financed_balance',
  interest_rate_monthly_pct: 0,
  rounding_unit: 1000,
  late_fee_rate_pct: 0,
  default_frequency: 'mensual',
  legal_text: null,
};

export const useNegociosStore = create<NegociosState>((set, get) => ({
  list: [],
  loading: false,
  creditSettings: null,

  fetchList: async () => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('negocios')
        .select('*, customer:customers!negocios_customer_id_fkey(name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      set({ list: data || [] });
    } catch (e) {
      console.error(e);
      set({ list: [] });
    } finally {
      set({ loading: false });
    }
  },

  fetchCreditSettings: async () => {
    const { data } = await supabase
      .from('credit_settings')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      set({
        creditSettings: {
          formula_type: data.formula_type as any,
          interest_rate_monthly_pct: Number(data.interest_rate_monthly_pct),
          rounding_unit: Number(data.rounding_unit),
          late_fee_rate_pct: Number(data.late_fee_rate_pct),
          default_frequency: data.default_frequency as CreditFrequency,
          legal_text: data.legal_text,
        },
      });
    } else {
      set({ creditSettings: defaultSettings });
    }
  },

  createAndActivate: async (input) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Sesión no válida');

    const settings = get().creditSettings || defaultSettings;
    const productsSubtotal = input.items.reduce(
      (s, i) => s + i.unit_price * i.quantity,
      0
    );
    const calc = calculateCredit({
      productsSubtotal,
      downPayment: input.down_payment,
      installmentsCount: input.installments_count,
      settings,
    });

    const hasCustomerSig = Boolean(input.customer_signature_data_url?.trim());

    const { data: negocio, error } = await supabase
      .from('negocios')
      .insert({
        deal_date: input.deal_date,
        location: input.location || null,
        seller_id: user.id,
        customer_id: input.customer_id,
        codeudor_customer_id: input.codeudor_customer_id || null,
        products_subtotal: calc.productsSubtotal,
        interest_amount: calc.interestAmount,
        total_credit: calc.totalCredit,
        down_payment: calc.downPayment,
        financed_amount: calc.financedAmount,
        installments_count: calc.installmentsCount,
        installment_amount: calc.installmentAmount,
        frequency: input.frequency,
        first_due_date: input.first_due_date,
        formula_snapshot: calc.formulaSnapshot,
        status: hasCustomerSig ? 'por_firmar' : 'borrador',
        customer_signature_url: null,
        guarantor_signature_url: null,
        notes: input.notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    const { error: itemsError } = await supabase.from('negocio_items').insert(
      input.items.map((item) => ({
        negocio_id: negocio.id,
        product_id: item.product_id,
        warehouse_id: item.warehouse_id,
        quantity: item.quantity,
        description: item.description,
        unit_price: item.unit_price,
        subtotal: item.unit_price * item.quantity,
      }))
    );
    if (itemsError) throw itemsError;

    const customerSignatureUrl = await uploadNegocioSignature(
      input.customer_signature_data_url,
      { negocioId: negocio.id, role: 'cliente' }
    );
    const guarantorSignatureUrl = await uploadNegocioSignature(
      input.guarantor_signature_data_url,
      { negocioId: negocio.id, role: 'fiador' }
    );
    const sellerSignatureUrl = await uploadNegocioSignature(
      input.seller_signature_data_url,
      { negocioId: negocio.id, role: 'vendedor' }
    );

    if (customerSignatureUrl || guarantorSignatureUrl || sellerSignatureUrl) {
      const { error: sigError } = await supabase
        .from('negocios')
        .update({
          customer_signature_url: customerSignatureUrl,
          guarantor_signature_url: guarantorSignatureUrl,
          seller_signature_url: sellerSignatureUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', negocio.id);
      if (sigError) throw sigError;
    }

    if (input.activate) {
      if (!customerSignatureUrl) {
        throw new Error('Se requiere firma del cliente para activar');
      }
      const { error: actError } = await supabase.rpc('activate_negocio', {
        p_negocio_id: negocio.id,
      });
      if (actError) throw actError;
    }

    await get().fetchList();
    return { numero: negocio.numero, id: negocio.id };
  },
}));
