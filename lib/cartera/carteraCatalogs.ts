import { fetchPaymentMethods, type PaymentMethodOption } from '@/components/negocios/infrastructure/services/paymentMethodsService';
import { fetchSellerOptions, type SellerOption } from '@/lib/users/sellersService';
import { fetchMunicipios, type Municipio } from './carteraService';

/**
 * Catálogos del modal de filtros de Cartera: municipios, vendedores y métodos
 * de pago.
 *
 * Cambian muy poco, así que se piden una vez y se reutilizan mientras viva la
 * sesión (el módulo muere con la app). Antes eran tres efectos que se lanzaban
 * en cada montaje de la pantalla.
 *
 * Cada catálogo es independiente: van en paralelo, un fallo no arrastra a los
 * demás (se avisa por consola y se devuelve una lista vacía, como hacía la
 * pantalla) y una lista vacía no se memoriza, para reintentarla en la próxima
 * apertura — normalmente significa que se cargó sin red.
 */
export type CarteraCatalogs = {
  municipios: Municipio[];
  sellers: SellerOption[];
  paymentMethods: PaymentMethodOption[];
};

export const EMPTY_CARTERA_CATALOGS: CarteraCatalogs = {
  municipios: [],
  sellers: [],
  paymentMethods: [],
};

type Slot<T> = { value: T[] | null; inflight: Promise<T[]> | null };

const municipiosSlot: Slot<Municipio> = { value: null, inflight: null };
const sellersSlot: Slot<SellerOption> = { value: null, inflight: null };
const paymentMethodsSlot: Slot<PaymentMethodOption> = { value: null, inflight: null };

function loadSlot<T>(slot: Slot<T>, fetcher: () => Promise<T[]>): Promise<T[]> {
  if (slot.value) return Promise.resolve(slot.value);
  if (slot.inflight) return slot.inflight;
  const request = (async () => {
    try {
      const list = await fetcher();
      if (list.length) slot.value = list;
      return list;
    } catch (error) {
      console.warn((error instanceof Error && error.message) || 'No fue posible cargar el catálogo');
      return [];
    }
  })().finally(() => {
    slot.inflight = null;
  });
  slot.inflight = request;
  return request;
}

/** Los tres catálogos, de la caché de sesión o del servidor, pedidos a la vez. */
export async function loadCarteraCatalogs(): Promise<CarteraCatalogs> {
  const [municipios, sellers, paymentMethods] = await Promise.all([
    loadSlot(municipiosSlot, fetchMunicipios),
    loadSlot(sellersSlot, fetchSellerOptions),
    loadSlot(paymentMethodsSlot, fetchPaymentMethods),
  ]);
  return { municipios, sellers, paymentMethods };
}

/** Solo para pruebas: vacía la caché de sesión. */
export function resetCarteraCatalogs(): void {
  for (const slot of [municipiosSlot, sellersSlot, paymentMethodsSlot] as Slot<unknown>[]) {
    slot.value = null;
    slot.inflight = null;
  }
}
