-- ============================================================================
-- Migration: Fix process_return_inventory - Remove double stock update
-- Date: 2026-02-03
-- Description: Removes the direct warehouse_stock update from process_return_inventory()
--              because the trigger fn_update_stock_on_entry() already handles this
--              automatically when inserting into inventory_entries.
--              This was causing DOUBLE stock increases on returns.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_return_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    new_entry_id UUID;
BEGIN
    -- Solo procesar en INSERT
    IF TG_OP = 'INSERT' THEN
        IF NEW.return_type = 'purchase_order' THEN
            -- Para purchase orders: crear entrada de inventario (devolver al stock)
            -- NOTA: El trigger fn_update_stock_on_entry() actualizará warehouse_stock automáticamente
            INSERT INTO inventory_entries (
                product_id,
                warehouse_id,
                quantity,
                entry_type,
                purchase_order_id,
                created_by
            ) VALUES (
                NEW.product_id,
                NEW.warehouse_id,
                NEW.quantity,
                'return',
                NEW.order_id,
                NEW.created_by
            )
            RETURNING id INTO new_entry_id;

            -- REMOVIDO: Actualización directa de warehouse_stock
            -- El trigger fn_update_stock_on_entry() ya lo hace automáticamente
            -- Esto estaba causando DOBLE incremento del stock

            -- Actualizar el registro de devolución con el ID de la entrada
            UPDATE returns
            SET inventory_entry_id = new_entry_id
            WHERE id = NEW.id;

        ELSIF NEW.return_type = 'delivery_order' THEN
            -- Para delivery orders: crear entrada de inventario (devolver al stock)
            -- NOTA: El trigger fn_update_stock_on_entry() actualizará warehouse_stock automáticamente
            INSERT INTO inventory_entries (
                product_id,
                warehouse_id,
                quantity,
                entry_type,
                created_by
            ) VALUES (
                NEW.product_id,
                NEW.warehouse_id,
                NEW.quantity,
                'return',
                NEW.created_by
            )
            RETURNING id INTO new_entry_id;

            -- REMOVIDO: Actualización directa de warehouse_stock
            -- El trigger fn_update_stock_on_entry() ya lo hace automáticamente
            -- Esto estaba causando DOBLE incremento del stock

            -- Actualizar delivered_quantity en delivery_order_items (reducir cantidad entregada)
            UPDATE delivery_order_items
            SET delivered_quantity = GREATEST(0, delivered_quantity - NEW.quantity)
            WHERE delivery_order_id = NEW.order_id
              AND product_id = NEW.product_id
              AND warehouse_id = NEW.warehouse_id;

            -- Actualizar el registro de devolución con el ID de la entrada
            UPDATE returns
            SET inventory_entry_id = new_entry_id
            WHERE id = NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.process_return_inventory() IS
    'Procesa las devoluciones creando entradas de inventario. El stock se actualiza automáticamente via trigger fn_update_stock_on_entry(). CORREGIDO: Eliminada la doble actualización de warehouse_stock.';
