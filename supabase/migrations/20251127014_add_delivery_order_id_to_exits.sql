-- ============================================================================
-- Agregar campo delivery_order_id a inventory_exits para trazabilidad
-- ============================================================================
-- Este campo permite relacionar directamente las salidas de inventario
-- con las órdenes de entrega que las generaron

-- Agregar columna delivery_order_id
ALTER TABLE public.inventory_exits
ADD COLUMN IF NOT EXISTS delivery_order_id UUID;

-- Agregar foreign key
ALTER TABLE public.inventory_exits
ADD CONSTRAINT fk_inventory_exit_delivery_order
    FOREIGN KEY (delivery_order_id)
    REFERENCES public.delivery_orders(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

-- Crear índice para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_inventory_exits_delivery_order_id
    ON public.inventory_exits(delivery_order_id)
    WHERE delivery_order_id IS NOT NULL;

-- Comentario
COMMENT ON COLUMN public.inventory_exits.delivery_order_id IS
    'Referencia a la orden de entrega que generó esta salida de inventario. NULL si la salida no fue generada por una orden de entrega.';

