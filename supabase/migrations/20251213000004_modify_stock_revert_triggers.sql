-- Migration: Modify stock revert triggers to skip items with source_delivery_order_id
--
-- Date: 2025-12-13
--
-- Description: Modifies stock revert functions to skip stock reversion for items that have
--              source_delivery_order_id set. These items are copied from other orders and
--              should not affect stock when deleted or updated.
--
-- ============================================================================

-- Function: fn_revert_stock_on_delivery_order_item
CREATE OR REPLACE FUNCTION public.fn_revert_stock_on_delivery_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  reserved_quantity numeric;
BEGIN
  -- Si el item viene de otra orden (source_delivery_order_id presente),
  -- NO revertir stock porque el stock pertenece a la orden original
  IF OLD.source_delivery_order_id IS NOT NULL THEN
    RETURN OLD;
  END IF;

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

-- Update comment
COMMENT ON FUNCTION public.fn_revert_stock_on_delivery_order_item() IS 
  'Reverts warehouse stock automatically when a delivery order item is deleted. Skips stock reversion for items with source_delivery_order_id (copied from other orders). Only reverts reserved stock (quantity - delivered_quantity). Called by trigger after delete.';

-- Function: fn_adjust_stock_on_delivery_order_item_change
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
  -- Si el item viene de otra orden (source_delivery_order_id presente),
  -- NO ajustar stock porque el stock pertenece a la orden original
  IF OLD.source_delivery_order_id IS NOT NULL OR NEW.source_delivery_order_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

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

-- Update comment
COMMENT ON FUNCTION public.fn_adjust_stock_on_delivery_order_item_change() IS 
  'Adjusts warehouse stock automatically when quantity or delivered_quantity changes in a delivery order item. Skips stock adjustment for items with source_delivery_order_id (copied from other orders). Calculates difference in reserved stock and adjusts accordingly. Called by trigger after update.';
