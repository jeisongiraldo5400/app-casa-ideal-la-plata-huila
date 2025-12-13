-- Migration: Create trigger to update order status when assigned to remission
--
-- Date: 2025-12-12
--
-- Description: Creates a trigger that automatically changes the status of a customer
--              delivery order to 'sent_by_remission' when it's assigned to a remission,
--              and reverts it to 'approved' when unassigned. Also creates audit records
--              in delivery_order_status_observations.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_update_order_status_on_remission_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Cuando se asigna una orden a una remisión, cambiar estado a 'sent_by_remission'
    UPDATE public.delivery_orders
    SET status = 'sent_by_remission',
        updated_at = NOW()
    WHERE id = NEW.source_delivery_order_id;
    
    -- Crear registro de auditoría
    INSERT INTO public.delivery_order_status_observations (
      delivery_order_id,
      status_action,
      observations,
      created_by
    )
    VALUES (
      NEW.source_delivery_order_id,
      'sent_by_remission',
      format('Orden asignada a remisión %s', NEW.remission_id),
      auth.uid()
    );
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Cuando se desasigna una orden de una remisión, revertir estado a 'approved'
    UPDATE public.delivery_orders
    SET status = 'approved',
        updated_at = NOW()
    WHERE id = OLD.source_delivery_order_id;
    
    -- Crear registro de auditoría
    INSERT INTO public.delivery_order_status_observations (
      delivery_order_id,
      status_action,
      observations,
      created_by
    )
    VALUES (
      OLD.source_delivery_order_id,
      'approved',
      format('Orden desasignada de remisión %s', OLD.remission_id),
      auth.uid()
    );
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create trigger for INSERT (assignment)
DROP TRIGGER IF EXISTS trg_update_status_on_remission_assignment ON public.remission_delivery_orders;

CREATE TRIGGER trg_update_status_on_remission_assignment
  AFTER INSERT OR DELETE ON public.remission_delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_order_status_on_remission_assignment();

-- Comments
COMMENT ON FUNCTION public.fn_update_order_status_on_remission_assignment() IS
  'Automatically updates the status of a customer delivery order when assigned to or unassigned from a remission. Changes status to sent_by_remission on assignment and reverts to approved on unassignment.';

COMMENT ON TRIGGER trg_update_status_on_remission_assignment ON public.remission_delivery_orders IS
  'Automatically changes order status to sent_by_remission when assigned to a remission, and reverts to approved when unassigned. Creates audit records in delivery_order_status_observations.';

-- ============================================================================
-- Migrar datos existentes: actualizar órdenes ya asignadas
-- ============================================================================

-- Actualizar el estado de todas las órdenes que ya están asignadas a remisiones
UPDATE public.delivery_orders
SET status = 'sent_by_remission',
    updated_at = NOW()
WHERE id IN (
  SELECT DISTINCT source_delivery_order_id 
  FROM public.remission_delivery_orders
)
AND status = 'approved';

-- Crear registros de auditoría para las órdenes migradas
INSERT INTO public.delivery_order_status_observations (
  delivery_order_id,
  status_action,
  observations,
  created_by
)
SELECT 
  source_delivery_order_id,
  'sent_by_remission',
  'Estado actualizado durante migración - orden ya asignada a remisión',
  NULL -- No hay usuario en migración
FROM public.remission_delivery_orders
WHERE source_delivery_order_id IN (
  SELECT id FROM public.delivery_orders WHERE status = 'sent_by_remission'
);
