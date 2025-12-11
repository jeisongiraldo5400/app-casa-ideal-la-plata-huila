-- ============================================================================
-- Migración: Agregar campo order_number a purchase_orders
-- Genera números de orden únicos y secuenciales por año (OC-YYYY-NNNN)
-- ============================================================================

-- Agregar campo order_number
ALTER TABLE public.purchase_orders 
  ADD COLUMN IF NOT EXISTS order_number TEXT;

-- Crear índice único para order_number (solo registros no eliminados)
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_order_number 
    ON public.purchase_orders(order_number) 
    WHERE order_number IS NOT NULL AND deleted_at IS NULL;

-- Función para generar el siguiente número de orden del año
CREATE OR REPLACE FUNCTION public.generate_purchase_order_number()
RETURNS TRIGGER AS $$
DECLARE
    order_year INTEGER;
    next_sequence INTEGER;
    new_order_number TEXT;
BEGIN
    -- Obtener el año de la orden
    order_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, NOW()));
    
    -- Obtener el siguiente número secuencial del año
    -- Busca el máximo número que coincida con el patrón OC-YYYY-NNNN
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(order_number FROM 'OC-\d+-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_sequence
    FROM public.purchase_orders
    WHERE order_number LIKE 'OC-' || order_year || '-%'
      AND deleted_at IS NULL;
    
    -- Generar el número de orden en formato OC-YYYY-NNNN
    new_order_number := 'OC-' || order_year || '-' || LPAD(next_sequence::TEXT, 4, '0');
    
    -- Asignar el número de orden
    NEW.order_number := new_order_number;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para generar automáticamente el número de orden
DROP TRIGGER IF EXISTS trigger_generate_purchase_order_number ON public.purchase_orders;

CREATE TRIGGER trigger_generate_purchase_order_number
    BEFORE INSERT ON public.purchase_orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL)
    EXECUTE FUNCTION public.generate_purchase_order_number();

-- Generar números de orden para órdenes existentes
DO $$
DECLARE
    order_record RECORD;
    order_year INTEGER;
    sequence_num INTEGER;
    new_order_number TEXT;
BEGIN
    -- Procesar órdenes por año, ordenadas por fecha de creación
    FOR order_record IN 
        SELECT id, created_at
        FROM public.purchase_orders
        WHERE order_number IS NULL OR order_number = '' OR order_number !~ '^OC-\d{4}-\d{4}$'
        ORDER BY created_at ASC
    LOOP
        order_year := EXTRACT(YEAR FROM COALESCE(order_record.created_at, NOW()));
        
        -- Obtener el siguiente número secuencial del año (incluyendo las ya generadas)
        SELECT COALESCE(MAX(
            CAST(SUBSTRING(order_number FROM 'OC-\d+-(\d+)') AS INTEGER)
        ), 0) + 1
        INTO sequence_num
        FROM public.purchase_orders
        WHERE order_number LIKE 'OC-' || order_year || '-%'
          AND deleted_at IS NULL;
        
        -- Generar el número de orden
        new_order_number := 'OC-' || order_year || '-' || LPAD(sequence_num::TEXT, 4, '0');
        
        -- Actualizar la orden
        UPDATE public.purchase_orders
        SET order_number = new_order_number
        WHERE id = order_record.id;
    END LOOP;
END $$;

-- Comentarios
COMMENT ON COLUMN public.purchase_orders.order_number IS 
    'Número único de orden de compra en formato OC-YYYY-NNNN (ej: OC-2024-0001). Generado automáticamente.';

COMMENT ON FUNCTION public.generate_purchase_order_number() IS 
    'Función trigger que genera automáticamente el número de orden secuencial por año al crear una nueva orden de compra.';
