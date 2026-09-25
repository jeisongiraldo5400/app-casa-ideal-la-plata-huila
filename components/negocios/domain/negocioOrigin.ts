/**
 * Origen del negocio según lo elegido en el paso 1 del asistente. Es el mismo
 * con señal y sin ella (la orden elegida puede venir del servidor o de la foto
 * llevada en el teléfono): el comando offline `create_negocio` manda estos
 * tres campos tal cual.
 *
 * - bodega: sin origen; `target_remission_id` solo si la OE viaja en remisión.
 * - OE cliente suelta: `source_delivery_order_id` = OE.
 * - remisión, grupo propio (CASO 1): `remission_id` = `source` = remisión.
 * - remisión, OE hija (CASO 3): `source_delivery_order_id` = hija, sin `remission_id`.
 */
export interface NegocioOriginPayload {
  remission_id: string | null;
  source_delivery_order_id: string | null;
  target_remission_id: string | null;
}

export interface NegocioOriginSelection {
  originType: 'bodega' | 'orden_entrega';
  deliveryMode: 'directo' | 'remision';
  targetRemissionId: string | null | undefined;
  selectedOrder: { id: string; order_type: string } | null | undefined;
  selectedGroup: { kind: 'own' | 'child'; sourceOrderId: string } | null | undefined;
}

export function buildNegocioOriginPayload(selection: NegocioOriginSelection): NegocioOriginPayload {
  const { originType, deliveryMode, targetRemissionId, selectedOrder, selectedGroup } = selection;
  if (originType === 'bodega') {
    return {
      remission_id: null,
      source_delivery_order_id: null,
      target_remission_id: deliveryMode === 'remision' ? targetRemissionId ?? null : null,
    };
  }
  if (selectedOrder?.order_type === 'remission') {
    const own = selectedGroup?.kind === 'own';
    return {
      remission_id: own ? selectedOrder.id : null,
      source_delivery_order_id: own ? selectedOrder.id : selectedGroup?.sourceOrderId ?? null,
      target_remission_id: null,
    };
  }
  return {
    remission_id: null,
    source_delivery_order_id: selectedOrder?.id ?? null,
    target_remission_id: null,
  };
}
