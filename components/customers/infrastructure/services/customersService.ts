import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { normalizeCustomerEmail } from '../../domain/customerEmail';
import {
  DuplicateCustomerDocumentError,
  isDuplicateCustomerDocumentMessage,
  type CustomerWithDocument,
} from '@/lib/customers/customerDocument';
import {
  canUseLocalDb,
  createCustomerOffline,
  fetchCustomerFromLocal,
  searchCustomersFromLocal,
} from '@/lib/offline/repositories/offlineRepository';

export type CustomerOption = {
  id: string;
  name: string;
  id_number: string;
};

export async function searchCustomersForNegocio(query: string): Promise<CustomerOption[]> {
  const term = query.trim();
  if (!term) return [];
  try {
    // `search_customers` compara sin tildes ni mayúsculas (norm_text, migración
    // 20261116120000): con dos `ilike` sueltos, «munoz» no encontraba a
    // «MUÑOZ» y el vendedor creaba el cliente otra vez.
    const { data, error } = await supabase.rpc('search_customers', {
      search_term: term,
      limit_count: 20,
    });
    if (error) throw error;
    return ((data || []) as CustomerOption[]).map((row) => ({
      id: row.id,
      name: row.name,
      id_number: row.id_number || '',
    }));
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalDb()) throw error;
    const local = await searchCustomersFromLocal(term, 20);
    return local.map((row) => ({
      id: row.id,
      name: row.name,
      id_number: row.idNumber || '',
    }));
  }
}

/** Cliente que ya tiene un número de documento. */
export type ExistingCustomer = CustomerWithDocument;

/**
 * El documento ya lo tiene otro cliente, escrito igual o distinto
 * («1.234.567» y «1234567», 20261219120000):
 * - el trigger `enforce_customer_document_unique` (con señal) o
 *   `create_customer_offline` lo rechazan con un mensaje en español;
 * - servidores sin esa migración, con la restricción `customers_id_number_key`
 *   (incluye a los clientes eliminados);
 * - sin señal, la base del teléfono (`DuplicateCustomerDocumentError`).
 */
export function isDuplicateCustomerIdNumber(error: unknown): boolean {
  if (error instanceof DuplicateCustomerDocumentError) return true;
  if (!error || typeof error !== 'object') return false;
  const { code, message, details } = error as { code?: unknown; message?: unknown; details?: unknown };
  const messageText = typeof message === 'string' ? message : '';
  if (isDuplicateCustomerDocumentMessage(messageText)) return true;
  const text = `${messageText} ${typeof details === 'string' ? details : ''}`;
  return String(code ?? '') === '23505' && text.includes('customers_id_number_key');
}

/**
 * Quién tiene ya ese documento (comparado por letras y dígitos), para ofrecer
 * usarlo en vez de mostrar un error. Si el rechazo vino del teléfono, el
 * cliente viaja en el propio error. Si no se puede consultar (sin permiso o
 * sin red) devuelve `null` y la pantalla se queda con el mensaje general.
 */
export async function findCustomerByIdNumber(idNumber: string, error?: unknown): Promise<ExistingCustomer | null> {
  if (error instanceof DuplicateCustomerDocumentError) return error.existing;
  const value = idNumber.trim();
  if (!value) return null;
  try {
    const { data, error: rpcError } = await supabase.rpc('find_customer_by_document', { p_id_number: value });
    if (!rpcError) {
      const row = (data ?? [])[0];
      return row ? { id: row.id, name: row.name, id_number: row.id_number, deleted: Boolean(row.deleted) } : null;
    }
    // Servidor sin 20261219120000: coincidencia exacta, como antes.
    const { data: exact, error: exactError } = await supabase
      .from('customers')
      .select('id, name, id_number, deleted_at')
      .eq('id_number', value)
      .limit(1)
      .maybeSingle();
    if (exactError || !exact) return null;
    return { id: exact.id, name: exact.name, id_number: exact.id_number, deleted: Boolean(exact.deleted_at) };
  } catch {
    return null;
  }
}

