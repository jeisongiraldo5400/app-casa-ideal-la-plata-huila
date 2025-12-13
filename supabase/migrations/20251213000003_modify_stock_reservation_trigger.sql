-- Migration: Modify stock reservation trigger to skip items with source_delivery_order_id
--
-- Date: 2025-12-13
--
-- Description: Modifies fn_reserve_stock_on_delivery_order_item() to skip stock reservation
--              for items that have source_delivery_order_id set. These items are copied
--              from other orders and stock was already reserved when the source order was created.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_reserve_stock_on_delivery_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  current_stock numeric;
BEGIN
  -- Si el item viene de otra orden (source_delivery_order_id presente),
  -- NO restar stock porque ya se restó cuando se creó la orden original
  IF NEW.source_delivery_order_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

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

-- Update comment
COMMENT ON FUNCTION public.fn_reserve_stock_on_delivery_order_item() IS 
  'Reserves warehouse stock automatically when a delivery order item is created. Skips stock reservation for items with source_delivery_order_id (copied from other orders). Called by trigger after insert. Uses FOR UPDATE to prevent race conditions.';
