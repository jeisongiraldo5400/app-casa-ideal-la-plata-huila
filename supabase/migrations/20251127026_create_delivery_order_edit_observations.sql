-- ============================================================================
-- TABLA: delivery_order_edit_observations
-- Registra observaciones y razones de cambios en órdenes de entrega
-- Similar a purchase_order_edit_observations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.delivery_order_edit_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL,
    product_id UUID NULL, -- NULL para cambios generales, UUID para cambios específicos de producto
    edit_type TEXT NOT NULL, -- Tipo de edición realizada
    previous_quantity NUMERIC NULL, -- Cantidad anterior (si aplica)
    new_quantity NUMERIC NULL, -- Cantidad nueva (si aplica)
    observations TEXT NOT NULL, -- Razón obligatoria del cambio
    created_by UUID, -- Usuario que realiza la edición
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign Keys
    CONSTRAINT fk_delivery_edit_observation_order 
        FOREIGN KEY (delivery_order_id) 
        REFERENCES public.delivery_orders(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_delivery_edit_observation_product 
        FOREIGN KEY (product_id) 
        REFERENCES public.products(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_delivery_edit_observation_user 
        FOREIGN KEY (created_by) 
        REFERENCES auth.users(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE,
    
    -- Constraint: Validar tipos de edición
    CONSTRAINT check_delivery_edit_type 
        CHECK (edit_type IN (
            'item_added', 
            'item_removed', 
            'item_quantity_changed', 
            'item_quantity_reduced',
            'item_quantity_increased',
            'order_updated'
        )),
    
    -- Constraint: Si es cambio de cantidad, debe tener previous y new
    CONSTRAINT check_delivery_quantity_change 
        CHECK (
            (edit_type NOT LIKE '%quantity%') OR 
            (previous_quantity IS NOT NULL AND new_quantity IS NOT NULL)
        )
);

-- Comentarios en la tabla
COMMENT ON TABLE public.delivery_order_edit_observations IS 
    'Registra observaciones y razones de cambios realizados en órdenes de entrega';
COMMENT ON COLUMN public.delivery_order_edit_observations.delivery_order_id IS 
    'Referencia a la orden de entrega que fue editada';
COMMENT ON COLUMN public.delivery_order_edit_observations.product_id IS 
    'Referencia al producto afectado (NULL para cambios generales de la orden)';
COMMENT ON COLUMN public.delivery_order_edit_observations.edit_type IS 
    'Tipo de edición: item_added, item_removed, item_quantity_reduced, item_quantity_increased, item_quantity_changed, order_updated';
COMMENT ON COLUMN public.delivery_order_edit_observations.previous_quantity IS 
    'Cantidad anterior del producto (si aplica al tipo de edición)';
COMMENT ON COLUMN public.delivery_order_edit_observations.new_quantity IS 
    'Cantidad nueva del producto (si aplica al tipo de edición)';
COMMENT ON COLUMN public.delivery_order_edit_observations.observations IS 
    'Razón obligatoria por la cual se realizó el cambio';
COMMENT ON COLUMN public.delivery_order_edit_observations.created_by IS 
    'Usuario que realizó la edición';

-- ============================================================================
-- ÍNDICES PARA MEJORAR RENDIMIENTO
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_delivery_edit_observations_order_id 
    ON public.delivery_order_edit_observations(delivery_order_id);

CREATE INDEX IF NOT EXISTS idx_delivery_edit_observations_product_id 
    ON public.delivery_order_edit_observations(product_id) 
    WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_edit_observations_created_at 
    ON public.delivery_order_edit_observations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_edit_observations_created_by 
    ON public.delivery_order_edit_observations(created_by);

-- ============================================================================
-- FUNCIÓN PARA ACTUALIZAR updated_at AUTOMÁTICAMENTE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_delivery_order_edit_observation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at automáticamente
CREATE TRIGGER trigger_update_delivery_edit_observation_updated_at
    BEFORE UPDATE ON public.delivery_order_edit_observations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_delivery_order_edit_observation_updated_at();

-- ============================================================================
-- POLÍTICAS RLS (Row Level Security)
-- ============================================================================

-- Habilitar RLS en la tabla
ALTER TABLE public.delivery_order_edit_observations ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios autenticados pueden ver todas las observaciones
CREATE POLICY "Users can view delivery edit observations"
    ON public.delivery_order_edit_observations
    FOR SELECT
    TO authenticated
    USING (true);

-- Política: Los usuarios autenticados pueden crear observaciones
CREATE POLICY "Users can create delivery edit observations"
    ON public.delivery_order_edit_observations
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Política: Solo el usuario que creó la observación puede actualizarla
CREATE POLICY "Users can update own delivery edit observations"
    ON public.delivery_order_edit_observations
    FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

