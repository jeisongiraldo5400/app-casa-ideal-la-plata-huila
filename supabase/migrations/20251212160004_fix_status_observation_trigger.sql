-- Migration: Fix trigger to include previous_status and new_status
--
-- Date: 2025-12-12
--
-- Description: Updates the trigger function to properly populate previous_status
--              and new_status columns when creating status observation records.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_update_order_status_on_remission_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_previous_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Obtener el estado actual antes de cambiarlo
    SELECT status INTO v_previous_status
    FROM public.delivery_orders
    WHERE id = NEW.source_delivery_order_id;
    
    -- Cuando se asigna una orden a una remisión, cambiar estado a 'sent_by_remission'
    UPDATE public.delivery_orders
    SET status = 'sent_by_remission',
        updated_at = NOW()
    WHERE id = NEW.source_delivery_order_id;
    
    -- Crear registro de auditoría con previous_status y new_status
    INSERT INTO public.delivery_order_status_observations (
      delivery_order_id,
      status_action,
      previous_status,
      new_status,
      observations,
      created_by
    )
    VALUES (
      NEW.source_delivery_order_id,
      'sent_by_remission',
      v_previous_status,
      'sent_by_remission',
      format('Orden asignada a remisión %s', NEW.remission_id),
      auth.uid()
    );
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Obtener el estado actual antes de cambiarlo
    SELECT status INTO v_previous_status
    FROM public.delivery_orders
    WHERE id = OLD.source_delivery_order_id;
    
    -- Cuando se desasigna una orden de una remisión, revertir estado a 'approved'
    UPDATE public.delivery_orders
    SET status = 'approved',
        updated_at = NOW()
    WHERE id = OLD.source_delivery_order_id;
    
    -- Crear registro de auditoría con previous_status y new_status
    INSERT INTO public.delivery_order_status_observations (
      delivery_order_id,
      status_action,
      previous_status,
      new_status,
      observations,
      created_by
    )
    VALUES (
      OLD.source_delivery_order_id,
      'approved',
      v_previous_status,
      'approved',
      format('Orden desasignada de remisión %s', OLD.remission_id),
      auth.uid()
    );
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Comment
COMMENT ON FUNCTION public.fn_update_order_status_on_remission_assignment() IS
  'Automatically updates the status of a customer delivery order when assigned to or unassigned from a remission. Changes status to sent_by_remission on assignment and reverts to approved on unassignment. Properly tracks previous_status and new_status.';
