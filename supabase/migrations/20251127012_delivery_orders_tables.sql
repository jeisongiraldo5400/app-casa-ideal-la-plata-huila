-- ============================================================================
-- Tablas: delivery_orders y delivery_order_items
-- Sistema de órdenes de entrega a clientes
-- ============================================================================

-- Tabla principal: delivery_orders
CREATE TABLE IF NOT EXISTS public.delivery_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    delivery_address TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Foreign Keys
    CONSTRAINT fk_delivery_order_customer 
        FOREIGN KEY (customer_id) 
        REFERENCES public.customers(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_delivery_order_created_by 
        FOREIGN KEY (created_by) 
        REFERENCES auth.users(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE,
    
    -- Constraints
    CONSTRAINT check_delivery_order_status 
        CHECK (status IN ('pending', 'preparing', 'ready', 'delivered', 'cancelled'))
);

-- Tabla de items: delivery_order_items
CREATE TABLE IF NOT EXISTS public.delivery_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity NUMERIC NOT NULL,
    delivered_quantity NUMERIC NOT NULL DEFAULT 0,
    warehouse_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    
    -- Foreign Keys
    CONSTRAINT fk_delivery_order_item_order 
        FOREIGN KEY (delivery_order_id) 
        REFERENCES public.delivery_orders(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_delivery_order_item_product 
        FOREIGN KEY (product_id) 
        REFERENCES public.products(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_delivery_order_item_warehouse 
        FOREIGN KEY (warehouse_id) 
        REFERENCES public.warehouses(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    -- Constraints
    CONSTRAINT check_delivery_order_item_quantity 
        CHECK (quantity > 0),
    
    CONSTRAINT check_delivery_order_item_delivered_quantity 
        CHECK (delivered_quantity >= 0)
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_delivery_orders_customer_id 
    ON public.delivery_orders(customer_id);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_status 
    ON public.delivery_orders(status);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_deleted_at 
    ON public.delivery_orders(deleted_at) 
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_orders_created_at 
    ON public.delivery_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_order_items_delivery_order_id 
    ON public.delivery_order_items(delivery_order_id);

CREATE INDEX IF NOT EXISTS idx_delivery_order_items_product_id 
    ON public.delivery_order_items(product_id);

CREATE INDEX IF NOT EXISTS idx_delivery_order_items_warehouse_id 
    ON public.delivery_order_items(warehouse_id);

-- Comentarios
COMMENT ON TABLE public.delivery_orders IS 
    'Órdenes de entrega de productos a clientes. Similar a purchase_orders pero para entregas.';

COMMENT ON TABLE public.delivery_order_items IS 
    'Items de las órdenes de entrega. Relaciona productos, cantidades y bodegas.';

COMMENT ON COLUMN public.delivery_orders.status IS 
    'Estados: pending (pendiente), preparing (preparando), ready (lista), delivered (entregada), cancelled (cancelada)';

COMMENT ON COLUMN public.delivery_order_items.quantity IS 
    'Cantidad solicitada en la orden';

COMMENT ON COLUMN public.delivery_order_items.delivered_quantity IS 
    'Cantidad realmente entregada (puede ser parcial)';

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION public.update_delivery_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_delivery_orders_updated_at
    BEFORE UPDATE ON public.delivery_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.update_delivery_orders_updated_at();

-- RLS (Row Level Security) - Habilitar si es necesario
-- ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.delivery_order_items ENABLE ROW LEVEL SECURITY;

