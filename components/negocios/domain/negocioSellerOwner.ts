import type { CustomerSellerLookup } from '@/components/customers/infrastructure/services/customerSellerLookup';

/**
 * Regla del negocio (migración 20261206120000): el «Vendedor» del negocio es
 * el dueño del cliente (`customers.seller_id`); «Creado por» es quien lo
 * registra (`negocios.created_by`).
 *
 * - Cliente con dueño: el vendedor se muestra fijo y no se elige.
 * - Cliente sin dueño y usuario administrador CON señal: puede elegir un
 *   vendedor (solo usuarios con rol vendedor, RPC `list_sellers`); el servidor
 *   deja el cliente asignado a él en la misma transacción.
 * - Sin dueño y sin señal (admin): no se ofrece el selector. Sin red no hay
 *   forma fiable de saber quién tiene hoy el rol vendedor (los perfiles
 *   descargados no traen roles) y el servidor rechazaría la asignación: se
 *   pide asignarlo desde Clientes cuando haya señal.
 * - Sin dueño y no administrador: el cliente sigue sin vendedor y el negocio
 *   queda a nombre de quien lo registra (lo decide el servidor).
 */
export type NegocioSellerMode =
  /** Aún no hay cliente elegido. */
  | 'none'
  /** Consultando el dueño del cliente. */
  | 'loading'
  /** El cliente tiene dueño: vendedor fijo. */
  | 'owner'
  /** Admin, cliente sin dueño y con señal: selector opcional. */
  | 'admin-choose'
  /** Admin, cliente sin dueño y sin señal: se asigna luego desde Clientes. */
  | 'admin-offline'
  /** No admin, cliente sin dueño. */
  | 'unassigned'
  /** No se pudo saber el dueño (sin señal y el cliente no está en el teléfono). */
  | 'unknown';

export function negocioSellerMode(params: {
  hasCustomer: boolean;
  lookup: CustomerSellerLookup | null;
  isAdmin: boolean;
  online: boolean;
}): NegocioSellerMode {
  if (!params.hasCustomer) return 'none';
  if (!params.lookup) return 'loading';
  if (params.lookup.status === 'assigned') return 'owner';
  if (params.lookup.status === 'unknown') return 'unknown';
  if (!params.isAdmin) return 'unassigned';
  return params.online ? 'admin-choose' : 'admin-offline';
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
  return { local_seller_id: null, seller_name: params.createdByName };
}

/** Texto de «Vendedor (dueño del cliente): …» en crear negocio. */
export function negocioSellerOwnerText(params: {
  mode: NegocioSellerMode;
  lookup: CustomerSellerLookup | null;
  chosenSellerName: string | null;
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
      return 'Opcional. El cliente quedará asignado a este vendedor.';
    case 'admin-offline':
      return 'Sin señal no se puede asignar vendedor al cliente. Asígnelo desde Clientes cuando haya señal.';
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
 * «Alinear con el dueño del cliente» (reemplaza a «Cambiar vendedor»): solo
 * admin, con señal, negocio no anulado, cliente con dueño y distinto del
 * vendedor guardado. El vendedor ya no se elige en el negocio: se cambia
 * reasignando el cliente en Clientes (assign_seller_to_negocio solo acepta al
 * dueño del cliente desde 20261206120000).
 */
export function canAlignNegocioSellerWithOwner(params: {
  isAdmin: boolean;
  online: boolean;
  status: string | null | undefined;
  negocioSellerId: string | null | undefined;
  customerSellerId: string | null | undefined;
}): boolean {
  return (
    params.isAdmin &&
    params.online &&
    params.status !== 'anulado' &&
    Boolean(params.customerSellerId) &&
    params.negocioSellerId !== params.customerSellerId
  );
}
