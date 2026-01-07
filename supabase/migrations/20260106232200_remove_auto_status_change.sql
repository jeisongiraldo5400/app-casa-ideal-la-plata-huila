-- ============================================================================
-- Migration: Remove automatic status change on delivery completion
-- Date: 2026-01-06
-- Description: Modifies update_delivery_order_progress to NOT change order status
--              when all items are delivered. Only admin can change status via web.
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
BEGIN
  -- Verificar que el item existe en la orden
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
  
  -- NO actualizar estado automáticamente
  -- El administrador debe cambiar el estado manualmente desde la web
  
  RETURN jsonb_build_object(
    'success', true,
    'all_delivered', all_items_delivered,
    'current_delivered', current_delivered,
    'total_quantity', total_quantity,
    'pending_quantity', total_quantity - current_delivered
  );
END;
$$;

COMMENT ON FUNCTION public.update_delivery_order_progress(UUID, UUID, INTEGER) IS 
  'Updates the delivered quantity for a product in a delivery order. Returns completion status but does NOT change order status. Admin must approve via web platform.';
