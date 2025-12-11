-- =====================================================
-- TABLAS DE CANCELACIÓN DE INVENTARIO
-- =====================================================
-- Este script crea las tablas para cancelar entradas y salidas de inventario
-- con sus respectivas relaciones y restricciones
-- =====================================================

-- =====================================================
-- 1. TABLA: inventory_entry_cancellations
-- =====================================================
-- Almacena las cancelaciones de entradas de inventario
CREATE TABLE IF NOT EXISTS public.inventory_entry_cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_entry_id UUID NOT NULL,
    observations TEXT NOT NULL, -- Campo obligatorio: razón de la cancelación
    created_by UUID, -- Usuario que realiza la cancelación
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: Una entrada solo puede cancelarse una vez
    CONSTRAINT unique_entry_cancellation UNIQUE (inventory_entry_id),
    
    -- Foreign Keys
    CONSTRAINT fk_entry_cancellation_entry 
        FOREIGN KEY (inventory_entry_id) 
        REFERENCES public.inventory_entries(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_entry_cancellation_user 
        FOREIGN KEY (created_by) 
        REFERENCES auth.users(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE
);

-- Comentarios en la tabla
COMMENT ON TABLE public.inventory_entry_cancellations IS 
    'Registra las cancelaciones de entradas de inventario con la razón obligatoria';
COMMENT ON COLUMN public.inventory_entry_cancellations.inventory_entry_id IS 
    'Referencia a la entrada de inventario que se cancela';
COMMENT ON COLUMN public.inventory_entry_cancellations.observations IS 
    'Razón obligatoria por la cual se cancela la entrada';
COMMENT ON COLUMN public.inventory_entry_cancellations.created_by IS 
    'Usuario que realiza la cancelación';

-- =====================================================
-- 2. TABLA: inventory_exit_cancellations
-- =====================================================
-- Almacena las cancelaciones de salidas de inventario
CREATE TABLE IF NOT EXISTS public.inventory_exit_cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_exit_id UUID NOT NULL,
    observations TEXT NOT NULL, -- Campo obligatorio: razón de la cancelación
    created_by UUID, -- Usuario que realiza la cancelación
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: Una salida solo puede cancelarse una vez
    CONSTRAINT unique_exit_cancellation UNIQUE (inventory_exit_id),
    
    -- Foreign Keys
    CONSTRAINT fk_exit_cancellation_exit 
        FOREIGN KEY (inventory_exit_id) 
        REFERENCES public.inventory_exits(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_exit_cancellation_user 
        FOREIGN KEY (created_by) 
        REFERENCES auth.users(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE
);

-- Comentarios en la tabla
COMMENT ON TABLE public.inventory_exit_cancellations IS 
    'Registra las cancelaciones de salidas de inventario con la razón obligatoria';
COMMENT ON COLUMN public.inventory_exit_cancellations.inventory_exit_id IS 
    'Referencia a la salida de inventario que se cancela';
COMMENT ON COLUMN public.inventory_exit_cancellations.observations IS 
    'Razón obligatoria por la cual se cancela la salida';
COMMENT ON COLUMN public.inventory_exit_cancellations.created_by IS 
    'Usuario que realiza la cancelación';

-- =====================================================
-- 3. ÍNDICES PARA MEJORAR RENDIMIENTO
-- =====================================================

-- Índices para búsquedas rápidas por entrada/salida
CREATE INDEX IF NOT EXISTS idx_entry_cancellations_entry_id 
    ON public.inventory_entry_cancellations(inventory_entry_id);

CREATE INDEX IF NOT EXISTS idx_entry_cancellations_created_by 
    ON public.inventory_entry_cancellations(created_by);

CREATE INDEX IF NOT EXISTS idx_entry_cancellations_created_at 
    ON public.inventory_entry_cancellations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exit_cancellations_exit_id 
    ON public.inventory_exit_cancellations(inventory_exit_id);

CREATE INDEX IF NOT EXISTS idx_exit_cancellations_created_by 
    ON public.inventory_exit_cancellations(created_by);

CREATE INDEX IF NOT EXISTS idx_exit_cancellations_created_at 
    ON public.inventory_exit_cancellations(created_at DESC);

-- =====================================================
-- 4. FUNCIÓN PARA ACTUALIZAR updated_at AUTOMÁTICAMENTE
-- =====================================================

-- Función para actualizar updated_at en cancelaciones de entradas
CREATE OR REPLACE FUNCTION public.update_entry_cancellation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función para actualizar updated_at en cancelaciones de salidas
CREATE OR REPLACE FUNCTION public.update_exit_cancellation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updated_at automáticamente
CREATE TRIGGER trigger_update_entry_cancellation_updated_at
    BEFORE UPDATE ON public.inventory_entry_cancellations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_entry_cancellation_updated_at();

CREATE TRIGGER trigger_update_exit_cancellation_updated_at
    BEFORE UPDATE ON public.inventory_exit_cancellations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_exit_cancellation_updated_at();

-- =====================================================
-- 5. POLÍTICAS RLS (Row Level Security)
-- =====================================================

-- Habilitar RLS en las tablas
ALTER TABLE public.inventory_entry_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_exit_cancellations ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios autenticados pueden ver todas las cancelaciones
CREATE POLICY "Users can view entry cancellations"
    ON public.inventory_entry_cancellations
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can view exit cancellations"
    ON public.inventory_exit_cancellations
    FOR SELECT
    TO authenticated
    USING (true);

-- Política: Los usuarios autenticados pueden crear cancelaciones
CREATE POLICY "Users can create entry cancellations"
    ON public.inventory_entry_cancellations
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Users can create exit cancellations"
    ON public.inventory_exit_cancellations
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Política: Solo el usuario que creó la cancelación puede actualizarla
CREATE POLICY "Users can update own entry cancellations"
    ON public.inventory_entry_cancellations
    FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own exit cancellations"
    ON public.inventory_exit_cancellations
    FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- =====================================================
-- 6. VISTAS ÚTILES (OPCIONAL)
-- =====================================================

-- Vista: Entradas canceladas con información relacionada
CREATE OR REPLACE VIEW public.v_cancelled_entries AS
SELECT 
    ec.id AS cancellation_id,
    ec.inventory_entry_id,
    ec.observations,
    ec.created_by AS cancelled_by,
    ec.created_at AS cancelled_at,
    e.product_id,
    e.warehouse_id,
    e.quantity,
    e.entry_type,
    e.created_at AS entry_created_at,
    e.created_by AS entry_created_by
FROM public.inventory_entry_cancellations ec
INNER JOIN public.inventory_entries e ON e.id = ec.inventory_entry_id;

COMMENT ON VIEW public.v_cancelled_entries IS 
    'Vista que muestra las entradas canceladas con información relacionada';

-- Vista: Salidas canceladas con información relacionada
CREATE OR REPLACE VIEW public.v_cancelled_exits AS
SELECT 
    ec.id AS cancellation_id,
    ec.inventory_exit_id,
    ec.observations,
    ec.created_by AS cancelled_by,
    ec.created_at AS cancelled_at,
    e.product_id,
    e.warehouse_id,
    e.quantity,
    e.created_at AS exit_created_at,
    e.created_by AS exit_created_by
FROM public.inventory_exit_cancellations ec
INNER JOIN public.inventory_exits e ON e.id = ec.inventory_exit_id;

COMMENT ON VIEW public.v_cancelled_exits IS 
    'Vista que muestra las salidas canceladas con información relacionada';

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================

