-- ============================================================================
-- TABLA: delivery_order_status_observations
-- Registra observaciones obligatorias para cambios de estado en órdenes de entrega
-- Similar a purchase_order_status_observations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.delivery_order_status_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL,
    status_action TEXT NOT NULL, -- 'cancelled', 'received', 'approved'
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    observations TEXT NOT NULL, -- Obligatorio
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign Keys
    CONSTRAINT fk_delivery_status_observation_order 
        FOREIGN KEY (delivery_order_id) 
        REFERENCES public.delivery_orders(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_delivery_status_observation_user 
        FOREIGN KEY (created_by) 
        REFERENCES auth.users(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE,
    
    -- Constraint: Validar acciones de estado
    CONSTRAINT check_delivery_status_action 
        CHECK (status_action IN ('cancelled', 'received', 'approved'))
);

-- Comentarios
COMMENT ON TABLE public.delivery_order_status_observations IS 
    'Registra observaciones obligatorias para cambios de estado en órdenes de entrega';
COMMENT ON COLUMN public.delivery_order_status_observations.status_action IS 
    'Tipo de acción: cancelled (Cancelada), received (Recibida), approved (Aprobada)';
COMMENT ON COLUMN public.delivery_order_status_observations.observations IS 
    'Razón obligatoria por la cual se realiza el cambio de estado';

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_delivery_status_observations_order_id 
    ON public.delivery_order_status_observations(delivery_order_id);

CREATE INDEX IF NOT EXISTS idx_delivery_status_observations_action 
    ON public.delivery_order_status_observations(status_action);

CREATE INDEX IF NOT EXISTS idx_delivery_status_observations_created_at 
    ON public.delivery_order_status_observations(created_at DESC);

-- ============================================================================
-- Función para actualizar updated_at automáticamente
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_delivery_status_observation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_delivery_status_observation_updated_at
    BEFORE UPDATE ON public.delivery_order_status_observations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_delivery_status_observation_updated_at();

-- ============================================================================
-- Políticas RLS (Row Level Security)
-- ============================================================================

ALTER TABLE public.delivery_order_status_observations ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios autenticados pueden ver todas las observaciones
CREATE POLICY "Users can view delivery status observations"
    ON public.delivery_order_status_observations
    FOR SELECT
    TO authenticated
    USING (true);

-- Política: Los usuarios autenticados pueden crear observaciones
CREATE POLICY "Users can create delivery status observations"
    ON public.delivery_order_status_observations
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Política: Solo el usuario que creó la observación puede actualizarla
CREATE POLICY "Users can update own delivery status observations"
    ON public.delivery_order_status_observations
    FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

