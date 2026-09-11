/**
 * Quién queda como vendedor de un cliente creado desde la app.
 *
 * La regla la aplica de verdad el trigger `enforce_customer_seller`: al crear,
 * autoasigna a quien tiene rol `vendedor` y NO tiene rol `admin`. Un
 * administrador (aunque también sea vendedor) crea el cliente sin vendedor, y
 * un gestor de cobro sin rol de vendedor también. Aquí solo se replica esa
 * regla para dos cosas que el servidor no puede resolver por la app:
 *
 * - el reflejo local del alta sin conexión (para que salga en «Mis clientes»
 *   antes de sincronizar), y
 * - los textos de la interfaz, que no deben prometer una asignación que no va
 *   a ocurrir.
 *
 * Los roles se comprueban por presencia, igual que en `useUserRoles`.
 */

const ADMIN_ROLE = 'admin';
const SELLER_ROLE = 'vendedor';

type RoleLike = { role?: { nombre?: string | null } | null };

/** Nombres de rol normalizados a partir de lo que devuelve `useUserRoles().roles`. */
export function roleNamesOf(roles: ReadonlyArray<RoleLike> | null | undefined): string[] {
  return (roles || [])
    .map((userRole) => String(userRole?.role?.nombre || '').trim().toLowerCase())
    .filter(Boolean);
}

/** `true` si el trigger asignará al creador como vendedor del cliente. */
export function autoAssignsCreatorAsSeller(roleNames: ReadonlyArray<string>): boolean {
  const normalized = roleNames.map((name) => name.trim().toLowerCase());
  return normalized.includes(SELLER_ROLE) && !normalized.includes(ADMIN_ROLE);
}

/** Vendedor que tendrá el cliente al crearlo: el creador o nadie. */
export function expectedSellerIdOnCreate(
  userId: string | null | undefined,
  roleNames: ReadonlyArray<string>
): string | null {
  if (!userId) return null;
  return autoAssignsCreatorAsSeller(roleNames) ? userId : null;
}

/** Subtítulo del alta de cliente, según a quién quedará asignado. */
export function customerCreateSubtitle(autoAssign: boolean): string {
  return autoAssign ? 'Quedará asignado a ti' : 'Quedará sin vendedor asignado';
}

interface CreatedCustomerMessageInput {
  name: string;
  /** Vendedor con el que quedó el cliente (el que devolvió el servidor, o el previsto sin conexión). */
  sellerId: string | null;
  currentUserId: string | null | undefined;
  /** El alta quedó en la cola sin conexión y aún no llega al servidor. */
  savedOffline: boolean;
}

/**
 * Mensaje de confirmación. Solo dice «asignado a ti» cuando el cliente
 * realmente quedó (o quedará al sincronizar) con el usuario como vendedor.
 */
export function describeCreatedCustomer({
  name,
  sellerId,
  currentUserId,
  savedOffline,
}: CreatedCustomerMessageInput): string {
  const assignedToMe = Boolean(sellerId && currentUserId && sellerId === currentUserId);
  if (savedOffline) {
    const assignment = assignedToMe ? 'Quedará asignado a ti' : 'Quedará sin vendedor asignado';
    return `${name} quedó guardado sin conexión. ${assignment} cuando se sincronice.`;
  }
  if (assignedToMe) return `${name} quedó registrado y asignado a ti.`;
  if (!sellerId) return `${name} quedó registrado sin vendedor asignado.`;
  return `${name} quedó registrado.`;
}
