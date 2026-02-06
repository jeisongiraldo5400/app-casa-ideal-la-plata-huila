-- ============================================================================
-- TABLA: operation_error_logs
-- Registra errores que ocurren durante operaciones de órdenes de entrega
-- y órdenes de compra, con identificación del punto exacto del error
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.operation_error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_code TEXT NOT NULL,
    error_message TEXT NOT NULL,
    module TEXT NOT NULL,
    operation TEXT NOT NULL,
    step TEXT,
    severity TEXT NOT NULL DEFAULT 'error',
    entity_type TEXT,
    entity_id UUID,
    context JSONB,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

    -- Foreign Keys
    CONSTRAINT fk_error_log_user
        FOREIGN KEY (created_by)
        REFERENCES auth.users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    -- Constraints
    CONSTRAINT check_severity
        CHECK (severity IN ('error', 'warning')),

    CONSTRAINT check_module
        CHECK (module IN ('exits', 'entries', 'purchase_orders', 'returns')),

    CONSTRAINT check_entity_type
        CHECK (entity_type IS NULL OR entity_type IN (
            'delivery_order', 'purchase_order', 'inventory_entry', 'inventory_exit'
        ))
);

-- Comentarios
COMMENT ON TABLE public.operation_error_logs IS
    'Registra errores durante operaciones de órdenes de entrega y compra';
COMMENT ON COLUMN public.operation_error_logs.error_code IS
    'Código corto del error (ej: DELIVERY_PROGRESS_FAILED, ENTRY_INSERT_FAILED)';
COMMENT ON COLUMN public.operation_error_logs.error_message IS
    'Mensaje de error raw tal como viene del sistema';
COMMENT ON COLUMN public.operation_error_logs.module IS
    'Módulo donde ocurrió: exits, entries, purchase_orders, returns';
COMMENT ON COLUMN public.operation_error_logs.operation IS
    'Operación específica: finalize_exit, finalize_entry, update_status, etc.';
COMMENT ON COLUMN public.operation_error_logs.step IS
    'Paso dentro de la operación: insert_records, rpc_update_progress, cache_refresh, validation';
COMMENT ON COLUMN public.operation_error_logs.severity IS
    'Nivel de severidad: error (crítico) o warning (no crítico)';
COMMENT ON COLUMN public.operation_error_logs.entity_type IS
    'Tipo de entidad: delivery_order, purchase_order, inventory_entry, inventory_exit';
COMMENT ON COLUMN public.operation_error_logs.entity_id IS
    'ID de la entidad principal relacionada al error';
COMMENT ON COLUMN public.operation_error_logs.context IS
    'Datos de contexto adicionales en formato JSON (product_ids, warehouse_id, quantities, etc.)';
COMMENT ON COLUMN public.operation_error_logs.created_by IS
    'Usuario que ejecutó la operación cuando ocurrió el error';

-- ============================================================================
-- Índices para mejorar rendimiento en consultas
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_error_logs_module
    ON public.operation_error_logs(module);

CREATE INDEX IF NOT EXISTS idx_error_logs_entity
    ON public.operation_error_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at
    ON public.operation_error_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_by
    ON public.operation_error_logs(created_by);

-- ============================================================================
-- Políticas RLS (Row Level Security)
-- ============================================================================

ALTER TABLE public.operation_error_logs ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios autenticados pueden ver todos los logs
CREATE POLICY "Users can view error logs"
    ON public.operation_error_logs
    FOR SELECT
    TO authenticated
    USING (true);

-- Política: Los usuarios autenticados pueden crear logs
CREATE POLICY "Users can create error logs"
    ON public.operation_error_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
