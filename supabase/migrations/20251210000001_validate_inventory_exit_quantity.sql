-- Migration: Add trigger to validate inventory exit quantities against delivery orders

-- Date: 2025-12-10

-- Description: Prevents registering inventory exits that exceed delivery order quantities

--              This is a critical safeguard against data integrity issues



-- ============================================================================

-- Function: validate_inventory_exit_quantity

-- Description: Validates that an inventory exit does not exceed the delivery order

--              quantity for the product. This function is called by a trigger BEFORE

--              inserting into inventory_exits.

-- ============================================================================

CREATE OR REPLACE FUNCTION validate_inventory_exit_quantity()

RETURNS TRIGGER

LANGUAGE plpgsql

AS $$

DECLARE

  order_item_quantity NUMERIC;

  total_dispatched NUMERIC;

  order_status TEXT;

  order_exists BOOLEAN;

BEGIN

  -- Solo validar si hay una orden de entrega asociada

  IF NEW.delivery_order_id IS NULL THEN

    RETURN NEW;

  END IF;



  -- Verificar que la orden existe y obtener su estado

  SELECT 

    dord.status,

    EXISTS(SELECT 1 FROM delivery_orders WHERE id = NEW.delivery_order_id AND deleted_at IS NULL)

  INTO order_status, order_exists

  FROM delivery_orders dord

  WHERE dord.id = NEW.delivery_order_id

    AND dord.deleted_at IS NULL;



  IF NOT order_exists THEN

    RAISE EXCEPTION 'La orden de entrega % no existe o ha sido eliminada', NEW.delivery_order_id;

  END IF;



  -- Verificar que la orden esté en estado válido (no cancelada)

  IF order_status = 'cancelled' THEN

    RAISE EXCEPTION 'La orden de entrega % está cancelada. No se pueden registrar más salidas.', 

      NEW.delivery_order_id;

  END IF;



  -- Obtener la cantidad solicitada para este producto en la orden y bodega específica

  SELECT quantity

  INTO order_item_quantity

  FROM delivery_order_items

  WHERE delivery_order_id = NEW.delivery_order_id

    AND product_id = NEW.product_id

    AND warehouse_id = NEW.warehouse_id;



  -- Si no hay item en la orden para este producto en esta bodega, rechazar

  IF order_item_quantity IS NULL THEN

    RAISE EXCEPTION 'El producto % no está incluido en la orden de entrega % para la bodega %', 

      NEW.product_id, NEW.delivery_order_id, NEW.warehouse_id;

  END IF;



  -- Calcular la cantidad total ya despachada para este producto en esta orden y bodega

  -- Sumar todas las salidas existentes (excluyendo la actual si es un UPDATE)

  SELECT COALESCE(SUM(quantity), 0)

  INTO total_dispatched

  FROM inventory_exits

  WHERE delivery_order_id = NEW.delivery_order_id

    AND product_id = NEW.product_id

    AND warehouse_id = NEW.warehouse_id

    AND (TG_OP = 'INSERT' OR id != NEW.id); -- Excluir la fila actual si es UPDATE



  -- Verificar que la cantidad total (incluyendo la nueva salida) no exceda la solicitada

  IF (total_dispatched + NEW.quantity) > order_item_quantity THEN

    RAISE EXCEPTION 

      'La cantidad excede lo permitido para este producto en la orden de entrega. Cantidad en orden: %, Ya despachado: %, Intentando despachar: %, Total después de esta salida: %',

      order_item_quantity, 

      total_dispatched, 

      NEW.quantity,

      total_dispatched + NEW.quantity;

  END IF;



  RETURN NEW;

END;

$$;



-- Add comment for documentation

COMMENT ON FUNCTION validate_inventory_exit_quantity() IS 

  'Validates that inventory exits do not exceed delivery order quantities. Called by trigger before insert/update.';



-- ============================================================================

-- Trigger: trg_validate_inventory_exit_quantity

-- Description: Triggers validation before inserting or updating inventory_exits

-- ============================================================================

DROP TRIGGER IF EXISTS trg_validate_inventory_exit_quantity ON inventory_exits;



CREATE TRIGGER trg_validate_inventory_exit_quantity

  BEFORE INSERT OR UPDATE ON inventory_exits

  FOR EACH ROW

  WHEN (NEW.delivery_order_id IS NOT NULL)

  EXECUTE FUNCTION validate_inventory_exit_quantity();



-- Add comment for documentation

COMMENT ON TRIGGER trg_validate_inventory_exit_quantity ON inventory_exits IS 

  'Validates inventory exit quantities against delivery orders before insert/update. Prevents exceeding ordered quantities.';
