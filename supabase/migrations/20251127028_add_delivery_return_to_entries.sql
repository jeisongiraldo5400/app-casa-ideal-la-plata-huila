-- ============================================================================
-- Agregar campo delivery_order_return_id a inventory_entries
-- Para relacionar entradas creadas por devoluciones
-- ============================================================================

-- Agregar columna delivery_order_return_id
ALTER TABLE public.inventory_entries
ADD COLUMN IF NOT EXISTS delivery_order_return_id UUID;

-- Foreign key
ALTER TABLE public.inventory_entries
ADD CONSTRAINT fk_entry_delivery_order_return
    FOREIGN KEY (delivery_order_return_id)
    REFERENCES public.delivery_order_returns(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

-- Índice
CREATE INDEX IF NOT EXISTS idx_inventory_entries_delivery_return_id
    ON public.inventory_entries(delivery_order_return_id)
    WHERE delivery_order_return_id IS NOT NULL;

-- Comentario
COMMENT ON COLUMN public.inventory_entries.delivery_order_return_id IS 
    'Referencia a la devolución de orden de entrega que generó esta entrada';

