-- Migration: Reserve stock when creating delivery order items
--
-- Date: 2025-12-12
--
-- Description: Automatically reserves stock (decreases warehouse_stock) when a delivery_order_item
--              is created. This ensures stock is available when the order is delivered and prevents
--              multiple orders from using the same inventory. Uses FOR UPDATE to prevent race conditions.
--
-- ============================================================================
--
-- Function: fn_reserve_stock_on_delivery_order_item
--
-- Description: Reserves stock (decreases) when a delivery order item is created.
--              This function is called by a trigger AFTER inserting into delivery_order_items.
--              It validates stock availability and updates the warehouse_stock table.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_reserve_stock_on_delivery_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  current_stock numeric;
BEGIN
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

  -- 3. Validar disponibilidad (incluyendo cantidad del nuevo item)
  IF current_stock < NEW.quantity THEN
    RAISE EXCEPTION 'Stock insuficiente al crear orden. Disponible: %, Solicitado: %',
      current_stock, NEW.quantity;
  END IF;

  -- 4. Reservar stock (disminuir)
  UPDATE public.warehouse_stock
  SET quantity = quantity - NEW.quantity,
      updated_at = NOW()
  WHERE product_id = NEW.product_id
    AND warehouse_id = NEW.warehouse_id;

  RETURN NEW;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.fn_reserve_stock_on_delivery_order_item() IS 
  'Reserves warehouse stock automatically when a delivery order item is created. Called by trigger after insert. Uses FOR UPDATE to prevent race conditions.';

-- ============================================================================
--
-- Trigger: trg_reserve_stock_on_delivery_order_item
--
-- Description: Triggers stock reservation after inserting into delivery_order_items
--
-- ============================================================================

DROP TRIGGER IF EXISTS trg_reserve_stock_on_delivery_order_item ON public.delivery_order_items;

CREATE TRIGGER trg_reserve_stock_on_delivery_order_item
  AFTER INSERT ON public.delivery_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_reserve_stock_on_delivery_order_item();

-- Add comment for documentation
COMMENT ON TRIGGER trg_reserve_stock_on_delivery_order_item ON public.delivery_order_items IS 
  'Automatically reserves warehouse stock when a delivery order item is created. Ensures stock availability and prevents inventory inconsistencies.';
