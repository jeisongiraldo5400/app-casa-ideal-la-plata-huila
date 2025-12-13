-- ============================================================================
-- Agregar campo zone_id a la tabla delivery_orders
-- ============================================================================

-- Agregar columna zone_id a la tabla delivery_orders
ALTER TABLE public.delivery_orders 
    ADD COLUMN IF NOT EXISTS zone_id UUID NULL;

-- Crear foreign key constraint
ALTER TABLE public.delivery_orders
    ADD CONSTRAINT delivery_orders_zone_id_fkey 
    FOREIGN KEY (zone_id) 
    REFERENCES public.zones(id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE;

-- Crear índice para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_delivery_orders_zone_id 
    ON public.delivery_orders(zone_id)
    WHERE zone_id IS NOT NULL;

-- Comentario en la columna
COMMENT ON COLUMN public.delivery_orders.zone_id IS 
    'Referencia a la zona de entrega. Requerido solo para órdenes de tipo remisión. NULL para órdenes de tipo cliente.';