/** Ubicación guardada del cliente (su vivienda). */
export type CustomerSavedLocation = {
  municipioId: string | null;
  veredaId: string | null;
  address: string | null;
};

/** Normaliza la ubicación: ids vacíos y dirección en blanco cuentan como sin dato. */
function toSavedLocation(row: {
  municipioId?: string | null;
  veredaId?: string | null;
  address?: string | null;
}): CustomerSavedLocation {
  return {
    municipioId: row.municipioId || null,
    veredaId: row.veredaId || null,
    address: row.address?.trim() || null,
  };
}

/**
 * Ubicación guardada del cliente en la base local (la última descarga o el alta
 * sin señal). `null` si no hay base local o el cliente no está descargado.
 */
async function fetchCustomerSavedLocationFromLocal(customerId: string): Promise<CustomerSavedLocation | null> {
  if (!canUseLocalDb()) return null;
  try {
    const row = await fetchCustomerFromLocal(customerId);
    return row ? toSavedLocation(row) : null;
  } catch {
    return null;
  }
}

/**
 * Ubicación guardada del cliente. Sin señal la lee de la base local: antes
 * devolvía `null` y el asistente de negocio no rellenaba departamento,
 * municipio, vereda ni dirección aunque el cliente ya estuviera descargado.
 * Si falla por otra causa devuelve `null`: se usa sólo para rellenar campos
 * vacíos, y no rellenarlos no debe impedir seguir.
 */
export async function fetchCustomerSavedLocation(customerId: string): Promise<CustomerSavedLocation | null> {
  if (!customerId) return null;
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('municipio_id, vereda_id, address')
      .eq('id', customerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // Un cliente creado sin señal aún no existe en el servidor: su ubicación
      // sólo está en la base local.
      return await fetchCustomerSavedLocationFromLocal(customerId);
    }
    return toSavedLocation({ municipioId: data.municipio_id, veredaId: data.vereda_id, address: data.address });
  } catch (error) {
    if (!isNetworkError(error)) return null;
    return await fetchCustomerSavedLocationFromLocal(customerId);
  }
}

/** Ubicación del cliente: los tres niveles son opcionales. */
export type CustomerLocationInput = {
  address?: string | null;
  municipioId?: string | null;
  veredaId?: string | null;
};

export type CreateCustomerInput = CustomerLocationInput & {
  name: string;
  idNumber: string;
  phone: string | null;
  /** Correo electrónico opcional; se guarda recortado y en minúsculas. */
  email?: string | null;
  /**
   * Vendedor que el trigger `enforce_customer_seller` asignará (ver
   * `expectedSellerIdOnCreate`). Nunca se envía al servidor: solo sirve para el
   * reflejo local del alta sin conexión.
   */
  expectedSellerId?: string | null;
};

export type CreatedCustomer = CustomerOption & {
  /** Vendedor con el que quedó el cliente: el real si hubo red, el previsto si no. */
  seller_id: string | null;
  /** El alta quedó en la cola sin conexión. */
  saved_offline: boolean;
};

export async function createCustomer(input: CreateCustomerInput): Promise<CreatedCustomer> {
  const { expectedSellerId, ...rest } = input;
  const customer = { ...rest, email: normalizeCustomerEmail(rest.email) };
  try {
    // No se envía `seller_id`: lo decide el trigger según los roles de quien crea.
    const { data, error } = await supabase
      .from('customers')
      .insert({
        name: customer.name,
        id_number: customer.idNumber,
        phone: customer.phone,
        email: customer.email,
        address: customer.address || null,
        municipio_id: customer.municipioId || null,
        vereda_id: customer.veredaId || null,
      })
      .select('id, name, id_number, seller_id')
      .single();
    if (error) throw error;
    const row = data as CustomerOption & { seller_id?: string | null };
    return {
      id: row.id,
      name: row.name,
      id_number: row.id_number,
      seller_id: row.seller_id ?? null,
      saved_offline: false,
    };
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalDb()) throw error;
    const sellerId = expectedSellerId ?? null;
    const created = await createCustomerOffline({ ...customer, sellerId });
    return { ...created, seller_id: sellerId, saved_offline: true };
  }
}
