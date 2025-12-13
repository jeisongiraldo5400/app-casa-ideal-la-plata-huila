-- ============================================================================
-- TABLA: colors
-- Descripción: Tabla para registrar los colores de los productos
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.colors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_colors_name 
    ON public.colors(name);

CREATE INDEX IF NOT EXISTS idx_colors_created_at 
    ON public.colors(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_colors_deleted_at 
    ON public.colors(deleted_at)
    WHERE deleted_at IS NULL;

-- Índice único para nombres de colores (solo registros no eliminados)
CREATE UNIQUE INDEX IF NOT EXISTS idx_colors_name_unique 
    ON public.colors(LOWER(TRIM(name))) 
    WHERE deleted_at IS NULL;

-- Comentarios
COMMENT ON TABLE public.colors IS 
    'Tabla para registrar los colores disponibles para los productos';

COMMENT ON COLUMN public.colors.name IS 
    'Nombre del color del producto (ej: Rojo, Azul, Verde, etc.)';

COMMENT ON COLUMN public.colors.deleted_at IS 
    'Fecha de eliminación lógica del color. NULL si el color está activo';

-- ============================================================================
-- FUNCIÓN PARA ACTUALIZAR updated_at AUTOMÁTICAMENTE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_colors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at automáticamente
CREATE TRIGGER trigger_update_colors_updated_at
    BEFORE UPDATE ON public.colors
    FOR EACH ROW
    EXECUTE FUNCTION public.update_colors_updated_at();
