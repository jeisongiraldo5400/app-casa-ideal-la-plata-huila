-- Migration: Add RPC functions for delivery order management
-- Date: 2025-11-28
-- Description: Functions to get delivery order details and update delivery progress

-- ============================================================================
-- Function: update_delivery_order_progress
-- Description: Updates the delivered quantity for a product in a delivery order
--              and automatically marks order as delivered when complete
-- ============================================================================
CREATE OR REPLACE FUNCTION update_delivery_order_progress(
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
BEGIN
  -- Verificar que el item existe en la orden
  SELECT EXISTS (
    SELECT 1 FROM delivery_order_items
    WHERE delivery_order_id = order_id_param
      AND product_id = product_id_param
      AND deleted_at IS NULL
  ) INTO item_exists;
  
  IF NOT item_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Product not found in delivery order'
    );
  END IF;
  
  -- Actualizar delivered_quantity
  UPDATE delivery_order_items
  SET 
    delivered_quantity = delivered_quantity + quantity_delivered_param,
    updated_at = NOW()
  WHERE delivery_order_id = order_id_param
    AND product_id = product_id_param
    AND deleted_at IS NULL
  RETURNING delivered_quantity, quantity INTO current_delivered, total_quantity;
  
  -- Verificar si excede la cantidad total
  IF current_delivered > total_quantity THEN
    -- Revertir el cambio
    UPDATE delivery_order_items
    SET 
      delivered_quantity = delivered_quantity - quantity_delivered_param,
      updated_at = NOW()
    WHERE delivery_order_id = order_id_param
      AND product_id = product_id_param
      AND deleted_at IS NULL;
      
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
      AND deleted_at IS NULL
  ) INTO all_items_delivered;
  
  -- Si todos están entregados, actualizar estado de la orden
  IF all_items_delivered THEN
    UPDATE delivery_orders
    SET 
      status = 'delivered',
      updated_at = NOW()
    WHERE id = order_id_param
      AND deleted_at IS NULL;
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
COMMENT ON FUNCTION update_delivery_order_progress(UUID, UUID, INTEGER) IS 
  'Updates the delivered quantity for a product in a delivery order and automatically marks order as delivered when complete';
