-- Migration: Revert and adjust stock when delivery order items are deleted or updated
--
-- Date: 2025-12-12
--
-- Description: Automatically reverts stock (increases warehouse_stock) when a delivery_order_item
--              is deleted or when quantity/delivered_quantity changes. This ensures stock is
--              properly managed when orders are cancelled or edited.
--
-- ============================================================================
--
-- Function: fn_revert_stock_on_delivery_order_item
--
-- Description: Reverts stock (increases) when a delivery order item is deleted.
--              Only reverts the reserved stock (quantity - delivered_quantity).
--              This function is called by a trigger AFTER deleting from delivery_order_items.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_revert_stock_on_delivery_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  reserved_quantity numeric;
BEGIN
  -- Revertir stock (aumentar) solo si el item no fue entregado completamente
  -- Si delivered_quantity < quantity, significa que hay stock reservado sin entregar
  IF OLD.delivered_quantity < OLD.quantity THEN
    reserved_quantity := OLD.quantity - OLD.delivered_quantity;
    
    -- Aumentar stock
    INSERT INTO public.warehouse_stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (OLD.product_id, OLD.warehouse_id, reserved_quantity, NOW())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET 
        quantity = warehouse_stock.quantity + reserved_quantity,
        updated_at = NOW();
  END IF;

  RETURN OLD;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.fn_revert_stock_on_delivery_order_item() IS 
  'Reverts warehouse stock automatically when a delivery order item is deleted. Only reverts reserved stock (quantity - delivered_quantity). Called by trigger after delete.';

-- ============================================================================
--
-- Function: fn_adjust_stock_on_delivery_order_item_change
--
-- Description: Adjusts stock when quantity or delivered_quantity changes in a delivery order item.
--              Calculates the difference in reserved stock and adjusts warehouse_stock accordingly.
--              This function is called by a trigger AFTER updating delivery_order_items.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_adjust_stock_on_delivery_order_item_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_reserved numeric;
  new_reserved numeric;
  stock_adjustment numeric;
  current_stock numeric;
BEGIN
  -- Calcular stock reservado antes y después
  old_reserved := OLD.quantity - OLD.delivered_quantity;
  new_reserved := NEW.quantity - NEW.delivered_quantity;
  stock_adjustment := new_reserved - old_reserved;

  -- Si hay cambio en la reserva, ajustar stock
  IF stock_adjustment != 0 THEN
    -- Si aumenta la reserva (stock_adjustment > 0), validar disponibilidad
    IF stock_adjustment > 0 THEN
      -- Obtener stock actual Y BLOQUEAR LA FILA (FOR UPDATE)
      SELECT quantity INTO current_stock
      FROM public.warehouse_stock
      WHERE product_id = NEW.product_id
        AND warehouse_id = NEW.warehouse_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe registro de stock para el producto (%) en la bodega (%).',
          NEW.product_id, NEW.warehouse_id;
      END IF;

      IF current_stock < stock_adjustment THEN
        RAISE EXCEPTION 'Stock insuficiente al editar orden. Disponible: %, Necesario adicional: %',
          current_stock, stock_adjustment;
      END IF;
    END IF;

    -- Ajustar stock
    UPDATE public.warehouse_stock
    SET quantity = quantity - stock_adjustment,
        updated_at = NOW()
    WHERE product_id = NEW.product_id
      AND warehouse_id = NEW.warehouse_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.fn_adjust_stock_on_delivery_order_item_change() IS 
  'Adjusts warehouse stock automatically when quantity or delivered_quantity changes in a delivery order item. Calculates difference in reserved stock and adjusts accordingly. Called by trigger after update.';

-- ============================================================================
--
-- Trigger: trg_revert_stock_on_delivery_order_item_delete
--
-- Description: Triggers stock reversion after deleting from delivery_order_items
--
-- ============================================================================

DROP TRIGGER IF EXISTS trg_revert_stock_on_delivery_order_item_delete ON public.delivery_order_items;

CREATE TRIGGER trg_revert_stock_on_delivery_order_item_delete
  AFTER DELETE ON public.delivery_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_revert_stock_on_delivery_order_item();

-- Add comment for documentation
COMMENT ON TRIGGER trg_revert_stock_on_delivery_order_item_delete ON public.delivery_order_items IS 
  'Automatically reverts warehouse stock when a delivery order item is deleted. Only reverts reserved stock that was not delivered.';

-- ============================================================================
--
-- Trigger: trg_adjust_stock_on_delivery_order_item_update
--
-- Description: Triggers stock adjustment after updating delivery_order_items
--
-- ============================================================================

DROP TRIGGER IF EXISTS trg_adjust_stock_on_delivery_order_item_update ON public.delivery_order_items;

CREATE TRIGGER trg_adjust_stock_on_delivery_order_item_update
  AFTER UPDATE ON public.delivery_order_items
  FOR EACH ROW
  WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity OR OLD.delivered_quantity IS DISTINCT FROM NEW.delivered_quantity)
  EXECUTE FUNCTION public.fn_adjust_stock_on_delivery_order_item_change();

-- Add comment for documentation
COMMENT ON TRIGGER trg_adjust_stock_on_delivery_order_item_update ON public.delivery_order_items IS 
  'Automatically adjusts warehouse stock when quantity or delivered_quantity changes in a delivery order item. Ensures stock reservation matches order requirements.';
