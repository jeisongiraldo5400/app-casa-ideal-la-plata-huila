-- ============================================================================
-- Migration: Auto-mark delivery orders as received when completed
-- Date: 2025-12-10
-- Description: Modify update_delivery_order_progress to automatically update
--              delivery order status to 'received' when all items are delivered
-- ============================================================================

-- Function: update_delivery_order_progress
-- Description: Updates the delivered quantity for a product in a delivery order
--              and automatically marks order as 'received' when all items are delivered
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_delivery_order_progress(
  order_id_param UUID,
  product_id_param UUID,
  quantity_delivered_param INTEGER
)
RETURNS JSONB 
LANGUAGE plpgsql
AS $$
DECLARE
  current_delivered INTEGER;
  total_quantity INTEGER;
  all_items_delivered BOOLEAN;
  item_exists BOOLEAN;
  current_status TEXT;
BEGIN
  -- Verificar que el item existe en la orden
  -- Nota: delivery_order_items no tiene columna deleted_at
  SELECT EXISTS (
    SELECT 1 FROM delivery_order_items
    WHERE delivery_order_id = order_id_param
      AND product_id = product_id_param
  ) INTO item_exists;
  
  IF NOT item_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Product not found in delivery order'
    );
  END IF;
  
  -- Actualizar delivered_quantity
  -- Nota: delivery_order_items no tiene columnas updated_at ni deleted_at
  UPDATE delivery_order_items
  SET 
    delivered_quantity = delivered_quantity + quantity_delivered_param
  WHERE delivery_order_id = order_id_param
    AND product_id = product_id_param
  RETURNING delivered_quantity, quantity INTO current_delivered, total_quantity;
  
  -- Verificar si excede la cantidad total
  IF current_delivered > total_quantity THEN
    -- Revertir el cambio
    UPDATE delivery_order_items
    SET 
      delivered_quantity = delivered_quantity - quantity_delivered_param
    WHERE delivery_order_id = order_id_param
      AND product_id = product_id_param;
      
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Delivered quantity exceeds total quantity',
      'current_delivered', current_delivered - quantity_delivered_param,
      'total_quantity', total_quantity
    );
  END IF;
  
  -- Verificar si todos los items están entregados
  SELECT NOT EXISTS (
    SELECT 1 FROM delivery_order_items
    WHERE delivery_order_id = order_id_param
      AND delivered_quantity < quantity
  ) INTO all_items_delivered;
  
  -- Si todos están entregados, actualizar estado de la orden a 'received'
  -- Solo si el estado actual es 'pending' o 'approved' (no si ya es 'received' o 'cancelled')
  IF all_items_delivered THEN
    -- Obtener el estado actual de la orden
    SELECT status INTO current_status
    FROM delivery_orders
    WHERE id = order_id_param;
    
    -- Solo actualizar si el estado permite la transición
    IF current_status IN ('pending', 'approved') THEN
      UPDATE delivery_orders
      SET 
        status = 'received',
        updated_at = NOW()
      WHERE id = order_id_param
        AND status IN ('pending', 'approved');
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'all_delivered', all_items_delivered,
    'current_delivered', current_delivered,
    'total_quantity', total_quantity,
    'pending_quantity', total_quantity - current_delivered
  );
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.update_delivery_order_progress(UUID, UUID, INTEGER) IS 
  'Updates the delivered quantity for a product in a delivery order and automatically marks order as received when all items are delivered. Only updates status if current status is pending or approved.';
