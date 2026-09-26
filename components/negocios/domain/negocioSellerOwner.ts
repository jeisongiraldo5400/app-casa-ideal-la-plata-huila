import type { CustomerSellerLookup } from '@/components/customers/infrastructure/services/customerSellerLookup';

/**
 * Regla del negocio (migraciones 20261206120000 y 20261207120000): el
 * «Vendedor» del negocio es el dueño del cliente (`customers.seller_id`);
 * «Creado por» es quien lo registra (`negocios.created_by`).
 *
 * - Cliente con dueño: el vendedor se muestra fijo y no se elige.
 * - Cliente sin dueño y usuario administrador CON señal: DEBE elegir un
 *   vendedor (solo usuarios con rol vendedor, RPC `list_sellers`); el servidor
 *   deja el cliente asignado a él en la misma transacción.
 * - Sin dueño y sin señal (admin): no puede guardar. Sin red no hay forma
 *   fiable de saber quién tiene hoy el rol vendedor (los perfiles descargados
 *   no traen roles): se pide asignarlo con señal.
 * - Sin dueño y vendedor (no admin): el servidor le asigna el cliente a quien
 *   registra, también al sincronizar un negocio creado sin señal.
 * - Sin dueño y sin rol vendedor ni admin (p. ej. gestor de cobro puro): el
 *   cliente sigue sin vendedor y el negocio queda a nombre de quien lo
 *   registra.
 */

/**
 * Marca que las apps nuevas envían siempre en `p_negocio`: con ella el
 * servidor exige al admin elegir vendedor para un cliente sin dueño. Los
 * comandos sin señal de apps viejas no la traen y se aceptan como antes.
 */
export const NEGOCIO_SELLER_RULE = 2;

/** Mensaje exacto cuando un admin sin señal elige un cliente sin dueño. */
export const NEGOCIO_SELLER_OFFLINE_ADMIN_MESSAGE = 'Este cliente no tiene vendedor: asígnalo con señal';
export type NegocioSellerMode =
  /** Aún no hay cliente elegido. */
  | 'none'
  /** Consultando el dueño del cliente. */
  | 'loading'
  /** El cliente tiene dueño: vendedor fijo. */
  | 'owner'
  /** Admin, cliente sin dueño y con señal: selector obligatorio. */
  | 'admin-choose'
  /** Admin, cliente sin dueño y sin señal: no puede guardar. */
  | 'admin-offline'
  /** Vendedor (no admin), cliente sin dueño: el cliente queda asignado a él. */
  | 'self-assign'
  /** Sin rol vendedor ni admin, cliente sin dueño. */
  | 'unassigned'
  /** No se pudo saber el dueño (sin señal y el cliente no está en el teléfono). */
  | 'unknown';

export function negocioSellerMode(params: {
  hasCustomer: boolean;
  lookup: CustomerSellerLookup | null;
  isAdmin: boolean;
  /** Tiene rol vendedor (roles por presencia: puede ser además gestor). */
  isVendedor?: boolean;
  online: boolean;
}): NegocioSellerMode {
  if (!params.hasCustomer) return 'none';
  if (!params.lookup) return 'loading';
  if (params.lookup.status === 'assigned') return 'owner';
  if (params.lookup.status === 'unknown') return 'unknown';
  if (params.isAdmin) return params.online ? 'admin-choose' : 'admin-offline';
  return params.isVendedor ? 'self-assign' : 'unassigned';
}

/**
 * Por qué no se puede avanzar/guardar por el vendedor (null = se puede).
 * El servidor rechaza igual al admin que no elige (marca `seller_rule`).
 */
export function negocioSellerBlockedReason(params: {
  mode: NegocioSellerMode;
  chosenSellerId: string;
}): string | null {
  if (params.mode === 'admin-choose' && !params.chosenSellerId) {
    return 'Este cliente no tiene vendedor: elija el vendedor al que quedará asignado.';
  }
  if (params.mode === 'admin-offline') return NEGOCIO_SELLER_OFFLINE_ADMIN_MESSAGE;
  return null;
}

/** Lo que la pantalla pasa a `createAndActivate` sobre el vendedor. */
export type NegocioSellerInput = {
  /**
   * Solo se envía cuando el administrador eligió vendedor para un cliente sin
   * dueño. Si no, el store manda el usuario actual (lo mismo que siempre), que
   * el servidor tolera y sustituye por el dueño del cliente: así un comando
   * encolado sin señal no falla si el dueño cambió mientras tanto.
   */
  seller_id?: string;
  assign_customer_seller?: true;
  /** Vendedor con el que se pinta el negocio pendiente (null = quien lo registra). */
  local_seller_id: string | null;
  seller_name: string | null;
};

