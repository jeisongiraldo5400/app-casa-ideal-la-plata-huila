-- Migration: Fix update_delivery_order_progress RPC function status validation

-- Date: 2025-12-10

-- Description: Fix the update_delivery_order_progress function to properly validate order status

--              before updating to prevent CHECK constraint violations



-- ============================================================================

-- Function: update_delivery_order_progress

-- Description: Updates the delivered quantity for a product in a delivery order

--              and automatically marks order as delivered when complete

--              Fixed to validate order status before updating

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

  current_order_status TEXT;

BEGIN

  -- Verificar que la orden existe y obtener su estado

  SELECT status INTO current_order_status

  FROM delivery_orders

  WHERE id = order_id_param

    AND deleted_at IS NULL;

  

  IF current_order_status IS NULL THEN

    RETURN jsonb_build_object(

      'success', false,

      'error', 'Delivery order not found or has been deleted'

    );

  END IF;

  

  -- No permitir actualizar si la orden está cancelada

  IF current_order_status = 'cancelled' THEN

    RETURN jsonb_build_object(

      'success', false,

      'error', 'Cannot update progress for a cancelled order'

    );

  END IF;

  

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

  

  -- Actualizar delivered_quantity (sin updated_at porque delivery_order_items no tiene esa columna)

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

  

  -- Si todos están entregados, actualizar estado de la orden

  -- Solo actualizar si la orden no está cancelada y el estado actual permite cambiar a 'delivered'

  IF all_items_delivered AND current_order_status != 'cancelled' AND current_order_status != 'delivered' THEN

    UPDATE delivery_orders

    SET 

      status = 'delivered',

      updated_at = NOW()

    WHERE id = order_id_param

      AND status != 'cancelled'

      AND status != 'delivered';

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

  'Updates the delivered quantity for a product in a delivery order and automatically marks order as delivered when complete. Fixed to validate order status before updating to prevent CHECK constraint violations.';
