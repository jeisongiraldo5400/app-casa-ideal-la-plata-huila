-- Migration: Create RPC function for batch order assignment to remissions
--
-- Date: 2025-12-12
--
-- Description: Creates an optimized RPC function to assign multiple delivery orders
--              to a remission in a single transaction. This eliminates N+1 queries
--              and reduces the number of database round-trips significantly.
--
-- Performance Impact:
--   Before: ~60 queries to assign 3 orders (20 queries per order)
--   After: 1 query to assign multiple orders
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_orders_to_remission_batch(
  p_remission_id UUID,
  p_order_ids UUID[]
)
RETURNS TABLE(
  order_id UUID,
  success BOOLEAN,
  error_message TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_remission_type TEXT;
  v_order_type TEXT;
  v_item_count INTEGER;
BEGIN
  -- Validar que la remisión existe y es de tipo 'remission' (una sola vez)
  SELECT order_type INTO v_remission_type
  FROM public.delivery_orders
  WHERE id = p_remission_id
    AND deleted_at IS NULL;
  
  IF v_remission_type IS NULL THEN
    -- Si la remisión no existe, retornar error para todas las órdenes
    FOREACH v_order_id IN ARRAY p_order_ids
    LOOP
      RETURN QUERY SELECT v_order_id, FALSE, 'La remisión no existe o fue eliminada'::TEXT;
    END LOOP;
    RETURN;
  END IF;
  
  IF v_remission_type != 'remission' THEN
    -- Si no es una remisión, retornar error para todas las órdenes
    FOREACH v_order_id IN ARRAY p_order_ids
    LOOP
      RETURN QUERY SELECT v_order_id, FALSE, 
        format('El ID %s no corresponde a una remisión (tipo: %s)', p_remission_id, v_remission_type)::TEXT;
    END LOOP;
    RETURN;
  END IF;

  -- Procesar cada orden individualmente
  FOREACH v_order_id IN ARRAY p_order_ids
  LOOP
    BEGIN
      -- Validar que la orden existe y es de tipo 'customer'
      SELECT order_type INTO v_order_type
      FROM public.delivery_orders
      WHERE id = v_order_id
        AND deleted_at IS NULL;
      
      IF v_order_type IS NULL THEN
        RETURN QUERY SELECT v_order_id, FALSE, 'La orden no existe o fue eliminada'::TEXT;
        CONTINUE;
      END IF;
      
      IF v_order_type != 'customer' THEN
        RETURN QUERY SELECT v_order_id, FALSE, 
          format('La orden debe ser de tipo ''customer'' (tipo actual: %s)', v_order_type)::TEXT;
        CONTINUE;
      END IF;

      -- Verificar si ya está asignada a ESTA remisión
      IF EXISTS (
        SELECT 1 FROM public.remission_delivery_orders
        WHERE remission_id = p_remission_id 
          AND source_delivery_order_id = v_order_id
      ) THEN
        RETURN QUERY SELECT v_order_id, FALSE, 'La orden ya está asignada a esta remisión'::TEXT;
        CONTINUE;
      END IF;

      -- Verificar si ya está asignada a OTRA remisión (restricción de asignación única)
      IF EXISTS (
        SELECT 1 FROM public.remission_delivery_orders
        WHERE source_delivery_order_id = v_order_id
      ) THEN
        RETURN QUERY SELECT v_order_id, FALSE, 'La orden ya está asignada a otra remisión. Una orden solo puede estar en una remisión a la vez.'::TEXT;
        CONTINUE;
      END IF;

      -- Verificar que la orden tiene items
      SELECT COUNT(*) INTO v_item_count
      FROM public.delivery_order_items
      WHERE delivery_order_id = v_order_id;
      
      IF v_item_count = 0 THEN
        RETURN QUERY SELECT v_order_id, FALSE, 'La orden no tiene productos para asignar'::TEXT;
        CONTINUE;
      END IF;

      -- Insertar relación en remission_delivery_orders
      -- El trigger trg_validate_remission_delivery_order_types validará los tipos
      INSERT INTO public.remission_delivery_orders (remission_id, source_delivery_order_id)
      VALUES (p_remission_id, v_order_id);

      -- Copiar items a la remisión con source_delivery_order_id establecido
      -- El trigger trg_reserve_stock_on_delivery_order_item NO restará stock
      -- porque source_delivery_order_id está presente
      INSERT INTO public.delivery_order_items (
        delivery_order_id,
        product_id,
        quantity,
        warehouse_id,
        delivered_quantity,
        source_delivery_order_id
      )
      SELECT 
        p_remission_id,
        product_id,
        quantity,
        warehouse_id,
        delivered_quantity,
        v_order_id
      FROM public.delivery_order_items
      WHERE delivery_order_id = v_order_id;

      -- Retornar éxito para esta orden
      RETURN QUERY SELECT v_order_id, TRUE, NULL::TEXT;

    EXCEPTION 
      WHEN OTHERS THEN
        -- Si ocurre cualquier error, retornar el error pero continuar con las demás órdenes
        -- La transacción se hace rollback solo para esta orden específica
        RETURN QUERY SELECT v_order_id, FALSE, SQLERRM::TEXT;
    END;
  END LOOP;
  
  RETURN;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.assign_orders_to_remission_batch(UUID, UUID[]) IS 
  'Asigna múltiples órdenes de entrega a una remisión en una sola transacción. Valida que cada orden no esté ya asignada a otra remisión (restricción de asignación única). Procesa cada orden individualmente y retorna el resultado de cada asignación. Optimizado para reducir N+1 queries.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.assign_orders_to_remission_batch(UUID, UUID[]) TO authenticated;
