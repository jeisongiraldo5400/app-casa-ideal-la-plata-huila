/**
 * Tipos y etiquetas del vínculo cliente ↔ negocio. Vivían en
 * `lib/negocios/searchCustomerNegocios.ts`, que desapareció al absorber la
 * pantalla «Buscar cliente» en el módulo de clientes.
 */

export type CustomerNegocioRole = 'titular' | 'codeudor' | 'titular_y_codeudor';

export type CustomerNegocioItem = {
  negocio_id: string;
  negocio_numero: number;
  status: string;
  deal_date: string | null;
  total_credit: number;
  remaining_balance: number;
  direccion: string;
  municipio_name: string | null;
  role_in_negocio: CustomerNegocioRole;
  has_mora?: boolean;
};

export type CustomerWithNegocios = {
  customer_id: string;
  customer_name: string;
  customer_id_number: string | null;
  customer_phone: string | null;
  negocios: CustomerNegocioItem[];
};

export function labelCustomerNegocioRole(role: CustomerNegocioRole): string {
  if (role === 'codeudor') return 'Codeudor';
  if (role === 'titular_y_codeudor') return 'Titular y codeudor';
  return 'Titular';
}
