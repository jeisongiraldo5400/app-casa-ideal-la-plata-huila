-- ============================================================================
-- MIGRACIÓN: Corregir actualización de stock en devoluciones de órdenes de compra
-- Descripción: Cuando se devuelve una orden de compra, el stock debe DISMINUIR
--               porque el producto se devuelve al proveedor y sale del inventario.
--               Actualmente está aumentando incorrectamente.
-- Fecha: 2025-12-10
-- ============================================================================

-- Actualizar la función process_return_inventory para corregir el manejo del stock
-- en devoluciones de órdenes de compra
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
            -- Para purchase orders: crear entrada de inventario (registro de devolución)
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
            
            -- Actualizar stock (RESTAR la cantidad devuelta porque sale del inventario)
            -- Verificar que existe stock suficiente antes de restar
            UPDATE warehouse_stock
            SET 
                quantity = GREATEST(0, quantity - NEW.quantity),
                updated_at = NOW()
            WHERE product_id = NEW.product_id
              AND warehouse_id = NEW.warehouse_id;
            
            -- Si no existe registro de stock, no crear uno (no debería pasar si hay productos recibidos)
            -- Pero por seguridad, si no existe, no hacer nada (el stock ya sería 0 o negativo)
            
            -- Actualizar el registro de devolución con el ID de la entrada
            UPDATE returns
            SET inventory_entry_id = new_entry_id
            WHERE id = NEW.id;
                
        ELSIF NEW.return_type = 'delivery_order' THEN
            -- Para delivery orders: crear entrada de inventario (devolver al stock)
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
            
            -- Actualizar stock (sumar la cantidad devuelta porque vuelve al inventario)
            INSERT INTO warehouse_stock (product_id, warehouse_id, quantity, updated_at)
            VALUES (NEW.product_id, NEW.warehouse_id, NEW.quantity, NOW())
            ON CONFLICT (product_id, warehouse_id)
            DO UPDATE SET 
                quantity = warehouse_stock.quantity + NEW.quantity,
                updated_at = NOW();
            
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
    'Procesa las devoluciones creando entradas de inventario y actualizando el stock automáticamente. Para purchase orders RESTA del stock (producto sale del inventario). Para delivery orders SUMA al stock (producto vuelve al inventario).';
