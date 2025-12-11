-- Migration: Add trigger to validate inventory entry quantities against purchase orders

-- Date: 2025-12-10

-- Description: Prevents registering inventory entries that exceed purchase order quantities

--              This is a critical safeguard against data integrity issues



-- ============================================================================

-- Function: validate_inventory_entry_quantity

-- Description: Validates that an inventory entry does not exceed the purchase order

--              quantity for the product. This function is called by a trigger BEFORE

--              inserting into inventory_entries.

-- ============================================================================

CREATE OR REPLACE FUNCTION validate_inventory_entry_quantity()

RETURNS TRIGGER

LANGUAGE plpgsql

AS $$

DECLARE

  order_item_quantity INTEGER;

  total_registered INTEGER;

  order_status TEXT;

  order_exists BOOLEAN;

BEGIN

  -- Solo validar si hay una orden de compra asociada

  IF NEW.purchase_order_id IS NULL THEN

    RETURN NEW;

  END IF;



  -- Verificar que la orden existe y obtener su estado

  SELECT 

    po.status,

    EXISTS(SELECT 1 FROM purchase_orders WHERE id = NEW.purchase_order_id AND deleted_at IS NULL)

  INTO order_status, order_exists

  FROM purchase_orders po

  WHERE po.id = NEW.purchase_order_id

    AND po.deleted_at IS NULL;



  IF NOT order_exists THEN

    RAISE EXCEPTION 'La orden de compra % no existe o ha sido eliminada', NEW.purchase_order_id;

  END IF;



  -- Verificar que la orden esté en estado válido (pending)

  -- Solo para entradas con tipo PO_ENTRY, pero validamos cantidades siempre

  IF NEW.entry_type = 'PO_ENTRY' AND order_status != 'pending' THEN

    RAISE EXCEPTION 'La orden de compra % no está en estado pendiente (estado actual: %). No se pueden registrar más entradas.', 

      NEW.purchase_order_id, order_status;

  END IF;



  -- Obtener la cantidad ordenada para este producto en la orden

  SELECT quantity

  INTO order_item_quantity

  FROM purchase_order_items

  WHERE purchase_order_id = NEW.purchase_order_id

    AND product_id = NEW.product_id;



  -- Si no hay item en la orden para este producto, rechazar

  IF order_item_quantity IS NULL THEN

    RAISE EXCEPTION 'El producto % no está incluido en la orden de compra %', 

      NEW.product_id, NEW.purchase_order_id;

  END IF;



  -- Calcular la cantidad total ya registrada para este producto en esta orden

  -- Sumar todas las entradas existentes (excluyendo la actual si es un UPDATE)

  SELECT COALESCE(SUM(quantity), 0)

  INTO total_registered

  FROM inventory_entries

  WHERE purchase_order_id = NEW.purchase_order_id

    AND product_id = NEW.product_id

    AND (TG_OP = 'INSERT' OR id != NEW.id); -- Excluir la fila actual si es UPDATE



  -- Verificar que la cantidad total (incluyendo la nueva entrada) no exceda la ordenada

  IF (total_registered + NEW.quantity) > order_item_quantity THEN

    RAISE EXCEPTION 

      'La cantidad excede lo permitido para este producto en la orden de compra. Cantidad en orden: %, Ya registrado: %, Intentando registrar: %, Total después de esta entrada: %',

      order_item_quantity, 

      total_registered, 

      NEW.quantity,

      total_registered + NEW.quantity;

  END IF;



  RETURN NEW;

END;

$$;



-- Add comment for documentation

COMMENT ON FUNCTION validate_inventory_entry_quantity() IS 

  'Validates that inventory entries do not exceed purchase order quantities. Called by trigger before insert/update.';



-- ============================================================================

-- Trigger: trg_validate_inventory_entry_quantity

-- Description: Triggers validation before inserting or updating inventory_entries

-- ============================================================================

DROP TRIGGER IF EXISTS trg_validate_inventory_entry_quantity ON inventory_entries;



CREATE TRIGGER trg_validate_inventory_entry_quantity

  BEFORE INSERT OR UPDATE ON inventory_entries

  FOR EACH ROW

  WHEN (NEW.purchase_order_id IS NOT NULL)

  EXECUTE FUNCTION validate_inventory_entry_quantity();



-- Add comment for documentation

COMMENT ON TRIGGER trg_validate_inventory_entry_quantity ON inventory_entries IS 

  'Validates inventory entry quantities against purchase orders before insert/update. Prevents exceeding ordered quantities.';
