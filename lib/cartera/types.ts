/**
 * Vocabulario compartido del listado de cartera.
 *
 * Vive en un módulo sin dependencias (ni Supabase, ni WatermelonDB, ni React)
 * porque lo necesitan tres capas que no deben acoplarse entre sí: el servicio
 * remoto (`lib/cartera/carteraService`), el repositorio y el dominio puro
 * offline (`lib/offline/domain/carteraLocal`) y la UI de filtros. Si el tipo
 * viviera en el servicio, el dominio tendría que importar la capa de I/O para
 * conocer los filtros; cuando se repetía a mano en cada capa, añadir un valor
 * (p. ej. «pagadas») rompía la compilación en el lado que se olvidaba.
 */

/** Estados consultables del listado; deben coincidir con `p_filter` del RPC `get_cartera_cuotas`. */
export type CarteraFilter = 'todas' | 'por_vencer' | 'vencidas' | 'mora' | 'pagadas';

/** Filtros del listado, iguales online (RPC) y offline (base local). */
export type CarteraQuery = {
  filter: CarteraFilter;
  search: string;
  /** Horizonte en días del filtro «por vencer». */
  days: number;
  municipioId: string;
  /** Vendedor del NEGOCIO. */
  sellerId?: string;
  /** Vendedor del CLIENTE, distinto del vendedor del negocio. */
  customerSellerId?: string;
  /** Cuotas de negocios con al menos un abono vigente de ese método. */
  paymentMethodId?: string;
  /** Rango sobre la fecha de vencimiento de la cuota. */
  dueFrom?: string;
  dueTo?: string;
};

/** Una página del listado de cartera. */
export type CarteraPageQuery = CarteraQuery & {
  page: number;
  pageSize: number;
};

/** Fila devuelta por `get_cartera_cuotas` (y reconstruida desde la base local). */
export type CarteraRow = {
  cuota_id: string;
  negocio_id: string;
  negocio_numero: number;
  customer_name: string | null;
  customer_id_number: string | null;
  customer_phone: string | null;
  municipio_id: string | null;
  municipio_name: string | null;
  seller_id: string | null;
  seller_name: string | null;
  customer_seller_id: string | null;
  customer_seller_name: string | null;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  late_fee_amount: number;
  saldo: number;
  status: string;
  total_count: number;
};
