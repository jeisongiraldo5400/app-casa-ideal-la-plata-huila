-- ============================================================================
-- Migration: Auto-update purchase order status to 'received' on completion
-- Date: 2026-01-07
-- Description: Creates function to automatically update purchase order status
--              to 'received' when all items are fully registered in inventory_entries.
--              Only updates status if current status is 'pending' or 'approved'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_purchase_order_progress(
  order_id_param UUID
)
RETURNS JSONB 
LANGUAGE plpgsql
AS $$
DECLARE
  all_items_complete BOOLEAN;
  current_status TEXT;
  order_exists BOOLEAN;
BEGIN
  -- Verificar que la orden existe
  SELECT EXISTS (
    SELECT 1 FROM purchase_orders
    WHERE id = order_id_param
      AND deleted_at IS NULL
  ) INTO order_exists;
  
  IF NOT order_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Purchase order not found or has been deleted'
    );
  END IF;
  
  -- Obtener el estado actual de la orden
  SELECT status INTO current_status
  FROM purchase_orders
  WHERE id = order_id_param
    AND deleted_at IS NULL;
  
  -- Verificar si todos los items están completos
  -- Un item está completo cuando la suma de inventory_entries >= cantidad en purchase_order_items
  SELECT NOT EXISTS (
    SELECT 1 
    FROM purchase_order_items poi
    WHERE poi.purchase_order_id = order_id_param
      AND COALESCE((
        SELECT SUM(ie.quantity)
        FROM inventory_entries ie
        WHERE ie.purchase_order_id = order_id_param
          AND ie.product_id = poi.product_id
      ), 0) < poi.quantity
  ) INTO all_items_complete;
  
  -- Si todos están completos, actualizar estado de la orden a 'received'
  -- Solo si el estado actual permite la transición
  IF all_items_complete THEN
    -- Solo actualizar si el estado permite la transición
    -- No actualizar si ya está en 'received' o 'cancelled'
    IF current_status IN ('pending', 'approved') THEN
      UPDATE purchase_orders
      SET 
        status = 'received',
        updated_at = NOW()
      WHERE id = order_id_param
        AND status IN ('pending', 'approved')
        AND deleted_at IS NULL;
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'all_complete', all_items_complete,
    'current_status', current_status,
    'updated', all_items_complete AND current_status IN ('pending', 'approved')
  );
END;
$$;

COMMENT ON FUNCTION public.update_purchase_order_progress(UUID) IS 
  'Checks if all items in a purchase order are fully registered in inventory_entries and automatically marks order as received when complete. Only updates status if current status is pending or approved.';
