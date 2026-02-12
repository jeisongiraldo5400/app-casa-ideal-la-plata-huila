-- ============================================================================
-- Migration: Fix fn_update_stock_on_entry - Restore return handling logic
-- Date: 2026-02-12
-- Description: The migration 20260211200000 (add_soft_delete_to_all_tables)
--              overwrote fn_update_stock_on_entry() and REMOVED the return
--              handling logic that was added in 20260211000000. This caused
--              PO returns to ADD stock instead of SUBTRACTING it.
--
--              This migration restores the complete logic:
--              1. Skip soft-deleted entries (from 20260211200000)
--              2. Handle returns correctly (from 20260211000000):
--                 - PO returns: DECREASE stock (product leaves warehouse)
--                 - DO returns: INCREASE stock (product returns to warehouse)
--              3. All other entry types: INCREASE stock
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_update_stock_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stock_delta NUMERIC;
    ret_type TEXT;
BEGIN
    -- Skip if this entry is soft-deleted
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Determinar el cambio de stock según el tipo de entrada
    IF NEW.entry_type = 'return' THEN
        -- Para returns, necesitamos consultar return_type para determinar la dirección
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

COMMENT ON FUNCTION public.fn_update_stock_on_entry() IS
    'Actualiza warehouse_stock cuando se inserta una entrada de inventario. '
    'Combina: (1) skip de entradas soft-deleted, (2) manejo de returns donde '
    'PO returns restan stock y DO returns suman stock, (3) otros entry_types siempre suman. '
    'CORREGIDO: Restaurada la lógica de returns que fue eliminada por migración 20260211200000.';
