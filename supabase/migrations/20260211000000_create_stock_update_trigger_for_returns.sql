-- ============================================================================
-- Migration: Create missing stock update trigger for inventory entries
-- Date: 2026-02-11
-- Description: Creates the missing trigger that updates warehouse_stock when
--              inventory entries are created. Fixes the broken chain where
--              returns were creating entries but not updating stock.
--
--              Root Cause: Migration 20260203000000 removed direct stock updates
--              from process_return_inventory() assuming fn_update_stock_on_entry()
--              trigger would handle it, but that trigger was never created.
--
--              This migration:
--              1. Modifies fn_update_stock_on_entry() to handle returns correctly
--                 - PO returns: DECREASE stock (product leaves warehouse)
--                 - DO returns: INCREASE stock (product returns to warehouse)
--              2. Creates the missing trigger on inventory_entries table
--              3. Adds index for optimized return lookups
-- ============================================================================

-- ============================================================================
-- STEP 1: Modify fn_update_stock_on_entry() to handle returns
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_update_stock_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    stock_delta NUMERIC;
    ret_type TEXT;
BEGIN
    -- Determinar el cambio de stock según el tipo de entrada
    IF NEW.entry_type = 'return' THEN
        -- Para returns, necesitamos consultar return_type para determinar la dirección
        -- Nota: Esto se ejecuta DESPUÉS de crear inventory_entry pero ANTES de
        -- actualizar returns.inventory_entry_id, por eso buscamos con inventory_entry_id IS NULL
        SELECT return_type INTO ret_type
        FROM returns
        WHERE product_id = NEW.product_id
          AND warehouse_id = NEW.warehouse_id
          AND quantity = NEW.quantity
          AND created_by = NEW.created_by
          AND created_at BETWEEN (NEW.created_at - INTERVAL '1 second') AND (NEW.created_at + INTERVAL '1 second')
          AND inventory_entry_id IS NULL
        ORDER BY created_at DESC
        LIMIT 1;

        -- Determinar dirección del stock según tipo de devolución
        IF ret_type = 'purchase_order' THEN
            -- Devoluciones a proveedor: producto SALE del almacén (RESTAR)
            stock_delta := -NEW.quantity;
        ELSIF ret_type = 'delivery_order' THEN
            -- Devoluciones de cliente: producto REGRESA al almacén (SUMAR)
            stock_delta := NEW.quantity;
        ELSE
            -- Fallback: si no encontramos el registro, loguear warning y sumar por defecto
            RAISE WARNING 'No se pudo determinar return_type para inventory_entry %, usando ADD por defecto', NEW.id;
            stock_delta := NEW.quantity;
        END IF;
    ELSE
        -- Todos los otros entry_types: SUMAR al stock
        -- (PO_ENTRY, ENTRY, INITIAL_LOAD, etc.)
        stock_delta := NEW.quantity;
    END IF;

    -- Upsert en warehouse_stock con el delta calculado
    INSERT INTO public.warehouse_stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (NEW.product_id, NEW.warehouse_id, stock_delta, NOW())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET
        quantity = warehouse_stock.quantity + EXCLUDED.quantity,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_update_stock_on_entry() IS
    'Actualiza warehouse_stock cuando se inserta una entrada de inventario. Para returns, determina la dirección (sumar/restar) consultando el return_type. PO returns restan stock, DO returns suman stock. Otros entry_types siempre suman.';

-- ============================================================================
-- STEP 2: Create the missing trigger on inventory_entries
-- ============================================================================

-- Eliminar si existe (por seguridad)
DROP TRIGGER IF EXISTS trg_update_stock_on_entry ON inventory_entries;

-- Crear el trigger AFTER INSERT en inventory_entries
CREATE TRIGGER trg_update_stock_on_entry
    AFTER INSERT ON inventory_entries
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_stock_on_entry();

COMMENT ON TRIGGER trg_update_stock_on_entry ON inventory_entries IS
    'Actualiza warehouse_stock automáticamente al crear entradas de inventario. Maneja la dirección (suma/resta) según el tipo de devolución. Este trigger faltaba y causaba que las devoluciones no actualizaran el stock.';

-- ============================================================================
-- STEP 3: Add index for optimized return lookups
-- ============================================================================

-- Índice para optimizar la búsqueda del trigger
-- Solo indexa returns que aún no tienen inventory_entry_id (WHERE clause)
CREATE INDEX IF NOT EXISTS idx_returns_lookup_for_trigger
ON returns (product_id, warehouse_id, created_at, created_by)
WHERE inventory_entry_id IS NULL;

COMMENT ON INDEX idx_returns_lookup_for_trigger IS
    'Optimiza la búsqueda de return_type en el trigger fn_update_stock_on_entry(). Índice parcial que solo incluye returns sin inventory_entry_id vinculado.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
--
-- What this migration fixes:
--
-- BEFORE (Broken):
--   1. INSERT into returns
--   2. Trigger: process_return_inventory() creates inventory_entry
--   3. ❌ NO trigger updates warehouse_stock
--   4. Stock remains unchanged
--
-- AFTER (Fixed):
--   1. INSERT into returns
--   2. Trigger: process_return_inventory() creates inventory_entry
--   3. Trigger: trg_update_stock_on_entry() fires automatically
--   4. ✅ warehouse_stock updated correctly:
--      - PO returns: stock DECREASES
--      - DO returns: stock INCREASES
--
-- Testing:
--   Run the test queries from the plan to verify correct behavior
--
-- Rollback:
--   DROP TRIGGER trg_update_stock_on_entry ON inventory_entries;
--   Then restore process_return_inventory to version 20251210000012
-- ============================================================================
