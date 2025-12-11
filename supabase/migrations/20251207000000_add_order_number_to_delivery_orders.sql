-- ============================================================================
-- Migración: Agregar campo order_number a delivery_orders
-- Genera números de orden únicos y secuenciales por año (OE-YYYY-NNNN)
-- ============================================================================

-- Agregar campo order_number
ALTER TABLE public.delivery_orders 
  ADD COLUMN IF NOT EXISTS order_number TEXT;

-- Crear índice único para order_number (solo registros no eliminados)
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_orders_order_number 
    ON public.delivery_orders(order_number) 
    WHERE order_number IS NOT NULL AND deleted_at IS NULL;

-- Función para generar el siguiente número de orden del año
CREATE OR REPLACE FUNCTION public.generate_delivery_order_number()
RETURNS TRIGGER AS $$
DECLARE
    order_year INTEGER;
    next_sequence INTEGER;
    new_order_number TEXT;
BEGIN
    -- Obtener el año de la orden
    order_year := EXTRACT(YEAR FROM NEW.created_at);
    
    -- Obtener el siguiente número secuencial del año
    -- Busca el máximo número que coincida con el patrón OE-YYYY-NNNN
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(order_number FROM 'OE-\d+-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_sequence
    FROM public.delivery_orders
    WHERE order_number LIKE 'OE-' || order_year || '-%'
      AND deleted_at IS NULL;
    
    -- Generar el número de orden en formato OE-YYYY-NNNN
    new_order_number := 'OE-' || order_year || '-' || LPAD(next_sequence::TEXT, 4, '0');
    
    -- Asignar el número de orden
    NEW.order_number := new_order_number;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para generar automáticamente el número de orden
DROP TRIGGER IF EXISTS trigger_generate_delivery_order_number ON public.delivery_orders;

CREATE TRIGGER trigger_generate_delivery_order_number
    BEFORE INSERT ON public.delivery_orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL)
    EXECUTE FUNCTION public.generate_delivery_order_number();

-- Generar números de orden para órdenes existentes
DO $$
DECLARE
    order_record RECORD;
    order_year INTEGER;
    sequence_num INTEGER;
    new_order_number TEXT;
    year_sequences RECORD;
BEGIN
    -- Procesar órdenes por año, ordenadas por fecha de creación
    FOR order_record IN 
        SELECT id, created_at
        FROM public.delivery_orders
        WHERE order_number IS NULL OR order_number = '' OR order_number !~ '^OE-\d{4}-\d{4}$'
        ORDER BY created_at ASC
    LOOP
        order_year := EXTRACT(YEAR FROM order_record.created_at);
        
        -- Obtener el siguiente número secuencial del año (incluyendo las ya generadas)
        SELECT COALESCE(MAX(
            CAST(SUBSTRING(order_number FROM 'OE-\d+-(\d+)') AS INTEGER)
        ), 0) + 1
        INTO sequence_num
        FROM public.delivery_orders
        WHERE order_number LIKE 'OE-' || order_year || '-%'
          AND deleted_at IS NULL;
        
        -- Generar el número de orden
        new_order_number := 'OE-' || order_year || '-' || LPAD(sequence_num::TEXT, 4, '0');
        
        -- Actualizar la orden
        UPDATE public.delivery_orders
        SET order_number = new_order_number
        WHERE id = order_record.id;
    END LOOP;
END $$;

-- Comentarios
COMMENT ON COLUMN public.delivery_orders.order_number IS 
    'Número único de orden de entrega en formato OE-YYYY-NNNN (ej: OE-2024-0001). Generado automáticamente.';

COMMENT ON FUNCTION public.generate_delivery_order_number() IS 
    'Función trigger que genera automáticamente el número de orden secuencial por año al crear una nueva orden de entrega.';
