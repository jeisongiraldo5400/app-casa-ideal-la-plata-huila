-- Migration: Create remission_delivery_orders table
--
-- Date: 2025-12-13
--
-- Description: Creates a junction table to relate remissions (delivery_orders with order_type='remission')
--              with customer delivery orders (order_type='customer'). This allows remissions to include
--              items from existing customer orders without duplicating stock reservations.
--
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.remission_delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remission_id UUID NOT NULL, -- delivery_order con order_type='remission'
  source_delivery_order_id UUID NOT NULL, -- delivery_order con order_type='customer'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_remission_delivery_orders_remission
    FOREIGN KEY (remission_id)
    REFERENCES public.delivery_orders(id)
    ON DELETE CASCADE,
    
  CONSTRAINT fk_remission_delivery_orders_source
    FOREIGN KEY (source_delivery_order_id)
    REFERENCES public.delivery_orders(id)
    ON DELETE RESTRICT,
    
  UNIQUE(remission_id, source_delivery_order_id)
);

-- Función para validar tipos de orden usando trigger (no se puede usar subquery en CHECK)
CREATE OR REPLACE FUNCTION public.fn_validate_remission_delivery_order_types()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  remission_type text;
  source_type text;
BEGIN
  -- Validar que remission_id sea de tipo 'remission'
  SELECT order_type INTO remission_type
  FROM public.delivery_orders
  WHERE id = NEW.remission_id;
  
  IF remission_type IS NULL THEN
    RAISE EXCEPTION 'La remisión con id % no existe', NEW.remission_id;
  END IF;
  
  IF remission_type != 'remission' THEN
    RAISE EXCEPTION 'El remission_id debe referenciar una orden de tipo ''remission'', pero se encontró tipo ''%''', remission_type;
  END IF;
  
  -- Validar que source_delivery_order_id sea de tipo 'customer'
  SELECT order_type INTO source_type
  FROM public.delivery_orders
  WHERE id = NEW.source_delivery_order_id;
  
  IF source_type IS NULL THEN
    RAISE EXCEPTION 'La orden fuente con id % no existe', NEW.source_delivery_order_id;
  END IF;
  
  IF source_type != 'customer' THEN
    RAISE EXCEPTION 'El source_delivery_order_id debe referenciar una orden de tipo ''customer'', pero se encontró tipo ''%''', source_type;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger para validar tipos antes de insertar o actualizar
CREATE TRIGGER trg_validate_remission_delivery_order_types
  BEFORE INSERT OR UPDATE ON public.remission_delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_remission_delivery_order_types();

CREATE INDEX IF NOT EXISTS idx_remission_delivery_orders_remission_id 
  ON public.remission_delivery_orders(remission_id);
  
CREATE INDEX IF NOT EXISTS idx_remission_delivery_orders_source_id 
  ON public.remission_delivery_orders(source_delivery_order_id);

-- Comments
COMMENT ON TABLE public.remission_delivery_orders IS 
  'Relación entre remisiones y órdenes de entrega de clientes. Permite asignar órdenes de cliente a remisiones.';

COMMENT ON COLUMN public.remission_delivery_orders.remission_id IS 
  'ID de la remisión (delivery_order con order_type=''remission'')';

COMMENT ON COLUMN public.remission_delivery_orders.source_delivery_order_id IS 
  'ID de la orden de entrega de cliente asignada (delivery_order con order_type=''customer'')';

COMMENT ON FUNCTION public.fn_validate_remission_delivery_order_types() IS 
  'Valida que remission_id sea de tipo ''remission'' y source_delivery_order_id sea de tipo ''customer''. Llamado por trigger antes de insertar o actualizar.';

COMMENT ON TRIGGER trg_validate_remission_delivery_order_types ON public.remission_delivery_orders IS 
  'Valida los tipos de orden antes de insertar o actualizar relaciones remisión-órdenes.';
