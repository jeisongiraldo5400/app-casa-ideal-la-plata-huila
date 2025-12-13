-- ============================================================================
-- TABLA: zones
-- Descripción: Tabla para registrar las zonas del sistema
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_zones_name 
    ON public.zones(name);

CREATE INDEX IF NOT EXISTS idx_zones_created_at 
    ON public.zones(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_zones_deleted_at 
    ON public.zones(deleted_at)
    WHERE deleted_at IS NULL;

-- Índice único para nombres de zonas (solo registros no eliminados)
CREATE UNIQUE INDEX IF NOT EXISTS idx_zones_name_unique 
    ON public.zones(LOWER(TRIM(name))) 
    WHERE deleted_at IS NULL;

-- Comentarios
COMMENT ON TABLE public.zones IS 
    'Tabla para registrar las zonas disponibles en el sistema';

COMMENT ON COLUMN public.zones.name IS 
    'Nombre de la zona (ej: Zona Norte, Zona Sur, Zona Centro, etc.)';

COMMENT ON COLUMN public.zones.deleted_at IS 
    'Fecha de eliminación lógica de la zona. NULL si la zona está activa';

-- ============================================================================
-- FUNCIÓN PARA ACTUALIZAR updated_at AUTOMÁTICAMENTE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_zones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at automáticamente
CREATE TRIGGER trigger_update_zones_updated_at
    BEFORE UPDATE ON public.zones
    FOR EACH ROW
    EXECUTE FUNCTION public.update_zones_updated_at();
