-- ============================================================================
-- Migration: Fix validate_inventory_entry_quantity - Exclude soft-deleted entries
-- Date: 2026-02-12
-- Description: The validation trigger was counting ALL inventory entries
--              (including soft-deleted/cancelled ones) when checking if the
--              total quantity exceeds the purchase order limit. This caused
--              cancelled entries to still block new entries for the same product.
--
--              Fix: Add WHERE deleted_at IS NULL to the SUM query.
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_inventory_entry_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  order_item_quantity INTEGER;
  total_registered INTEGER;
  order_status TEXT;
  order_exists BOOLEAN;
BEGIN
  -- Solo validar si hay una orden de compra asociada
  IF NEW.purchase_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verificar que la orden existe y obtener su estado
  SELECT
    po.status,
    EXISTS(SELECT 1 FROM purchase_orders WHERE id = NEW.purchase_order_id AND deleted_at IS NULL)
  INTO order_status, order_exists
  FROM purchase_orders po
  WHERE po.id = NEW.purchase_order_id
    AND po.deleted_at IS NULL;

  IF NOT order_exists THEN
    RAISE EXCEPTION 'La orden de compra % no existe o ha sido eliminada', NEW.purchase_order_id;
  END IF;

  -- Verificar que la orden esté en estado válido (pending)
  IF NEW.entry_type = 'PO_ENTRY' AND order_status != 'pending' THEN
    RAISE EXCEPTION 'La orden de compra % no está en estado pendiente (estado actual: %). No se pueden registrar más entradas.',
      NEW.purchase_order_id, order_status;
  END IF;

  -- Obtener la cantidad ordenada para este producto en la orden
  -- Solo considerar items activos (no soft-deleted)
  SELECT quantity
  INTO order_item_quantity
  FROM purchase_order_items
  WHERE purchase_order_id = NEW.purchase_order_id
    AND product_id = NEW.product_id
    AND deleted_at IS NULL;

  -- Si no hay item en la orden para este producto, rechazar
  IF order_item_quantity IS NULL THEN
    RAISE EXCEPTION 'El producto % no está incluido en la orden de compra %',
      NEW.product_id, NEW.purchase_order_id;
  END IF;

  -- Calcular la cantidad total ya registrada para este producto en esta orden
  -- CORREGIDO: Excluir entradas soft-deleted (cancelled) del conteo
  SELECT COALESCE(SUM(quantity), 0)
  INTO total_registered
  FROM inventory_entries
  WHERE purchase_order_id = NEW.purchase_order_id
    AND product_id = NEW.product_id
    AND deleted_at IS NULL
    AND (TG_OP = 'INSERT' OR id != NEW.id);

  -- Verificar que la cantidad total (incluyendo la nueva entrada) no exceda la ordenada
  IF (total_registered + NEW.quantity) > order_item_quantity THEN
    RAISE EXCEPTION
      'La cantidad excede lo permitido para este producto en la orden de compra. Cantidad en orden: %, Ya registrado: %, Intentando registrar: %, Total después de esta entrada: %',
      order_item_quantity,
      total_registered,
      NEW.quantity,
      total_registered + NEW.quantity;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_inventory_entry_quantity() IS
  'Validates that inventory entries do not exceed purchase order quantities. '
  'CORREGIDO: Ahora excluye entradas soft-deleted del conteo y solo considera '
  'purchase_order_items activos (deleted_at IS NULL).';
