-- Migration: Fix update_delivery_order_progress RPC function

-- Date: 2025-12-10

-- Description: Fix the update_delivery_order_progress function to remove invalid column references

--              and prevent automatic status updates that violate CHECK constraints



-- ============================================================================

-- Function: update_delivery_order_progress

-- Description: Updates the delivered quantity for a product in a delivery order

--              Does NOT automatically update order status to prevent CHECK constraint violations

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

  

  -- NOTA: No actualizamos el estado de la orden automáticamente porque el constraint

  -- check_delivery_order_status solo permite: 'pending', 'approved', 'received', 'cancelled'

  -- El sistema puede determinar si una orden está completa basándose en las cantidades

  -- entregadas sin necesidad de cambiar el estado

  -- Cambiar el estado debe hacerse manualmente o mediante otro proceso que valide

  -- las reglas de negocio apropiadas

  

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

  'Updates the delivered quantity for a product in a delivery order. Does NOT automatically update order status to prevent CHECK constraint violations. The system can determine if an order is complete based on delivered quantities without changing the status.';
