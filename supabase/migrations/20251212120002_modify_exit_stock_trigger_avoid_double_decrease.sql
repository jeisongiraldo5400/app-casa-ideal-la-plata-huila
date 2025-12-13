-- Migration: Modify exit stock trigger to avoid double decrease when stock is already reserved
--
-- Date: 2025-12-12
--
-- Description: Modifies fn_update_stock_on_exit to check if stock is already reserved
--              by the delivery order before decreasing it. This prevents double decrease
--              when stock was reserved at order creation and then delivered.
--
-- ============================================================================
--
-- Function: fn_update_stock_on_exit (MODIFIED)
--
-- Description: Decreases warehouse stock when an inventory exit is registered.
--              Now checks if stock is already reserved by the delivery order.
--              If stock is reserved, it only validates but doesn't decrease again.
--              This function is called by a trigger AFTER inserting into inventory_exits.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_update_stock_on_exit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  current_stock numeric;
  stock_already_reserved boolean;
  reserved_quantity numeric;
BEGIN
  -- Verificar si el stock ya está reservado por la orden de entrega
  -- Solo aplica si hay una delivery_order_id asociada
  IF NEW.delivery_order_id IS NOT NULL THEN
    -- Verificar si hay items de la orden con stock reservado (delivered_quantity < quantity)
    SELECT EXISTS(
      SELECT 1 
      FROM public.delivery_order_items
      WHERE delivery_order_id = NEW.delivery_order_id
        AND product_id = NEW.product_id
        AND warehouse_id = NEW.warehouse_id
        AND delivered_quantity < quantity
    ) INTO stock_already_reserved;

    -- Si el stock ya está reservado, solo validar disponibilidad pero NO disminuir
    -- El stock ya fue disminuido cuando se creó el item de la orden
    IF stock_already_reserved THEN
      -- Obtener stock actual para validar (sin bloquear, solo lectura)
      SELECT quantity INTO current_stock
      FROM public.warehouse_stock
      WHERE product_id = NEW.product_id
        AND warehouse_id = NEW.warehouse_id;

      -- Validar existencia del registro
      IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe registro de stock para el producto (%) en la bodega (%).',
          NEW.product_id, NEW.warehouse_id;
      END IF;

      -- Validar que hay suficiente stock reservado
      -- El stock reservado debería ser suficiente porque ya fue validado al crear la orden
      -- Pero validamos por seguridad
      SELECT COALESCE(SUM(quantity - delivered_quantity), 0) INTO reserved_quantity
      FROM public.delivery_order_items
      WHERE delivery_order_id = NEW.delivery_order_id
        AND product_id = NEW.product_id
        AND warehouse_id = NEW.warehouse_id;

      IF reserved_quantity < NEW.quantity THEN
        RAISE EXCEPTION 'Stock reservado insuficiente. Reservado: %, Solicitado: %',
          reserved_quantity, NEW.quantity;
      END IF;

      -- No disminuir stock, ya está reservado
      RETURN NEW;
    END IF;
  END IF;

  -- Si no hay orden asociada o el stock no está reservado, proceder con la disminución normal
  -- 1. Obtener stock actual Y BLOQUEAR LA FILA (FOR UPDATE)
  -- Esto hace que otras transacciones esperen si intentan tocar este producto/bodega
  SELECT quantity INTO current_stock
  FROM public.warehouse_stock
  WHERE product_id = NEW.product_id
    AND warehouse_id = NEW.warehouse_id
  FOR UPDATE; -- <--- ESTO ES CLAVE

  -- 2. Validar existencia del registro
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe registro de stock para el producto (%) en la bodega (%).',
      NEW.product_id, NEW.warehouse_id;
  END IF;

  -- 3. Validar disponibilidad
  IF current_stock < NEW.quantity THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible: %, Solicitado: %',
      current_stock, NEW.quantity;
  END IF;

  -- 4. Actualizar stock
  UPDATE public.warehouse_stock
  SET quantity = quantity - NEW.quantity,
      updated_at = NOW()
  WHERE product_id = NEW.product_id
    AND warehouse_id = NEW.warehouse_id;

  RETURN NEW;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.fn_update_stock_on_exit() IS 
  'Decreases warehouse stock automatically when an inventory exit is registered. Checks if stock is already reserved by delivery order to avoid double decrease. Called by trigger after insert. Uses FOR UPDATE to prevent race conditions.';
