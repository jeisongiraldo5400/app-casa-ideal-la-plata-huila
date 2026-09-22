/**
 * Negocio a medias en el asistente de crear negocio.
 *
 * La pantalla es una pestaña y no se destruye al salir: lo escrito sigue ahí al
 * volver. Eso ayuda si se sale sin querer, pero un vendedor podía entrar a hacer
 * un negocio «nuevo» y seguir, sin darse cuenta, con el cliente y los productos
 * del anterior. Al volver con algo a medias se pregunta si continuar o empezar
 * de nuevo.
 */

export type NegocioDraftState = {
  step: number;
  customerId: string | null | undefined;
  itemsCount: number;
  selectedOrderId: string | null | undefined;
  direccion: string;
};

/** Hay algo que perder si se empezara de nuevo. */
export function hasNegocioDraft(state: NegocioDraftState): boolean {
  return (
    state.step > 0 ||
    Boolean(state.customerId) ||
    state.itemsCount > 0 ||
    Boolean(state.selectedOrderId) ||
    state.direccion.trim().length > 0
  );
}

/** Texto del aviso: a quién va el negocio y en qué paso se dejó. */
export function negocioDraftSummary(input: {
  customerName: string | null | undefined;
  stepLabel: string;
  itemsCount: number;
}): string {
  const who = input.customerName?.trim() ? `para ${input.customerName.trim()}` : 'sin cliente elegido';
  const products =
    input.itemsCount === 1 ? '1 producto' : input.itemsCount > 1 ? `${input.itemsCount} productos` : null;
  return [who, `paso «${input.stepLabel}»`, products].filter(Boolean).join(' · ');
}
