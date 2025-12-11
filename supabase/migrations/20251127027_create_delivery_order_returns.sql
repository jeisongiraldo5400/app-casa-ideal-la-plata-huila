-- ============================================================================
-- TABLA: delivery_order_returns
-- Registra devoluciones de productos entregados en órdenes de entrega
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.delivery_order_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL,
    inventory_exit_id UUID NOT NULL, -- La salida original que se devuelve
    product_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    return_reason TEXT NOT NULL, -- Razón obligatoria de la devolución
    observations TEXT, -- Observaciones adicionales
    inventory_entry_id UUID, -- La entrada creada al devolver
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign Keys
    CONSTRAINT fk_return_delivery_order 
        FOREIGN KEY (delivery_order_id) 
        REFERENCES public.delivery_orders(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_return_inventory_exit 
        FOREIGN KEY (inventory_exit_id) 
        REFERENCES public.inventory_exits(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_return_product 
        FOREIGN KEY (product_id) 
        REFERENCES public.products(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_return_warehouse 
        FOREIGN KEY (warehouse_id) 
        REFERENCES public.warehouses(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_return_inventory_entry 
        FOREIGN KEY (inventory_entry_id) 
        REFERENCES public.inventory_entries(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_return_user 
        FOREIGN KEY (created_by) 
        REFERENCES auth.users(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_delivery_order_returns_delivery_order_id 
    ON public.delivery_order_returns(delivery_order_id);

CREATE INDEX IF NOT EXISTS idx_delivery_order_returns_inventory_exit_id 
    ON public.delivery_order_returns(inventory_exit_id);

CREATE INDEX IF NOT EXISTS idx_delivery_order_returns_created_at 
    ON public.delivery_order_returns(created_at DESC);

-- Comentarios
COMMENT ON TABLE public.delivery_order_returns IS 
    'Registra devoluciones de productos entregados en órdenes de entrega';

COMMENT ON COLUMN public.delivery_order_returns.return_reason IS 
    'Razón obligatoria por la cual se devuelve el producto (ej: defectuoso, incorrecto, etc.)';

COMMENT ON COLUMN public.delivery_order_returns.inventory_entry_id IS 
    'Referencia a la entrada de inventario creada al procesar la devolución';

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION public.update_delivery_order_return_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_delivery_order_return_updated_at
    BEFORE UPDATE ON public.delivery_order_returns
    FOR EACH ROW
    EXECUTE FUNCTION public.update_delivery_order_return_updated_at();

-- RLS (Row Level Security)
ALTER TABLE public.delivery_order_returns ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios autenticados pueden ver todas las devoluciones
CREATE POLICY "Users can view delivery returns"
    ON public.delivery_order_returns
    FOR SELECT
    TO authenticated
    USING (true);

-- Política: Los usuarios autenticados pueden crear devoluciones
CREATE POLICY "Users can create delivery returns"
    ON public.delivery_order_returns
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

