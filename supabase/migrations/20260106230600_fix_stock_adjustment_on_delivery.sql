-- ============================================================================
-- Migration: Fix fn_adjust_stock_on_delivery_order_item_change
-- Date: 2026-01-06
-- Description: Modifies the trigger to NOT adjust stock when only delivered_quantity changes.
--              Stock should only be adjusted when the ORDER quantity changes, not when
--              items are delivered. Delivered items were already reserved, so stock
--              should remain unchanged.
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
  -- Solo ajustar stock si cambia la CANTIDAD DE LA ORDEN (quantity)
  -- NO ajustar si solo cambia delivered_quantity (entregas)
  IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
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
  END IF;
  -- Si solo cambió delivered_quantity, NO hacer nada con warehouse_stock

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_adjust_stock_on_delivery_order_item_change() IS 
  'Adjusts warehouse stock automatically when ORDER quantity changes in a delivery order item. Does NOT adjust stock when only delivered_quantity changes (deliveries). Called by trigger after update.';

-- Actualizar el trigger para que solo se ejecute cuando cambia quantity
-- (no cuando solo cambia delivered_quantity)
DROP TRIGGER IF EXISTS trg_adjust_stock_on_delivery_order_item_update ON public.delivery_order_items;

CREATE TRIGGER trg_adjust_stock_on_delivery_order_item_update
  AFTER UPDATE ON public.delivery_order_items
  FOR EACH ROW
  WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity)
  EXECUTE FUNCTION public.fn_adjust_stock_on_delivery_order_item_change();

COMMENT ON TRIGGER trg_adjust_stock_on_delivery_order_item_update ON public.delivery_order_items IS 
  'Automatically adjusts warehouse stock when ORDER quantity changes. Does NOT trigger on delivered_quantity changes.';