export function buildNegocioSellerInput(params: {
  mode: NegocioSellerMode;
  lookup: CustomerSellerLookup | null;
  chosenSellerId: string;
  chosenSellerName: string | null;
  createdByName: string | null;
  /** Usuario actual: dueño que asignará el servidor en 'self-assign'. */
  userId?: string | null;
}): NegocioSellerInput {
  if (params.mode === 'owner' && params.lookup?.status === 'assigned') {
    return {
      local_seller_id: params.lookup.sellerId,
      seller_name: params.lookup.name,
    };
  }
  if (params.mode === 'admin-choose' && params.chosenSellerId) {
    return {
      seller_id: params.chosenSellerId,
      assign_customer_seller: true,
      local_seller_id: params.chosenSellerId,
      seller_name: params.chosenSellerName,
    };
  }
  if (params.mode === 'self-assign') {
    return { local_seller_id: params.userId ?? null, seller_name: params.createdByName };
  }
  return { local_seller_id: null, seller_name: params.createdByName };
}

/** Texto de «Vendedor (dueño del cliente): …» en crear negocio. */
export function negocioSellerOwnerText(params: {
  mode: NegocioSellerMode;
  lookup: CustomerSellerLookup | null;
  chosenSellerName: string | null;
  /** Nombre del usuario actual (caso 'self-assign'). */
  createdByName?: string | null;
}): string | null {
  switch (params.mode) {
    case 'none':
      return null;
    case 'loading':
      return 'Cargando…';
    case 'owner':
      return params.lookup?.status === 'assigned'
        ? params.lookup.name || 'Asignado (nombre no disponible sin señal)'
        : 'Asignado';
    case 'admin-choose':
      return params.chosenSellerName || 'Sin asignar';
    case 'self-assign':
      return params.createdByName ? `${params.createdByName} (usted)` : 'Usted';
    case 'unknown':
      return 'No disponible';
    default:
      return 'Sin asignar';
  }
}

/** Nota bajo el vendedor según el caso (null = sin nota). */
export function negocioSellerOwnerHint(mode: NegocioSellerMode): string | null {
  switch (mode) {
    case 'owner':
      return 'El vendedor es el dueño del cliente; se cambia reasignando el cliente en Clientes.';
    case 'admin-choose':
      return 'Obligatorio. El cliente quedará asignado a este vendedor.';
    case 'admin-offline':
      return NEGOCIO_SELLER_OFFLINE_ADMIN_MESSAGE;
    case 'self-assign':
      return 'El cliente quedará asignado a usted.';
    case 'unassigned':
      return 'El cliente no tiene vendedor; el negocio queda a nombre de quien lo registra.';
    default:
      return null;
  }
}

/**
 * El vendedor guardado en el negocio (`negocios.seller_id`) difiere del dueño
 * actual del cliente: negocios anteriores a la regla o cliente reasignado
 * después. Solo entonces se muestra «Vendedor registrado en el negocio».
 */
export function negocioSellerDiffersFromOwner(
  negocioSellerId: string | null | undefined,
  customerSellerId: string | null | undefined
): boolean {
  return Boolean(negocioSellerId) && negocioSellerId !== (customerSellerId ?? null);
}

/**
 * Aviso para quien registró el negocio cuando quedó a nombre de otro vendedor:
 * el cliente tenía dueño (o lo cambió antes de sincronizar) y el servidor pone
 * el negocio a nombre de ese dueño (20261206120000). Solo lo ve quien lo
 * registró; `null` si no aplica.
 */
export function negocioSoldForOwnerNotice(params: {
  negocioSellerId: string | null | undefined;
  createdBy: string | null | undefined;
  currentUserId: string | null | undefined;
  /** Nombre del vendedor del negocio (dueño del cliente). */
  sellerName: string | null | undefined;
}): string | null {
  const { negocioSellerId, createdBy, currentUserId } = params;
  if (!negocioSellerId || !createdBy || !currentUserId) return null;
  if (negocioSellerId === createdBy || currentUserId !== createdBy) return null;
  const name = params.sellerName?.trim() || 'otro vendedor';
  return `El cliente pertenece a ${name}: el negocio quedó a su nombre.`;
}
