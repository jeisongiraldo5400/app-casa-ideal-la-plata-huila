-- ============================================================================
-- Migration: Fix fn_update_stock_on_entry - INSERT with quantity 0
-- Date: 2026-01-06
-- Description: Fixes issue where first entry creates warehouse_stock with quantity=0
--              The problem is in the INSERT VALUES clause - it's using the wrong reference
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_update_stock_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insertamos o Actualizamos (Upsert) en warehouse_stock
  -- IMPORTANTE: En el DO UPDATE usamos EXCLUDED.quantity que es el valor del INSERT
  INSERT INTO public.warehouse_stock (product_id, warehouse_id, quantity, updated_at)
  VALUES (NEW.product_id, NEW.warehouse_id, NEW.quantity, NOW())
  ON CONFLICT (product_id, warehouse_id)
  DO UPDATE SET 
      quantity = warehouse_stock.quantity + EXCLUDED.quantity,
      updated_at = NOW();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_update_stock_on_entry() IS
  'Automatically updates warehouse_stock when an inventory entry is inserted. Fixed to use EXCLUDED.quantity in UPDATE clause.';
