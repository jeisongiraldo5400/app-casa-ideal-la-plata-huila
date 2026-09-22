import type { ExistingCustomer } from '../infrastructure/services/customersService';

export type DuplicateCustomerPrompt = {
  title: string;
  message: string;
  /** Se puede ofrecer «Usar este cliente». */
  canUse: boolean;
};

/**
 * Qué decir cuando el documento ya lo tiene otro cliente. Antes la app mostraba
 * el texto crudo de la base («duplicate key value violates unique constraint
 * "customers_id_number_key"»), que no dice ni qué pasó ni qué hacer.
 */
export function duplicateCustomerPrompt(existing: ExistingCustomer | null, idNumber: string): DuplicateCustomerPrompt {
  const doc = idNumber.trim();
  if (!existing) {
    return {
      title: 'Cliente ya registrado',
      message: `Ya existe un cliente con el documento ${doc}. Búscalo por su nombre o documento en lugar de crearlo de nuevo.`,
      canUse: false,
    };
  }
  if (existing.deleted) {
    return {
      title: 'Cliente eliminado',
      message: `El documento ${doc} pertenece a ${existing.name}, que fue eliminado. Pide a un administrador que lo restaure desde la web y luego búscalo.`,
      canUse: false,
    };
  }
  return {
    title: 'Cliente ya registrado',
    message: `El documento ${doc} ya es de ${existing.name}. ¿Quieres usar ese cliente?`,
    canUse: true,
  };
}
