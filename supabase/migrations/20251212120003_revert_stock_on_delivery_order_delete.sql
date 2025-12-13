-- Migration: Revert stock when delivery order is deleted (soft delete)
--
-- Date: 2025-12-12
--
-- Description: Automatically reverts reserved stock when a delivery order is deleted
--              via soft delete (when deleted_at changes from NULL to a value).
--              This ensures stock is properly released when orders are eliminated.
--
-- ============================================================================
--
-- Function: fn_revert_stock_on_delivery_order_delete
--
-- Description: Reverts stock (increases warehouse_stock) when a delivery order
--              is deleted via soft delete. Only reverts stock that was not delivered.
--              This function is called by a trigger AFTER updating delivery_orders.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_revert_stock_on_delivery_order_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  item_record RECORD;
  reserved_quantity numeric;
BEGIN
  -- Solo procesar si se está haciendo soft delete (deleted_at cambia de NULL a un valor)
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Obtener todos los items de la orden eliminada
    FOR item_record IN 
      SELECT product_id, warehouse_id, quantity, delivered_quantity
      FROM public.delivery_order_items
      WHERE delivery_order_id = NEW.id
    LOOP
      -- Calcular stock reservado sin entregar
      reserved_quantity := item_record.quantity - item_record.delivered_quantity;
      
      -- Solo revertir si hay stock reservado
      IF reserved_quantity > 0 THEN
        -- Revertir stock (aumentar)
        INSERT INTO public.warehouse_stock (product_id, warehouse_id, quantity, updated_at)
        VALUES (item_record.product_id, item_record.warehouse_id, reserved_quantity, NOW())
        ON CONFLICT (product_id, warehouse_id)
        DO UPDATE SET 
            quantity = warehouse_stock.quantity + reserved_quantity,
            updated_at = NOW();
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.fn_revert_stock_on_delivery_order_delete() IS 
  'Reverts warehouse stock automatically when a delivery order is deleted via soft delete. Only reverts reserved stock that was not delivered. Called by trigger after update.';

-- ============================================================================
--
-- Trigger: trg_revert_stock_on_delivery_order_delete
--
-- Description: Triggers stock reversion after soft deleting a delivery order
--
-- ============================================================================

DROP TRIGGER IF EXISTS trg_revert_stock_on_delivery_order_delete ON public.delivery_orders;

CREATE TRIGGER trg_revert_stock_on_delivery_order_delete
  AFTER UPDATE ON public.delivery_orders
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.fn_revert_stock_on_delivery_order_delete();

-- Add comment for documentation
COMMENT ON TRIGGER trg_revert_stock_on_delivery_order_delete ON public.delivery_orders IS 
  'Automatically reverts warehouse stock when a delivery order is deleted via soft delete. Only reverts reserved stock that was not delivered.';
