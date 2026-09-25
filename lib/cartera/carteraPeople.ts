/**
 * Las personas de una cuota de cartera.
 *
 * Reportado por el usuario (2026-09-25): «cuando el usuario está en cartera,
 * aparece que es el vendedor porque lo vendió, pero no está asignado ese
 * cliente a él». Son tres personas distintas que se leían todas como
 * «vendedor»:
 *
 * - Registrado por (`negocios.created_by`): quien creó el negocio.
 * - Vendedor del negocio (`negocios.seller_id`): por defecto, el mismo que lo
 *   registra.
 * - Vendedor del cliente (`customers.seller_id`): a quien pertenece el cliente.
 *
 * Siempre se muestran «Registrado por» y «Vendedor del cliente». El vendedor
 * del negocio solo aparece cuando es otra persona: si coincide con quien lo
 * registró (el caso normal) repetir el nombre no aporta nada y recarga la fila.
 * Si no se sabe quién lo registró (negocios viejos sin `created_by`) sí se
 * muestra, para no perder el único nombre conocido.

 *
 * Mismo criterio que la web (`frontend/src/app/admin/cartera/domain/carteraPeople.ts`).
 * Lo usan la tarjeta de cartera y la ficha del negocio, con y sin señal.
 */

export type CarteraPeopleSource = {
  created_by?: string | null;
  created_by_name?: string | null;
  seller_id: string | null;
  seller_name: string | null;
  customer_seller_name: string | null;
};

export type CarteraPersonLine = {
  key: 'registered_by' | 'business_seller' | 'customer_seller';
  label: string;
  value: string;
};

export const SIN_ASIGNAR = 'Sin asignar';
const SIN_REGISTRO = '—';

/** ¿El vendedor del negocio es otra persona distinta de quien lo registró? */
export function businessSellerDiffers(row: CarteraPeopleSource): boolean {
  if (!row.seller_id && !row.seller_name) return false;
  if (!row.created_by && !row.created_by_name) return true;
  if (row.created_by && row.seller_id) return row.created_by !== row.seller_id;
  return (row.created_by_name || '') !== (row.seller_name || '');
}

export function carteraPeopleLines(row: CarteraPeopleSource): CarteraPersonLine[] {
  const lines: CarteraPersonLine[] = [
    { key: 'registered_by', label: 'Registrado por', value: row.created_by_name || SIN_REGISTRO },
  ];
  if (businessSellerDiffers(row)) {
    lines.push({
      key: 'business_seller',
      label: 'Vendedor del negocio',
      value: row.seller_name || SIN_ASIGNAR,
    });
  }
  lines.push({
    key: 'customer_seller',
    label: 'Vendedor del cliente',
    value: row.customer_seller_name || SIN_ASIGNAR,
  });
  return lines;
}
