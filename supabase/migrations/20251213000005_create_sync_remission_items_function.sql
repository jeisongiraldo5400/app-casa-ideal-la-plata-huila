-- Migration: Create function to sync remission items when source orders are edited
--
-- Date: 2025-12-13
--
-- Description: Creates a trigger function that automatically synchronizes items in remissions
--              when the source delivery orders (customer orders) are edited. This ensures
--              that remission items stay in sync with their source orders.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_remission_items_on_order_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  remission_record RECORD;
  existing_item RECORD;
BEGIN
  -- Solo procesar items que NO tienen source_delivery_order_id (son items originales)
  -- Los items con source_delivery_order_id son copias y no deben disparar sincronización
  IF (TG_OP = 'DELETE' AND OLD.source_delivery_order_id IS NOT NULL) OR
     (TG_OP IN ('INSERT', 'UPDATE') AND NEW.source_delivery_order_id IS NOT NULL) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Cuando se eliminan items de una orden original,
  -- eliminar también los items copiados en remisiones
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.delivery_order_items
    WHERE source_delivery_order_id = OLD.delivery_order_id
      AND product_id = OLD.product_id
      AND warehouse_id = OLD.warehouse_id;
    RETURN OLD;
  END IF;
  
  -- Cuando se insertan/actualizan items de una orden original,
  -- sincronizar items copiados en remisiones
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    -- Buscar todas las remisiones que tienen esta orden asignada
    FOR remission_record IN
      SELECT remission_id
      FROM public.remission_delivery_orders
      WHERE source_delivery_order_id = NEW.delivery_order_id
    LOOP
      -- Verificar si ya existe un item copiado para este producto/bodega en esta remisión
      SELECT * INTO existing_item
      FROM public.delivery_order_items
      WHERE delivery_order_id = remission_record.remission_id
        AND product_id = NEW.product_id
        AND warehouse_id = NEW.warehouse_id
        AND source_delivery_order_id = NEW.delivery_order_id
      LIMIT 1;

      IF FOUND THEN
        -- Actualizar item existente
        UPDATE public.delivery_order_items
        SET quantity = NEW.quantity,
            delivered_quantity = NEW.delivered_quantity
        WHERE id = existing_item.id;
      ELSE
        -- Insertar nuevo item copiado
        INSERT INTO public.delivery_order_items (
          delivery_order_id,
          product_id,
          quantity,
          warehouse_id,
          delivered_quantity,
          source_delivery_order_id
        )
        VALUES (
          remission_record.remission_id,
          NEW.product_id,
          NEW.quantity,
          NEW.warehouse_id,
          NEW.delivered_quantity,
          NEW.delivery_order_id
        );
      END IF;
    END LOOP;
      
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_sync_remission_items_on_order_edit ON public.delivery_order_items;

CREATE TRIGGER trg_sync_remission_items_on_order_edit
  AFTER INSERT OR UPDATE OR DELETE ON public.delivery_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_remission_items_on_order_edit();

-- Comments
COMMENT ON FUNCTION public.fn_sync_remission_items_on_order_edit() IS 
  'Synchronizes items in remissions when source delivery orders (customer orders) are edited. Automatically updates or deletes copied items in remissions when the source order items change.';

COMMENT ON TRIGGER trg_sync_remission_items_on_order_edit ON public.delivery_order_items IS 
  'Automatically synchronizes remission items when source order items are inserted, updated, or deleted. Ensures remission items stay in sync with their source orders.';
