


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."adjust_product_stock"("p_product_id" "uuid", "p_warehouse_id" "uuid", "p_new_quantity" numeric, "p_reason" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_current_user_id   UUID;
    v_previous_quantity NUMERIC(12,2);
    v_log_id            UUID;
BEGIN
    -- Obtener el usuario autenticado actual
    v_current_user_id := auth.uid();

    -- Validar cantidad >= 0
    IF p_new_quantity < 0 THEN
        RETURN json_build_object(
            'success', false,
            'message', 'La cantidad no puede ser negativa'
        );
    END IF;

    -- Validar longitud mínima del motivo
    IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
        RETURN json_build_object(
            'success', false,
            'message', 'El motivo debe tener al menos 10 caracteres'
        );
    END IF;

    -- Validar longitud máxima del motivo
    IF length(trim(p_reason)) > 500 THEN
        RETURN json_build_object(
            'success', false,
            'message', 'El motivo no puede exceder 500 caracteres'
        );
    END IF;

    -- Bloquear la fila de warehouse_stock y leer la cantidad actual
    -- FOR UPDATE previene condiciones de carrera en ajustes simultáneos
    SELECT quantity
    INTO v_previous_quantity
    FROM public.warehouse_stock
    WHERE product_id = p_product_id
      AND warehouse_id = p_warehouse_id
    FOR UPDATE;

    -- Si no existe fila, tratar la cantidad anterior como 0
    IF v_previous_quantity IS NULL THEN
        v_previous_quantity := 0;
    END IF;

    -- Establecer la nueva cantidad (UPSERT)
    INSERT INTO public.warehouse_stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (p_product_id, p_warehouse_id, p_new_quantity, NOW())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET
        quantity   = p_new_quantity,
        updated_at = NOW();

    -- Registrar el ajuste en el log de auditoría
    INSERT INTO public.stock_adjustment_logs (
        product_id,
        warehouse_id,
        previous_quantity,
        new_quantity,
        reason,
        created_by
    )
    VALUES (
        p_product_id,
        p_warehouse_id,
        v_previous_quantity,
        p_new_quantity,
        trim(p_reason),
        v_current_user_id
    )
    RETURNING id INTO v_log_id;

    RETURN json_build_object(
        'success',           true,
        'message',           'Ajuste de stock realizado exitosamente',
        'log_id',            v_log_id,
        'previous_quantity', v_previous_quantity,
        'new_quantity',      p_new_quantity
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'message', format('Error al ajustar el stock: %s', SQLERRM)
        );
END;
$$;


ALTER FUNCTION "public"."adjust_product_stock"("p_product_id" "uuid", "p_warehouse_id" "uuid", "p_new_quantity" numeric, "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."adjust_product_stock"("p_product_id" "uuid", "p_warehouse_id" "uuid", "p_new_quantity" numeric, "p_reason" "text") IS 'Actualiza atómicamente warehouse_stock.quantity para un par producto+bodega y registra el cambio en stock_adjustment_logs. Usa SELECT FOR UPDATE para prevenir race conditions. Retorna JSON con success, message, log_id, previous_quantity y new_quantity.';



CREATE OR REPLACE FUNCTION "public"."assign_orders_to_remission_batch"("p_remission_id" "uuid", "p_order_ids" "uuid"[]) RETURNS TABLE("order_id" "uuid", "success" boolean, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_order_id UUID;
  v_remission_type TEXT;
  v_order_type TEXT;
  v_item_count INTEGER;
BEGIN
  -- Validar que la remisión existe y es de tipo 'remission' (una sola vez)
  SELECT order_type INTO v_remission_type
  FROM public.delivery_orders
  WHERE id = p_remission_id
    AND deleted_at IS NULL;
  
  IF v_remission_type IS NULL THEN
    -- Si la remisión no existe, retornar error para todas las órdenes
    FOREACH v_order_id IN ARRAY p_order_ids
    LOOP
      RETURN QUERY SELECT v_order_id, FALSE, 'La remisión no existe o fue eliminada'::TEXT;
    END LOOP;
    RETURN;
  END IF;
  
  IF v_remission_type != 'remission' THEN
    -- Si no es una remisión, retornar error para todas las órdenes
    FOREACH v_order_id IN ARRAY p_order_ids
    LOOP
      RETURN QUERY SELECT v_order_id, FALSE, 
        format('El ID %s no corresponde a una remisión (tipo: %s)', p_remission_id, v_remission_type)::TEXT;
    END LOOP;
    RETURN;
  END IF;

  -- Procesar cada orden individualmente
  FOREACH v_order_id IN ARRAY p_order_ids
  LOOP
    BEGIN
      -- Validar que la orden existe y es de tipo 'customer'
      SELECT order_type INTO v_order_type
      FROM public.delivery_orders
      WHERE id = v_order_id
        AND deleted_at IS NULL;
      
      IF v_order_type IS NULL THEN
        RETURN QUERY SELECT v_order_id, FALSE, 'La orden no existe o fue eliminada'::TEXT;
        CONTINUE;
      END IF;
      
      IF v_order_type != 'customer' THEN
        RETURN QUERY SELECT v_order_id, FALSE, 
          format('La orden debe ser de tipo ''customer'' (tipo actual: %s)', v_order_type)::TEXT;
        CONTINUE;
      END IF;

      -- Verificar si ya está asignada
      IF EXISTS (
        SELECT 1 FROM public.remission_delivery_orders
        WHERE remission_id = p_remission_id 
          AND source_delivery_order_id = v_order_id
      ) THEN
        RETURN QUERY SELECT v_order_id, FALSE, 'La orden ya está asignada a esta remisión'::TEXT;
        CONTINUE;
      END IF;

      -- Verificar que la orden tiene items
      SELECT COUNT(*) INTO v_item_count
      FROM public.delivery_order_items
      WHERE delivery_order_id = v_order_id;
      
      IF v_item_count = 0 THEN
        RETURN QUERY SELECT v_order_id, FALSE, 'La orden no tiene productos para asignar'::TEXT;
        CONTINUE;
      END IF;

      -- Insertar relación en remission_delivery_orders
      -- El trigger trg_validate_remission_delivery_order_types validará los tipos
      INSERT INTO public.remission_delivery_orders (remission_id, source_delivery_order_id)
      VALUES (p_remission_id, v_order_id);

      -- Copiar items a la remisión con source_delivery_order_id establecido
      -- El trigger trg_reserve_stock_on_delivery_order_item NO restará stock
      -- porque source_delivery_order_id está presente
      INSERT INTO public.delivery_order_items (
        delivery_order_id,
        product_id,
        quantity,
        warehouse_id,
        delivered_quantity,
        source_delivery_order_id
      )
      SELECT 
        p_remission_id,
        product_id,
        quantity,
        warehouse_id,
        delivered_quantity,
        v_order_id
      FROM public.delivery_order_items
      WHERE delivery_order_id = v_order_id;

      -- Retornar éxito para esta orden
      RETURN QUERY SELECT v_order_id, TRUE, NULL::TEXT;

    EXCEPTION 
      WHEN OTHERS THEN
        -- Si ocurre cualquier error, retornar el error pero continuar con las demás órdenes
        -- La transacción se hace rollback solo para esta orden específica
        RETURN QUERY SELECT v_order_id, FALSE, SQLERRM::TEXT;
    END;
  END LOOP;
  
  RETURN;
END;
$$;


ALTER FUNCTION "public"."assign_orders_to_remission_batch"("p_remission_id" "uuid", "p_order_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."assign_orders_to_remission_batch"("p_remission_id" "uuid", "p_order_ids" "uuid"[]) IS 'Asigna múltiples órdenes de entrega a una remisión en una sola transacción. Valida la remisión una vez y procesa cada orden individualmente, retornando el resultado de cada asignación. Optimizado para reducir N+1 queries.';



CREATE OR REPLACE FUNCTION "public"."cancel_delivery_order_with_items"("p_order_id" "uuid", "p_cancelled_at" timestamp with time zone DEFAULT "now"()) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Update order status to cancelled
  UPDATE public.delivery_orders
  SET
    status     = 'cancelled',
    updated_at = p_cancelled_at
  WHERE id = p_order_id;

  -- Soft-delete all active items of the order.
  -- The trigger fn_revert_stock_on_delivery_order_item_soft_delete
  -- will automatically restore the reserved warehouse stock for each item.
  UPDATE public.delivery_order_items
  SET deleted_at = p_cancelled_at
  WHERE delivery_order_id = p_order_id
    AND deleted_at IS NULL;
END;
$$;


ALTER FUNCTION "public"."cancel_delivery_order_with_items"("p_order_id" "uuid", "p_cancelled_at" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cancel_delivery_order_with_items"("p_order_id" "uuid", "p_cancelled_at" timestamp with time zone) IS 'Atomically cancels a delivery order and soft-deletes all its active items in a single transaction. Stock restoration is handled automatically by the fn_revert_stock_on_delivery_order_item_soft_delete trigger.';



CREATE OR REPLACE FUNCTION "public"."edit_delivery_order_items"("p_delivery_order_id" "uuid", "p_items" "jsonb", "p_notes" "text" DEFAULT NULL::"text", "p_delivery_address" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_order RECORD;
  v_existing_item RECORD;
  v_new_item JSONB;
  v_item_found BOOLEAN;
  v_new_quantity INTEGER;
  v_items_soft_deleted INTEGER := 0;
  v_items_updated INTEGER := 0;
  v_items_inserted INTEGER := 0;
BEGIN
  -- 1. Validate order exists and is pending
  SELECT * INTO v_order
  FROM public.delivery_orders
  WHERE id = p_delivery_order_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden de entrega no encontrada o fue eliminada';
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Solo se pueden editar ordenes en estado pendiente. Estado actual: %', v_order.status;
  END IF;

  -- 2. Validate items not empty
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La orden debe tener al menos un producto';
  END IF;

  -- 3. Update order metadata
  UPDATE public.delivery_orders
  SET
    notes = COALESCE(p_notes, notes),
    delivery_address = COALESCE(p_delivery_address, delivery_address),
    status = COALESCE(p_status, status),
    updated_at = NOW()
  WHERE id = p_delivery_order_id;

  -- 4. SOFT DELETE items not in the new list
  FOR v_existing_item IN
    SELECT doi.*
    FROM public.delivery_order_items doi
    WHERE doi.delivery_order_id = p_delivery_order_id
      AND doi.deleted_at IS NULL
  LOOP
    v_item_found := EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) elem
      WHERE (elem->>'product_id') = v_existing_item.product_id::TEXT
        AND (elem->>'warehouse_id') = v_existing_item.warehouse_id::TEXT
    );

    IF NOT v_item_found THEN
      IF v_existing_item.delivered_quantity > 0 THEN
        RAISE EXCEPTION 'No se puede eliminar el producto (%) de la bodega (%) porque tiene % unidades entregadas',
          v_existing_item.product_id, v_existing_item.warehouse_id, v_existing_item.delivered_quantity;
      END IF;

      -- Soft delete: triggers handle stock reversion + remission propagation
      UPDATE public.delivery_order_items
      SET deleted_at = NOW()
      WHERE id = v_existing_item.id;

      v_items_soft_deleted := v_items_soft_deleted + 1;
    END IF;
  END LOOP;

  -- 5. Update existing or insert new items
  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_new_quantity := (v_new_item->>'quantity')::INTEGER;

    SELECT * INTO v_existing_item
    FROM public.delivery_order_items
    WHERE delivery_order_id = p_delivery_order_id
      AND product_id = (v_new_item->>'product_id')::UUID
      AND warehouse_id = (v_new_item->>'warehouse_id')::UUID
      AND deleted_at IS NULL;

    IF FOUND THEN
      IF v_existing_item.quantity != v_new_quantity THEN
        IF v_new_quantity < v_existing_item.delivered_quantity THEN
          RAISE EXCEPTION 'No se puede reducir la cantidad a % porque ya se entregaron % unidades del producto (%) en bodega (%)',
            v_new_quantity, v_existing_item.delivered_quantity,
            v_existing_item.product_id, v_existing_item.warehouse_id;
        END IF;

        UPDATE public.delivery_order_items
        SET quantity = v_new_quantity
        WHERE id = v_existing_item.id;

        v_items_updated := v_items_updated + 1;
      END IF;
    ELSE
      INSERT INTO public.delivery_order_items (
        delivery_order_id, product_id, quantity, warehouse_id,
        delivered_quantity, source_delivery_order_id
      )
      VALUES (
        p_delivery_order_id,
        (v_new_item->>'product_id')::UUID,
        v_new_quantity,
        (v_new_item->>'warehouse_id')::UUID,
        0,
        NULLIF(v_new_item->>'source_delivery_order_id', '')::UUID
      );

      v_items_inserted := v_items_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'items_soft_deleted', v_items_soft_deleted,
    'items_updated', v_items_updated,
    'items_inserted', v_items_inserted
  );
END;
$$;


ALTER FUNCTION "public"."edit_delivery_order_items"("p_delivery_order_id" "uuid", "p_items" "jsonb", "p_notes" "text", "p_delivery_address" "text", "p_status" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."edit_delivery_order_items"("p_delivery_order_id" "uuid", "p_items" "jsonb", "p_notes" "text", "p_delivery_address" "text", "p_status" "text") IS 'Atomically edits delivery order items using soft delete. Runs in a single transaction. Uses smart diffing: soft-deletes removed items, updates changed quantities, inserts new items. If any step fails, everything is rolled back. Stock handled by triggers.';



CREATE OR REPLACE FUNCTION "public"."edit_purchase_order_items"("p_purchase_order_id" "uuid", "p_items" "jsonb", "p_supplier_id" "uuid" DEFAULT NULL::"uuid", "p_notes" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_order RECORD;
  v_new_item JSONB;
  v_items_soft_deleted INTEGER := 0;
  v_items_inserted INTEGER := 0;
  v_product_id UUID;
  v_quantity INTEGER;
BEGIN
  -- 1. Validate order exists
  SELECT * INTO v_order
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden de compra no encontrada o fue eliminada';
  END IF;

  -- 2. Validate items not empty
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La orden debe tener al menos un producto';
  END IF;

  -- 3. Update purchase order fields if provided
  IF p_supplier_id IS NOT NULL OR p_notes IS NOT NULL OR p_status IS NOT NULL THEN
    UPDATE public.purchase_orders
    SET
      supplier_id = COALESCE(p_supplier_id, supplier_id),
      notes = COALESCE(p_notes, notes),
      status = COALESCE(p_status, status),
      updated_at = NOW()
    WHERE id = p_purchase_order_id;
  END IF;

  -- 4. SOFT DELETE all existing active items for this order
  UPDATE public.purchase_order_items
  SET deleted_at = NOW()
  WHERE purchase_order_id = p_purchase_order_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_items_soft_deleted = ROW_COUNT;

  -- 5. Insert new items from JSONB array
  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_new_item->>'productId')::UUID;
    v_quantity := (v_new_item->>'quantity')::INTEGER;

    -- Validate product exists
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Producto no encontrado: %', v_product_id;
    END IF;

    -- Validate quantity > 0
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
    END IF;

    -- Insert new item
    INSERT INTO public.purchase_order_items (
      purchase_order_id,
      product_id,
      quantity,
      created_at,
      updated_at
    ) VALUES (
      p_purchase_order_id,
      v_product_id,
      v_quantity,
      NOW(),
      NOW()
    );

    v_items_inserted := v_items_inserted + 1;
  END LOOP;

  -- 6. Return result
  RETURN jsonb_build_object(
    'success', true,
    'purchase_order_id', p_purchase_order_id,
    'items_soft_deleted', v_items_soft_deleted,
    'items_inserted', v_items_inserted
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error al editar orden de compra: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."edit_purchase_order_items"("p_purchase_order_id" "uuid", "p_items" "jsonb", "p_supplier_id" "uuid", "p_notes" "text", "p_status" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."edit_purchase_order_items"("p_purchase_order_id" "uuid", "p_items" "jsonb", "p_supplier_id" "uuid", "p_notes" "text", "p_status" "text") IS 'Atomically edits purchase order items using soft delete. Marks all existing items as deleted and inserts new ones in a single transaction.';



CREATE OR REPLACE FUNCTION "public"."fn_adjust_stock_on_delivery_order_item_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  old_reserved numeric;
  new_reserved numeric;
  stock_adjustment numeric;
  current_stock numeric;
BEGIN
  -- Skip soft-deleted items
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Skip items copied from other orders
  IF OLD.source_delivery_order_id IS NOT NULL OR NEW.source_delivery_order_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  old_reserved := OLD.quantity - OLD.delivered_quantity;
  new_reserved := NEW.quantity - NEW.delivered_quantity;
  stock_adjustment := new_reserved - old_reserved;

  IF stock_adjustment != 0 THEN
    IF stock_adjustment > 0 THEN
      SELECT quantity INTO current_stock
      FROM public.warehouse_stock
      WHERE product_id = NEW.product_id
        AND warehouse_id = NEW.warehouse_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe registro de stock para el producto (%) en la bodega (%).',
          NEW.product_id, NEW.warehouse_id;
      END IF;

      IF current_stock < stock_adjustment THEN
        RAISE EXCEPTION 'Stock insuficiente al editar orden. Disponible: %, Necesario adicional: %',
          current_stock, stock_adjustment;
      END IF;
    END IF;

    UPDATE public.warehouse_stock
    SET quantity = quantity - stock_adjustment,
        updated_at = NOW()
    WHERE product_id = NEW.product_id
      AND warehouse_id = NEW.warehouse_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_adjust_stock_on_delivery_order_item_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_adjust_stock_on_delivery_order_item_change"() IS 'Adjusts warehouse stock automatically when ORDER quantity changes in a delivery order item. Does NOT adjust stock when only delivered_quantity changes (deliveries). Called by trigger after update.';



CREATE OR REPLACE FUNCTION "public"."fn_auto_update_remission_status_on_delivery"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_remission_id UUID;
  v_all_delivered BOOLEAN;
  v_order_type TEXT;
  v_previous_status TEXT;
BEGIN
  -- Solo actuar si el estado cambió a 'delivered'
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'delivered' THEN
    
    -- Verificar que es una orden de tipo 'customer'
    SELECT order_type INTO v_order_type
    FROM public.delivery_orders
    WHERE id = NEW.id;
    
    IF v_order_type = 'customer' THEN
      -- Buscar si esta orden está asignada a una remisión
      SELECT remission_id INTO v_remission_id
      FROM public.remission_delivery_orders
      WHERE source_delivery_order_id = NEW.id;
      
      IF v_remission_id IS NOT NULL THEN
        -- Verificar si TODAS las órdenes de esa remisión están en 'delivered'
        SELECT NOT EXISTS (
          SELECT 1
          FROM public.remission_delivery_orders rdo
          JOIN public.delivery_orders dord ON dord.id = rdo.source_delivery_order_id
          WHERE rdo.remission_id = v_remission_id
            AND dord.status != 'delivered'
        ) INTO v_all_delivered;
        
        -- Si todas están entregadas, actualizar la remisión
        IF v_all_delivered THEN
          -- Obtener el estado actual de la remisión antes de actualizar
          SELECT status INTO v_previous_status
          FROM public.delivery_orders
          WHERE id = v_remission_id;
          
          -- Solo actualizar si no está ya en 'delivered'
          IF v_previous_status != 'delivered' THEN
            UPDATE public.delivery_orders
            SET status = 'delivered',
                updated_at = NOW()
            WHERE id = v_remission_id;
            
            -- Registrar en historial
            INSERT INTO public.delivery_order_status_observations (
              delivery_order_id,
              status_action,
              previous_status,
              new_status,
              observations,
              created_by
            )
            VALUES (
              v_remission_id,
              'delivered',
              v_previous_status,
              'delivered',
              'Remisión marcada como entregada automáticamente - todas las órdenes asignadas fueron entregadas',
              auth.uid()
            );
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_auto_update_remission_status_on_delivery"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_auto_update_remission_status_on_delivery"() IS 'Actualiza automáticamente el estado de una remisión a delivered cuando todas sus órdenes de cliente asignadas están en estado delivered';



CREATE OR REPLACE FUNCTION "public"."fn_cancel_inventory_entry_on_cancellation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.inventory_entries
  SET deleted_at = NOW()
  WHERE id = NEW.inventory_entry_id
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_cancel_inventory_entry_on_cancellation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_log_delivery_order_delivered"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Solo registrar cuando el estado cambia a "delivered"
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'delivered' THEN
    INSERT INTO public.delivery_order_status_observations (
      delivery_order_id,
      status_action,
      previous_status,
      new_status,
      observations,
      created_by
    )
    VALUES (
      NEW.id,
      'delivered',
      OLD.status,
      NEW.status,
      'Entrega registrada desde aplicación móvil',
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_log_delivery_order_delivered"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_log_delivery_order_delivered"() IS 'Registra automáticamente en el historial cuando una orden cambia a estado delivered desde la app móvil';



CREATE OR REPLACE FUNCTION "public"."fn_process_delivery_order_return"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  new_entry_id UUID;
BEGIN
  -- Create inventory entry; entry_type != 'return' so fn_update_stock_on_entry
  -- will add to warehouse_stock via its existing trigger.
  INSERT INTO public.inventory_entries (
    product_id,
    warehouse_id,
    quantity,
    entry_type,
    created_by
  ) VALUES (
    NEW.product_id,
    NEW.warehouse_id,
    NEW.quantity,
    'delivery_return',
    NEW.created_by
  )
  RETURNING id INTO new_entry_id;

  -- Link the new inventory entry back to this return record.
  UPDATE public.delivery_order_returns
  SET inventory_entry_id = new_entry_id
  WHERE id = NEW.id;

  -- Reduce delivered_quantity on the matching DOI (product came back to warehouse).
  UPDATE public.delivery_order_items
  SET delivered_quantity = GREATEST(0, delivered_quantity - NEW.quantity)
  WHERE delivery_order_id = NEW.delivery_order_id
    AND product_id = NEW.product_id
    AND warehouse_id = NEW.warehouse_id
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_process_delivery_order_return"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_reserve_stock_on_delivery_order_item"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  current_stock numeric;
BEGIN
  -- Si el item viene de otra orden (source_delivery_order_id presente),
  -- NO restar stock porque ya se restó cuando se creó la orden original
  IF NEW.source_delivery_order_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Obtener stock actual Y BLOQUEAR LA FILA (FOR UPDATE)
  -- Esto hace que otras transacciones esperen si intentan tocar este producto/bodega
  SELECT quantity INTO current_stock
  FROM public.warehouse_stock
  WHERE product_id = NEW.product_id
    AND warehouse_id = NEW.warehouse_id
  FOR UPDATE; -- <--- ESTO ES CLAVE

  -- 2. Validar existencia del registro
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe registro de stock para el producto (%) en la bodega (%).',
      NEW.product_id, NEW.warehouse_id;
  END IF;

  -- 3. Validar disponibilidad (incluyendo cantidad del nuevo item)
  IF current_stock < NEW.quantity THEN
    RAISE EXCEPTION 'Stock insuficiente al crear orden. Disponible: %, Solicitado: %',
      current_stock, NEW.quantity;
  END IF;

  -- 4. Reservar stock (disminuir)
  UPDATE public.warehouse_stock
  SET quantity = quantity - NEW.quantity,
      updated_at = NOW()
  WHERE product_id = NEW.product_id
    AND warehouse_id = NEW.warehouse_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_reserve_stock_on_delivery_order_item"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_reserve_stock_on_delivery_order_item"() IS 'Reserves warehouse stock automatically when a delivery order item is created. Skips stock reservation for items with source_delivery_order_id (copied from other orders). Called by trigger after insert. Uses FOR UPDATE to prevent race conditions.';



CREATE OR REPLACE FUNCTION "public"."fn_revert_stock_on_delivery_order_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  item_record RECORD;
  reserved_quantity numeric;
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Only process ACTIVE items (not already soft-deleted)
    FOR item_record IN
      SELECT product_id, warehouse_id, quantity, delivered_quantity, source_delivery_order_id
      FROM public.delivery_order_items
      WHERE delivery_order_id = NEW.id
        AND deleted_at IS NULL
    LOOP
      -- Skip items copied from other orders
      IF item_record.source_delivery_order_id IS NOT NULL THEN
        CONTINUE;
      END IF;

      reserved_quantity := item_record.quantity - item_record.delivered_quantity;

      IF reserved_quantity > 0 THEN
        INSERT INTO public.warehouse_stock (product_id, warehouse_id, quantity, updated_at)
        VALUES (item_record.product_id, item_record.warehouse_id, reserved_quantity, NOW())
        ON CONFLICT (product_id, warehouse_id)
        DO UPDATE SET
            quantity = warehouse_stock.quantity + reserved_quantity,
            updated_at = NOW();
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_revert_stock_on_delivery_order_delete"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_revert_stock_on_delivery_order_delete"() IS 'Reverts warehouse stock automatically when a delivery order is deleted via soft delete. Only reverts reserved stock that was not delivered. Called by trigger after update.';



CREATE OR REPLACE FUNCTION "public"."fn_revert_stock_on_delivery_order_item"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  reserved_quantity numeric;
BEGIN
  -- Si el item viene de otra orden (source_delivery_order_id presente),
  -- NO revertir stock porque el stock pertenece a la orden original
  IF OLD.source_delivery_order_id IS NOT NULL THEN
    RETURN OLD;
  END IF;

  -- Revertir stock (aumentar) solo si el item no fue entregado completamente
  -- Si delivered_quantity < quantity, significa que hay stock reservado sin entregar
  IF OLD.delivered_quantity < OLD.quantity THEN
    reserved_quantity := OLD.quantity - OLD.delivered_quantity;
    
    -- Aumentar stock
    INSERT INTO public.warehouse_stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (OLD.product_id, OLD.warehouse_id, reserved_quantity, NOW())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET 
        quantity = warehouse_stock.quantity + reserved_quantity,
        updated_at = NOW();
  END IF;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."fn_revert_stock_on_delivery_order_item"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_revert_stock_on_delivery_order_item"() IS 'Reverts warehouse stock automatically when a delivery order item is deleted. Skips stock reversion for items with source_delivery_order_id (copied from other orders). Only reverts reserved stock (quantity - delivered_quantity). Called by trigger after delete.';



CREATE OR REPLACE FUNCTION "public"."fn_revert_stock_on_delivery_order_item_soft_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  reserved_quantity numeric;
BEGIN
  -- Skip items copied from other orders (stock belongs to original order)
  IF NEW.source_delivery_order_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Revert reserved stock (quantity - delivered_quantity)
  IF NEW.delivered_quantity < NEW.quantity THEN
    reserved_quantity := NEW.quantity - NEW.delivered_quantity;

    INSERT INTO public.warehouse_stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (NEW.product_id, NEW.warehouse_id, reserved_quantity, NOW())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET
        quantity = warehouse_stock.quantity + reserved_quantity,
        updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_revert_stock_on_delivery_order_item_soft_delete"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_revert_stock_on_delivery_order_item_soft_delete"() IS 'Reverts warehouse stock when a delivery order item is soft-deleted (deleted_at set). Skips items with source_delivery_order_id. Only reverts reserved stock (qty - delivered).';



CREATE OR REPLACE FUNCTION "public"."fn_revert_stock_on_exit_cancellation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  exit_record RECORD;
  doi_record  RECORD;
BEGIN
  SELECT product_id, warehouse_id, quantity, delivery_order_id
  INTO exit_record
  FROM public.inventory_exits
  WHERE id = NEW.inventory_exit_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF exit_record.delivery_order_id IS NULL THEN
    -- Direct exit: always restore warehouse_stock
    INSERT INTO public.warehouse_stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (exit_record.product_id, exit_record.warehouse_id, exit_record.quantity, NOW())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET
        quantity = warehouse_stock.quantity + EXCLUDED.quantity,
        updated_at = NOW();

  ELSE
    -- Order exit: check if delivered_quantity was already updated (Scenario B)
    SELECT * INTO doi_record
    FROM public.delivery_order_items
    WHERE delivery_order_id = exit_record.delivery_order_id
      AND product_id = exit_record.product_id
      AND warehouse_id = exit_record.warehouse_id
      AND deleted_at IS NULL
    LIMIT 1;

    IF FOUND AND doi_record.delivered_quantity >= exit_record.quantity THEN
      -- Scenario B: exit did decrease warehouse_stock; revert delivered_quantity.
      -- warehouse_stock adjustment is handled by the DOI update trigger.
      UPDATE public.delivery_order_items
      SET delivered_quantity = GREATEST(0, delivered_quantity - exit_record.quantity)
      WHERE id = doi_record.id;
    END IF;
    -- Scenario A (delivered_quantity < exit.quantity): exit was skipped by the
    -- original trigger; DOI reservation still holds → no direct warehouse_stock change.
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_revert_stock_on_exit_cancellation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_revert_stock_on_inventory_entry_soft_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only process if this is a soft delete (deleted_at changes from NULL to a value)
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Reduce stock by the entry quantity (reverting the entry)
    UPDATE public.warehouse_stock
    SET quantity = GREATEST(0, quantity - OLD.quantity),
        updated_at = NOW()
    WHERE product_id = OLD.product_id
      AND warehouse_id = OLD.warehouse_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_revert_stock_on_inventory_entry_soft_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_soft_delete_remission_relationships"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- When a remission is soft-deleted, soft-delete all its relationships
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.remission_delivery_orders
    SET deleted_at = NEW.deleted_at
    WHERE remission_id = NEW.id
      AND deleted_at IS NULL;
  END IF;
  
  -- When a remission is restored (deleted_at set back to NULL), restore relationships
  IF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
    UPDATE public.remission_delivery_orders
    SET deleted_at = NULL
    WHERE remission_id = NEW.id
      AND deleted_at IS NOT NULL;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_soft_delete_remission_relationships"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_soft_delete_remission_relationships"() IS 'Automatically soft-deletes or restores remission relationships when a remission is soft-deleted or restored. This ensures that orders can be reassigned after a remission is deleted.';



CREATE OR REPLACE FUNCTION "public"."fn_sync_remission_items_on_order_edit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  remission_record RECORD;
  existing_item RECORD;
BEGIN
  -- Skip items that are copies (have source_delivery_order_id)
  IF (TG_OP = 'DELETE' AND OLD.source_delivery_order_id IS NOT NULL) OR
     (TG_OP IN ('INSERT', 'UPDATE') AND NEW.source_delivery_order_id IS NOT NULL) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Handle physical DELETE (kept for safety)
  IF TG_OP = 'DELETE' THEN
    UPDATE public.delivery_order_items
    SET deleted_at = NOW()
    WHERE source_delivery_order_id = OLD.delivery_order_id
      AND product_id = OLD.product_id
      AND warehouse_id = OLD.warehouse_id
      AND deleted_at IS NULL;
    RETURN OLD;
  END IF;

  -- Handle UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- If item is being soft-deleted, propagate to copied items in remissions
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE public.delivery_order_items
      SET deleted_at = NOW()
      WHERE source_delivery_order_id = NEW.delivery_order_id
        AND product_id = NEW.product_id
        AND warehouse_id = NEW.warehouse_id
        AND deleted_at IS NULL;
      RETURN NEW;
    END IF;

    -- Skip if item is already soft-deleted
    IF NEW.deleted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;

    -- Normal update: sync quantities to remission copies
    FOR remission_record IN
      SELECT remission_id
      FROM public.remission_delivery_orders
      WHERE source_delivery_order_id = NEW.delivery_order_id
        AND deleted_at IS NULL
    LOOP
      SELECT * INTO existing_item
      FROM public.delivery_order_items
      WHERE delivery_order_id = remission_record.remission_id
        AND product_id = NEW.product_id
        AND warehouse_id = NEW.warehouse_id
        AND source_delivery_order_id = NEW.delivery_order_id
        AND deleted_at IS NULL
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.delivery_order_items
        SET quantity = NEW.quantity,
            delivered_quantity = NEW.delivered_quantity
        WHERE id = existing_item.id;
      ELSE
        INSERT INTO public.delivery_order_items (
          delivery_order_id, product_id, quantity, warehouse_id,
          delivered_quantity, source_delivery_order_id
        )
        VALUES (
          remission_record.remission_id, NEW.product_id, NEW.quantity,
          NEW.warehouse_id, NEW.delivered_quantity, NEW.delivery_order_id
        );
      END IF;
    END LOOP;

    RETURN NEW;
  END IF;

  -- Handle INSERT
  IF TG_OP = 'INSERT' THEN
    FOR remission_record IN
      SELECT remission_id
      FROM public.remission_delivery_orders
      WHERE source_delivery_order_id = NEW.delivery_order_id
        AND deleted_at IS NULL
    LOOP
      SELECT * INTO existing_item
      FROM public.delivery_order_items
      WHERE delivery_order_id = remission_record.remission_id
        AND product_id = NEW.product_id
        AND warehouse_id = NEW.warehouse_id
        AND source_delivery_order_id = NEW.delivery_order_id
        AND deleted_at IS NULL
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.delivery_order_items
        SET quantity = NEW.quantity,
            delivered_quantity = NEW.delivered_quantity
        WHERE id = existing_item.id;
      ELSE
        INSERT INTO public.delivery_order_items (
          delivery_order_id, product_id, quantity, warehouse_id,
          delivered_quantity, source_delivery_order_id
        )
        VALUES (
          remission_record.remission_id, NEW.product_id, NEW.quantity,
          NEW.warehouse_id, NEW.delivered_quantity, NEW.delivery_order_id
        );
      END IF;
    END LOOP;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."fn_sync_remission_items_on_order_edit"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_sync_remission_items_on_order_edit"() IS 'Synchronizes items in remissions when source delivery orders (customer orders) are edited. Automatically updates or deletes copied items in remissions when the source order items change.';



CREATE OR REPLACE FUNCTION "public"."fn_update_order_status_on_remission_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_previous_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Obtener el estado actual de la orden antes de cambiarlo
    SELECT status INTO v_previous_status
    FROM public.delivery_orders
    WHERE id = NEW.source_delivery_order_id;
    
    -- Cuando se asigna una orden a una remisión, cambiar estado a 'sent_by_remission'
    UPDATE public.delivery_orders
    SET status = 'sent_by_remission',
        updated_at = NOW()
    WHERE id = NEW.source_delivery_order_id;
    
    -- Crear registro de auditoría con previous_status
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
    -- Obtener el estado actual de la orden antes de cambiarlo
    SELECT status INTO v_previous_status
    FROM public.delivery_orders
    WHERE id = OLD.source_delivery_order_id;
    
    -- Cuando se desasigna una orden de una remisión, revertir estado a 'pending'
    UPDATE public.delivery_orders
    SET status = 'pending',
        updated_at = NOW()
    WHERE id = OLD.source_delivery_order_id;
    
    -- Crear registro de auditoría con previous_status
    -- Usar 'approved' que es un valor permitido en el constraint
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
      'pending',
      format('Orden desasignada de remisión %s - vuelve a estado pendiente', OLD.remission_id),
      auth.uid()
    );
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."fn_update_order_status_on_remission_assignment"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_update_order_status_on_remission_assignment"() IS 'Automatically updates the status of a customer delivery order when assigned to or unassigned from a remission. Changes status to sent_by_remission on assignment and reverts to pending on unassignment. Uses approved action for unassignment audit.';



CREATE OR REPLACE FUNCTION "public"."fn_update_stock_on_entry"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    stock_delta NUMERIC;
    ret_type TEXT;
BEGIN
    -- Skip if this entry is soft-deleted
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Determinar el cambio de stock según el tipo de entrada
    IF NEW.entry_type = 'return' THEN
        -- Para returns, necesitamos consultar return_type para determinar la dirección
        SELECT return_type INTO ret_type
        FROM returns
        WHERE product_id = NEW.product_id
          AND warehouse_id = NEW.warehouse_id
          AND quantity = NEW.quantity
          AND created_by = NEW.created_by
          AND created_at BETWEEN (NEW.created_at - INTERVAL '1 second') AND (NEW.created_at + INTERVAL '1 second')
          AND inventory_entry_id IS NULL
        ORDER BY created_at DESC
        LIMIT 1;

        -- Determinar dirección del stock según tipo de devolución
        IF ret_type = 'purchase_order' THEN
            -- Devoluciones a proveedor: producto SALE del almacén (RESTAR)
            stock_delta := -NEW.quantity;
        ELSIF ret_type = 'delivery_order' THEN
            -- Devoluciones de cliente: producto REGRESA al almacén (SUMAR)
            stock_delta := NEW.quantity;
        ELSE
            -- Fallback: si no encontramos el registro, loguear warning y sumar por defecto
            RAISE WARNING 'No se pudo determinar return_type para inventory_entry %, usando ADD por defecto', NEW.id;
            stock_delta := NEW.quantity;
        END IF;
    ELSE
        -- Todos los otros entry_types: SUMAR al stock
        -- (PO_ENTRY, ENTRY, INITIAL_LOAD, etc.)
        stock_delta := NEW.quantity;
    END IF;

    -- Upsert en warehouse_stock con el delta calculado
    INSERT INTO public.warehouse_stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (NEW.product_id, NEW.warehouse_id, stock_delta, NOW())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET
        quantity = warehouse_stock.quantity + EXCLUDED.quantity,
        updated_at = NOW();

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_update_stock_on_entry"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_update_stock_on_entry"() IS 'Actualiza warehouse_stock cuando se inserta una entrada de inventario. Combina: (1) skip de entradas soft-deleted, (2) manejo de returns donde PO returns restan stock y DO returns suman stock, (3) otros entry_types siempre suman. CORREGIDO: Restaurada la lógica de returns que fue eliminada por migración 20260211200000.';



CREATE OR REPLACE FUNCTION "public"."fn_update_stock_on_exit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  current_stock numeric;
  stock_already_reserved boolean;
  reserved_quantity numeric;
BEGIN
  -- Verificar si el stock ya está reservado por la orden de entrega
  -- Solo aplica si hay una delivery_order_id asociada
  IF NEW.delivery_order_id IS NOT NULL THEN
    -- Verificar si hay items de la orden con stock reservado (delivered_quantity < quantity)
    SELECT EXISTS(
      SELECT 1 
      FROM public.delivery_order_items
      WHERE delivery_order_id = NEW.delivery_order_id
        AND product_id = NEW.product_id
        AND warehouse_id = NEW.warehouse_id
        AND delivered_quantity < quantity
    ) INTO stock_already_reserved;

    -- Si el stock ya está reservado, solo validar disponibilidad pero NO disminuir
    -- El stock ya fue disminuido cuando se creó el item de la orden
    IF stock_already_reserved THEN
      -- Obtener stock actual para validar (sin bloquear, solo lectura)
      SELECT quantity INTO current_stock
      FROM public.warehouse_stock
      WHERE product_id = NEW.product_id
        AND warehouse_id = NEW.warehouse_id;

      -- Validar existencia del registro
      IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe registro de stock para el producto (%) en la bodega (%).',
          NEW.product_id, NEW.warehouse_id;
      END IF;

      -- Validar que hay suficiente stock reservado
      -- El stock reservado debería ser suficiente porque ya fue validado al crear la orden
      -- Pero validamos por seguridad
      SELECT COALESCE(SUM(quantity - delivered_quantity), 0) INTO reserved_quantity
      FROM public.delivery_order_items
      WHERE delivery_order_id = NEW.delivery_order_id
        AND product_id = NEW.product_id
        AND warehouse_id = NEW.warehouse_id;

      IF reserved_quantity < NEW.quantity THEN
        RAISE EXCEPTION 'Stock reservado insuficiente. Reservado: %, Solicitado: %',
          reserved_quantity, NEW.quantity;
      END IF;

      -- No disminuir stock, ya está reservado
      RETURN NEW;
    END IF;
  END IF;

  -- Si no hay orden asociada o el stock no está reservado, proceder con la disminución normal
  -- 1. Obtener stock actual Y BLOQUEAR LA FILA (FOR UPDATE)
  -- Esto hace que otras transacciones esperen si intentan tocar este producto/bodega
  SELECT quantity INTO current_stock
  FROM public.warehouse_stock
  WHERE product_id = NEW.product_id
    AND warehouse_id = NEW.warehouse_id
  FOR UPDATE; -- <--- ESTO ES CLAVE

  -- 2. Validar existencia del registro
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe registro de stock para el producto (%) en la bodega (%).',
      NEW.product_id, NEW.warehouse_id;
  END IF;

  -- 3. Validar disponibilidad
  IF current_stock < NEW.quantity THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible: %, Solicitado: %',
      current_stock, NEW.quantity;
  END IF;

  -- 4. Actualizar stock
  UPDATE public.warehouse_stock
  SET quantity = quantity - NEW.quantity,
      updated_at = NOW()
  WHERE product_id = NEW.product_id
    AND warehouse_id = NEW.warehouse_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_update_stock_on_exit"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_update_stock_on_exit"() IS 'Decreases warehouse stock automatically when an inventory exit is registered. Checks if stock is already reserved by delivery order to avoid double decrease. Called by trigger after insert. Uses FOR UPDATE to prevent race conditions.';



CREATE OR REPLACE FUNCTION "public"."fn_validate_inventory_entry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Validación: si tiene purchase_order_id → entry_type debe ser PO_ENTRY o 'return'
  IF NEW.purchase_order_id IS NOT NULL AND NEW.entry_type NOT IN ('PO_ENTRY', 'return') THEN
    RAISE EXCEPTION 'Si purchase_order_id no es NULL, entry_type debe ser PO_ENTRY o return';
  END IF;

  -- Validación: si entry_type es PO_ENTRY → debe tener purchase_order_id
  IF NEW.entry_type = 'PO_ENTRY' AND NEW.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Las entradas de tipo PO_ENTRY deben tener purchase_order_id';
  END IF;

  -- Validación: si entry_type es PO_ENTRY → debe tener supplier_id
  -- (no aplica para 'return' ya que las devoluciones no requieren supplier_id)
  IF NEW.supplier_id IS NULL AND NEW.entry_type = 'PO_ENTRY' THEN
    RAISE EXCEPTION 'Una entrada PO_ENTRY debe tener supplier_id';
  END IF;

  -- Validación cantidad positiva
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_validate_inventory_entry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_validate_remission_assignment_exclusivity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_has_direct_items BOOLEAN;
BEGIN
    -- Verificar si la remisión ya tiene productos agregados directamente
    SELECT EXISTS (
        SELECT 1 FROM public.delivery_order_items
        WHERE delivery_order_id = NEW.remission_id
          AND source_delivery_order_id IS NULL
    ) INTO v_has_direct_items;

    IF v_has_direct_items THEN
        RAISE EXCEPTION 'No se pueden asignar órdenes de cliente a una remisión que ya contiene productos agregados directamente.';
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_validate_remission_assignment_exclusivity"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_validate_remission_assignment_exclusivity"() IS 'Valida que una remisión no reciba órdenes de cliente si ya tiene items agregados directamente.';



CREATE OR REPLACE FUNCTION "public"."fn_validate_remission_delivery_order_types"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."fn_validate_remission_delivery_order_types"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_validate_remission_delivery_order_types"() IS 'Valida que remission_id sea de tipo ''remission'' y source_delivery_order_id sea de tipo ''customer''. Llamado por trigger antes de insertar o actualizar.';



CREATE OR REPLACE FUNCTION "public"."fn_validate_remission_items_exclusivity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_order_type TEXT;
    v_has_conflicting_items BOOLEAN;
    v_has_assigned_orders BOOLEAN;
BEGIN
    -- Obtenemos el tipo de la orden de entrega
    SELECT order_type INTO v_order_type
    FROM public.delivery_orders
    WHERE id = NEW.delivery_order_id;

    -- Solo aplicamos la lógica a remisiones
    IF v_order_type = 'remission' THEN
        
        -- Caso A: Intentando insertar/actualizar un item DIRECTO (sin source_delivery_order_id)
        IF NEW.source_delivery_order_id IS NULL THEN
            -- Verificar si ya hay items sincronizados (con source_delivery_order_id)
            SELECT EXISTS (
                SELECT 1 FROM public.delivery_order_items
                WHERE delivery_order_id = NEW.delivery_order_id
                  AND source_delivery_order_id IS NOT NULL
            ) INTO v_has_conflicting_items;

            -- Verificar si ya hay órdenes asignadas en la tabla de relación
            SELECT EXISTS (
                SELECT 1 FROM public.remission_delivery_orders
                WHERE remission_id = NEW.delivery_order_id
            ) INTO v_has_assigned_orders;

            IF v_has_conflicting_items OR v_has_assigned_orders THEN
                RAISE EXCEPTION 'No se pueden agregar productos directamente a una remisión que ya tiene órdenes de cliente asignadas.';
            END IF;

        -- Caso B: Intentando insertar/actualizar un item SINCRONIZADO (con source_delivery_order_id)
        ELSE
            -- Verificar si ya hay items directos (sin source_delivery_order_id)
            SELECT EXISTS (
                SELECT 1 FROM public.delivery_order_items
                WHERE delivery_order_id = NEW.delivery_order_id
                  AND source_delivery_order_id IS NULL
            ) INTO v_has_conflicting_items;

            IF v_has_conflicting_items THEN
                RAISE EXCEPTION 'No se pueden sincronizar productos de una orden en una remisión que ya contiene productos agregados directamente.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_validate_remission_items_exclusivity"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_validate_remission_items_exclusivity"() IS 'Valida que una remisión no mezcle items directos con items sincronizados de órdenes de cliente.';



CREATE OR REPLACE FUNCTION "public"."generate_delivery_order_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."generate_delivery_order_number"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_delivery_order_number"() IS 'Función trigger que genera automáticamente el número de orden secuencial por año al crear una nueva orden de entrega.';



CREATE OR REPLACE FUNCTION "public"."generate_purchase_order_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."generate_purchase_order_number"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_purchase_order_number"() IS 'Función trigger que genera automáticamente el número de orden secuencial por año al crear una nueva orden de compra.';



CREATE OR REPLACE FUNCTION "public"."get_customer_delivery_orders"("customer_id_param" "uuid", "page" integer DEFAULT 1, "page_size" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "status" "text", "notes" "text", "delivery_address" "text", "created_at" timestamp with time zone, "created_by_name" "text", "total_items" bigint, "total_quantity" numeric, "delivered_quantity" numeric, "is_complete" boolean, "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    offset_val integer;
BEGIN
    offset_val := GREATEST((COALESCE(page, 1) - 1) * COALESCE(page_size, 50), 0);
    
    RETURN QUERY
    WITH total AS (
        SELECT COUNT(*)::bigint AS cnt
        FROM public.delivery_orders dord
        WHERE dord.customer_id = customer_id_param
          AND dord.deleted_at IS NULL
    ),
    items_agg AS (
        SELECT
            doi.delivery_order_id,
            COUNT(*)::bigint AS total_items,
            SUM(doi.quantity)::numeric AS total_quantity,
            SUM(doi.delivered_quantity)::numeric AS delivered_quantity
        FROM public.delivery_order_items doi
        GROUP BY doi.delivery_order_id
    ),
    enriched AS (
        SELECT
            dord.id,
            dord.status,
            dord.notes,
            dord.delivery_address,
            dord.created_at,
            pr.full_name AS created_by_name,
            COALESCE(ia.total_items, 0)::bigint AS total_items,
            COALESCE(ia.total_quantity, 0)::numeric AS total_quantity,
            COALESCE(ia.delivered_quantity, 0)::numeric AS delivered_quantity,
            CASE
                WHEN COALESCE(ia.total_items, 0) = 0 THEN false
                ELSE (
                    SELECT bool_and(doi2.delivered_quantity >= doi2.quantity)
                    FROM public.delivery_order_items doi2
                    WHERE doi2.delivery_order_id = dord.id
                )
            END AS is_complete
        FROM public.delivery_orders dord
        LEFT JOIN public.profiles pr ON pr.id = dord.created_by
        LEFT JOIN items_agg ia ON ia.delivery_order_id = dord.id
        WHERE dord.customer_id = customer_id_param
          AND dord.deleted_at IS NULL
    )
    SELECT
        e.id,
        e.status::text,
        e.notes::text,
        e.delivery_address::text,
        e.created_at,
        e.created_by_name::text,
        e.total_items,
        e.total_quantity,
        e.delivered_quantity,
        COALESCE(e.is_complete, false) AS is_complete,
        total.cnt AS total_count
    FROM enriched e
    CROSS JOIN total
    ORDER BY e.created_at DESC
    LIMIT GREATEST(COALESCE(page_size, 50), 1)
    OFFSET offset_val;
END;
$$;


ALTER FUNCTION "public"."get_customer_delivery_orders"("customer_id_param" "uuid", "page" integer, "page_size" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_customer_delivery_orders"("customer_id_param" "uuid", "page" integer, "page_size" integer) IS 'Devuelve el historial de órdenes de entrega para un cliente específico.';



CREATE OR REPLACE FUNCTION "public"."get_customer_exit_history"("customer_id_param" "uuid", "page" integer DEFAULT 1, "page_size" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "product_name" "text", "warehouse_name" "text", "quantity" numeric, "created_at" timestamp with time zone, "created_by_name" "text", "is_cancelled" boolean, "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    offset_val integer;
BEGIN
    offset_val := GREATEST((COALESCE(page, 1) - 1) * COALESCE(page_size, 50), 0);
    
    RETURN QUERY
    WITH total AS (
        SELECT COUNT(*)::bigint AS cnt
        FROM public.inventory_exits ie
        WHERE ie.delivered_to_customer_id = customer_id_param
    )
    SELECT 
        ie.id,
        p.name::text AS product_name,
        w.name::text AS warehouse_name,
        ie.quantity,
        ie.created_at,
        creator.full_name::text AS created_by_name,
        EXISTS(
            SELECT 1 FROM public.inventory_exit_cancellations iec 
            WHERE iec.inventory_exit_id = ie.id
        ) AS is_cancelled,
        total.cnt AS total_count
    FROM public.inventory_exits ie
    LEFT JOIN public.products p ON p.id = ie.product_id
    LEFT JOIN public.warehouses w ON w.id = ie.warehouse_id
    LEFT JOIN public.profiles creator ON creator.id = ie.created_by
    CROSS JOIN total
    WHERE ie.delivered_to_customer_id = customer_id_param
    ORDER BY ie.created_at DESC
    LIMIT GREATEST(COALESCE(page_size, 50), 1)
    OFFSET offset_val;
END;
$$;


ALTER FUNCTION "public"."get_customer_exit_history"("customer_id_param" "uuid", "page" integer, "page_size" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_customer_exit_history"("customer_id_param" "uuid", "page" integer, "page_size" integer) IS 'Devuelve el historial de salidas de inventario para un cliente específico, corrigiendo la referencia a inventory_exit_id.';



CREATE OR REPLACE FUNCTION "public"."get_customers"("search_term" "text" DEFAULT NULL::"text", "page" integer DEFAULT 1, "page_size" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "name" "text", "id_number" "text", "phone" "text", "email" "text", "address" "text", "total_exits" bigint, "last_exit_date" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  offset_val integer;
BEGIN
  offset_val := (page - 1) * page_size;

  RETURN QUERY
  WITH total AS (
    SELECT COUNT(*) as cnt
    FROM customers c
    WHERE deleted_at IS NULL
      AND (
        search_term IS NULL 
        OR c.name ILIKE '%' || search_term || '%'
        OR c.id_number ILIKE '%' || search_term || '%'
        OR c.phone ILIKE '%' || search_term || '%'
      )
  )
  SELECT 
    c.id,
    c.name,
    c.id_number,
    c.phone,
    c.email,
    c.address,
    COUNT(ie.id) AS total_exits,
    MAX(ie.created_at) AS last_exit_date,
    total.cnt AS total_count
  FROM customers c
  LEFT JOIN inventory_exits ie ON ie.delivered_to_customer_id = c.id
  CROSS JOIN total
  WHERE c.deleted_at IS NULL
    AND (
      search_term IS NULL 
      OR c.name ILIKE '%' || search_term || '%'
      OR c.id_number ILIKE '%' || search_term || '%'
      OR c.phone ILIKE '%' || search_term || '%'
    )
  GROUP BY c.id, c.name, c.id_number, c.phone, c.email, c.address, total.cnt
  ORDER BY c.name
  LIMIT page_size
  OFFSET offset_val;
END;
$$;


ALTER FUNCTION "public"."get_customers"("search_term" "text", "page" integer, "page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customers_dashboard"("search_term" "text" DEFAULT ''::"text", "page" integer DEFAULT 1, "page_size" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "name" "text", "id_number" "text", "email" "text", "phone" "text", "address" "text", "notes" "text", "created_at" timestamp with time zone, "created_by" "uuid", "created_by_name" "text", "total_exits" bigint, "last_exit_date" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    _limit integer := GREATEST(COALESCE(page_size, 5), 1);
    _offset integer := GREATEST((COALESCE(page, 1) - 1) * _limit, 0);
    _search text := COALESCE(LOWER(TRIM(search_term)), '');
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            c.id,
            c.name,
            c.id_number,
            c.email,
            c.phone,
            c.address,
            c.notes,
            c.created_at,
            c.created_by
        FROM public.customers c
        WHERE c.deleted_at IS NULL
          AND (
            _search = ''
            OR LOWER(c.name) LIKE '%' || _search || '%'
            OR LOWER(c.id_number) LIKE '%' || _search || '%'
            OR LOWER(COALESCE(c.email, '')) LIKE '%' || _search || '%'
            OR LOWER(COALESCE(c.phone, '')) LIKE '%' || _search || '%'
          )
    ),
    enriched AS (
        SELECT
            f.*,
            pr.full_name AS created_by_name,
            COALESCE(exit_stats.total_exits, 0)::bigint AS total_exits,
            exit_stats.last_exit_date
        FROM filtered f
        LEFT JOIN public.profiles pr ON pr.id = f.created_by
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*)::bigint AS total_exits,
                MAX(ie.created_at) AS last_exit_date
            FROM public.inventory_exits ie
            WHERE ie.delivered_to_customer_id = f.id
        ) exit_stats ON true
    ),
    numbered AS (
        SELECT
            e.*,
            COUNT(*) OVER () AS total_count,
            ROW_NUMBER() OVER (ORDER BY e.created_at DESC) AS row_number
        FROM enriched e
    )
    SELECT
        n.id,
        n.name::text,
        n.id_number::text,
        n.email::text,
        n.phone::text,
        n.address::text,
        n.notes::text,
        n.created_at,
        n.created_by,
        n.created_by_name::text,
        n.total_exits,
        n.last_exit_date,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$$;


ALTER FUNCTION "public"."get_customers_dashboard"("search_term" "text", "page" integer, "page_size" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_customers_dashboard"("search_term" "text", "page" integer, "page_size" integer) IS 'Devuelve clientes con estadísticas agregadas (total de salidas, última salida) en una sola consulta optimizada.';



CREATE OR REPLACE FUNCTION "public"."get_customers_stats"() RETURNS TABLE("total_customers" bigint, "customers_with_exits" bigint, "customers_without_exits" bigint, "total_exits_to_customers" bigint)
    LANGUAGE "sql" STABLE
    AS $$
WITH customer_exits AS (
    SELECT
        c.id AS customer_id,
        COUNT(ie.id) AS exit_count
    FROM public.customers c
    LEFT JOIN public.inventory_exits ie ON ie.delivered_to_customer_id = c.id
    WHERE c.deleted_at IS NULL
    GROUP BY c.id
)
SELECT
    COUNT(DISTINCT ce.customer_id) AS total_customers,
    COUNT(DISTINCT ce.customer_id) FILTER (WHERE ce.exit_count > 0) AS customers_with_exits,
    COUNT(DISTINCT ce.customer_id) FILTER (WHERE ce.exit_count = 0) AS customers_without_exits,
    COALESCE(SUM(ce.exit_count), 0)::bigint AS total_exits_to_customers
FROM customer_exits ce;
$$;


ALTER FUNCTION "public"."get_customers_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_customers_stats"() IS 'Calcula estadísticas globales de clientes en una sola consulta agregada.';



CREATE OR REPLACE FUNCTION "public"."get_delivery_orders_admin_list"("search_term" "text" DEFAULT ''::"text", "page" integer DEFAULT 1, "page_size" integer DEFAULT 50, "order_type_filter" "text" DEFAULT 'all'::"text", "status_filter" "text" DEFAULT 'all'::"text", "start_ts" timestamp with time zone DEFAULT NULL::timestamp with time zone, "end_ts" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("id" "uuid", "order_type" "text", "customer_id" "uuid", "assigned_to_user_id" "uuid", "order_number" "text", "status" "text", "notes" "text", "delivery_address" "text", "created_at" timestamp with time zone, "zone_id" "uuid", "zone_name" "text", "customer_name" "text", "assigned_user_name" "text", "pickup_assigned_user_id" "uuid", "pickup_assigned_user_name" "text", "total_items" bigint, "total_quantity" numeric, "delivered_quantity" numeric, "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  _limit  integer := GREATEST(COALESCE(page_size, 50), 1);
  _offset integer := GREATEST((COALESCE(page, 1) - 1) * _limit, 0);
  _search text    := COALESCE(LOWER(TRIM(search_term)), '');
  _otf    text    := COALESCE(NULLIF(LOWER(TRIM(order_type_filter)), ''), 'all');
  _sf     text    := COALESCE(NULLIF(LOWER(TRIM(status_filter)), ''), 'all');
BEGIN
  RETURN QUERY
  WITH pickup_agg AS (
    -- Agrega todos los usuarios activos de retiro por orden en un solo string y
    -- expone el UUID del primero (para compatibilidad con el campo pickup_assigned_user_id).
    SELECT
      pua.delivery_order_id,
      (ARRAY_AGG(pp.id ORDER BY pua.created_at))[1]                          AS first_user_id,
      STRING_AGG(pp.full_name, ', ' ORDER BY pua.created_at)                 AS all_user_names
    FROM public.delivery_order_pickup_assignments pua
    JOIN public.profiles pp ON pp.id = pua.user_id
    WHERE pua.deleted_at IS NULL
    GROUP BY pua.delivery_order_id
  ),
  filtered AS (
    SELECT
      dord.id,
      dord.order_type,
      dord.customer_id,
      dord.assigned_to_user_id,
      dord.order_number,
      dord.status,
      dord.notes,
      dord.delivery_address,
      dord.created_at,
      dord.zone_id,
      z.name          AS zone_name,
      c.name          AS customer_name,
      pa.full_name    AS assigned_user_name,
      pagg.first_user_id    AS pickup_assigned_user_id,
      pagg.all_user_names   AS pickup_assigned_user_name
    FROM public.delivery_orders dord
    LEFT JOIN public.customers c   ON c.id  = dord.customer_id
    LEFT JOIN public.profiles  pa  ON pa.id = dord.assigned_to_user_id
    LEFT JOIN public.zones     z   ON z.id  = dord.zone_id
    LEFT JOIN pickup_agg pagg      ON pagg.delivery_order_id = dord.id
    WHERE dord.deleted_at IS NULL
      AND (_otf = 'all' OR dord.order_type = _otf)
      AND (_sf  = 'all' OR dord.status     = _sf)
      AND (start_ts IS NULL OR dord.created_at >= start_ts)
      AND (end_ts   IS NULL OR dord.created_at <= end_ts)
      AND (
        _search = ''
        OR dord.order_number ILIKE '%' || _search || '%'
        OR dord.id::text     ILIKE '%' || _search || '%'
        OR LOWER(COALESCE(c.name,           ''::text)) LIKE '%' || _search || '%'
        OR LOWER(COALESCE(c.id_number,      ''::text)) LIKE '%' || _search || '%'
        OR LOWER(COALESCE(pa.full_name,     ''::text)) LIKE '%' || _search || '%'
        OR LOWER(COALESCE(pa.email,         ''::text)) LIKE '%' || _search || '%'
        OR LOWER(COALESCE(pagg.all_user_names, ''::text)) LIKE '%' || _search || '%'
      )
  ),
  items_agg AS (
    SELECT
      doi.delivery_order_id,
      COUNT(*)::bigint     AS total_items,
      SUM(doi.quantity)    AS total_quantity,
      SUM(doi.delivered_quantity) AS delivered_quantity
    FROM public.delivery_order_items doi
    WHERE doi.deleted_at IS NULL
    GROUP BY doi.delivery_order_id
  ),
  enriched AS (
    SELECT
      f.*,
      COALESCE(ia.total_items,        0)::bigint  AS total_items,
      COALESCE(ia.total_quantity,     0)::numeric AS total_quantity,
      COALESCE(ia.delivered_quantity, 0)::numeric AS delivered_quantity
    FROM filtered f
    LEFT JOIN items_agg ia ON ia.delivery_order_id = f.id
  ),
  numbered AS (
    SELECT
      e.*,
      COUNT(*) OVER ()                              AS total_count,
      ROW_NUMBER() OVER (ORDER BY e.created_at DESC) AS row_number
    FROM enriched e
  )
  SELECT
    n.id,
    n.order_type::text,
    n.customer_id,
    n.assigned_to_user_id,
    n.order_number::text,
    n.status::text,
    n.notes::text,
    n.delivery_address::text,
    n.created_at,
    n.zone_id,
    n.zone_name::text,
    n.customer_name::text,
    n.assigned_user_name::text,
    n.pickup_assigned_user_id,
    n.pickup_assigned_user_name::text,
    n.total_items,
    n.total_quantity,
    n.delivered_quantity,
    n.total_count
  FROM numbered n
  WHERE n.row_number > _offset
  ORDER BY n.row_number
  LIMIT _limit;
END;
$$;


ALTER FUNCTION "public"."get_delivery_orders_admin_list"("search_term" "text", "page" integer, "page_size" integer, "order_type_filter" "text", "status_filter" "text", "start_ts" timestamp with time zone, "end_ts" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_delivery_orders_admin_list"("search_term" "text", "page" integer, "page_size" integer, "order_type_filter" "text", "status_filter" "text", "start_ts" timestamp with time zone, "end_ts" timestamp with time zone) IS 'Listado paginado de órdenes de entrega (admin) con filtros, búsqueda y usuarios autorizados de retiro (múltiples, concatenados).';



CREATE OR REPLACE FUNCTION "public"."get_delivery_orders_dashboard"("search_term" "text" DEFAULT ''::"text", "page" integer DEFAULT 1, "page_size" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "customer_id" "uuid", "customer_name" "text", "customer_id_number" "text", "status" "text", "notes" "text", "delivery_address" "text", "created_at" timestamp with time zone, "created_by" "uuid", "created_by_name" "text", "total_items" bigint, "total_quantity" numeric, "delivered_items" bigint, "delivered_quantity" numeric, "items" "jsonb", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    _limit integer := GREATEST(COALESCE(page_size, 5), 1);
    _offset integer := GREATEST((COALESCE(page, 1) - 1) * _limit, 0);
    _search text := COALESCE(LOWER(TRIM(search_term)), '');
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            dord.id,
            dord.customer_id,
            dord.status,
            dord.notes,
            dord.delivery_address,
            dord.created_at,
            dord.created_by,
            c.name AS customer_name,
            c.id_number AS customer_id_number
        FROM public.delivery_orders dord
        LEFT JOIN public.customers c ON c.id = dord.customer_id
        WHERE dord.deleted_at IS NULL
          AND (
            _search = ''
            OR dord.status ILIKE '%' || _search || '%'
            OR dord.notes ILIKE '%' || _search || '%'
            OR dord.id::text ILIKE '%' || _search || '%'
            OR LOWER(c.name) LIKE '%' || _search || '%'
            OR LOWER(c.id_number) LIKE '%' || _search || '%'
          )
    ),
    items_agg AS (
        SELECT
            doi.delivery_order_id,
            COUNT(*)::bigint AS total_items,
            SUM(doi.quantity)::numeric AS total_quantity,
            COUNT(*) FILTER (WHERE doi.delivered_quantity >= doi.quantity)::bigint AS delivered_items,
            SUM(doi.delivered_quantity)::numeric AS delivered_quantity,
            jsonb_agg(
                jsonb_build_object(
                    'product_id', doi.product_id,
                    'product_name', p.name,
                    'quantity', doi.quantity,
                    'delivered_quantity', doi.delivered_quantity,
                    'warehouse_id', doi.warehouse_id,
                    'warehouse_name', w.name
                )
            ) AS items
        FROM public.delivery_order_items doi
        LEFT JOIN public.products p ON p.id = doi.product_id
        LEFT JOIN public.warehouses w ON w.id = doi.warehouse_id
        GROUP BY doi.delivery_order_id
    ),
    enriched AS (
        SELECT
            f.*,
            pr.full_name AS created_by_name,
            COALESCE(ia.total_items, 0)::bigint AS total_items,
            COALESCE(ia.total_quantity, 0)::numeric AS total_quantity,
            COALESCE(ia.delivered_items, 0)::bigint AS delivered_items,
            COALESCE(ia.delivered_quantity, 0)::numeric AS delivered_quantity,
            COALESCE(ia.items, '[]'::jsonb) AS items
        FROM filtered f
        LEFT JOIN public.profiles pr ON pr.id = f.created_by
        LEFT JOIN items_agg ia ON ia.delivery_order_id = f.id
    ),
    numbered AS (
        SELECT
            e.*,
            COUNT(*) OVER () AS total_count,
            ROW_NUMBER() OVER (ORDER BY e.created_at DESC) AS row_number
        FROM enriched e
    )
    SELECT
        n.id,
        n.customer_id,
        n.customer_name::text,
        n.customer_id_number::text,
        n.status::text,
        n.notes::text,
        n.delivery_address::text,
        n.created_at,
        n.created_by,
        n.created_by_name::text,
        n.total_items,
        n.total_quantity,
        n.delivered_items,
        n.delivered_quantity,
        n.items,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$$;


ALTER FUNCTION "public"."get_delivery_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_delivery_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer) IS 'Devuelve órdenes de entrega con información de cliente, items agregados y estado de completitud.';



CREATE OR REPLACE FUNCTION "public"."get_delivery_orders_stats"() RETURNS TABLE("total_orders" bigint, "pending_orders" bigint, "preparing_orders" bigint, "ready_orders" bigint, "delivered_orders" bigint, "cancelled_orders" bigint, "total_items_pending" bigint, "total_quantity_pending" numeric)
    LANGUAGE "sql" STABLE
    AS $$
WITH order_stats AS (
    SELECT
        dord.id,
        dord.status,
        COUNT(doi.id) AS item_count,
        SUM(doi.quantity - doi.delivered_quantity) AS pending_quantity
    FROM public.delivery_orders dord
    LEFT JOIN public.delivery_order_items doi ON doi.delivery_order_id = dord.id
    WHERE dord.deleted_at IS NULL
    GROUP BY dord.id, dord.status
)
SELECT
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE status = 'pending') AS pending_orders,
    COUNT(*) FILTER (WHERE status = 'preparing') AS preparing_orders,
    COUNT(*) FILTER (WHERE status = 'ready') AS ready_orders,
    COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_orders,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders,
    COUNT(*) FILTER (WHERE status IN ('pending', 'preparing', 'ready') AND pending_quantity > 0) AS total_items_pending,
    COALESCE(SUM(pending_quantity) FILTER (WHERE status IN ('pending', 'preparing', 'ready')), 0)::numeric AS total_quantity_pending
FROM order_stats;
$$;


ALTER FUNCTION "public"."get_delivery_orders_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_delivery_orders_stats"() IS 'Calcula estadísticas globales de órdenes de entrega en una sola consulta agregada.';



CREATE OR REPLACE FUNCTION "public"."get_inventory_entries_dashboard"("search_term" "text" DEFAULT ''::"text", "page" integer DEFAULT 1, "page_size" integer DEFAULT 5, "date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "supplier_filter" "uuid" DEFAULT NULL::"uuid", "user_filter" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "product_id" "uuid", "product_name" "text", "product_sku" "text", "product_barcode" "text", "warehouse_id" "uuid", "warehouse_name" "text", "supplier_id" "uuid", "supplier_name" "text", "purchase_order_id" "uuid", "quantity" numeric, "entry_type" "text", "barcode_scanned" "text", "created_by" "uuid", "created_by_name" "text", "created_at" timestamp with time zone, "is_cancelled" boolean, "cancellation_id" "uuid", "cancellation_observations" "text", "cancellation_created_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    _limit integer := GREATEST(COALESCE(page_size, 5), 1);
    _offset integer := GREATEST((COALESCE(page, 1) - 1) * _limit, 0);
    _search text := COALESCE(LOWER(TRIM(search_term)), '');
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            ie.id,
            ie.product_id,
            ie.warehouse_id,
            ie.supplier_id,
            ie.purchase_order_id,
            ie.quantity,
            ie.entry_type,
            ie.barcode_scanned,
            ie.created_by,
            ie.created_at,
            p.name AS product_name,
            p.sku AS product_sku,
            p.barcode AS product_barcode,
            w.name AS warehouse_name,
            s.name AS supplier_name,
            pr.full_name AS created_by_name,
            iec.id AS cancellation_id,
            iec.observations AS cancellation_observations,
            iec.created_at AS cancellation_created_at
        FROM public.inventory_entries ie
        LEFT JOIN public.products p ON p.id = ie.product_id
        LEFT JOIN public.warehouses w ON w.id = ie.warehouse_id
        LEFT JOIN public.suppliers s ON s.id = ie.supplier_id
        LEFT JOIN public.profiles pr ON pr.id = ie.created_by
        LEFT JOIN public.inventory_entry_cancellations iec ON iec.inventory_entry_id = ie.id
        WHERE (
            _search = ''
            OR LOWER(p.name) LIKE '%' || _search || '%'
            OR LOWER(p.sku) LIKE '%' || _search || '%'
            OR LOWER(p.barcode) LIKE '%' || _search || '%'
            OR LOWER(w.name) LIKE '%' || _search || '%'
            OR LOWER(s.name) LIKE '%' || _search || '%'
            OR LOWER(pr.full_name) LIKE '%' || _search || '%'
            OR LOWER(ie.entry_type) LIKE '%' || _search || '%'
            OR LOWER(ie.barcode_scanned) LIKE '%' || _search || '%'
            OR ie.purchase_order_id::text LIKE '%' || _search || '%'
        )
          AND (date_from IS NULL OR ie.created_at >= date_from)
          AND (date_to IS NULL OR ie.created_at <= date_to)
          AND (supplier_filter IS NULL OR ie.supplier_id = supplier_filter)
          AND (user_filter IS NULL OR ie.created_by = user_filter)
    ),
    numbered AS (
        SELECT
            f.*,
            COUNT(*) OVER () AS total_count,
            ROW_NUMBER() OVER (ORDER BY f.created_at DESC) AS row_number
        FROM filtered f
    )
    SELECT
        n.id,
        n.product_id,
        n.product_name::text,
        n.product_sku::text,
        n.product_barcode::text,
        n.warehouse_id,
        n.warehouse_name::text,
        n.supplier_id,
        n.supplier_name::text,
        n.purchase_order_id,
        n.quantity,
        n.entry_type::text,
        n.barcode_scanned::text,
        n.created_by,
        n.created_by_name::text,
        n.created_at,
        (n.cancellation_id IS NOT NULL) AS is_cancelled,
        n.cancellation_id,
        n.cancellation_observations::text,
        n.cancellation_created_at,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$$;


ALTER FUNCTION "public"."get_inventory_entries_dashboard"("search_term" "text", "page" integer, "page_size" integer, "date_from" timestamp with time zone, "date_to" timestamp with time zone, "supplier_filter" "uuid", "user_filter" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_inventory_entries_dashboard"("search_term" "text", "page" integer, "page_size" integer, "date_from" timestamp with time zone, "date_to" timestamp with time zone, "supplier_filter" "uuid", "user_filter" "uuid") IS 'Devuelve entradas de inventario con producto, bodega, proveedor, usuario y estado de cancelacion. Permite filtrar por busqueda de texto, rango de fechas, proveedor y usuario. Usa SECURITY DEFINER para permitir leer perfiles de todos los usuarios en el dashboard.';



CREATE OR REPLACE FUNCTION "public"."get_inventory_entries_stats"() RETURNS TABLE("total_entries" bigint, "total_quantity" numeric, "unique_warehouses" bigint, "active_entries" bigint, "cancelled_entries" bigint)
    LANGUAGE "sql" STABLE
    AS $$
WITH entries AS (
    SELECT
        ie.id,
        ie.quantity,
        ie.warehouse_id,
        iec.id AS cancellation_id
    FROM public.inventory_entries ie
    LEFT JOIN public.inventory_entry_cancellations iec ON iec.inventory_entry_id = ie.id
)
SELECT
    COUNT(*) AS total_entries,
    COALESCE(SUM(quantity), 0) AS total_quantity,
    COUNT(DISTINCT warehouse_id) AS unique_warehouses,
    COUNT(*) FILTER (WHERE cancellation_id IS NULL) AS active_entries,
    COUNT(*) FILTER (WHERE cancellation_id IS NOT NULL) AS cancelled_entries
FROM entries;
$$;


ALTER FUNCTION "public"."get_inventory_entries_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_inventory_entries_stats"() IS 'Calcula estadísticas globales de entradas de inventario en una sola consulta agregada.';



CREATE OR REPLACE FUNCTION "public"."get_inventory_exits_dashboard"("search_term" "text" DEFAULT ''::"text", "page" integer DEFAULT 1, "page_size" integer DEFAULT 5, "date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "warehouse_filter" "uuid" DEFAULT NULL::"uuid", "user_filter" "uuid" DEFAULT NULL::"uuid", "status_filter" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "product_id" "uuid", "product_name" "text", "product_sku" "text", "product_barcode" "text", "warehouse_id" "uuid", "warehouse_name" "text", "quantity" numeric, "barcode_scanned" "text", "created_by" "uuid", "created_by_name" "text", "created_at" timestamp with time zone, "is_cancelled" boolean, "cancellation_id" "uuid", "cancellation_observations" "text", "cancellation_created_at" timestamp with time zone, "delivery_order_id" "uuid", "delivery_observations" "text", "delivered_to_name" "text", "delivered_to_id_number" "text", "delivered_to_type" "text", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    _limit integer := GREATEST(COALESCE(page_size, 5), 1);
    _offset integer := GREATEST((COALESCE(page, 1) - 1) * _limit, 0);
    _search text := COALESCE(LOWER(TRIM(search_term)), '');
    _status_filter text := NULLIF(TRIM(COALESCE(status_filter, '')), '');
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            ie.id,
            ie.product_id,
            ie.warehouse_id,
            ie.quantity,
            ie.barcode_scanned,
            ie.created_by,
            ie.created_at,
            ie.delivery_order_id,
            ie.delivery_observations,
            ie.delivered_to_customer_id,
            ie.delivered_to_user_id,
            p.name AS product_name,
            p.sku AS product_sku,
            p.barcode AS product_barcode,
            w.name AS warehouse_name,
            pr.full_name AS created_by_name,
            iec.id AS cancellation_id,
            iec.observations AS cancellation_observations,
            iec.created_at AS cancellation_created_at,
            CASE
                WHEN ie.delivered_to_customer_id IS NOT NULL THEN c.name
                WHEN ie.delivered_to_user_id IS NOT NULL THEN pr_delivered.full_name
                ELSE NULL
            END AS delivered_to_name,
            CASE
                WHEN ie.delivered_to_customer_id IS NOT NULL THEN c.id_number
                ELSE NULL
            END AS delivered_to_id_number,
            CASE
                WHEN ie.delivered_to_customer_id IS NOT NULL THEN 'customer'::text
                WHEN ie.delivered_to_user_id IS NOT NULL THEN 'user'::text
                ELSE NULL
            END AS delivered_to_type
        FROM public.inventory_exits ie
        LEFT JOIN public.products p ON p.id = ie.product_id
        LEFT JOIN public.warehouses w ON w.id = ie.warehouse_id
        LEFT JOIN public.profiles pr ON pr.id = ie.created_by
        LEFT JOIN public.inventory_exit_cancellations iec ON iec.inventory_exit_id = ie.id
        LEFT JOIN public.customers c ON c.id = ie.delivered_to_customer_id AND c.deleted_at IS NULL
        LEFT JOIN public.profiles pr_delivered ON pr_delivered.id = ie.delivered_to_user_id
        WHERE (
            _search = ''
            OR LOWER(p.name) LIKE '%' || _search || '%'
            OR LOWER(p.sku) LIKE '%' || _search || '%'
            OR LOWER(p.barcode) LIKE '%' || _search || '%'
            OR LOWER(w.name) LIKE '%' || _search || '%'
            OR LOWER(pr.full_name) LIKE '%' || _search || '%'
            OR LOWER(ie.barcode_scanned) LIKE '%' || _search || '%'
            OR LOWER(COALESCE(c.name, '')) LIKE '%' || _search || '%'
            OR LOWER(COALESCE(pr_delivered.full_name, '')) LIKE '%' || _search || '%'
        )
          AND (date_from IS NULL OR ie.created_at >= date_from)
          AND (date_to IS NULL OR ie.created_at <= date_to)
          AND (warehouse_filter IS NULL OR ie.warehouse_id = warehouse_filter)
          AND (user_filter IS NULL OR ie.created_by = user_filter)
          AND (
            _status_filter IS NULL
            OR (_status_filter = 'active' AND iec.id IS NULL)
            OR (_status_filter = 'cancelled' AND iec.id IS NOT NULL)
          )
    ),
    numbered AS (
        SELECT
            f.*,
            COUNT(*) OVER () AS total_count,
            ROW_NUMBER() OVER (ORDER BY f.created_at DESC) AS row_number
        FROM filtered f
    )
    SELECT
        n.id,
        n.product_id,
        n.product_name::text,
        n.product_sku::text,
        n.product_barcode::text,
        n.warehouse_id,
        n.warehouse_name::text,
        n.quantity,
        n.barcode_scanned::text,
        n.created_by,
        n.created_by_name::text,
        n.created_at,
        (n.cancellation_id IS NOT NULL) AS is_cancelled,
        n.cancellation_id,
        n.cancellation_observations::text,
        n.cancellation_created_at,
        n.delivery_order_id,
        n.delivery_observations,
        n.delivered_to_name::text,
        n.delivered_to_id_number::text,
        n.delivered_to_type::text,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$$;


ALTER FUNCTION "public"."get_inventory_exits_dashboard"("search_term" "text", "page" integer, "page_size" integer, "date_from" timestamp with time zone, "date_to" timestamp with time zone, "warehouse_filter" "uuid", "user_filter" "uuid", "status_filter" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_inventory_exits_dashboard"("search_term" "text", "page" integer, "page_size" integer, "date_from" timestamp with time zone, "date_to" timestamp with time zone, "warehouse_filter" "uuid", "user_filter" "uuid", "status_filter" "text") IS 'Devuelve salidas de inventario con producto, bodega, usuario, cancelacion, orden de entrega, observaciones y entregado a. Permite filtrar por busqueda de texto, rango de fechas, bodega, usuario y estado (active/cancelled). Usa SECURITY DEFINER para permitir leer perfiles de todos los usuarios en el dashboard.';



CREATE OR REPLACE FUNCTION "public"."get_inventory_exits_stats"() RETURNS TABLE("total_exits" bigint, "total_quantity" numeric, "unique_warehouses" bigint, "active_exits" bigint, "cancelled_exits" bigint)
    LANGUAGE "sql" STABLE
    AS $$
WITH exits AS (
    SELECT
        ie.id,
        ie.quantity,
        ie.warehouse_id,
        iec.id AS cancellation_id
    FROM public.inventory_exits ie
    LEFT JOIN public.inventory_exit_cancellations iec ON iec.inventory_exit_id = ie.id
)
SELECT
    COUNT(*) AS total_exits,
    COALESCE(SUM(quantity), 0) AS total_quantity,
    COUNT(DISTINCT warehouse_id) AS unique_warehouses,
    COUNT(*) FILTER (WHERE cancellation_id IS NULL) AS active_exits,
    COUNT(*) FILTER (WHERE cancellation_id IS NOT NULL) AS cancelled_exits
FROM exits;
$$;


ALTER FUNCTION "public"."get_inventory_exits_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_inventory_exits_stats"() IS 'Calcula estadísticas globales de salidas de inventario en una sola consulta agregada.';



CREATE OR REPLACE FUNCTION "public"."get_movements_by_period"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "movement_limit" integer DEFAULT 1000) RETURNS TABLE("id" "uuid", "movement_type" "text", "created_at" timestamp with time zone, "product_name" "text", "product_sku" "text", "product_barcode" "text", "quantity" numeric, "warehouse_name" "text", "user_name" "text", "supplier_name" "text", "purchase_order_id" "uuid", "delivery_order_id" "uuid", "delivery_observations" "text", "is_cancelled" boolean, "cancellation_observations" "text", "cancelled_by" "text", "cancelled_at" timestamp with time zone, "delivered_to_name" "text", "delivered_to_id_number" "text", "delivered_to_type" "text")
    LANGUAGE "sql" STABLE
    AS $$
WITH all_movements AS (
    -- Entradas
    SELECT
        ie.id,
        'entry' AS movement_type,
        ie.created_at,
        p.name AS product_name,
        p.sku AS product_sku,
        p.barcode AS product_barcode,
        ie.quantity,
        w.name AS warehouse_name,
        pr.full_name AS user_name,
        s.name AS supplier_name,
        ie.purchase_order_id,
        NULL::uuid AS delivery_order_id,
        NULL::text AS delivery_observations,
        iec.id IS NOT NULL AS is_cancelled,
        iec.observations AS cancellation_observations,
        pr_cancel.full_name AS cancelled_by,
        iec.created_at AS cancelled_at,
        NULL::text AS delivered_to_name,
        NULL::text AS delivered_to_id_number,
        NULL::text AS delivered_to_type
    FROM public.inventory_entries ie
    LEFT JOIN public.products p ON p.id = ie.product_id
    LEFT JOIN public.warehouses w ON w.id = ie.warehouse_id
    LEFT JOIN public.profiles pr ON pr.id = ie.created_by
    LEFT JOIN public.suppliers s ON s.id = ie.supplier_id
    LEFT JOIN public.inventory_entry_cancellations iec ON iec.inventory_entry_id = ie.id
    LEFT JOIN public.profiles pr_cancel ON pr_cancel.id = iec.created_by
    WHERE ie.created_at >= start_date
      AND ie.created_at <= end_date
    
    UNION ALL
    
    -- Salidas
    SELECT
        iex.id,
        'exit' AS movement_type,
        iex.created_at,
        p.name AS product_name,
        p.sku AS product_sku,
        p.barcode AS product_barcode,
        iex.quantity,
        w.name AS warehouse_name,
        pr.full_name AS user_name,
        NULL AS supplier_name,
        NULL AS purchase_order_id,
        iex.delivery_order_id,
        iex.delivery_observations,
        iecx.id IS NOT NULL AS is_cancelled,
        iecx.observations AS cancellation_observations,
        pr_cancel.full_name AS cancelled_by,
        iecx.created_at AS cancelled_at,
        -- Información de "Entregado a"
        CASE
            WHEN iex.delivered_to_customer_id IS NOT NULL THEN c.name
            WHEN iex.delivered_to_user_id IS NOT NULL THEN pr_delivered.full_name
            ELSE NULL
        END AS delivered_to_name,
        CASE
            WHEN iex.delivered_to_customer_id IS NOT NULL THEN c.id_number
            ELSE NULL
        END AS delivered_to_id_number,
        CASE
            WHEN iex.delivered_to_customer_id IS NOT NULL THEN 'customer'::text
            WHEN iex.delivered_to_user_id IS NOT NULL THEN 'user'::text
            ELSE NULL
        END AS delivered_to_type
    FROM public.inventory_exits iex
    LEFT JOIN public.products p ON p.id = iex.product_id
    LEFT JOIN public.warehouses w ON w.id = iex.warehouse_id
    LEFT JOIN public.profiles pr ON pr.id = iex.created_by
    LEFT JOIN public.inventory_exit_cancellations iecx ON iecx.inventory_exit_id = iex.id
    LEFT JOIN public.profiles pr_cancel ON pr_cancel.id = iecx.created_by
    LEFT JOIN public.customers c ON c.id = iex.delivered_to_customer_id AND c.deleted_at IS NULL
    LEFT JOIN public.profiles pr_delivered ON pr_delivered.id = iex.delivered_to_user_id
    WHERE iex.created_at >= start_date
      AND iex.created_at <= end_date
)
SELECT
    am.id,
    am.movement_type,
    am.created_at,
    am.product_name,
    am.product_sku,
    am.product_barcode,
    am.quantity,
    am.warehouse_name,
    am.user_name,
    am.supplier_name,
    am.purchase_order_id,
    am.delivery_order_id,
    am.delivery_observations,
    am.is_cancelled,
    am.cancellation_observations,
    am.cancelled_by,
    am.cancelled_at,
    am.delivered_to_name,
    am.delivered_to_id_number,
    am.delivered_to_type
FROM all_movements am
ORDER BY am.created_at DESC
LIMIT movement_limit;
$$;


ALTER FUNCTION "public"."get_movements_by_period"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "movement_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_movements_by_period"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "movement_limit" integer) IS 'Retorna movimientos (entradas y salidas) en un período con todas las relaciones, incluyendo orden de compra, orden de entrega, observaciones de entrega e información de "Entregado a" para salidas. Incluye LIMIT para evitar descargas masivas.';



CREATE OR REPLACE FUNCTION "public"."get_orders_for_return"("return_type_param" "text") RETURNS TABLE("id" "uuid", "order_number" "text", "display_name" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    IF return_type_param = 'purchase_order' THEN
        RETURN QUERY
        SELECT
            po.id,
            po.order_number,
            COALESCE(po.order_number, 'OC-' || SUBSTRING(po.id::text, 1, 8)) AS display_name
        FROM public.purchase_orders po
        WHERE po.status != 'cancelled'
          AND po.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 
              FROM public.inventory_entries ie
              WHERE ie.purchase_order_id = po.id
          )
        ORDER BY po.created_at DESC;
        
    ELSIF return_type_param = 'delivery_order' THEN
        RETURN QUERY
        SELECT
            dord.id,
            dord.order_number,
            COALESCE(dord.order_number, 'OE-' || SUBSTRING(dord.id::text, 1, 8)) AS display_name
        FROM public.delivery_orders dord
        WHERE dord.status != 'cancelled'
          AND dord.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 
              FROM public.inventory_exits iex
              WHERE iex.delivery_order_id = dord.id
          )
        ORDER BY dord.created_at DESC;
    ELSE
        -- Retornar vacío si el tipo no es válido
        RETURN;
    END IF;
END;
$$;


ALTER FUNCTION "public"."get_orders_for_return"("return_type_param" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_orders_for_return"("return_type_param" "text") IS 'Devuelve órdenes disponibles para devolución. Incluye todas las órdenes con productos recibidos/entregados, excepto las canceladas. Permite devolver productos de órdenes en cualquier estado (pending, approved, received) siempre que tengan productos recibidos/entregados.';



CREATE OR REPLACE FUNCTION "public"."get_orders_for_return"("return_type_param" "text", "search_term" "text" DEFAULT ''::"text") RETURNS TABLE("id" "uuid", "order_number" "text", "display_name" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    IF return_type_param = 'purchase_order' THEN
        RETURN QUERY
        SELECT
            po.id,
            po.order_number,
            COALESCE(po.order_number, 'OC-' || SUBSTRING(po.id::text, 1, 8)) AS display_name
        FROM public.purchase_orders po
        WHERE po.status != 'cancelled'
          AND po.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 
              FROM public.inventory_entries ie
              WHERE ie.purchase_order_id = po.id
          )
          AND (
              search_term = ''
              OR LOWER(po.order_number) LIKE '%' || LOWER(search_term) || '%'
              OR LOWER(COALESCE(po.order_number, 'OC-' || SUBSTRING(po.id::text, 1, 8))) LIKE '%' || LOWER(search_term) || '%'
              OR po.id::text LIKE '%' || search_term || '%'
          )
        ORDER BY po.created_at DESC
        LIMIT 50; -- Limitar resultados para mejor rendimiento
        
    ELSIF return_type_param = 'delivery_order' THEN
        RETURN QUERY
        SELECT
            dord.id,
            dord.order_number,
            COALESCE(dord.order_number, 'OE-' || SUBSTRING(dord.id::text, 1, 8)) AS display_name
        FROM public.delivery_orders dord
        WHERE dord.status != 'cancelled'
          AND dord.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 
              FROM public.inventory_exits iex
              WHERE iex.delivery_order_id = dord.id
          )
          AND (
              search_term = ''
              OR LOWER(dord.order_number) LIKE '%' || LOWER(search_term) || '%'
              OR LOWER(COALESCE(dord.order_number, 'OE-' || SUBSTRING(dord.id::text, 1, 8))) LIKE '%' || LOWER(search_term) || '%'
              OR dord.id::text LIKE '%' || search_term || '%'
          )
        ORDER BY dord.created_at DESC
        LIMIT 50; -- Limitar resultados para mejor rendimiento
    ELSE
        -- Retornar vacío si el tipo no es válido
        RETURN;
    END IF;
END;
$$;


ALTER FUNCTION "public"."get_orders_for_return"("return_type_param" "text", "search_term" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_orders_for_return"("return_type_param" "text", "search_term" "text") IS 'Devuelve órdenes disponibles para devolución con búsqueda. Incluye todas las órdenes con productos recibidos/entregados, excepto las canceladas. Permite buscar por número de orden o ID. Limita resultados a 50 para mejor rendimiento.';



CREATE OR REPLACE FUNCTION "public"."get_period_stats"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "period_type" "text" DEFAULT 'daily'::"text") RETURNS TABLE("period_date" "date", "period_label" "text", "entries_count" bigint, "exits_count" bigint, "entries_quantity" numeric, "exits_quantity" numeric, "cancellations_count" bigint, "net_movement" numeric)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    _start_date timestamptz := start_date;
    _end_date timestamptz := end_date;
    _period_type text := COALESCE(period_type, 'daily');
    _trunc_format text;
BEGIN
    -- Determinar formato de truncamiento según el tipo de período
    CASE _period_type
        WHEN 'daily' THEN _trunc_format := 'day';
        WHEN 'weekly' THEN _trunc_format := 'week';
        WHEN 'monthly' THEN _trunc_format := 'month';
        WHEN 'yearly' THEN _trunc_format := 'year';
        ELSE _trunc_format := 'day';
    END CASE;

    RETURN QUERY
    WITH all_movements AS (
        -- Entradas
        SELECT
            date_trunc(_trunc_format, ie.created_at) AS period,
            'entry' AS movement_type,
            ie.quantity,
            ie.id AS movement_id
        FROM public.inventory_entries ie
        WHERE ie.created_at >= _start_date
          AND ie.created_at <= _end_date
        
        UNION ALL
        
        -- Salidas
        SELECT
            date_trunc(_trunc_format, iex.created_at) AS period,
            'exit' AS movement_type,
            iex.quantity,
            iex.id AS movement_id
        FROM public.inventory_exits iex
        WHERE iex.created_at >= _start_date
          AND iex.created_at <= _end_date
    ),
    cancellations AS (
        -- Cancelaciones de entradas
        SELECT
            date_trunc(_trunc_format, iec.created_at) AS period,
            iec.id
        FROM public.inventory_entry_cancellations iec
        WHERE iec.created_at >= _start_date
          AND iec.created_at <= _end_date
        
        UNION ALL
        
        -- Cancelaciones de salidas
        SELECT
            date_trunc(_trunc_format, iecx.created_at) AS period,
            iecx.id
        FROM public.inventory_exit_cancellations iecx
        WHERE iecx.created_at >= _start_date
          AND iecx.created_at <= _end_date
    ),
    period_series AS (
        SELECT generate_series(
            date_trunc(_trunc_format, _start_date),
            date_trunc(_trunc_format, _end_date),
            ('1 ' || _trunc_format)::interval
        ) AS period
    ),
    aggregated AS (
        SELECT
            ps.period,
            COUNT(*) FILTER (WHERE am.movement_type = 'entry') AS entries_count,
            COUNT(*) FILTER (WHERE am.movement_type = 'exit') AS exits_count,
            COALESCE(SUM(am.quantity) FILTER (WHERE am.movement_type = 'entry'), 0) AS entries_quantity,
            COALESCE(SUM(am.quantity) FILTER (WHERE am.movement_type = 'exit'), 0) AS exits_quantity,
            COUNT(DISTINCT c.id) AS cancellations_count
        FROM period_series ps
        LEFT JOIN all_movements am ON date_trunc(_trunc_format, am.period) = ps.period
        LEFT JOIN cancellations c ON c.period = ps.period
        GROUP BY ps.period
    )
    SELECT
        a.period::date AS period_date,
        CASE _period_type
            WHEN 'daily' THEN to_char(a.period, 'DD Mon')
            WHEN 'weekly' THEN 'Sem ' || to_char(a.period, 'WW')
            WHEN 'monthly' THEN to_char(a.period, 'Mon YYYY')
            WHEN 'yearly' THEN to_char(a.period, 'YYYY')
            ELSE to_char(a.period, 'DD Mon')
        END AS period_label,
        a.entries_count,
        a.exits_count,
        a.entries_quantity,
        a.exits_quantity,
        a.cancellations_count,
        (a.entries_quantity - a.exits_quantity) AS net_movement
    FROM aggregated a
    ORDER BY a.period;
END;
$$;


ALTER FUNCTION "public"."get_period_stats"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "period_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_period_stats"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "period_type" "text") IS 'Retorna estadísticas agregadas por período (daily/weekly/monthly/yearly) con entradas, salidas, cancelaciones y movimiento neto.';



CREATE OR REPLACE FUNCTION "public"."get_product_movement_timeline"("p_product_id" "uuid", "p_page" integer DEFAULT 1, "p_page_size" integer DEFAULT 20, "p_date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_movement_types" "text"[] DEFAULT NULL::"text"[]) RETURNS TABLE("id" "uuid", "movement_type" "text", "movement_date" timestamp with time zone, "description" "text", "quantity" numeric, "warehouse_name" "text", "secondary_warehouse_name" "text", "user_name" "text", "related_order_id" "uuid", "related_order_type" "text", "related_order_number" "text", "observations" "text", "is_cancelled" boolean, "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    _offset integer;
    _types text[];
BEGIN
    _offset := (GREATEST(p_page, 1) - 1) * p_page_size;

    -- Si no se especifican tipos, incluir todos
    IF p_movement_types IS NULL OR array_length(p_movement_types, 1) IS NULL THEN
        _types := ARRAY['entry', 'exit', 'return', 'transfer', 'entry_cancellation', 'exit_cancellation', 'reserved'];
    ELSE
        _types := p_movement_types;
    END IF;

    RETURN QUERY
    WITH all_movements AS (
        -- 1. Entradas de inventario
        SELECT
            ie.id,
            'entry'::text AS movement_type,
            ie.created_at AS movement_date,
            CASE
                WHEN ie.entry_type = 'return' THEN 'Entrada por devolución'
                WHEN ie.purchase_order_id IS NOT NULL THEN 'Entrada de mercancía (OC)'
                ELSE 'Entrada de mercancía'
            END AS description,
            ie.quantity,
            w.name AS warehouse_name,
            NULL::text AS secondary_warehouse_name,
            pr.full_name AS user_name,
            ie.purchase_order_id AS related_order_id,
            CASE WHEN ie.purchase_order_id IS NOT NULL THEN 'purchase_order' ELSE NULL END AS related_order_type,
            po.order_number AS related_order_number,
            NULL::text AS observations,
            (ie.deleted_at IS NOT NULL OR EXISTS (
                SELECT 1 FROM public.inventory_entry_cancellations c
                WHERE c.inventory_entry_id = ie.id AND c.deleted_at IS NULL
            )) AS is_cancelled
        FROM public.inventory_entries ie
        LEFT JOIN public.warehouses w ON w.id = ie.warehouse_id
        LEFT JOIN public.profiles pr ON pr.id = ie.created_by
        LEFT JOIN public.purchase_orders po ON po.id = ie.purchase_order_id
        WHERE ie.product_id = p_product_id
          AND 'entry' = ANY(_types)

        UNION ALL

        -- 2. Salidas de inventario
        SELECT
            iex.id,
            'exit'::text AS movement_type,
            iex.created_at AS movement_date,
            'Salida de mercancía' AS description,
            iex.quantity,
            w.name AS warehouse_name,
            NULL::text AS secondary_warehouse_name,
            pr.full_name AS user_name,
            iex.delivery_order_id AS related_order_id,
            CASE WHEN iex.delivery_order_id IS NOT NULL THEN 'delivery_order' ELSE NULL END AS related_order_type,
            do_tbl.order_number AS related_order_number,
            NULL::text AS observations,
            EXISTS (
                SELECT 1 FROM public.inventory_exit_cancellations c
                WHERE c.inventory_exit_id = iex.id AND c.deleted_at IS NULL
            ) AS is_cancelled
        FROM public.inventory_exits iex
        LEFT JOIN public.warehouses w ON w.id = iex.warehouse_id
        LEFT JOIN public.profiles pr ON pr.id = iex.created_by
        LEFT JOIN public.delivery_orders do_tbl ON do_tbl.id = iex.delivery_order_id
        WHERE iex.product_id = p_product_id
          AND 'exit' = ANY(_types)

        UNION ALL

        -- 3. Devoluciones
        SELECT
            r.id,
            'return'::text AS movement_type,
            r.created_at AS movement_date,
            CASE r.return_type
                WHEN 'purchase_order' THEN 'Devolución de orden de compra'
                WHEN 'delivery_order' THEN 'Devolución de orden de entrega'
                ELSE 'Devolución'
            END AS description,
            r.quantity,
            w.name AS warehouse_name,
            NULL::text AS secondary_warehouse_name,
            pr.full_name AS user_name,
            r.order_id AS related_order_id,
            r.return_type AS related_order_type,
            CASE r.return_type
                WHEN 'purchase_order' THEN po.order_number
                WHEN 'delivery_order' THEN do_tbl.order_number
                ELSE NULL
            END AS related_order_number,
            COALESCE(r.return_reason, '') ||
                CASE WHEN r.observations IS NOT NULL AND r.observations <> ''
                    THEN ' - ' || r.observations ELSE '' END AS observations,
            false AS is_cancelled
        FROM public.returns r
        LEFT JOIN public.warehouses w ON w.id = r.warehouse_id
        LEFT JOIN public.profiles pr ON pr.id = r.created_by
        LEFT JOIN public.purchase_orders po ON po.id = r.order_id AND r.return_type = 'purchase_order'
        LEFT JOIN public.delivery_orders do_tbl ON do_tbl.id = r.order_id AND r.return_type = 'delivery_order'
        WHERE r.product_id = p_product_id
          AND 'return' = ANY(_types)

        UNION ALL

        -- 4. Transferencias entre bodegas
        SELECT
            st.id,
            'transfer'::text AS movement_type,
            st.created_at AS movement_date,
            'Transferencia entre bodegas' AS description,
            st.quantity::numeric,
            w_src.name AS warehouse_name,
            w_dst.name AS secondary_warehouse_name,
            pr.full_name AS user_name,
            NULL::uuid AS related_order_id,
            NULL::text AS related_order_type,
            NULL::text AS related_order_number,
            st.observations,
            false AS is_cancelled
        FROM public.stock_transfers st
        LEFT JOIN public.warehouses w_src ON w_src.id = st.source_warehouse_id
        LEFT JOIN public.warehouses w_dst ON w_dst.id = st.destination_warehouse_id
        LEFT JOIN public.profiles pr ON pr.id = st.created_by
        WHERE st.product_id = p_product_id
          AND 'transfer' = ANY(_types)

        UNION ALL

        -- 5. Cancelaciones de entradas
        SELECT
            iec.id,
            'entry_cancellation'::text AS movement_type,
            iec.created_at AS movement_date,
            'Cancelación de entrada' AS description,
            ie.quantity,
            w.name AS warehouse_name,
            NULL::text AS secondary_warehouse_name,
            pr.full_name AS user_name,
            ie.purchase_order_id AS related_order_id,
            CASE WHEN ie.purchase_order_id IS NOT NULL THEN 'purchase_order' ELSE NULL END AS related_order_type,
            po.order_number AS related_order_number,
            iec.observations,
            true AS is_cancelled
        FROM public.inventory_entry_cancellations iec
        INNER JOIN public.inventory_entries ie ON ie.id = iec.inventory_entry_id
        LEFT JOIN public.warehouses w ON w.id = ie.warehouse_id
        LEFT JOIN public.profiles pr ON pr.id = iec.created_by
        LEFT JOIN public.purchase_orders po ON po.id = ie.purchase_order_id
        WHERE ie.product_id = p_product_id
          AND 'entry_cancellation' = ANY(_types)
          AND iec.deleted_at IS NULL

        UNION ALL

        -- 6. Cancelaciones de salidas
        SELECT
            iecx.id,
            'exit_cancellation'::text AS movement_type,
            iecx.created_at AS movement_date,
            'Cancelación de salida' AS description,
            iex.quantity,
            w.name AS warehouse_name,
            NULL::text AS secondary_warehouse_name,
            pr.full_name AS user_name,
            iex.delivery_order_id AS related_order_id,
            CASE WHEN iex.delivery_order_id IS NOT NULL THEN 'delivery_order' ELSE NULL END AS related_order_type,
            do_tbl.order_number AS related_order_number,
            iecx.observations,
            true AS is_cancelled
        FROM public.inventory_exit_cancellations iecx
        INNER JOIN public.inventory_exits iex ON iex.id = iecx.inventory_exit_id
        LEFT JOIN public.warehouses w ON w.id = iex.warehouse_id
        LEFT JOIN public.profiles pr ON pr.id = iecx.created_by
        LEFT JOIN public.delivery_orders do_tbl ON do_tbl.id = iex.delivery_order_id
        WHERE iex.product_id = p_product_id
          AND 'exit_cancellation' = ANY(_types)
          AND iecx.deleted_at IS NULL

        UNION ALL

        -- 7. Separados: DOI activos sin inventory_exit registrado
        SELECT
            doi.id,
            'reserved'::text AS movement_type,
            doi.created_at AS movement_date,
            'Separado en orden de entrega' AS description,
            (doi.quantity - COALESCE(doi.delivered_quantity, 0))::numeric AS quantity,
            w.name AS warehouse_name,
            NULL::text AS secondary_warehouse_name,
            pr.full_name AS user_name,
            doi.delivery_order_id AS related_order_id,
            'delivery_order'::text AS related_order_type,
            dord.order_number AS related_order_number,
            NULL::text AS observations,
            false AS is_cancelled
        FROM public.delivery_order_items doi
        JOIN public.delivery_orders dord ON dord.id = doi.delivery_order_id
        LEFT JOIN public.warehouses w ON w.id = doi.warehouse_id
        LEFT JOIN public.profiles pr ON pr.id = dord.created_by
        WHERE doi.product_id = p_product_id
          AND doi.deleted_at IS NULL
          AND dord.deleted_at IS NULL
          AND doi.source_delivery_order_id IS NULL
          AND (doi.quantity - COALESCE(doi.delivered_quantity, 0)) > 0
          AND NOT EXISTS (
              SELECT 1 FROM public.inventory_exits iex
              WHERE iex.delivery_order_id = doi.delivery_order_id
                AND iex.product_id = doi.product_id
                AND iex.warehouse_id = doi.warehouse_id
                AND NOT EXISTS (
                    SELECT 1 FROM public.inventory_exit_cancellations iec
                    WHERE iec.inventory_exit_id = iex.id AND iec.deleted_at IS NULL
                )
          )
          AND 'reserved' = ANY(_types)
    ),
    filtered_movements AS (
        SELECT am.*
        FROM all_movements am
        WHERE (p_date_from IS NULL OR am.movement_date >= p_date_from)
          AND (p_date_to IS NULL OR am.movement_date <= p_date_to)
    )
    SELECT
        fm.id,
        fm.movement_type,
        fm.movement_date,
        fm.description,
        fm.quantity,
        fm.warehouse_name,
        fm.secondary_warehouse_name,
        fm.user_name,
        fm.related_order_id,
        fm.related_order_type,
        fm.related_order_number,
        fm.observations,
        fm.is_cancelled,
        COUNT(*) OVER() AS total_count
    FROM filtered_movements fm
    ORDER BY fm.movement_date DESC
    LIMIT p_page_size
    OFFSET _offset;
END;
$$;


ALTER FUNCTION "public"."get_product_movement_timeline"("p_product_id" "uuid", "p_page" integer, "p_page_size" integer, "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_movement_types" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_product_movement_timeline"("p_product_id" "uuid", "p_page" integer, "p_page_size" integer, "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_movement_types" "text"[]) IS 'Retorna la línea de tiempo completa de movimientos de un producto con paginación y filtros. Incluye entradas, salidas, devoluciones, transferencias y cancelaciones.';



CREATE OR REPLACE FUNCTION "public"."get_product_timeline_summary"("p_product_id" "uuid") RETURNS TABLE("product_name" "text", "product_sku" "text", "product_barcode" "text", "total_entries" bigint, "total_exits" bigint, "total_returns" bigint, "total_transfers" bigint, "total_cancellations" bigint, "total_reserved" bigint, "current_stock" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN QUERY
    WITH entry_stats AS (
        SELECT COUNT(*) AS cnt
        FROM public.inventory_entries
        WHERE product_id = p_product_id
          AND deleted_at IS NULL
    ),
    exit_stats AS (
        SELECT COUNT(*) AS cnt
        FROM public.inventory_exits
        WHERE product_id = p_product_id
    ),
    return_stats AS (
        SELECT COUNT(*) AS cnt
        FROM public.returns
        WHERE product_id = p_product_id
    ),
    transfer_stats AS (
        SELECT COUNT(*) AS cnt
        FROM public.stock_transfers
        WHERE product_id = p_product_id
    ),
    cancellation_stats AS (
        SELECT (
            (SELECT COUNT(*) FROM public.inventory_entry_cancellations iec
             INNER JOIN public.inventory_entries ie ON ie.id = iec.inventory_entry_id
             WHERE ie.product_id = p_product_id AND iec.deleted_at IS NULL)
            +
            (SELECT COUNT(*) FROM public.inventory_exit_cancellations iecx
             INNER JOIN public.inventory_exits iex ON iex.id = iecx.inventory_exit_id
             WHERE iex.product_id = p_product_id AND iecx.deleted_at IS NULL)
        ) AS cnt
    ),
    reserved_stats AS (
        SELECT COUNT(*) AS cnt
        FROM public.delivery_order_items doi
        JOIN public.delivery_orders dord ON dord.id = doi.delivery_order_id
        WHERE doi.product_id = p_product_id
          AND doi.deleted_at IS NULL
          AND dord.deleted_at IS NULL
          AND doi.source_delivery_order_id IS NULL
          AND (doi.quantity - COALESCE(doi.delivered_quantity, 0)) > 0
          AND NOT EXISTS (
              SELECT 1 FROM public.inventory_exits iex
              WHERE iex.delivery_order_id = doi.delivery_order_id
                AND iex.product_id = doi.product_id
                AND iex.warehouse_id = doi.warehouse_id
                AND NOT EXISTS (
                    SELECT 1 FROM public.inventory_exit_cancellations iec
                    WHERE iec.inventory_exit_id = iex.id AND iec.deleted_at IS NULL
                )
          )
    ),
    stock_by_warehouse AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'warehouse_name', w.name,
                'quantity', ws.quantity
            ) ORDER BY w.name
        ) AS stock
        FROM public.warehouse_stock ws
        INNER JOIN public.warehouses w ON w.id = ws.warehouse_id
        WHERE ws.product_id = p_product_id
          AND ws.quantity > 0
    )
    SELECT
        p.name AS product_name,
        p.sku AS product_sku,
        p.barcode AS product_barcode,
        es.cnt AS total_entries,
        exs.cnt AS total_exits,
        rs.cnt AS total_returns,
        ts.cnt AS total_transfers,
        cs.cnt AS total_cancellations,
        rs2.cnt AS total_reserved,
        COALESCE(sbw.stock, '[]'::jsonb) AS current_stock
    FROM public.products p
    CROSS JOIN entry_stats es
    CROSS JOIN exit_stats exs
    CROSS JOIN return_stats rs
    CROSS JOIN transfer_stats ts
    CROSS JOIN cancellation_stats cs
    CROSS JOIN reserved_stats rs2
    CROSS JOIN stock_by_warehouse sbw
    WHERE p.id = p_product_id
      AND p.deleted_at IS NULL;
END;
$$;


ALTER FUNCTION "public"."get_product_timeline_summary"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_product_traceability"("product_ids" "uuid"[] DEFAULT NULL::"uuid"[], "search_term" "text" DEFAULT NULL::"text", "products_limit" integer DEFAULT 5, "events_limit" integer DEFAULT 5) RETURNS TABLE("product_id" "uuid", "product_name" "text", "product_sku" "text", "product_barcode" "text", "events" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    _product_ids uuid[];
    _search text := COALESCE(LOWER(TRIM(search_term)), '');
BEGIN
    -- Si se proporcionan product_ids, usarlos
    IF product_ids IS NOT NULL AND array_length(product_ids, 1) > 0 THEN
        _product_ids := product_ids;
    -- Si hay término de búsqueda, buscar productos
    ELSIF _search <> '' THEN
        SELECT array_agg(p.id)
        INTO _product_ids
        FROM (
            SELECT id
            FROM public.products
            WHERE deleted_at IS NULL
              AND (
                LOWER(name) LIKE '%' || _search || '%'
                OR LOWER(sku) LIKE '%' || _search || '%'
                OR LOWER(barcode) LIKE '%' || _search || '%'
              )
            LIMIT products_limit
        ) p;
    -- Si no hay filtros, obtener productos con movimientos recientes
    ELSE
        WITH recent_products AS (
            (SELECT ie.product_id, ie.created_at
             FROM public.inventory_entries ie
             ORDER BY ie.created_at DESC
             LIMIT products_limit * 2)
            
            UNION
            
            (SELECT iex.product_id, iex.created_at
             FROM public.inventory_exits iex
             ORDER BY iex.created_at DESC
             LIMIT products_limit * 2)
        )
        SELECT array_agg(DISTINCT limited.product_id)
        INTO _product_ids
        FROM (
            SELECT rp.product_id, rp.created_at
            FROM recent_products rp
            ORDER BY rp.created_at DESC
            LIMIT products_limit
        ) limited;
    END IF;

    -- Si no hay productos, retornar vacío
    IF _product_ids IS NULL OR array_length(_product_ids, 1) = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH product_events AS (
        -- Entradas
        SELECT
            ie.product_id,
            jsonb_build_object(
                'id', ie.id,
                'type', 'entry',
                'date', ie.created_at,
                'description', CASE
                    WHEN ie.purchase_order_id IS NOT NULL
                    THEN 'Recibido (OC-' || SUBSTRING(ie.purchase_order_id::text, 1, 8) || '...)'
                    ELSE 'Recibido'
                END,
                'user', COALESCE(pr.full_name, NULL),
                'warehouse', w.name,
                'purchaseOrder', ie.purchase_order_id,
                'quantity', ie.quantity
            ) AS event,
            ie.created_at AS event_date
        FROM public.inventory_entries ie
        LEFT JOIN public.profiles pr ON pr.id = ie.created_by
        LEFT JOIN public.warehouses w ON w.id = ie.warehouse_id
        WHERE ie.product_id = ANY(_product_ids)
        
        UNION ALL
        
        -- Salidas
        SELECT
            iex.product_id,
            jsonb_build_object(
                'id', iex.id,
                'type', 'exit',
                'date', iex.created_at,
                'description', 'Despachado',
                'user', COALESCE(pr.full_name, NULL),
                'warehouse', w.name,
                'purchaseOrder', NULL,
                'quantity', iex.quantity
            ) AS event,
            iex.created_at AS event_date
        FROM public.inventory_exits iex
        LEFT JOIN public.profiles pr ON pr.id = iex.created_by
        LEFT JOIN public.warehouses w ON w.id = iex.warehouse_id
        WHERE iex.product_id = ANY(_product_ids)
    ),
    ranked_events AS (
        SELECT
            pe.product_id,
            pe.event,
            ROW_NUMBER() OVER (PARTITION BY pe.product_id ORDER BY pe.event_date DESC) AS rn
        FROM product_events pe
    ),
    aggregated_events AS (
        SELECT
            re.product_id,
            jsonb_agg(re.event ORDER BY (re.event->>'date')::timestamptz DESC) AS events
        FROM ranked_events re
        WHERE re.rn <= events_limit
        GROUP BY re.product_id
    )
    SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.sku AS product_sku,
        p.barcode AS product_barcode,
        COALESCE(ae.events, '[]'::jsonb) AS events
    FROM public.products p
    LEFT JOIN aggregated_events ae ON ae.product_id = p.id
    WHERE p.id = ANY(_product_ids)
      AND p.deleted_at IS NULL;
END;
$$;


ALTER FUNCTION "public"."get_product_traceability"("product_ids" "uuid"[], "search_term" "text", "products_limit" integer, "events_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_product_traceability"("product_ids" "uuid"[], "search_term" "text", "products_limit" integer, "events_limit" integer) IS 'Retorna trazabilidad de productos con eventos (entradas/salidas) en formato JSON. Elimina N+1 queries.';



CREATE OR REPLACE FUNCTION "public"."get_products_dashboard"("search_term" "text" DEFAULT ''::"text", "page" integer DEFAULT 1, "page_size" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "name" "text", "sku" "text", "barcode" "text", "status" boolean, "created_at" timestamp with time zone, "brand_id" "uuid", "brand_name" "text", "category_id" "uuid", "category_name" "text", "color_id" "uuid", "color_name" "text", "total_stock" numeric, "stock_by_warehouse" "jsonb", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    _limit integer := GREATEST(COALESCE(page_size, 5), 1);
    _offset integer := GREATEST((COALESCE(page, 1) - 1) * _limit, 0);
    _search text := COALESCE(search_term, '');
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            p.id,
            p.name,
            p.sku,
            p.barcode,
            p.status,
            p.created_at::timestamptz AS created_at,
            p.brand_id,
            b.name::text AS brand_name,
            p.category_id,
            c.name::text AS category_name,
            p.color_id,
            col.name::text AS color_name
        FROM public.products p
        LEFT JOIN public.brands b ON b.id = p.brand_id
        LEFT JOIN public.category c ON c.id = p.category_id
        LEFT JOIN public.colors col ON col.id = p.color_id AND col.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
          AND (
            _search = ''
            OR p.name ILIKE '%' || _search || '%'
            OR p.sku ILIKE '%' || _search || '%'
            OR p.barcode ILIKE '%' || _search || '%'
            OR b.name ILIKE '%' || _search || '%'
            OR c.name ILIKE '%' || _search || '%'
            OR col.name ILIKE '%' || _search || '%'
          )
    ),
    aggregated AS (
        SELECT
            f.id,
            f.name,
            f.sku,
            f.barcode,
            f.status,
            f.created_at,
            f.brand_id,
            f.brand_name,
            f.category_id,
            f.category_name,
            f.color_id,
            f.color_name,
            COALESCE(
                SUM(ws.quantity) FILTER (WHERE ws.quantity > 0)::numeric,
                0::numeric
            ) AS total_stock,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'warehouseId', ws.warehouse_id,
                        'warehouseName', w.name,
                        'quantity', ws.quantity
                    )
                ) FILTER (WHERE ws.quantity > 0),
                '[]'::jsonb
            ) AS stock_by_warehouse
        FROM filtered f
        LEFT JOIN public.warehouse_stock ws ON ws.product_id = f.id
        LEFT JOIN public.warehouses w ON w.id = ws.warehouse_id
        GROUP BY
            f.id,
            f.name,
            f.sku,
            f.barcode,
            f.status,
            f.created_at,
            f.brand_id,
            f.brand_name,
            f.category_id,
            f.category_name,
            f.color_id,
            f.color_name
    ),
    numbered AS (
        SELECT
            a.*,
            COUNT(*) OVER () AS total_count,
            ROW_NUMBER() OVER (ORDER BY a.created_at DESC) AS row_number
        FROM aggregated a
    )
    SELECT
        n.id,
        n.name,
        n.sku,
        n.barcode,
        n.status,
        n.created_at,
        n.brand_id,
        n.brand_name,
        n.category_id,
        n.category_name,
        n.color_id,
        n.color_name,
        n.total_stock,
        n.stock_by_warehouse,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$$;


ALTER FUNCTION "public"."get_products_dashboard"("search_term" "text", "page" integer, "page_size" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_products_dashboard"("search_term" "text", "page" integer, "page_size" integer) IS 'Devuelve productos con marca/categoría/color y stock agregado. Solo incluye bodegas con stock > 0.';



CREATE OR REPLACE FUNCTION "public"."get_products_for_return"("return_type_param" "text", "order_id_param" "uuid") RETURNS TABLE("product_id" "uuid", "product_name" "text", "product_sku" "text", "warehouse_id" "uuid", "warehouse_name" "text", "max_returnable" numeric, "already_returned" numeric)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    IF return_type_param = 'purchase_order' THEN
        RETURN QUERY
        WITH received_by_product_warehouse AS (
            -- Calcular cantidades recibidas por producto-bodega
            SELECT
                ie.product_id,
                ie.warehouse_id,
                SUM(ie.quantity) AS total_received
            FROM public.inventory_entries ie
            WHERE ie.purchase_order_id = order_id_param
            GROUP BY ie.product_id, ie.warehouse_id
        ),
        returned_by_product_warehouse AS (
            -- Calcular cantidades ya devueltas por producto-bodega
            SELECT
                r.product_id,
                r.warehouse_id,
                SUM(r.quantity) AS total_returned
            FROM public.returns r
            WHERE r.return_type = 'purchase_order'
              AND r.order_id = order_id_param
            GROUP BY r.product_id, r.warehouse_id
        ),
        products_with_quantities AS (
            SELECT
                r.product_id,
                r.warehouse_id,
                r.total_received,
                COALESCE(ret.total_returned, 0) AS total_returned,
                (r.total_received - COALESCE(ret.total_returned, 0)) AS max_returnable
            FROM received_by_product_warehouse r
            LEFT JOIN returned_by_product_warehouse ret 
                ON ret.product_id = r.product_id 
                AND ret.warehouse_id = r.warehouse_id
            WHERE (r.total_received - COALESCE(ret.total_returned, 0)) > 0
        )
        SELECT
            pwq.product_id,
            p.name::text AS product_name,
            p.sku::text AS product_sku,
            pwq.warehouse_id,
            w.name::text AS warehouse_name,
            pwq.max_returnable,
            pwq.total_returned AS already_returned
        FROM products_with_quantities pwq
        LEFT JOIN public.products p ON p.id = pwq.product_id
        LEFT JOIN public.warehouses w ON w.id = pwq.warehouse_id
        WHERE p.id IS NOT NULL
        ORDER BY p.name, w.name;
        
    ELSIF return_type_param = 'delivery_order' THEN
        RETURN QUERY
        WITH returned_by_product_warehouse AS (
            -- Calcular cantidades ya devueltas por producto-bodega
            SELECT
                r.product_id,
                r.warehouse_id,
                SUM(r.quantity) AS total_returned
            FROM public.returns r
            WHERE r.return_type = 'delivery_order'
              AND r.order_id = order_id_param
            GROUP BY r.product_id, r.warehouse_id
        ),
        items_with_returns AS (
            SELECT
                doi.product_id,
                doi.warehouse_id,
                doi.delivered_quantity,
                COALESCE(ret.total_returned, 0) AS total_returned,
                (doi.delivered_quantity - COALESCE(ret.total_returned, 0)) AS max_returnable
            FROM public.delivery_order_items doi
            LEFT JOIN returned_by_product_warehouse ret 
                ON ret.product_id = doi.product_id 
                AND ret.warehouse_id = doi.warehouse_id
            WHERE doi.delivery_order_id = order_id_param
              AND doi.delivered_quantity > 0
              AND (doi.delivered_quantity - COALESCE(ret.total_returned, 0)) > 0
        )
        SELECT
            iwr.product_id,
            p.name::text AS product_name,
            p.sku::text AS product_sku,
            iwr.warehouse_id,
            w.name::text AS warehouse_name,
            iwr.max_returnable,
            iwr.total_returned AS already_returned
        FROM items_with_returns iwr
        LEFT JOIN public.products p ON p.id = iwr.product_id
        LEFT JOIN public.warehouses w ON w.id = iwr.warehouse_id
        WHERE p.id IS NOT NULL
        ORDER BY p.name, w.name;
    ELSE
        -- Retornar vacío si el tipo no es válido
        RETURN;
    END IF;
END;
$$;


ALTER FUNCTION "public"."get_products_for_return"("return_type_param" "text", "order_id_param" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_products_for_return"("return_type_param" "text", "order_id_param" "uuid") IS 'Devuelve productos disponibles para devolución con cantidades calculadas usando agregaciones. Evita problemas N+1.';



CREATE OR REPLACE FUNCTION "public"."get_products_stats"() RETURNS TABLE("total_products" bigint, "products_with_barcode" bigint, "products_with_internal_barcode" bigint, "unique_categories" bigint)
    LANGUAGE "sql" STABLE
    AS $$
SELECT
    COUNT(*) FILTER (WHERE p.deleted_at IS NULL) AS total_products,
    COUNT(*) FILTER (
        WHERE p.deleted_at IS NULL
          AND p.barcode IS NOT NULL
          AND p.barcode <> ''
          AND p.barcode NOT ILIKE 'INT-%'
    ) AS products_with_barcode,
    COUNT(*) FILTER (
        WHERE p.deleted_at IS NULL
          AND p.barcode ILIKE 'INT-%'
    ) AS products_with_internal_barcode,
    COUNT(DISTINCT p.category_id) FILTER (
        WHERE p.deleted_at IS NULL
          AND p.category_id IS NOT NULL
    ) AS unique_categories
FROM public.products p;
$$;


ALTER FUNCTION "public"."get_products_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_products_stats"() IS 'Retorna totales globales del módulo de productos sin traer todas las filas.';



CREATE OR REPLACE FUNCTION "public"."get_products_with_stock_for_delivery"("search_term" "text" DEFAULT ''::"text") RETURNS TABLE("product_id" "uuid", "product_name" "text", "product_sku" "text", "product_barcode" "text", "stock_by_warehouse" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    _search text := COALESCE(TRIM(search_term), '');
BEGIN
    RETURN QUERY
    SELECT
        p.id                                AS product_id,
        p.name                              AS product_name,
        COALESCE(p.sku, '')                 AS product_sku,
        COALESCE(p.barcode, '')             AS product_barcode,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'warehouseId',   ws.warehouse_id,
                    'warehouseName', w.name,
                    'quantity',      ws.quantity
                )
                ORDER BY w.name
            ) FILTER (WHERE ws.quantity > 0 AND w.is_active = true),
            '[]'::jsonb
        )                                   AS stock_by_warehouse
    FROM public.products p
    LEFT JOIN public.warehouse_stock ws ON ws.product_id = p.id
    LEFT JOIN public.warehouses w       ON w.id = ws.warehouse_id
    WHERE p.deleted_at IS NULL
      AND (
            _search = ''
            OR p.name    ILIKE '%' || _search || '%'
            OR p.sku     ILIKE '%' || _search || '%'
            OR p.barcode ILIKE '%' || _search || '%'
          )
    GROUP BY p.id, p.name, p.sku, p.barcode
    HAVING
        COALESCE(
            SUM(ws.quantity) FILTER (WHERE ws.quantity > 0 AND w.is_active = true),
            0
        ) > 0
    ORDER BY p.name;
END;
$$;


ALTER FUNCTION "public"."get_products_with_stock_for_delivery"("search_term" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_products_with_stock_for_delivery"("search_term" "text") IS 'Devuelve productos que tienen stock > 0 en al menos una bodega activa, con detalle de stock por bodega. Filtra por nombre, SKU o código de barras. No usa status del producto como criterio — el stock real es suficiente.';



CREATE OR REPLACE FUNCTION "public"."get_purchase_orders_dashboard"("search_term" "text" DEFAULT ''::"text", "page" integer DEFAULT 1, "page_size" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "status" "text", "supplier_id" "uuid", "supplier_name" "text", "created_at" timestamp with time zone, "notes" "text", "total_items" numeric, "total_quantity" numeric, "completion" "jsonb", "completion_detail" "jsonb", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    _limit integer := GREATEST(COALESCE(page_size, 5), 1);
    _offset integer := GREATEST((COALESCE(page, 1) - 1) * _limit, 0);
    _search text := COALESCE(search_term, '');
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            po.id,
            po.status,
            po.supplier_id,
            s.name::text AS supplier_name,
            po.created_at,
            po.notes
        FROM public.purchase_orders po
        LEFT JOIN public.suppliers s ON s.id = po.supplier_id
        WHERE po.deleted_at IS NULL
          AND (
            _search = ''
            OR po.status ILIKE '%' || _search || '%'
            OR po.notes ILIKE '%' || _search || '%'
            OR po.id::text ILIKE '%' || _search || '%'
            OR s.name ILIKE '%' || _search || '%'
          )
    ),
    items AS (
        SELECT
            poi.purchase_order_id,
            SUM(poi.quantity) AS total_quantity,
            COUNT(*) AS total_items,
            jsonb_agg(
                jsonb_build_object(
                    'product_id', poi.product_id,
                    'product_name', p.name,
                    'ordered_quantity', poi.quantity
                )
            ) AS items
        FROM public.purchase_order_items poi
        LEFT JOIN public.products p ON p.id = poi.product_id
        GROUP BY poi.purchase_order_id
    ),
    entries AS (
        SELECT
            ie.purchase_order_id,
            ie.product_id,
            SUM(ie.quantity) AS received_quantity
        FROM public.inventory_entries ie
        LEFT JOIN public.inventory_entry_cancellations iec ON iec.inventory_entry_id = ie.id
        WHERE iec.id IS NULL
        GROUP BY ie.purchase_order_id, ie.product_id
    ),
    enriched AS (
        SELECT
            f.*,
            i.total_items,
            i.total_quantity,
            i.items,
            jsonb_agg(
                jsonb_build_object(
                    'product_id', item->>'product_id',
                    'product_name', item->>'product_name',
                    'ordered_quantity', (item->>'ordered_quantity')::numeric,
                    'received_quantity', COALESCE(e.received_quantity, 0),
                    'is_complete', COALESCE(e.received_quantity, 0) >= (item->>'ordered_quantity')::numeric
                )
            ) FILTER (WHERE i.items IS NOT NULL) AS completion_detail,
            (
                jsonb_build_object(
                    'isComplete',
                    CASE
                        WHEN i.items IS NULL THEN false
                        ELSE bool_and(COALESCE(e.received_quantity, 0) >= (item->>'ordered_quantity')::numeric)
                    END,
                    'totalItems', COALESCE(i.total_items, 0),
                    'receivedItems',
                    COALESCE(
                        SUM(LEAST(COALESCE(e.received_quantity, 0), (item->>'ordered_quantity')::numeric)),
                        0
                    )
                )
            ) AS completion
        FROM filtered f
        LEFT JOIN items i ON i.purchase_order_id = f.id
        LEFT JOIN LATERAL jsonb_array_elements(i.items) item ON true
        LEFT JOIN entries e ON e.purchase_order_id = f.id AND e.product_id = (item->>'product_id')::uuid
        GROUP BY
            f.id,
            f.status,
            f.supplier_id,
            f.supplier_name,
            f.created_at,
            f.notes,
            i.total_items,
            i.total_quantity,
            i.items
    ),
    numbered AS (
        SELECT
            e.*,
            COUNT(*) OVER () AS total_count,
            ROW_NUMBER() OVER (ORDER BY e.created_at DESC) AS row_number
        FROM enriched e
    )
    SELECT
        n.id,
        n.status,
        n.supplier_id,
        n.supplier_name,
        n.created_at,
        n.notes,
        COALESCE(n.total_items, 0)::numeric AS total_items,
        COALESCE(n.total_quantity, 0)::numeric AS total_quantity,
        n.completion,
        n.completion_detail,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$$;


ALTER FUNCTION "public"."get_purchase_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_purchase_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer) IS 'Devuelve órdenes de compra activas (deleted_at IS NULL) con proveedor, items, estado de completitud y total_count.';



CREATE OR REPLACE FUNCTION "public"."get_purchase_orders_dashboard"("search_term" "text" DEFAULT ''::"text", "page" integer DEFAULT 1, "page_size" integer DEFAULT 5, "status_filter" "text" DEFAULT NULL::"text", "date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("id" "uuid", "status" "text", "supplier_id" "uuid", "supplier_name" "text", "created_at" timestamp with time zone, "notes" "text", "order_number" "text", "total_items" numeric, "total_quantity" numeric, "completion" "jsonb", "completion_detail" "jsonb", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    _limit integer := GREATEST(COALESCE(page_size, 5), 1);
    _offset integer := GREATEST((COALESCE(page, 1) - 1) * _limit, 0);
    _search text := COALESCE(search_term, '');
    _status_filter text := NULLIF(TRIM(COALESCE(status_filter, '')), '');
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            po.id,
            po.status,
            po.supplier_id,
            s.name::text AS supplier_name,
            po.created_at,
            po.notes,
            po.order_number
        FROM public.purchase_orders po
        LEFT JOIN public.suppliers s ON s.id = po.supplier_id
        WHERE po.deleted_at IS NULL
          AND (
            _search = ''
            OR po.status ILIKE '%' || _search || '%'
            OR po.notes ILIKE '%' || _search || '%'
            OR po.id::text ILIKE '%' || _search || '%'
            OR po.order_number ILIKE '%' || _search || '%'
            OR s.name ILIKE '%' || _search || '%'
          )
          AND (
            _status_filter IS NULL
            OR po.status = _status_filter
          )
          AND (date_from IS NULL OR po.created_at >= date_from)
          AND (date_to IS NULL OR po.created_at <= date_to)
    ),
    items AS (
        SELECT
            poi.purchase_order_id,
            SUM(poi.quantity) AS total_quantity,
            COUNT(*) AS total_items,
            jsonb_agg(
                jsonb_build_object(
                    'product_id', poi.product_id,
                    'product_name', p.name,
                    'ordered_quantity', poi.quantity
                )
            ) AS items
        FROM public.purchase_order_items poi
        LEFT JOIN public.products p ON p.id = poi.product_id
        WHERE poi.deleted_at IS NULL  -- ADDED: Filter out soft-deleted items
        GROUP BY poi.purchase_order_id
    ),
    entries AS (
        SELECT
            ie.purchase_order_id,
            ie.product_id,
            SUM(ie.quantity) AS received_quantity
        FROM public.inventory_entries ie
        LEFT JOIN public.inventory_entry_cancellations iec ON iec.inventory_entry_id = ie.id
        WHERE iec.id IS NULL
        GROUP BY ie.purchase_order_id, ie.product_id
    ),
    enriched AS (
        SELECT
            f.*,
            i.total_items,
            i.total_quantity,
            i.items,
            jsonb_agg(
                jsonb_build_object(
                    'product_id', item->>'product_id',
                    'product_name', item->>'product_name',
                    'ordered_quantity', (item->>'ordered_quantity')::numeric,
                    'received_quantity', COALESCE(e.received_quantity, 0),
                    'is_complete', COALESCE(e.received_quantity, 0) >= (item->>'ordered_quantity')::numeric
                )
            ) FILTER (WHERE i.items IS NOT NULL) AS completion_detail,
            (
                jsonb_build_object(
                    'isComplete',
                    CASE
                        WHEN i.items IS NULL THEN false
                        ELSE bool_and(COALESCE(e.received_quantity, 0) >= (item->>'ordered_quantity')::numeric)
                    END,
                    'totalItems', COALESCE(i.total_items, 0),
                    'receivedItems',
                    COALESCE(
                        SUM(LEAST(COALESCE(e.received_quantity, 0), (item->>'ordered_quantity')::numeric)),
                        0
                    )
                )
            ) AS completion
        FROM filtered f
        LEFT JOIN items i ON i.purchase_order_id = f.id
        LEFT JOIN LATERAL jsonb_array_elements(i.items) item ON true
        LEFT JOIN entries e ON e.purchase_order_id = f.id AND e.product_id = (item->>'product_id')::uuid
        GROUP BY
            f.id,
            f.status,
            f.supplier_id,
            f.supplier_name,
            f.created_at,
            f.notes,
            f.order_number,
            i.total_items,
            i.total_quantity,
            i.items
    ),
    numbered AS (
        SELECT
            e.*,
            COUNT(*) OVER () AS total_count,
            ROW_NUMBER() OVER (ORDER BY e.created_at DESC) AS row_number
        FROM enriched e
    )
    SELECT
        n.id,
        n.status,
        n.supplier_id,
        n.supplier_name,
        n.created_at,
        n.notes,
        n.order_number,
        COALESCE(n.total_items, 0)::numeric AS total_items,
        COALESCE(n.total_quantity, 0)::numeric AS total_quantity,
        n.completion,
        n.completion_detail,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$$;


ALTER FUNCTION "public"."get_purchase_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer, "status_filter" "text", "date_from" timestamp with time zone, "date_to" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_purchase_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer, "status_filter" "text", "date_from" timestamp with time zone, "date_to" timestamp with time zone) IS 'Devuelve ordenes de compra activas (deleted_at IS NULL) con proveedor, items activos (deleted_at IS NULL), estado de completitud, order_number y total_count. Permite filtrar por estado, rango de fechas y busqueda de texto.';



CREATE OR REPLACE FUNCTION "public"."get_purchase_orders_stats"() RETURNS TABLE("total" bigint, "pending" bigint, "approved" bigint, "received" bigint, "cancelled" bigint, "total_items" numeric, "total_quantity" numeric)
    LANGUAGE "sql" STABLE
    AS $$
WITH orders AS (
    SELECT
        po.id,
        po.status
    FROM public.purchase_orders po
    WHERE po.deleted_at IS NULL
),
items AS (
    SELECT
        poi.purchase_order_id,
        SUM(poi.quantity) AS total_quantity,
        COUNT(*) AS total_items
    FROM public.purchase_order_items poi
    INNER JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
    WHERE po.deleted_at IS NULL
      AND poi.deleted_at IS NULL  -- ADDED: Filter out soft-deleted items
    GROUP BY poi.purchase_order_id
)
SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE o.status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE o.status = 'approved') AS approved,
    COUNT(*) FILTER (WHERE o.status = 'received') AS received,
    COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled,
    COALESCE(SUM(i.total_items), 0) AS total_items,
    COALESCE(SUM(i.total_quantity), 0) AS total_quantity
FROM orders o
LEFT JOIN items i ON i.purchase_order_id = o.id;
$$;


ALTER FUNCTION "public"."get_purchase_orders_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_purchase_orders_stats"() IS 'Calcula estadísticas globales de órdenes de compra activas (deleted_at IS NULL) con items activos (deleted_at IS NULL) en una sola consulta, incluyendo conteo de canceladas.';



CREATE OR REPLACE FUNCTION "public"."get_reports_stats_today"() RETURNS TABLE("movements_today" bigint, "entries_today" bigint, "exits_today" bigint, "entries_quantity_today" numeric, "exits_quantity_today" numeric, "total_stock" numeric, "cancelled_entries_today" bigint, "cancelled_exits_today" bigint)
    LANGUAGE "sql" STABLE
    AS $$
WITH today_range AS (
    SELECT
        date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota') AS start_time,
        date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota') + INTERVAL '1 day' AS end_time
),
entries_stats AS (
    SELECT
        COUNT(*) AS entries_count,
        COALESCE(SUM(quantity), 0) AS entries_qty
    FROM public.inventory_entries ie
    CROSS JOIN today_range tr
    WHERE ie.created_at >= tr.start_time
      AND ie.created_at < tr.end_time
),
exits_stats AS (
    SELECT
        COUNT(*) AS exits_count,
        COALESCE(SUM(quantity), 0) AS exits_qty
    FROM public.inventory_exits ie
    CROSS JOIN today_range tr
    WHERE ie.created_at >= tr.start_time
      AND ie.created_at < tr.end_time
),
cancelled_entries AS (
    SELECT COUNT(*) AS count
    FROM public.inventory_entry_cancellations iec
    CROSS JOIN today_range tr
    WHERE iec.created_at >= tr.start_time
      AND iec.created_at < tr.end_time
),
cancelled_exits AS (
    SELECT COUNT(*) AS count
    FROM public.inventory_exit_cancellations iec
    CROSS JOIN today_range tr
    WHERE iec.created_at >= tr.start_time
      AND iec.created_at < tr.end_time
),
stock_total AS (
    SELECT COALESCE(SUM(quantity), 0) AS total
    FROM public.warehouse_stock
)
SELECT
    (es.entries_count + exs.exits_count) AS movements_today,
    es.entries_count AS entries_today,
    exs.exits_count AS exits_today,
    es.entries_qty AS entries_quantity_today,
    exs.exits_qty AS exits_quantity_today,
    st.total AS total_stock,
    ce.count AS cancelled_entries_today,
    cex.count AS cancelled_exits_today
FROM entries_stats es
CROSS JOIN exits_stats exs
CROSS JOIN cancelled_entries ce
CROSS JOIN cancelled_exits cex
CROSS JOIN stock_total st;
$$;


ALTER FUNCTION "public"."get_reports_stats_today"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_reports_stats_today"() IS 'Retorna estadísticas de hoy consolidadas en una sola consulta: movimientos, entradas, salidas, stock total y cancelaciones.';



CREATE OR REPLACE FUNCTION "public"."get_returns_dashboard"("search_term" "text" DEFAULT ''::"text", "page" integer DEFAULT 1, "page_size" integer DEFAULT 50, "return_type_filter" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "return_type" "text", "order_id" "uuid", "order_number" "text", "product_id" "uuid", "product_name" "text", "product_sku" "text", "warehouse_id" "uuid", "warehouse_name" "text", "quantity" numeric, "return_reason" "text", "observations" "text", "created_by" "uuid", "created_by_name" "text", "created_at" timestamp with time zone, "inventory_entry_id" "uuid", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    _limit integer := GREATEST(COALESCE(page_size, 50), 1);
    _offset integer := GREATEST((COALESCE(page, 1) - 1) * _limit, 0);
    _search text := COALESCE(LOWER(TRIM(search_term)), '');
    _return_type text := NULLIF(TRIM(COALESCE(return_type_filter, '')), '');
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            r.id,
            r.return_type,
            r.order_id,
            r.product_id,
            r.warehouse_id,
            r.quantity,
            r.return_reason,
            r.observations,
            r.created_by,
            r.created_at,
            r.inventory_entry_id,
            -- Obtener order_number según el tipo usando CASE y LEFT JOIN
            CASE 
                WHEN r.return_type = 'purchase_order' THEN po.order_number
                WHEN r.return_type = 'delivery_order' THEN dord.order_number
                ELSE NULL
            END AS order_number,
            -- Información del producto
            p.name AS product_name,
            p.sku AS product_sku,
            -- Información de la bodega
            w.name AS warehouse_name,
            -- Información del usuario
            pr.full_name AS created_by_name
        FROM public.returns r
        LEFT JOIN public.products p ON p.id = r.product_id
        LEFT JOIN public.warehouses w ON w.id = r.warehouse_id
        LEFT JOIN public.profiles pr ON pr.id = r.created_by
        LEFT JOIN public.purchase_orders po ON po.id = r.order_id AND r.return_type = 'purchase_order'
        LEFT JOIN public.delivery_orders dord ON dord.id = r.order_id AND r.return_type = 'delivery_order'
        WHERE (
            _return_type IS NULL OR r.return_type = _return_type
        )
        AND (
            _search = ''
            OR LOWER(r.return_reason) LIKE '%' || _search || '%'
            OR LOWER(p.name) LIKE '%' || _search || '%'
            OR LOWER(p.sku) LIKE '%' || _search || '%'
            OR LOWER(w.name) LIKE '%' || _search || '%'
        )
    ),
    numbered AS (
        SELECT
            f.*,
            COUNT(*) OVER () AS total_count,
            ROW_NUMBER() OVER (ORDER BY f.created_at DESC) AS row_number
        FROM filtered f
    )
    SELECT
        n.id,
        n.return_type::text,
        n.order_id,
        n.order_number::text,
        n.product_id,
        n.product_name::text,
        n.product_sku::text,
        n.warehouse_id,
        n.warehouse_name::text,
        n.quantity,
        n.return_reason::text,
        n.observations::text,
        n.created_by,
        n.created_by_name::text,
        n.created_at,
        n.inventory_entry_id,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$$;


ALTER FUNCTION "public"."get_returns_dashboard"("search_term" "text", "page" integer, "page_size" integer, "return_type_filter" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_returns_dashboard"("search_term" "text", "page" integer, "page_size" integer, "return_type_filter" "text") IS 'Devuelve devoluciones con información completa usando JOINs optimizados. Evita problemas N+1.';



CREATE OR REPLACE FUNCTION "public"."get_stock_by_product_for_delivery"("p_product_id" "uuid") RETURNS TABLE("warehouse_id" "uuid", "warehouse_name" "text", "available_quantity" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id                    AS warehouse_id,
        w.name                  AS warehouse_name,
        ws.quantity::integer    AS available_quantity
    FROM public.warehouse_stock ws
    JOIN public.warehouses w ON w.id = ws.warehouse_id
    WHERE ws.product_id  = p_product_id
      AND ws.quantity    > 0
      AND w.is_active    = true
      AND w.deleted_at   IS NULL
    ORDER BY w.name;
END;
$$;


ALTER FUNCTION "public"."get_stock_by_product_for_delivery"("p_product_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_stock_by_product_for_delivery"("p_product_id" "uuid") IS 'Dado un producto, devuelve las bodegas activas donde tiene stock disponible (quantity > 0).
Usado en el paso 2 del flujo de creación de órdenes de entrega.
Exclusivo para el módulo de órdenes de entrega.';



CREATE OR REPLACE FUNCTION "public"."get_stock_validation"("p_search_term" "text" DEFAULT ''::"text", "p_page" integer DEFAULT 1, "p_page_size" integer DEFAULT 50) RETURNS TABLE("product_id" "uuid", "producto" "text", "sku" "text", "codigo_barras" "text", "estado_producto" "text", "bodega_id" "uuid", "bodega" "text", "entradas_validas" numeric, "salidas_directas" numeric, "salidas_ordenes_entrega" numeric, "reservado_sin_exit" numeric, "transferencias_entrada" numeric, "transferencias_salida" numeric, "stock_teorico" numeric, "stock_actual" numeric, "diferencia" numeric, "diagnostico" "text", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    WITH entradas AS (
        -- Valid inventory entries (not soft-deleted, not cancelled)
        SELECT
            ie.product_id,
            ie.warehouse_id,
            COALESCE(SUM(ie.quantity), 0) AS total_entradas
        FROM public.inventory_entries ie
        WHERE ie.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.inventory_entry_cancellations iec
              WHERE iec.inventory_entry_id = ie.id
                AND iec.deleted_at IS NULL
          )
        GROUP BY ie.product_id, ie.warehouse_id
    ),
    salidas_directas AS (
        -- Direct exits (not linked to a delivery order, not cancelled)
        SELECT
            iex.product_id,
            iex.warehouse_id,
            COALESCE(SUM(iex.quantity), 0) AS total_salidas_directas
        FROM public.inventory_exits iex
        WHERE iex.delivery_order_id IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.inventory_exit_cancellations iec
              WHERE iec.inventory_exit_id = iex.id
                AND iec.deleted_at IS NULL
          )
        GROUP BY iex.product_id, iex.warehouse_id
    ),
    salidas_ordenes AS (
        -- Exits linked to delivery orders, not cancelled
        SELECT
            iex.product_id,
            iex.warehouse_id,
            COALESCE(SUM(iex.quantity), 0) AS total_salidas_ordenes
        FROM public.inventory_exits iex
        WHERE iex.delivery_order_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.inventory_exit_cancellations iec
              WHERE iec.inventory_exit_id = iex.id
                AND iec.deleted_at IS NULL
          )
        GROUP BY iex.product_id, iex.warehouse_id
    ),
    reservas_doi AS (
        -- Items reserved in delivery orders but without a corresponding exit yet
        SELECT
            doi.product_id,
            doi.warehouse_id,
            COALESCE(SUM(doi.quantity - COALESCE(doi.delivered_quantity, 0)), 0) AS total_reservado
        FROM public.delivery_order_items doi
        JOIN public.delivery_orders dord ON dord.id = doi.delivery_order_id
        WHERE doi.deleted_at IS NULL
          AND dord.deleted_at IS NULL
          AND doi.source_delivery_order_id IS NULL
          AND (doi.quantity - COALESCE(doi.delivered_quantity, 0)) > 0
          AND NOT EXISTS (
              SELECT 1 FROM public.inventory_exits iex
              WHERE iex.delivery_order_id = doi.delivery_order_id
                AND iex.product_id = doi.product_id
                AND iex.warehouse_id = doi.warehouse_id
                AND NOT EXISTS (
                    SELECT 1 FROM public.inventory_exit_cancellations iec
                    WHERE iec.inventory_exit_id = iex.id
                      AND iec.deleted_at IS NULL
                )
          )
        GROUP BY doi.product_id, doi.warehouse_id
    ),
    transferencias_entrada AS (
        -- Incoming stock transfers by destination warehouse
        SELECT
            st.product_id,
            st.destination_warehouse_id AS warehouse_id,
            COALESCE(SUM(st.quantity), 0)::numeric AS total_transferencias_entrada
        FROM public.stock_transfers st
        GROUP BY st.product_id, st.destination_warehouse_id
    ),
    transferencias_salida AS (
        -- Outgoing stock transfers by source warehouse
        SELECT
            st.product_id,
            st.source_warehouse_id AS warehouse_id,
            COALESCE(SUM(st.quantity), 0)::numeric AS total_transferencias_salida
        FROM public.stock_transfers st
        GROUP BY st.product_id, st.source_warehouse_id
    ),
    todos_pares AS (
        -- All unique product-warehouse combinations from any movement source
        SELECT product_id, warehouse_id FROM entradas
        UNION
        SELECT product_id, warehouse_id FROM salidas_directas
        UNION
        SELECT product_id, warehouse_id FROM salidas_ordenes
        UNION
        SELECT product_id, warehouse_id FROM reservas_doi
        UNION
        SELECT product_id, warehouse_id FROM transferencias_entrada
        UNION
        SELECT product_id, warehouse_id FROM transferencias_salida
        UNION
        SELECT product_id, warehouse_id FROM public.warehouse_stock
    ),
    resultado AS (
        SELECT
            p.id                                                                AS product_id,
            p.name                                                              AS producto,
            p.sku                                                               AS sku,
            p.barcode                                                           AS codigo_barras,
            CASE WHEN p.status THEN 'Activo' ELSE 'Inactivo' END               AS estado_producto,
            w.id                                                                AS bodega_id,
            w.name                                                              AS bodega,
            COALESCE(e.total_entradas, 0)                                       AS entradas_validas,
            COALESCE(sd.total_salidas_directas, 0)                             AS salidas_directas,
            COALESCE(so.total_salidas_ordenes, 0)                              AS salidas_ordenes_entrega,
            COALESCE(rdoi.total_reservado, 0)                                  AS reservado_sin_exit,
            COALESCE(te.total_transferencias_entrada, 0)                       AS transferencias_entrada,
            COALESCE(ts.total_transferencias_salida, 0)                        AS transferencias_salida,
            (
                COALESCE(e.total_entradas, 0)
                - COALESCE(sd.total_salidas_directas, 0)
                - COALESCE(so.total_salidas_ordenes, 0)
                + COALESCE(te.total_transferencias_entrada, 0)
                - COALESCE(ts.total_transferencias_salida, 0)
            )                                                                   AS stock_teorico,
            COALESCE(ws.quantity, 0)                                           AS stock_actual,
            (
                COALESCE(ws.quantity, 0)
                - (
                    COALESCE(e.total_entradas, 0)
                    - COALESCE(sd.total_salidas_directas, 0)
                    - COALESCE(so.total_salidas_ordenes, 0)
                    + COALESCE(te.total_transferencias_entrada, 0)
                    - COALESCE(ts.total_transferencias_salida, 0)
                )
            )                                                                   AS diferencia,
            CASE
                WHEN COALESCE(ws.quantity, 0) < 0
                    THEN '🔴 STOCK NEGATIVO'
                WHEN COALESCE(ws.quantity, 0) = (
                    COALESCE(e.total_entradas, 0)
                    - COALESCE(sd.total_salidas_directas, 0)
                    - COALESCE(so.total_salidas_ordenes, 0)
                    + COALESCE(te.total_transferencias_entrada, 0)
                    - COALESCE(ts.total_transferencias_salida, 0)
                )
                    THEN '✅ OK'
                WHEN COALESCE(ws.quantity, 0) > (
                    COALESCE(e.total_entradas, 0)
                    - COALESCE(sd.total_salidas_directas, 0)
                    - COALESCE(so.total_salidas_ordenes, 0)
                    + COALESCE(te.total_transferencias_entrada, 0)
                    - COALESCE(ts.total_transferencias_salida, 0)
                )
                    THEN '⬆️ FALTA EN TABLA'
                ELSE '⬇️ EXCEDE'
            END                                                                 AS diagnostico,
            COUNT(*) OVER()                                                     AS total_count
        FROM todos_pares tp
        JOIN public.products p
            ON p.id = tp.product_id
            AND p.deleted_at IS NULL
        JOIN public.warehouses w
            ON w.id = tp.warehouse_id
            AND w.deleted_at IS NULL
            AND w.is_active = true
        LEFT JOIN entradas e
            ON e.product_id = tp.product_id AND e.warehouse_id = tp.warehouse_id
        LEFT JOIN salidas_directas sd
            ON sd.product_id = tp.product_id AND sd.warehouse_id = tp.warehouse_id
        LEFT JOIN salidas_ordenes so
            ON so.product_id = tp.product_id AND so.warehouse_id = tp.warehouse_id
        LEFT JOIN reservas_doi rdoi
            ON rdoi.product_id = tp.product_id AND rdoi.warehouse_id = tp.warehouse_id
        LEFT JOIN transferencias_entrada te
            ON te.product_id = tp.product_id AND te.warehouse_id = tp.warehouse_id
        LEFT JOIN transferencias_salida ts
            ON ts.product_id = tp.product_id AND ts.warehouse_id = tp.warehouse_id
        LEFT JOIN public.warehouse_stock ws
            ON ws.product_id = tp.product_id AND ws.warehouse_id = tp.warehouse_id
        WHERE
            p_search_term = ''
            OR p.name ILIKE '%' || p_search_term || '%'
            OR p.id::text = p_search_term
            OR p.barcode ILIKE '%' || p_search_term || '%'
    )
    SELECT
        r.product_id,
        r.producto,
        r.sku,
        r.codigo_barras,
        r.estado_producto,
        r.bodega_id,
        r.bodega,
        r.entradas_validas,
        r.salidas_directas,
        r.salidas_ordenes_entrega,
        r.reservado_sin_exit,
        r.transferencias_entrada,
        r.transferencias_salida,
        r.stock_teorico,
        r.stock_actual,
        r.diferencia,
        r.diagnostico,
        r.total_count
    FROM resultado r
    ORDER BY r.producto, r.bodega
    LIMIT p_page_size
    OFFSET (GREATEST(p_page, 1) - 1) * p_page_size;
END;
$$;


ALTER FUNCTION "public"."get_stock_validation"("p_search_term" "text", "p_page" integer, "p_page_size" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_stock_validation"("p_search_term" "text", "p_page" integer, "p_page_size" integer) IS 'Validates theoretical stock (computed from movement records) against actual stock
    (warehouse_stock table) per product-warehouse pair.
    Supports full-text search by product name, product UUID, or barcode.
    Returns paginated results with a total_count window column.';



CREATE OR REPLACE FUNCTION "public"."get_user_activities_today"() RETURNS TABLE("user_id" "uuid", "user_name" "text", "user_email" "text", "entries_count" bigint, "exits_count" bigint, "total_movements" bigint)
    LANGUAGE "sql" STABLE
    AS $$
WITH today_range AS (
    SELECT
        date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota') AS start_time,
        date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota') + INTERVAL '1 day' AS end_time
),
user_movements AS (
    -- Entradas
    SELECT
        ie.created_by AS user_id,
        'entry' AS movement_type
    FROM public.inventory_entries ie
    CROSS JOIN today_range tr
    WHERE ie.created_at >= tr.start_time
      AND ie.created_at < tr.end_time
      AND ie.created_by IS NOT NULL
    
    UNION ALL
    
    -- Salidas
    SELECT
        iex.created_by AS user_id,
        'exit' AS movement_type
    FROM public.inventory_exits iex
    CROSS JOIN today_range tr
    WHERE iex.created_at >= tr.start_time
      AND iex.created_at < tr.end_time
      AND iex.created_by IS NOT NULL
),
aggregated AS (
    SELECT
        um.user_id,
        COUNT(*) FILTER (WHERE um.movement_type = 'entry') AS entries_count,
        COUNT(*) FILTER (WHERE um.movement_type = 'exit') AS exits_count,
        COUNT(*) AS total_movements
    FROM user_movements um
    GROUP BY um.user_id
)
SELECT
    a.user_id,
    COALESCE(p.full_name, 'Usuario sin nombre') AS user_name,
    p.email AS user_email,
    a.entries_count,
    a.exits_count,
    a.total_movements
FROM aggregated a
LEFT JOIN public.profiles p ON p.id = a.user_id
ORDER BY a.total_movements DESC
LIMIT 10;
$$;


ALTER FUNCTION "public"."get_user_activities_today"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_activities_today"() IS 'Retorna top 10 usuarios con más actividad hoy (entradas y salidas).';



CREATE OR REPLACE FUNCTION "public"."get_user_delivery_orders_expanded"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "order_number" "text", "order_type" "text", "customer_id" "uuid", "customer_name" "text", "customer_id_number" "text", "assigned_to_user_id" "uuid", "assigned_to_user_name" "text", "status" "text", "notes" "text", "delivery_address" "text", "created_at" timestamp with time zone, "is_from_remission" boolean, "remission_id" "uuid", "total_items" bigint, "total_quantity" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    delivery_order.id,
    delivery_order.order_number::text,
    delivery_order.order_type::text,
    delivery_order.customer_id,
    c.name::text AS customer_name,
    c.id_number::text AS customer_id_number,
    delivery_order.assigned_to_user_id,
    NULL::text AS assigned_to_user_name,
    delivery_order.status::text,
    delivery_order.notes::text,
    delivery_order.delivery_address::text,
    delivery_order.created_at,
    TRUE AS is_from_remission,
    rdo.remission_id,
    COUNT(DISTINCT doi.id) AS total_items,
    COALESCE(SUM(doi.quantity), 0) AS total_quantity
  FROM public.delivery_orders AS delivery_order
  INNER JOIN public.remission_delivery_orders rdo
    ON rdo.source_delivery_order_id = delivery_order.id
    AND rdo.deleted_at IS NULL
  INNER JOIN public.delivery_orders remission
    ON remission.id = rdo.remission_id
    AND remission.assigned_to_user_id = p_user_id
    AND remission.order_type = 'remission'
    AND remission.status IN ('pending', 'approved')
    AND remission.deleted_at IS NULL
  LEFT JOIN public.customers c ON c.id = delivery_order.customer_id
  LEFT JOIN public.delivery_order_items doi ON doi.delivery_order_id = delivery_order.id
  WHERE delivery_order.deleted_at IS NULL
  GROUP BY
    delivery_order.id,
    delivery_order.order_number,
    delivery_order.order_type,
    delivery_order.customer_id,
    c.name,
    c.id_number,
    delivery_order.assigned_to_user_id,
    delivery_order.status,
    delivery_order.notes,
    delivery_order.delivery_address,
    delivery_order.created_at,
    rdo.remission_id

  UNION ALL

  SELECT
    delivery_order.id,
    delivery_order.order_number::text,
    delivery_order.order_type::text,
    NULL::uuid AS customer_id,
    NULL::text AS customer_name,
    NULL::text AS customer_id_number,
    delivery_order.assigned_to_user_id,
    p.full_name::text AS assigned_to_user_name,
    delivery_order.status::text,
    delivery_order.notes::text,
    delivery_order.delivery_address::text,
    delivery_order.created_at,
    FALSE AS is_from_remission,
    NULL::uuid AS remission_id,
    COUNT(DISTINCT doi.id) AS total_items,
    COALESCE(SUM(doi.quantity), 0) AS total_quantity
  FROM public.delivery_orders AS delivery_order
  LEFT JOIN public.profiles p ON p.id = delivery_order.assigned_to_user_id
  LEFT JOIN public.delivery_order_items doi
    ON doi.delivery_order_id = delivery_order.id
    AND doi.source_delivery_order_id IS NULL
  WHERE delivery_order.assigned_to_user_id = p_user_id
    AND delivery_order.order_type = 'remission'
    AND delivery_order.status IN ('pending', 'approved')
    AND delivery_order.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.delivery_order_items doi_check
      WHERE doi_check.delivery_order_id = delivery_order.id
        AND doi_check.source_delivery_order_id IS NULL
    )
  GROUP BY
    delivery_order.id,
    delivery_order.order_number,
    delivery_order.order_type,
    delivery_order.assigned_to_user_id,
    p.full_name,
    delivery_order.status,
    delivery_order.notes,
    delivery_order.delivery_address,
    delivery_order.created_at

  UNION ALL

  SELECT
    delivery_order.id,
    delivery_order.order_number::text,
    delivery_order.order_type::text,
    delivery_order.customer_id,
    c.name::text AS customer_name,
    c.id_number::text AS customer_id_number,
    delivery_order.assigned_to_user_id,
    pp.full_name::text AS assigned_to_user_name,
    delivery_order.status::text,
    delivery_order.notes::text,
    delivery_order.delivery_address::text,
    delivery_order.created_at,
    FALSE AS is_from_remission,
    NULL::uuid AS remission_id,
    COUNT(DISTINCT doi.id) AS total_items,
    COALESCE(SUM(doi.quantity), 0) AS total_quantity
  FROM public.delivery_orders AS delivery_order
  INNER JOIN public.delivery_order_pickup_assignments pua
    ON pua.delivery_order_id = delivery_order.id
    AND pua.user_id = p_user_id
    AND pua.deleted_at IS NULL
  LEFT JOIN public.profiles pp ON pp.id = pua.user_id
  LEFT JOIN public.customers c ON c.id = delivery_order.customer_id
  LEFT JOIN public.delivery_order_items doi
    ON doi.delivery_order_id = delivery_order.id
    AND doi.deleted_at IS NULL
    AND (
      delivery_order.order_type IS DISTINCT FROM 'remission'
      OR doi.source_delivery_order_id IS NULL
    )
  WHERE delivery_order.deleted_at IS NULL
    AND delivery_order.status IN ('pending', 'approved', 'sent_by_remission')
    AND NOT EXISTS (
      SELECT 1
      FROM public.remission_delivery_orders rdo
      INNER JOIN public.delivery_orders rem ON rem.id = rdo.remission_id
      WHERE rdo.source_delivery_order_id = delivery_order.id
        AND rdo.deleted_at IS NULL
        AND rem.assigned_to_user_id IS NOT DISTINCT FROM p_user_id
        AND rem.order_type = 'remission'
        AND rem.deleted_at IS NULL
    )
    AND NOT (
      delivery_order.order_type = 'remission'
      AND delivery_order.assigned_to_user_id IS NOT DISTINCT FROM p_user_id
    )
  GROUP BY
    delivery_order.id,
    delivery_order.order_number,
    delivery_order.order_type,
    delivery_order.customer_id,
    c.name,
    c.id_number,
    delivery_order.assigned_to_user_id,
    pp.full_name,
    delivery_order.status,
    delivery_order.notes,
    delivery_order.delivery_address,
    delivery_order.created_at

  ORDER BY created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_user_delivery_orders_expanded"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_delivery_orders_expanded"("p_user_id" "uuid") IS 'Órdenes para app móvil: remisiones, órdenes cliente en remisión, y órdenes con asignación explícita de retiro (cualquier tipo).';



CREATE OR REPLACE FUNCTION "public"."get_users_dashboard"("search_term" "text" DEFAULT ''::"text", "page" integer DEFAULT 1, "page_size" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "email" "text", "full_name" "text", "avatar_url" "text", "deleted_at" timestamp with time zone, "created_at" timestamp with time zone, "roles" "jsonb", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    _limit integer := GREATEST(COALESCE(page_size, 5), 1);
    _offset integer := GREATEST((COALESCE(page, 1) - 1) * _limit, 0);
    _search text := COALESCE(search_term, '');
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            p.id,
            p.email,
            p.full_name,
            p.avatar_url,
            p.deleted_at,
            p.created_at
        FROM public.profiles p
        WHERE (
            _search = ''
            OR p.full_name ILIKE '%' || _search || '%'
            OR p.email ILIKE '%' || _search || '%'
        )
    ),
    enriched AS (
        SELECT
            f.*,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'id', r.id,
                        'nombre', r.nombre
                    )
                ) FILTER (WHERE r.id IS NOT NULL),
                '[]'::jsonb
            ) AS roles
        FROM filtered f
        LEFT JOIN public.user_roles ur ON ur.user_id = f.id
        LEFT JOIN public.roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
        GROUP BY
            f.id,
            f.email,
            f.full_name,
            f.avatar_url,
            f.deleted_at,
            f.created_at
    ),
    numbered AS (
        SELECT
            e.*,
            COUNT(*) OVER () AS total_count,
            ROW_NUMBER() OVER (ORDER BY e.deleted_at NULLS FIRST, e.created_at DESC) AS row_number
        FROM enriched e
        -- Removido el filtro WHERE e.deleted_at IS NULL para incluir usuarios eliminados
    )
    SELECT
        n.id,
        n.email,
        n.full_name,
        n.avatar_url,
        n.deleted_at,
        n.created_at,
        n.roles,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$$;


ALTER FUNCTION "public"."get_users_dashboard"("search_term" "text", "page" integer, "page_size" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_users_dashboard"("search_term" "text", "page" integer, "page_size" integer) IS 'Devuelve usuarios con roles agregados y total_count, incluyendo usuarios eliminados. Ordena primero usuarios activos, luego eliminados.';



CREATE OR REPLACE FUNCTION "public"."get_users_stats"() RETURNS TABLE("total" bigint, "active" bigint, "admins" bigint, "bodegueros" bigint, "vendedores" bigint)
    LANGUAGE "sql" STABLE
    AS $$
WITH base AS (
    SELECT
        p.id,
        p.deleted_at,
        ARRAY_REMOVE(
            ARRAY_AGG(LOWER(r.nombre)) FILTER (WHERE r.id IS NOT NULL),
            NULL
        ) AS role_names
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
    GROUP BY p.id, p.deleted_at
)
SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE b.deleted_at IS NULL) AS active,
    COUNT(*) FILTER (WHERE 'admin' = ANY(role_names)) AS admins,
    COUNT(*) FILTER (WHERE 'bodeguero' = ANY(role_names)) AS bodegueros,
    COUNT(*) FILTER (WHERE 'vendedor' = ANY(role_names)) AS vendedores
FROM base b;
$$;


ALTER FUNCTION "public"."get_users_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_users_stats"() IS 'Calcula totales de usuarios, activos y por rol en una sola consulta.';



CREATE OR REPLACE FUNCTION "public"."get_warehouses_stats"() RETURNS TABLE("id" "uuid", "name" "text", "city" "text", "address" "text", "is_active" boolean, "total_products" bigint, "total_units" bigint, "last_activity" timestamp with time zone)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT 
    w.id,
    w.name,
    w.city,
    w.address,
    w.is_active,
    COUNT(DISTINCT CASE WHEN ws.quantity > 0 THEN ws.product_id END) as total_products,
    COALESCE(SUM(CASE WHEN ws.quantity > 0 THEN ws.quantity ELSE 0 END), 0) as total_units,
    MAX(ws.updated_at) as last_activity
  FROM warehouses w
  LEFT JOIN warehouse_stock ws ON w.id = ws.warehouse_id
  GROUP BY w.id, w.name, w.city, w.address, w.is_active
  ORDER BY w.name ASC;
$$;


ALTER FUNCTION "public"."get_warehouses_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_return_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    new_entry_id UUID;
BEGIN
    -- Solo procesar en INSERT
    IF TG_OP = 'INSERT' THEN
        IF NEW.return_type = 'purchase_order' THEN
            -- Para purchase orders: crear entrada de inventario (devolver al stock)
            -- NOTA: El trigger fn_update_stock_on_entry() actualizará warehouse_stock automáticamente
            INSERT INTO inventory_entries (
                product_id,
                warehouse_id,
                quantity,
                entry_type,
                purchase_order_id,
                created_by
            ) VALUES (
                NEW.product_id,
                NEW.warehouse_id,
                NEW.quantity,
                'return',
                NEW.order_id,
                NEW.created_by
            )
            RETURNING id INTO new_entry_id;

            -- REMOVIDO: Actualización directa de warehouse_stock
            -- El trigger fn_update_stock_on_entry() ya lo hace automáticamente
            -- Esto estaba causando DOBLE incremento del stock

            -- Actualizar el registro de devolución con el ID de la entrada
            UPDATE returns
            SET inventory_entry_id = new_entry_id
            WHERE id = NEW.id;

        ELSIF NEW.return_type = 'delivery_order' THEN
            -- Para delivery orders: crear entrada de inventario (devolver al stock)
            -- NOTA: El trigger fn_update_stock_on_entry() actualizará warehouse_stock automáticamente
            INSERT INTO inventory_entries (
                product_id,
                warehouse_id,
                quantity,
                entry_type,
                created_by
            ) VALUES (
                NEW.product_id,
                NEW.warehouse_id,
                NEW.quantity,
                'return',
                NEW.created_by
            )
            RETURNING id INTO new_entry_id;

            -- REMOVIDO: Actualización directa de warehouse_stock
            -- El trigger fn_update_stock_on_entry() ya lo hace automáticamente
            -- Esto estaba causando DOBLE incremento del stock

            -- Actualizar delivered_quantity en delivery_order_items (reducir cantidad entregada)
            UPDATE delivery_order_items
            SET delivered_quantity = GREATEST(0, delivered_quantity - NEW.quantity)
            WHERE delivery_order_id = NEW.order_id
              AND product_id = NEW.product_id
              AND warehouse_id = NEW.warehouse_id;

            -- Actualizar el registro de devolución con el ID de la entrada
            UPDATE returns
            SET inventory_entry_id = new_entry_id
            WHERE id = NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."process_return_inventory"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_return_inventory"() IS 'Procesa las devoluciones creando entradas de inventario. El stock se actualiza automáticamente via trigger fn_update_stock_on_entry(). CORREGIDO: Eliminada la doble actualización de warehouse_stock.';



CREATE OR REPLACE FUNCTION "public"."search_customers"("search_term" "text" DEFAULT ''::"text", "limit_count" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "name" "text", "id_number" "text", "address" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    _search text := COALESCE(LOWER(TRIM(search_term)), '');
    _limit integer := GREATEST(COALESCE(limit_count, 20), 1);
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.name::text,
        c.id_number::text,
        c.address::text
    FROM public.customers c
    WHERE c.deleted_at IS NULL
      AND (
        _search = ''
        OR LOWER(c.name) LIKE '%' || _search || '%'
        OR LOWER(c.id_number) LIKE '%' || _search || '%'
      )
    ORDER BY c.name ASC
    LIMIT _limit;
END;
$$;


ALTER FUNCTION "public"."search_customers"("search_term" "text", "limit_count" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_customers"("search_term" "text", "limit_count" integer) IS 'Búsqueda optimizada de clientes por nombre o número de identificación para autocomplete. Usa índices idx_customers_name e idx_customers_id_number.';



CREATE OR REPLACE FUNCTION "public"."search_products_for_delivery_order"("p_search_term" "text" DEFAULT ''::"text") RETURNS TABLE("product_id" "uuid", "product_name" "text", "product_sku" "text", "product_barcode" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    _search text := COALESCE(TRIM(p_search_term), '');
BEGIN
    -- Require at least 2 characters to avoid full-table scans on every
    -- keystroke; the frontend also enforces this.
    IF char_length(_search) < 2 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        p.id                        AS product_id,
        p.name                      AS product_name,
        COALESCE(p.sku, '')         AS product_sku,
        COALESCE(p.barcode, '')     AS product_barcode
    FROM public.products p
    WHERE p.deleted_at IS NULL
      AND (
            p.name    ILIKE '%' || _search || '%'
         OR p.sku     ILIKE '%' || _search || '%'
         OR p.barcode ILIKE '%' || _search || '%'
          )
    ORDER BY p.name
    LIMIT 50;
END;
$$;


ALTER FUNCTION "public"."search_products_for_delivery_order"("p_search_term" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_products_for_delivery_order"("p_search_term" "text") IS 'Búsqueda de productos para el paso 1 del flujo de creación de órdenes de entrega.
Devuelve todos los productos no eliminados que coincidan con nombre, SKU o código de barras.
No filtra por stock — eso se delega a get_stock_by_product_for_delivery.
Exclusivo para el módulo de órdenes de entrega.';



CREATE OR REPLACE FUNCTION "public"."transfer_product_between_warehouses"("p_product_id" "uuid", "p_source_warehouse_id" "uuid", "p_destination_warehouse_id" "uuid", "p_quantity" integer, "p_observations" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_source_stock INTEGER;
  v_current_user_id UUID;
  v_transfer_id UUID;
BEGIN
  -- Get current user ID
  v_current_user_id := auth.uid();

  -- Validate that warehouses are different
  IF p_source_warehouse_id = p_destination_warehouse_id THEN
    RETURN json_build_object(
      'success', false,
      'message', 'La bodega de origen y destino no pueden ser la misma'
    );
  END IF;

  -- Validate quantity is positive
  IF p_quantity <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'message', 'La cantidad debe ser mayor a 0'
    );
  END IF;

  -- Validate observations
  IF p_observations IS NULL OR length(trim(p_observations)) < 10 THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Las observaciones deben tener al menos 10 caracteres'
    );
  END IF;

  -- Lock the source warehouse stock row and get current quantity
  SELECT quantity INTO v_source_stock
  FROM warehouse_stock
  WHERE product_id = p_product_id
    AND warehouse_id = p_source_warehouse_id
  FOR UPDATE;

  -- Check if stock exists
  IF v_source_stock IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'No existe stock del producto en la bodega de origen'
    );
  END IF;

  -- Check if sufficient stock
  IF v_source_stock < p_quantity THEN
    RETURN json_build_object(
      'success', false,
      'message', format('Stock insuficiente. Disponible: %s, Solicitado: %s', v_source_stock, p_quantity)
    );
  END IF;

  -- Decrease stock in source warehouse
  UPDATE warehouse_stock
  SET quantity = quantity - p_quantity,
      updated_at = NOW()
  WHERE product_id = p_product_id
    AND warehouse_id = p_source_warehouse_id;

  -- Increase stock in destination warehouse (UPSERT)
  INSERT INTO warehouse_stock (product_id, warehouse_id, quantity, updated_at)
  VALUES (p_product_id, p_destination_warehouse_id, p_quantity, NOW())
  ON CONFLICT (product_id, warehouse_id)
  DO UPDATE SET
    quantity = warehouse_stock.quantity + EXCLUDED.quantity,
    updated_at = NOW();

  -- Record the transfer in audit table
  INSERT INTO stock_transfers (
    product_id,
    source_warehouse_id,
    destination_warehouse_id,
    quantity,
    observations,
    created_by
  ) VALUES (
    p_product_id,
    p_source_warehouse_id,
    p_destination_warehouse_id,
    p_quantity,
    trim(p_observations),
    v_current_user_id
  )
  RETURNING id INTO v_transfer_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Transferencia realizada exitosamente',
    'transfer_id', v_transfer_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'message', format('Error al realizar la transferencia: %s', SQLERRM)
    );
END;
$$;


ALTER FUNCTION "public"."transfer_product_between_warehouses"("p_product_id" "uuid", "p_source_warehouse_id" "uuid", "p_destination_warehouse_id" "uuid", "p_quantity" integer, "p_observations" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_colors_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_colors_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_delivery_order_edit_observation_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_delivery_order_edit_observation_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_delivery_order_progress"("order_id_param" "uuid", "product_id_param" "uuid", "warehouse_id_param" "uuid", "quantity_delivered_param" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  current_delivered INTEGER;
  total_quantity INTEGER;
  all_items_delivered BOOLEAN;
  item_exists BOOLEAN;
  current_status TEXT;
BEGIN
  -- Verificar que el item existe en la orden (filtrando por warehouse_id)
  SELECT EXISTS (
    SELECT 1 FROM delivery_order_items
    WHERE delivery_order_id = order_id_param
      AND product_id = product_id_param
      AND warehouse_id = warehouse_id_param
  ) INTO item_exists;

  IF NOT item_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Product not found in delivery order for the specified warehouse'
    );
  END IF;

  -- Actualizar delivered_quantity filtrando por warehouse_id
  -- Esto asegura que solo se actualice el item específico
  UPDATE delivery_order_items
  SET
    delivered_quantity = delivered_quantity + quantity_delivered_param
  WHERE delivery_order_id = order_id_param
    AND product_id = product_id_param
    AND warehouse_id = warehouse_id_param
  RETURNING delivered_quantity, quantity INTO current_delivered, total_quantity;

  -- Verificar si excede la cantidad total
  IF current_delivered > total_quantity THEN
    -- Revertir el cambio (solo el item específico)
    UPDATE delivery_order_items
    SET
      delivered_quantity = delivered_quantity - quantity_delivered_param
    WHERE delivery_order_id = order_id_param
      AND product_id = product_id_param
      AND warehouse_id = warehouse_id_param;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Delivered quantity exceeds total quantity',
      'current_delivered', current_delivered - quantity_delivered_param,
      'total_quantity', total_quantity
    );
  END IF;

  -- Verificar si todos los items de la orden están entregados
  SELECT NOT EXISTS (
    SELECT 1 FROM delivery_order_items
    WHERE delivery_order_id = order_id_param
      AND delivered_quantity < quantity
  ) INTO all_items_delivered;

  -- Si todos están entregados, actualizar estado de la orden a 'delivered'
  -- Solo si el estado actual permite la transición
  IF all_items_delivered THEN
    SELECT status INTO current_status
    FROM delivery_orders
    WHERE id = order_id_param;

    IF current_status IN ('pending', 'approved', 'sent_by_remission') THEN
      UPDATE delivery_orders
      SET
        status = 'delivered',
        updated_at = NOW()
      WHERE id = order_id_param
        AND status IN ('pending', 'approved', 'sent_by_remission');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'all_delivered', all_items_delivered,
    'current_delivered', current_delivered,
    'total_quantity', total_quantity,
    'pending_quantity', total_quantity - current_delivered
  );
END;
$$;


ALTER FUNCTION "public"."update_delivery_order_progress"("order_id_param" "uuid", "product_id_param" "uuid", "warehouse_id_param" "uuid", "quantity_delivered_param" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_delivery_order_progress"("order_id_param" "uuid", "product_id_param" "uuid", "warehouse_id_param" "uuid", "quantity_delivered_param" integer) IS 'Updates the delivered quantity for a specific product+warehouse in a delivery order. Automatically marks order as delivered when all items are complete. Now correctly filters by warehouse_id to prevent incorrect updates when the same product exists in multiple warehouses.';



CREATE OR REPLACE FUNCTION "public"."update_delivery_order_progress_batch"("order_id_param" "uuid", "items_param" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  item JSONB;
  item_product_id UUID;
  item_warehouse_id UUID;
  item_quantity INTEGER;
  current_delivered INTEGER;
  total_quantity INTEGER;
  item_exists BOOLEAN;
  all_items_delivered BOOLEAN;
  current_status TEXT;
  results JSONB := '[]'::JSONB;
  failed_items JSONB := '[]'::JSONB;
  success_count INTEGER := 0;
  fail_count INTEGER := 0;
BEGIN
  -- Iterate over each item in the array
  FOR item IN SELECT * FROM jsonb_array_elements(items_param)
  LOOP
    item_product_id := (item ->> 'product_id')::UUID;
    item_warehouse_id := (item ->> 'warehouse_id')::UUID;
    item_quantity := (item ->> 'quantity_delivered')::INTEGER;

    -- Verify item exists in the order for the specified warehouse
    SELECT EXISTS (
      SELECT 1 FROM delivery_order_items
      WHERE delivery_order_id = order_id_param
        AND product_id = item_product_id
        AND warehouse_id = item_warehouse_id
        AND deleted_at IS NULL
    ) INTO item_exists;

    IF NOT item_exists THEN
      fail_count := fail_count + 1;
      failed_items := failed_items || jsonb_build_object(
        'product_id', item_product_id,
        'warehouse_id', item_warehouse_id,
        'error', 'Product not found in delivery order for the specified warehouse'
      );
      CONTINUE;
    END IF;

    -- Update delivered_quantity for the specific product+warehouse item
    UPDATE delivery_order_items
    SET delivered_quantity = delivered_quantity + item_quantity
    WHERE delivery_order_id = order_id_param
      AND product_id = item_product_id
      AND warehouse_id = item_warehouse_id
      AND deleted_at IS NULL
    RETURNING delivered_quantity, quantity INTO current_delivered, total_quantity;

    -- Check if exceeds total quantity
    IF current_delivered > total_quantity THEN
      -- Revert the change
      UPDATE delivery_order_items
      SET delivered_quantity = delivered_quantity - item_quantity
      WHERE delivery_order_id = order_id_param
        AND product_id = item_product_id
        AND warehouse_id = item_warehouse_id
        AND deleted_at IS NULL;

      fail_count := fail_count + 1;
      failed_items := failed_items || jsonb_build_object(
        'product_id', item_product_id,
        'warehouse_id', item_warehouse_id,
        'error', 'Delivered quantity exceeds total quantity',
        'current_delivered', current_delivered - item_quantity,
        'total_quantity', total_quantity
      );
      CONTINUE;
    END IF;

    success_count := success_count + 1;
    results := results || jsonb_build_object(
      'product_id', item_product_id,
      'warehouse_id', item_warehouse_id,
      'current_delivered', current_delivered,
      'total_quantity', total_quantity,
      'pending_quantity', total_quantity - current_delivered
    );
  END LOOP;

  -- After all updates, check if ALL items in the order are fully delivered
  SELECT NOT EXISTS (
    SELECT 1 FROM delivery_order_items
    WHERE delivery_order_id = order_id_param
      AND delivered_quantity < quantity
      AND deleted_at IS NULL
  ) INTO all_items_delivered;

  -- Auto-complete order if all delivered
  IF all_items_delivered THEN
    SELECT status INTO current_status
    FROM delivery_orders
    WHERE id = order_id_param;

    IF current_status IN ('pending', 'approved', 'sent_by_remission') THEN
      UPDATE delivery_orders
      SET status = 'delivered', updated_at = NOW()
      WHERE id = order_id_param
        AND status IN ('pending', 'approved', 'sent_by_remission');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', fail_count = 0,
    'all_delivered', all_items_delivered,
    'success_count', success_count,
    'fail_count', fail_count,
    'results', results,
    'failed_items', failed_items
  );
END;
$$;


ALTER FUNCTION "public"."update_delivery_order_progress_batch"("order_id_param" "uuid", "items_param" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_delivery_order_return_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_delivery_order_return_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_delivery_orders_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_delivery_orders_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_delivery_status_observation_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_delivery_status_observation_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_entry_cancellation_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_entry_cancellation_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_exit_cancellation_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_exit_cancellation_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_purchase_order_edit_observation_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_purchase_order_edit_observation_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_purchase_order_progress"("order_id_param" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  all_items_complete BOOLEAN;
  current_status TEXT;
  order_exists BOOLEAN;
BEGIN
  -- Verificar que la orden existe
  SELECT EXISTS (
    SELECT 1 FROM purchase_orders
    WHERE id = order_id_param
      AND deleted_at IS NULL
  ) INTO order_exists;
  
  IF NOT order_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Purchase order not found or has been deleted'
    );
  END IF;
  
  -- Obtener el estado actual de la orden
  SELECT status INTO current_status
  FROM purchase_orders
  WHERE id = order_id_param
    AND deleted_at IS NULL;
  
  -- Verificar si todos los items están completos
  -- Un item está completo cuando la suma de inventory_entries >= cantidad en purchase_order_items
  SELECT NOT EXISTS (
    SELECT 1 
    FROM purchase_order_items poi
    WHERE poi.purchase_order_id = order_id_param
      AND COALESCE((
        SELECT SUM(ie.quantity)
        FROM inventory_entries ie
        WHERE ie.purchase_order_id = order_id_param
          AND ie.product_id = poi.product_id
      ), 0) < poi.quantity
  ) INTO all_items_complete;
  
  -- Si todos están completos, actualizar estado de la orden a 'received'
  -- Solo si el estado actual permite la transición
  IF all_items_complete THEN
    -- Solo actualizar si el estado permite la transición
    -- No actualizar si ya está en 'received' o 'cancelled'
    IF current_status IN ('pending', 'approved') THEN
      UPDATE purchase_orders
      SET 
        status = 'received',
        updated_at = NOW()
      WHERE id = order_id_param
        AND status IN ('pending', 'approved')
        AND deleted_at IS NULL;
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'all_complete', all_items_complete,
    'current_status', current_status,
    'updated', all_items_complete AND current_status IN ('pending', 'approved')
  );
END;
$$;


ALTER FUNCTION "public"."update_purchase_order_progress"("order_id_param" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_purchase_order_progress"("order_id_param" "uuid") IS 'Checks if all items in a purchase order are fully registered in inventory_entries and automatically marks order as received when complete. Only updates status if current status is pending or approved.';



CREATE OR REPLACE FUNCTION "public"."update_returns_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_returns_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_status_observation_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_status_observation_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_zones_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_zones_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_inventory_entry_quantity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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
  IF NEW.entry_type = 'PO_ENTRY' AND order_status != 'pending' THEN
    RAISE EXCEPTION 'La orden de compra % no está en estado pendiente (estado actual: %). No se pueden registrar más entradas.',
      NEW.purchase_order_id, order_status;
  END IF;

  -- Obtener la cantidad ordenada para este producto en la orden
  -- Solo considerar items activos (no soft-deleted)
  SELECT quantity
  INTO order_item_quantity
  FROM purchase_order_items
  WHERE purchase_order_id = NEW.purchase_order_id
    AND product_id = NEW.product_id
    AND deleted_at IS NULL;

  -- Si no hay item en la orden para este producto, rechazar
  IF order_item_quantity IS NULL THEN
    RAISE EXCEPTION 'El producto % no está incluido en la orden de compra %',
      NEW.product_id, NEW.purchase_order_id;
  END IF;

  -- Calcular la cantidad total ya registrada para este producto en esta orden
  -- CORREGIDO: Excluir entradas soft-deleted (cancelled) del conteo
  SELECT COALESCE(SUM(quantity), 0)
  INTO total_registered
  FROM inventory_entries
  WHERE purchase_order_id = NEW.purchase_order_id
    AND product_id = NEW.product_id
    AND deleted_at IS NULL
    AND (TG_OP = 'INSERT' OR id != NEW.id);

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


ALTER FUNCTION "public"."validate_inventory_entry_quantity"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_inventory_entry_quantity"() IS 'Validates that inventory entries do not exceed purchase order quantities. CORREGIDO: Ahora excluye entradas soft-deleted del conteo y solo considera purchase_order_items activos (deleted_at IS NULL).';



CREATE OR REPLACE FUNCTION "public"."validate_inventory_exit_quantity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  order_item_quantity numeric;
  total_dispatched    numeric;
  order_status        text;
  order_exists        boolean;
  has_any_assignment  boolean;
BEGIN
  IF NEW.delivery_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    dord.status,
    EXISTS (
      SELECT 1
      FROM public.delivery_orders
      WHERE id = NEW.delivery_order_id
        AND deleted_at IS NULL
    )
  INTO order_status, order_exists
  FROM public.delivery_orders dord
  WHERE dord.id = NEW.delivery_order_id
    AND dord.deleted_at IS NULL;

  IF NOT order_exists THEN
    RAISE EXCEPTION 'La orden de entrega % no existe o ha sido eliminada', NEW.delivery_order_id;
  END IF;

  IF order_status = 'cancelled' THEN
    RAISE EXCEPTION 'La orden de entrega % está cancelada. No se pueden registrar más salidas.', NEW.delivery_order_id;
  END IF;

  -- Verificar si la orden tiene algún usuario autorizado asignado
  SELECT EXISTS (
    SELECT 1
    FROM public.delivery_order_pickup_assignments
    WHERE delivery_order_id = NEW.delivery_order_id
      AND deleted_at IS NULL
  ) INTO has_any_assignment;

  IF has_any_assignment THEN
    -- Si hay asignaciones, el usuario debe ser uno de ellos, ser admin, o service_role
    IF COALESCE(auth.role(), ''::text) = 'service_role'
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND r.nombre = 'admin'::text
      )
      OR EXISTS (
        SELECT 1
        FROM public.delivery_order_pickup_assignments
        WHERE delivery_order_id = NEW.delivery_order_id
          AND user_id = auth.uid()
          AND deleted_at IS NULL
      ) THEN
      -- permitido
    ELSE
      RAISE EXCEPTION 'Solo un usuario autorizado para retiro o un administrador puede registrar salidas para esta orden';
    END IF;
  END IF;

  SELECT quantity
  INTO order_item_quantity
  FROM public.delivery_order_items
  WHERE delivery_order_id = NEW.delivery_order_id
    AND product_id = NEW.product_id
    AND warehouse_id = NEW.warehouse_id
    AND deleted_at IS NULL;

  IF order_item_quantity IS NULL THEN
    RAISE EXCEPTION 'El producto % no está incluido en la orden de entrega % para la bodega %',
      NEW.product_id, NEW.delivery_order_id, NEW.warehouse_id;
  END IF;

  SELECT COALESCE(SUM(quantity), 0)
  INTO total_dispatched
  FROM public.inventory_exits
  WHERE delivery_order_id = NEW.delivery_order_id
    AND product_id = NEW.product_id
    AND warehouse_id = NEW.warehouse_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

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


ALTER FUNCTION "public"."validate_inventory_exit_quantity"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_inventory_exit_quantity"() IS 'Validates inventory exits against delivery orders and pickup assignments (multiple authorized users). Called by trigger before insert/update.';



CREATE OR REPLACE FUNCTION "public"."validate_return_quantity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    max_quantity NUMERIC;
    total_returned NUMERIC;
    order_exists BOOLEAN;
BEGIN
    -- Validar según el tipo de devolución
    IF NEW.return_type = 'purchase_order' THEN
        -- Validar que la orden de compra existe
        SELECT EXISTS(
            SELECT 1 FROM purchase_orders 
            WHERE id = NEW.order_id AND deleted_at IS NULL
        ) INTO order_exists;
        
        IF NOT order_exists THEN
            RAISE EXCEPTION 'La orden de compra % no existe o ha sido eliminada', NEW.order_id;
        END IF;
        
        -- Obtener la cantidad recibida para este producto en esta orden
        -- Sumar todas las entradas de inventario relacionadas con esta orden
        SELECT COALESCE(SUM(quantity), 0)
        INTO max_quantity
        FROM inventory_entries
        WHERE purchase_order_id = NEW.order_id
          AND product_id = NEW.product_id
          AND warehouse_id = NEW.warehouse_id;
        
        -- Verificar que el producto esté en la orden
        IF NOT EXISTS (
            SELECT 1 FROM purchase_order_items
            WHERE purchase_order_id = NEW.order_id
              AND product_id = NEW.product_id
        ) THEN
            RAISE EXCEPTION 'El producto % no está incluido en la orden de compra %', 
                NEW.product_id, NEW.order_id;
        END IF;
        
    ELSIF NEW.return_type = 'delivery_order' THEN
        -- Validar que la orden de entrega existe
        SELECT EXISTS(
            SELECT 1 FROM delivery_orders 
            WHERE id = NEW.order_id AND deleted_at IS NULL
        ) INTO order_exists;
        
        IF NOT order_exists THEN
            RAISE EXCEPTION 'La orden de entrega % no existe o ha sido eliminada', NEW.order_id;
        END IF;
        
        -- Obtener la cantidad entregada para este producto en esta orden y bodega
        SELECT COALESCE(SUM(quantity), 0)
        INTO max_quantity
        FROM inventory_exits
        WHERE delivery_order_id = NEW.order_id
          AND product_id = NEW.product_id
          AND warehouse_id = NEW.warehouse_id;
        
        -- Verificar que el producto esté en la orden
        IF NOT EXISTS (
            SELECT 1 FROM delivery_order_items
            WHERE delivery_order_id = NEW.order_id
              AND product_id = NEW.product_id
              AND warehouse_id = NEW.warehouse_id
        ) THEN
            RAISE EXCEPTION 'El producto % no está incluido en la orden de entrega % para la bodega %', 
                NEW.product_id, NEW.order_id, NEW.warehouse_id;
        END IF;
        
        -- Si hay inventory_exit_id, validar que pertenece a esta orden
        IF NEW.inventory_exit_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM inventory_exits
                WHERE id = NEW.inventory_exit_id
                  AND delivery_order_id = NEW.order_id
                  AND product_id = NEW.product_id
                  AND warehouse_id = NEW.warehouse_id
            ) THEN
                RAISE EXCEPTION 'La salida de inventario % no pertenece a esta orden de entrega o producto', 
                    NEW.inventory_exit_id;
            END IF;
        END IF;
    ELSE
        RAISE EXCEPTION 'Tipo de devolución inválido: %', NEW.return_type;
    END IF;
    
    -- Calcular la cantidad total ya devuelta (excluyendo la actual si es UPDATE)
    SELECT COALESCE(SUM(quantity), 0)
    INTO total_returned
    FROM returns
    WHERE return_type = NEW.return_type
      AND order_id = NEW.order_id
      AND product_id = NEW.product_id
      AND warehouse_id = NEW.warehouse_id
      AND (TG_OP = 'INSERT' OR id != NEW.id); -- Excluir la fila actual si es UPDATE
    
    -- Validar que la cantidad total devuelta no exceda lo recibido/entregado
    IF (total_returned + NEW.quantity) > max_quantity THEN
        RAISE EXCEPTION 
            'La cantidad excede lo permitido para este producto. Máximo disponible: %, Ya devuelto: %, Intentando devolver: %, Total después de esta devolución: %',
            max_quantity, 
            total_returned, 
            NEW.quantity,
            total_returned + NEW.quantity;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_return_quantity"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_return_quantity"() IS 'Valida que las devoluciones no excedan las cantidades recibidas/entregadas en las órdenes';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."brands" OWNER TO "postgres";


COMMENT ON TABLE "public"."brands" IS 'Marca de todos los electrodomésticos';



CREATE TABLE IF NOT EXISTS "public"."category" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying NOT NULL,
    "description" character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" time with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."category" OWNER TO "postgres";


COMMENT ON TABLE "public"."category" IS 'Categories of products';



CREATE TABLE IF NOT EXISTS "public"."colors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."colors" OWNER TO "postgres";


COMMENT ON TABLE "public"."colors" IS 'Tabla para registrar los colores disponibles para los productos';



COMMENT ON COLUMN "public"."colors"."name" IS 'Nombre del color del producto (ej: Rojo, Azul, Verde, etc.)';



COMMENT ON COLUMN "public"."colors"."deleted_at" IS 'Fecha de eliminación lógica del color. NULL si el color está activo';



CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "id_number" character varying(50) NOT NULL,
    "phone" character varying(20),
    "email" character varying(100),
    "address" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_order_edit_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_order_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "edit_type" "text" NOT NULL,
    "previous_quantity" numeric,
    "new_quantity" numeric,
    "observations" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "check_delivery_edit_type" CHECK (("edit_type" = ANY (ARRAY['item_added'::"text", 'item_removed'::"text", 'item_quantity_changed'::"text", 'item_quantity_reduced'::"text", 'item_quantity_increased'::"text", 'order_updated'::"text"]))),
    CONSTRAINT "check_delivery_quantity_change" CHECK ((("edit_type" !~~ '%quantity%'::"text") OR (("previous_quantity" IS NOT NULL) AND ("new_quantity" IS NOT NULL))))
);


ALTER TABLE "public"."delivery_order_edit_observations" OWNER TO "postgres";


COMMENT ON TABLE "public"."delivery_order_edit_observations" IS 'Registra observaciones y razones de cambios realizados en órdenes de entrega';



COMMENT ON COLUMN "public"."delivery_order_edit_observations"."delivery_order_id" IS 'Referencia a la orden de entrega que fue editada';



COMMENT ON COLUMN "public"."delivery_order_edit_observations"."product_id" IS 'Referencia al producto afectado (NULL para cambios generales de la orden)';



COMMENT ON COLUMN "public"."delivery_order_edit_observations"."edit_type" IS 'Tipo de edición: item_added, item_removed, item_quantity_reduced, item_quantity_increased, item_quantity_changed, order_updated';



COMMENT ON COLUMN "public"."delivery_order_edit_observations"."previous_quantity" IS 'Cantidad anterior del producto (si aplica al tipo de edición)';



COMMENT ON COLUMN "public"."delivery_order_edit_observations"."new_quantity" IS 'Cantidad nueva del producto (si aplica al tipo de edición)';



COMMENT ON COLUMN "public"."delivery_order_edit_observations"."observations" IS 'Razón obligatoria por la cual se realizó el cambio';



COMMENT ON COLUMN "public"."delivery_order_edit_observations"."created_by" IS 'Usuario que realizó la edición';



CREATE TABLE IF NOT EXISTS "public"."delivery_order_item_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_order_id" "uuid" NOT NULL,
    "observations" "text" NOT NULL,
    "delivered_by_user_id" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."delivery_order_item_approvals" OWNER TO "postgres";


COMMENT ON TABLE "public"."delivery_order_item_approvals" IS 'Almacena grupos de productos aprobados en lote para órdenes de entrega';



COMMENT ON COLUMN "public"."delivery_order_item_approvals"."id" IS 'Identificador único de la aprobación';



COMMENT ON COLUMN "public"."delivery_order_item_approvals"."delivery_order_id" IS 'Orden de entrega a la que pertenece esta aprobación';



COMMENT ON COLUMN "public"."delivery_order_item_approvals"."observations" IS 'Observaciones obligatorias sobre la aprobación';



COMMENT ON COLUMN "public"."delivery_order_item_approvals"."delivered_by_user_id" IS 'Usuario/colaborador que realizó la entrega física (opcional)';



COMMENT ON COLUMN "public"."delivery_order_item_approvals"."approved_by" IS 'Usuario que registró la aprobación en el sistema';



COMMENT ON COLUMN "public"."delivery_order_item_approvals"."approved_at" IS 'Fecha y hora de la aprobación';



CREATE TABLE IF NOT EXISTS "public"."delivery_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "delivered_quantity" numeric DEFAULT 0 NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_approved" boolean DEFAULT false NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "source_delivery_order_id" "uuid",
    "approval_id" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "check_delivery_order_item_delivered_quantity" CHECK (("delivered_quantity" >= (0)::numeric)),
    CONSTRAINT "check_delivery_order_item_quantity" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."delivery_order_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."delivery_order_items" IS 'Items de las órdenes de entrega. Relaciona productos, cantidades y bodegas.';



COMMENT ON COLUMN "public"."delivery_order_items"."quantity" IS 'Cantidad solicitada en la orden';



COMMENT ON COLUMN "public"."delivery_order_items"."delivered_quantity" IS 'Cantidad realmente entregada (puede ser parcial)';



COMMENT ON COLUMN "public"."delivery_order_items"."is_approved" IS 'Indica si el producto ha sido aprobado por el administrador para la entrega';



COMMENT ON COLUMN "public"."delivery_order_items"."approved_at" IS 'Fecha y hora en que el producto fue aprobado';



COMMENT ON COLUMN "public"."delivery_order_items"."approved_by" IS 'Usuario que aprobó el producto';



COMMENT ON COLUMN "public"."delivery_order_items"."source_delivery_order_id" IS 'ID de la orden de entrega original de la cual se copió este item. Si está presente, el item NO afecta el stock (ya se reservó al crear la orden original).';



COMMENT ON COLUMN "public"."delivery_order_items"."approval_id" IS 'Referencia a la aprobación grupal a la que pertenece este item';



CREATE TABLE IF NOT EXISTS "public"."delivery_order_pickup_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_order_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."delivery_order_pickup_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."delivery_order_pickup_assignments" IS 'Usuario de la plataforma (profiles) autorizado a registrar salidas de inventario para la orden (cliente o remisión).';



COMMENT ON COLUMN "public"."delivery_order_pickup_assignments"."user_id" IS 'Perfil en profiles del operador autorizado; no es el cliente final.';



COMMENT ON COLUMN "public"."delivery_order_pickup_assignments"."deleted_at" IS 'Soft delete; al reasignar se marca la fila anterior y se inserta una nueva.';



CREATE TABLE IF NOT EXISTS "public"."delivery_order_returns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_order_id" "uuid" NOT NULL,
    "inventory_exit_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "return_reason" "text" NOT NULL,
    "observations" "text",
    "inventory_entry_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "delivery_order_returns_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."delivery_order_returns" OWNER TO "postgres";


COMMENT ON TABLE "public"."delivery_order_returns" IS 'Registra devoluciones de productos entregados en órdenes de entrega';



COMMENT ON COLUMN "public"."delivery_order_returns"."return_reason" IS 'Razón obligatoria por la cual se devuelve el producto (ej: defectuoso, incorrecto, etc.)';



COMMENT ON COLUMN "public"."delivery_order_returns"."inventory_entry_id" IS 'Referencia a la entrada de inventario creada al procesar la devolución';



CREATE TABLE IF NOT EXISTS "public"."delivery_order_status_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_order_id" "uuid" NOT NULL,
    "status_action" "text" NOT NULL,
    "previous_status" "text" NOT NULL,
    "new_status" "text" NOT NULL,
    "observations" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "check_delivery_status_action" CHECK (("status_action" = ANY (ARRAY['cancelled'::"text", 'approved'::"text", 'sent_by_remission'::"text", 'delivered'::"text"])))
);


ALTER TABLE "public"."delivery_order_status_observations" OWNER TO "postgres";


COMMENT ON TABLE "public"."delivery_order_status_observations" IS 'Registra observaciones obligatorias para cambios de estado en órdenes de entrega';



COMMENT ON COLUMN "public"."delivery_order_status_observations"."status_action" IS 'Tipo de acción: cancelled (Cancelada), approved (Aprobada), sent_by_remission (Enviado por Remisión), delivered (Entregado)';



COMMENT ON COLUMN "public"."delivery_order_status_observations"."observations" IS 'Razón obligatoria por la cual se realiza el cambio de estado';



CREATE TABLE IF NOT EXISTS "public"."delivery_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "delivery_address" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "order_type" "text" DEFAULT 'customer'::"text" NOT NULL,
    "assigned_to_user_id" "uuid",
    "order_number" "text",
    "zone_id" "uuid",
    CONSTRAINT "check_delivery_order_recipient_required" CHECK (((("order_type" = 'customer'::"text") AND ("customer_id" IS NOT NULL) AND ("assigned_to_user_id" IS NULL)) OR (("order_type" = 'remission'::"text") AND ("assigned_to_user_id" IS NOT NULL) AND ("customer_id" IS NULL)))),
    CONSTRAINT "check_delivery_order_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'sent_by_remission'::"text", 'delivered'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "check_delivery_order_type" CHECK (("order_type" = ANY (ARRAY['remission'::"text", 'customer'::"text"])))
);


ALTER TABLE "public"."delivery_orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."delivery_orders" IS 'Órdenes de entrega de productos a clientes. Similar a purchase_orders pero para entregas.';



COMMENT ON COLUMN "public"."delivery_orders"."customer_id" IS 'ID del cliente (requerido solo para tipo customer, NULL para remission)';



COMMENT ON COLUMN "public"."delivery_orders"."status" IS 'Estados: pending (pendiente), approved (aprobada), sent_by_remission (enviado por remisión), delivered (entregado), cancelled (cancelada)';



COMMENT ON COLUMN "public"."delivery_orders"."order_type" IS 'Tipo de orden: remission (remisión) o customer (cliente)';



COMMENT ON COLUMN "public"."delivery_orders"."assigned_to_user_id" IS 'ID del usuario asignado a la remisión (requerido solo para tipo remission, NULL para customer)';



COMMENT ON COLUMN "public"."delivery_orders"."order_number" IS 'Número único de orden de entrega en formato OE-YYYY-NNNN (ej: OE-2024-0001). Generado automáticamente.';



COMMENT ON COLUMN "public"."delivery_orders"."zone_id" IS 'Referencia a la zona de entrega. Requerido solo para órdenes de tipo remisión. NULL para órdenes de tipo cliente.';



COMMENT ON CONSTRAINT "check_delivery_order_status" ON "public"."delivery_orders" IS 'Restricts status to: pending (Pendiente), approved (Aprobada), sent_by_remission (Enviado por Remisión), delivered (Entregado), cancelled (Cancelada)';



CREATE TABLE IF NOT EXISTS "public"."inventory_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "purchase_order_id" "uuid",
    "quantity" numeric(12,2) NOT NULL,
    "barcode_scanned" "text",
    "entry_type" "text" DEFAULT 'ENTRY'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivery_order_return_id" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "inventory_entries_entry_type_check" CHECK (("entry_type" = ANY (ARRAY['PO_ENTRY'::"text", 'ENTRY'::"text", 'INITIAL_LOAD'::"text", 'return'::"text"]))),
    CONSTRAINT "inventory_entries_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."inventory_entries" OWNER TO "postgres";


COMMENT ON COLUMN "public"."inventory_entries"."delivery_order_return_id" IS 'Referencia a la devolución de orden de entrega que generó esta entrada';



CREATE TABLE IF NOT EXISTS "public"."inventory_entry_cancellations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventory_entry_id" "uuid" NOT NULL,
    "observations" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."inventory_entry_cancellations" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_entry_cancellations" IS 'Registra las cancelaciones de entradas de inventario con la razón obligatoria';



COMMENT ON COLUMN "public"."inventory_entry_cancellations"."inventory_entry_id" IS 'Referencia a la entrada de inventario que se cancela';



COMMENT ON COLUMN "public"."inventory_entry_cancellations"."observations" IS 'Razón obligatoria por la cual se cancela la entrada';



COMMENT ON COLUMN "public"."inventory_entry_cancellations"."created_by" IS 'Usuario que realiza la cancelación';



CREATE TABLE IF NOT EXISTS "public"."inventory_exit_cancellations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventory_exit_id" "uuid" NOT NULL,
    "observations" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."inventory_exit_cancellations" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_exit_cancellations" IS 'Registra las cancelaciones de salidas de inventario con la razón obligatoria';



COMMENT ON COLUMN "public"."inventory_exit_cancellations"."inventory_exit_id" IS 'Referencia a la salida de inventario que se cancela';



COMMENT ON COLUMN "public"."inventory_exit_cancellations"."observations" IS 'Razón obligatoria por la cual se cancela la salida';



COMMENT ON COLUMN "public"."inventory_exit_cancellations"."created_by" IS 'Usuario que realiza la cancelación';



CREATE TABLE IF NOT EXISTS "public"."inventory_exits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "quantity" numeric(12,2) NOT NULL,
    "barcode_scanned" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered_to_user_id" "uuid",
    "delivered_to_customer_id" "uuid",
    "delivery_order_id" "uuid",
    "delivery_observations" "text",
    CONSTRAINT "inventory_exits_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."inventory_exits" OWNER TO "postgres";


COMMENT ON COLUMN "public"."inventory_exits"."delivery_order_id" IS 'Referencia a la orden de entrega que generó esta salida de inventario. NULL si la salida no fue generada por una orden de entrega.';



CREATE TABLE IF NOT EXISTS "public"."operation_error_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "error_code" "text" NOT NULL,
    "error_message" "text" NOT NULL,
    "module" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "step" "text",
    "severity" "text" DEFAULT 'error'::"text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "context" "jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_entity_type" CHECK ((("entity_type" IS NULL) OR ("entity_type" = ANY (ARRAY['delivery_order'::"text", 'purchase_order'::"text", 'inventory_entry'::"text", 'inventory_exit'::"text"])))),
    CONSTRAINT "check_module" CHECK (("module" = ANY (ARRAY['exits'::"text", 'entries'::"text", 'purchase_orders'::"text", 'returns'::"text"]))),
    CONSTRAINT "check_severity" CHECK (("severity" = ANY (ARRAY['error'::"text", 'warning'::"text"])))
);


ALTER TABLE "public"."operation_error_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."operation_error_logs" IS 'Registra errores durante operaciones de órdenes de entrega y compra';



COMMENT ON COLUMN "public"."operation_error_logs"."error_code" IS 'Código corto del error (ej: DELIVERY_PROGRESS_FAILED, ENTRY_INSERT_FAILED)';



COMMENT ON COLUMN "public"."operation_error_logs"."error_message" IS 'Mensaje de error raw tal como viene del sistema';



COMMENT ON COLUMN "public"."operation_error_logs"."module" IS 'Módulo donde ocurrió: exits, entries, purchase_orders, returns';



COMMENT ON COLUMN "public"."operation_error_logs"."operation" IS 'Operación específica: finalize_exit, finalize_entry, update_status, etc.';



COMMENT ON COLUMN "public"."operation_error_logs"."step" IS 'Paso dentro de la operación: insert_records, rpc_update_progress, cache_refresh, validation';



COMMENT ON COLUMN "public"."operation_error_logs"."severity" IS 'Nivel de severidad: error (crítico) o warning (no crítico)';



COMMENT ON COLUMN "public"."operation_error_logs"."entity_type" IS 'Tipo de entidad: delivery_order, purchase_order, inventory_entry, inventory_exit';



COMMENT ON COLUMN "public"."operation_error_logs"."entity_id" IS 'ID de la entidad principal relacionada al error';



COMMENT ON COLUMN "public"."operation_error_logs"."context" IS 'Datos de contexto adicionales en formato JSON (product_ids, warehouse_id, quantities, etc.)';



COMMENT ON COLUMN "public"."operation_error_logs"."created_by" IS 'Usuario que ejecutó la operación cuando ocurrió el error';



CREATE TABLE IF NOT EXISTS "public"."permisos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."permisos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text" NOT NULL,
    "barcode" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "deleted_at" timestamp without time zone,
    "category_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" boolean DEFAULT true,
    "color_id" "uuid"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."color_id" IS 'Referencia al color del producto. NULL si el producto no tiene color asignado.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_edit_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "edit_type" "text" NOT NULL,
    "previous_quantity" numeric,
    "new_quantity" numeric,
    "observations" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "check_edit_type" CHECK (("edit_type" = ANY (ARRAY['item_added'::"text", 'item_removed'::"text", 'item_quantity_changed'::"text", 'item_quantity_reduced'::"text", 'item_quantity_increased'::"text", 'order_updated'::"text"]))),
    CONSTRAINT "check_quantity_change" CHECK ((("edit_type" !~~ '%quantity%'::"text") OR (("previous_quantity" IS NOT NULL) AND ("new_quantity" IS NOT NULL))))
);


ALTER TABLE "public"."purchase_order_edit_observations" OWNER TO "postgres";


COMMENT ON TABLE "public"."purchase_order_edit_observations" IS 'Registra observaciones y razones de cambios realizados en órdenes de compra';



COMMENT ON COLUMN "public"."purchase_order_edit_observations"."purchase_order_id" IS 'Referencia a la orden de compra que fue editada';



COMMENT ON COLUMN "public"."purchase_order_edit_observations"."product_id" IS 'Referencia al producto afectado (NULL para cambios generales de la orden)';



COMMENT ON COLUMN "public"."purchase_order_edit_observations"."edit_type" IS 'Tipo de edición: item_added, item_removed, item_quantity_reduced, item_quantity_increased, item_quantity_changed, order_updated';



COMMENT ON COLUMN "public"."purchase_order_edit_observations"."previous_quantity" IS 'Cantidad anterior del producto (si aplica al tipo de edición)';



COMMENT ON COLUMN "public"."purchase_order_edit_observations"."new_quantity" IS 'Cantidad nueva del producto (si aplica al tipo de edición)';



COMMENT ON COLUMN "public"."purchase_order_edit_observations"."observations" IS 'Razón obligatoria por la cual se realizó el cambio';



COMMENT ON COLUMN "public"."purchase_order_edit_observations"."created_by" IS 'Usuario que realizó la edición';



CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."purchase_order_items"."updated_at" IS 'Timestamp of last update, automatically maintained by trigger';



CREATE TABLE IF NOT EXISTS "public"."purchase_order_status_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "status_action" "text" NOT NULL,
    "previous_status" "text" NOT NULL,
    "new_status" "text" NOT NULL,
    "observations" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "check_status_action" CHECK (("status_action" = ANY (ARRAY['cancelled'::"text", 'received'::"text", 'approved'::"text"])))
);


ALTER TABLE "public"."purchase_order_status_observations" OWNER TO "postgres";


COMMENT ON TABLE "public"."purchase_order_status_observations" IS 'Registra observaciones obligatorias para cambios de estado en órdenes de compra';



COMMENT ON COLUMN "public"."purchase_order_status_observations"."status_action" IS 'Tipo de acción: cancelled (Cancelada), received (Recibida), approved (Aprobada)';



COMMENT ON COLUMN "public"."purchase_order_status_observations"."observations" IS 'Razón obligatoria por la cual se realiza el cambio de estado';



CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "order_number" "text",
    CONSTRAINT "purchase_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'received'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."purchase_orders"."deleted_at" IS 'Fecha de eliminación lógica. NULL significa que la orden está activa.';



COMMENT ON COLUMN "public"."purchase_orders"."order_number" IS 'Número único de orden de compra en formato OC-YYYY-NNNN (ej: OC-2024-0001). Generado automáticamente.';



COMMENT ON CONSTRAINT "purchase_orders_status_check" ON "public"."purchase_orders" IS 'Restricts status to: pending (Pendiente), approved (Aprobada), received (Recibida), cancelled (Cancelada)';



CREATE TABLE IF NOT EXISTS "public"."remission_delivery_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "remission_id" "uuid" NOT NULL,
    "source_delivery_order_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."remission_delivery_orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."remission_delivery_orders" IS 'Relación entre remisiones y órdenes de entrega de clientes. Permite asignar órdenes de cliente a remisiones.';



COMMENT ON COLUMN "public"."remission_delivery_orders"."remission_id" IS 'ID de la remisión (delivery_order con order_type=''remission'')';



COMMENT ON COLUMN "public"."remission_delivery_orders"."source_delivery_order_id" IS 'ID de la orden de entrega de cliente asignada (delivery_order con order_type=''customer'')';



COMMENT ON COLUMN "public"."remission_delivery_orders"."deleted_at" IS 'Soft delete timestamp. When a remission is deleted, its relationships are also soft-deleted to allow order reassignment.';



CREATE TABLE IF NOT EXISTS "public"."returns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "return_type" "text" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "return_reason" "text" NOT NULL,
    "observations" "text",
    "inventory_entry_id" "uuid",
    "inventory_exit_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "returns_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "returns_return_type_check" CHECK (("return_type" = ANY (ARRAY['purchase_order'::"text", 'delivery_order'::"text"])))
);


ALTER TABLE "public"."returns" OWNER TO "postgres";


COMMENT ON TABLE "public"."returns" IS 'Sistema unificado para registrar devoluciones de productos de órdenes de compra y órdenes de entrega';



COMMENT ON COLUMN "public"."returns"."return_type" IS 'Tipo de devolución: purchase_order (devolución de orden de compra) o delivery_order (devolución de orden de entrega)';



COMMENT ON COLUMN "public"."returns"."order_id" IS 'ID de la orden (purchase_order_id o delivery_order_id según return_type)';



COMMENT ON COLUMN "public"."returns"."return_reason" IS 'Razón obligatoria por la cual se devuelve el producto (ej: defectuoso, incorrecto, etc.)';



COMMENT ON COLUMN "public"."returns"."inventory_entry_id" IS 'Para purchase orders: referencia a la entrada de inventario creada al procesar la devolución';



COMMENT ON COLUMN "public"."returns"."inventory_exit_id" IS 'Para delivery orders: referencia a la salida de inventario original que se devuelve';



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles_permisos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rol_id" "uuid" NOT NULL,
    "permiso_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."roles_permisos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_adjustment_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "previous_quantity" numeric(12,2) NOT NULL,
    "new_quantity" numeric(12,2) NOT NULL,
    "reason" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_adjustment_logs_new_qty_check" CHECK (("new_quantity" >= (0)::numeric)),
    CONSTRAINT "stock_adjustment_logs_reason_check" CHECK (("length"(TRIM(BOTH FROM "reason")) >= 10))
);


ALTER TABLE "public"."stock_adjustment_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."stock_adjustment_logs" IS 'Registro de auditoría para ajustes manuales de stock. Cada fila registra la cantidad anterior y nueva de un producto en una bodega específica, junto con el motivo y el usuario que realizó el cambio.';



CREATE TABLE IF NOT EXISTS "public"."stock_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "source_warehouse_id" "uuid" NOT NULL,
    "destination_warehouse_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "observations" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "different_warehouses" CHECK (("source_warehouse_id" <> "destination_warehouse_id")),
    CONSTRAINT "stock_transfers_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."stock_transfers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "address" "text",
    "city" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."warehouses" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."stock_transfers_searchable" WITH ("security_invoker"='on') AS
 SELECT "st"."id",
    "st"."product_id",
    "st"."source_warehouse_id",
    "st"."destination_warehouse_id",
    "st"."quantity",
    "st"."observations",
    "st"."created_by",
    "st"."created_at",
    "p"."name" AS "product_name",
    "p"."sku" AS "product_sku",
    "w1"."name" AS "source_warehouse_name",
    "w2"."name" AS "destination_warehouse_name",
    "prof"."full_name" AS "created_by_name"
   FROM (((("public"."stock_transfers" "st"
     LEFT JOIN "public"."products" "p" ON (("st"."product_id" = "p"."id")))
     LEFT JOIN "public"."warehouses" "w1" ON (("st"."source_warehouse_id" = "w1"."id")))
     LEFT JOIN "public"."warehouses" "w2" ON (("st"."destination_warehouse_id" = "w2"."id")))
     LEFT JOIN "public"."profiles" "prof" ON (("st"."created_by" = "prof"."id")));


ALTER VIEW "public"."stock_transfers_searchable" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nit" character varying,
    "name" character varying,
    "description" "text",
    "cell_phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


COMMENT ON TABLE "public"."suppliers" IS 'Proveedores de los productos';



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_roles" IS 'roles asignados al usuario';



CREATE OR REPLACE VIEW "public"."v_cancelled_entries" AS
 SELECT "ec"."id" AS "cancellation_id",
    "ec"."inventory_entry_id",
    "ec"."observations",
    "ec"."created_by" AS "cancelled_by",
    "ec"."created_at" AS "cancelled_at",
    "e"."product_id",
    "e"."warehouse_id",
    "e"."quantity",
    "e"."entry_type",
    "e"."created_at" AS "entry_created_at",
    "e"."created_by" AS "entry_created_by"
   FROM ("public"."inventory_entry_cancellations" "ec"
     JOIN "public"."inventory_entries" "e" ON (("e"."id" = "ec"."inventory_entry_id")));


ALTER VIEW "public"."v_cancelled_entries" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_cancelled_entries" IS 'Vista que muestra las entradas canceladas con información relacionada';



CREATE OR REPLACE VIEW "public"."v_cancelled_exits" AS
 SELECT "ec"."id" AS "cancellation_id",
    "ec"."inventory_exit_id",
    "ec"."observations",
    "ec"."created_by" AS "cancelled_by",
    "ec"."created_at" AS "cancelled_at",
    "e"."product_id",
    "e"."warehouse_id",
    "e"."quantity",
    "e"."created_at" AS "exit_created_at",
    "e"."created_by" AS "exit_created_by"
   FROM ("public"."inventory_exit_cancellations" "ec"
     JOIN "public"."inventory_exits" "e" ON (("e"."id" = "ec"."inventory_exit_id")));


ALTER VIEW "public"."v_cancelled_exits" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_cancelled_exits" IS 'Vista que muestra las salidas canceladas con información relacionada';



CREATE TABLE IF NOT EXISTS "public"."warehouse_stock" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "quantity" numeric(12,2) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "warehouse_stock_quantity_check" CHECK (("quantity" >= (0)::numeric))
);


ALTER TABLE "public"."warehouse_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."zones" OWNER TO "postgres";


COMMENT ON TABLE "public"."zones" IS 'Tabla para registrar las zonas disponibles en el sistema';



COMMENT ON COLUMN "public"."zones"."name" IS 'Nombre de la zona (ej: Zona Norte, Zona Sur, Zona Centro, etc.)';



COMMENT ON COLUMN "public"."zones"."deleted_at" IS 'Fecha de eliminación lógica de la zona. NULL si la zona está activa';



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "PK_products" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "UQ_products_barcode" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "UQ_products_sku" UNIQUE ("sku");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category"
    ADD CONSTRAINT "category_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."colors"
    ADD CONSTRAINT "colors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_id_number_key" UNIQUE ("id_number");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_order_edit_observations"
    ADD CONSTRAINT "delivery_order_edit_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_order_item_approvals"
    ADD CONSTRAINT "delivery_order_item_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_order_items"
    ADD CONSTRAINT "delivery_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_order_pickup_assignments"
    ADD CONSTRAINT "delivery_order_pickup_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_order_returns"
    ADD CONSTRAINT "delivery_order_returns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_order_status_observations"
    ADD CONSTRAINT "delivery_order_status_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_orders"
    ADD CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_entries"
    ADD CONSTRAINT "inventory_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_entry_cancellations"
    ADD CONSTRAINT "inventory_entry_cancellations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_exit_cancellations"
    ADD CONSTRAINT "inventory_exit_cancellations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_exits"
    ADD CONSTRAINT "inventory_exits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operation_error_logs"
    ADD CONSTRAINT "operation_error_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permisos"
    ADD CONSTRAINT "permisos_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."permisos"
    ADD CONSTRAINT "permisos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_suppliers"
    ADD CONSTRAINT "product_suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_suppliers"
    ADD CONSTRAINT "product_suppliers_unique" UNIQUE ("product_id", "supplier_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_edit_observations"
    ADD CONSTRAINT "purchase_order_edit_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_status_observations"
    ADD CONSTRAINT "purchase_order_status_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."remission_delivery_orders"
    ADD CONSTRAINT "remission_delivery_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."remission_delivery_orders"
    ADD CONSTRAINT "remission_delivery_orders_remission_id_source_delivery_orde_key" UNIQUE ("remission_id", "source_delivery_order_id");



ALTER TABLE ONLY "public"."returns"
    ADD CONSTRAINT "returns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."roles_permisos"
    ADD CONSTRAINT "roles_permisos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_adjustment_logs"
    ADD CONSTRAINT "stock_adjustment_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_entry_cancellations"
    ADD CONSTRAINT "unique_entry_cancellation" UNIQUE ("inventory_entry_id");



ALTER TABLE ONLY "public"."inventory_exit_cancellations"
    ADD CONSTRAINT "unique_exit_cancellation" UNIQUE ("inventory_exit_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouse_stock"
    ADD CONSTRAINT "warehouse_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouse_stock"
    ADD CONSTRAINT "warehouse_stock_unique" UNIQUE ("product_id", "warehouse_id");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_colors_created_at" ON "public"."colors" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_colors_deleted_at" ON "public"."colors" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_colors_name" ON "public"."colors" USING "btree" ("name");



CREATE UNIQUE INDEX "idx_colors_name_unique" ON "public"."colors" USING "btree" ("lower"(TRIM(BOTH FROM "name"))) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_customers_created_by" ON "public"."customers" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "idx_customers_deleted_at" ON "public"."customers" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_customers_email" ON "public"."customers" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_customers_id_number" ON "public"."customers" USING "btree" ("id_number") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_customers_name" ON "public"."customers" USING "btree" ("name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_customers_phone" ON "public"."customers" USING "btree" ("phone") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_delivery_edit_observations_created_at" ON "public"."delivery_order_edit_observations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_delivery_edit_observations_created_by" ON "public"."delivery_order_edit_observations" USING "btree" ("created_by");



CREATE INDEX "idx_delivery_edit_observations_order_id" ON "public"."delivery_order_edit_observations" USING "btree" ("delivery_order_id");



CREATE INDEX "idx_delivery_edit_observations_product_id" ON "public"."delivery_order_edit_observations" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "idx_delivery_items_approval" ON "public"."delivery_order_items" USING "btree" ("approval_id") WHERE ("approval_id" IS NOT NULL);



CREATE INDEX "idx_delivery_order_item_approvals_active" ON "public"."delivery_order_item_approvals" USING "btree" ("delivery_order_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_delivery_order_items_approved_at" ON "public"."delivery_order_items" USING "btree" ("approved_at" DESC) WHERE ("approved_at" IS NOT NULL);



CREATE INDEX "idx_delivery_order_items_deleted_at" ON "public"."delivery_order_items" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_delivery_order_items_delivery_order_id" ON "public"."delivery_order_items" USING "btree" ("delivery_order_id");



CREATE INDEX "idx_delivery_order_items_is_approved" ON "public"."delivery_order_items" USING "btree" ("is_approved") WHERE ("is_approved" = true);



CREATE INDEX "idx_delivery_order_items_product_id" ON "public"."delivery_order_items" USING "btree" ("product_id");



CREATE INDEX "idx_delivery_order_items_source_id" ON "public"."delivery_order_items" USING "btree" ("source_delivery_order_id") WHERE ("source_delivery_order_id" IS NOT NULL);



CREATE INDEX "idx_delivery_order_items_warehouse_id" ON "public"."delivery_order_items" USING "btree" ("warehouse_id");



CREATE UNIQUE INDEX "idx_delivery_order_pickup_assignments_per_user" ON "public"."delivery_order_pickup_assignments" USING "btree" ("delivery_order_id", "user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_delivery_order_pickup_assignments_user_id" ON "public"."delivery_order_pickup_assignments" USING "btree" ("user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_delivery_order_returns_created_at" ON "public"."delivery_order_returns" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_delivery_order_returns_delivery_order_id" ON "public"."delivery_order_returns" USING "btree" ("delivery_order_id");



CREATE INDEX "idx_delivery_order_returns_inventory_exit_id" ON "public"."delivery_order_returns" USING "btree" ("inventory_exit_id");



CREATE INDEX "idx_delivery_orders_assigned_to_user_id" ON "public"."delivery_orders" USING "btree" ("assigned_to_user_id") WHERE ("assigned_to_user_id" IS NOT NULL);



CREATE INDEX "idx_delivery_orders_created_at" ON "public"."delivery_orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_delivery_orders_customer_id" ON "public"."delivery_orders" USING "btree" ("customer_id");



CREATE INDEX "idx_delivery_orders_deleted_at" ON "public"."delivery_orders" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "idx_delivery_orders_order_number" ON "public"."delivery_orders" USING "btree" ("order_number") WHERE (("order_number" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_delivery_orders_order_type" ON "public"."delivery_orders" USING "btree" ("order_type");



CREATE INDEX "idx_delivery_orders_status" ON "public"."delivery_orders" USING "btree" ("status");



CREATE INDEX "idx_delivery_orders_zone_id" ON "public"."delivery_orders" USING "btree" ("zone_id") WHERE ("zone_id" IS NOT NULL);



CREATE INDEX "idx_delivery_status_observations_action" ON "public"."delivery_order_status_observations" USING "btree" ("status_action");



CREATE INDEX "idx_delivery_status_observations_created_at" ON "public"."delivery_order_status_observations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_delivery_status_observations_order_id" ON "public"."delivery_order_status_observations" USING "btree" ("delivery_order_id");



CREATE INDEX "idx_edit_observations_created_at" ON "public"."purchase_order_edit_observations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_edit_observations_created_by" ON "public"."purchase_order_edit_observations" USING "btree" ("created_by");



CREATE INDEX "idx_edit_observations_order_id" ON "public"."purchase_order_edit_observations" USING "btree" ("purchase_order_id");



CREATE INDEX "idx_edit_observations_product_id" ON "public"."purchase_order_edit_observations" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "idx_entry_cancellations_created_at" ON "public"."inventory_entry_cancellations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_entry_cancellations_created_by" ON "public"."inventory_entry_cancellations" USING "btree" ("created_by");



CREATE INDEX "idx_entry_cancellations_entry_id" ON "public"."inventory_entry_cancellations" USING "btree" ("inventory_entry_id");



CREATE INDEX "idx_error_logs_created_at" ON "public"."operation_error_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_error_logs_created_by" ON "public"."operation_error_logs" USING "btree" ("created_by");



CREATE INDEX "idx_error_logs_entity" ON "public"."operation_error_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_error_logs_module" ON "public"."operation_error_logs" USING "btree" ("module");



CREATE INDEX "idx_exit_cancellations_created_at" ON "public"."inventory_exit_cancellations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_exit_cancellations_created_by" ON "public"."inventory_exit_cancellations" USING "btree" ("created_by");



CREATE INDEX "idx_exit_cancellations_exit_id" ON "public"."inventory_exit_cancellations" USING "btree" ("inventory_exit_id");



CREATE INDEX "idx_inventory_entries_active" ON "public"."inventory_entries" USING "btree" ("id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_inventory_entries_created_at" ON "public"."inventory_entries" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inventory_entries_delivery_return_id" ON "public"."inventory_entries" USING "btree" ("delivery_order_return_id") WHERE ("delivery_order_return_id" IS NOT NULL);



CREATE INDEX "idx_inventory_entries_product_date" ON "public"."inventory_entries" USING "btree" ("product_id", "created_at" DESC);



COMMENT ON INDEX "public"."idx_inventory_entries_product_date" IS 'Optimiza reportes de entradas por producto y fecha';



CREATE INDEX "idx_inventory_entries_purchase_order" ON "public"."inventory_entries" USING "btree" ("purchase_order_id") WHERE ("purchase_order_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_inventory_entries_purchase_order" IS 'Optimiza búsquedas de entradas por orden de compra';



CREATE INDEX "idx_inventory_entries_supplier" ON "public"."inventory_entries" USING "btree" ("supplier_id", "created_at" DESC) WHERE ("supplier_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_inventory_entries_supplier" IS 'Optimiza consultas de entradas por proveedor';



CREATE INDEX "idx_inventory_entries_type" ON "public"."inventory_entries" USING "btree" ("entry_type");



COMMENT ON INDEX "public"."idx_inventory_entries_type" IS 'Optimiza filtros por tipo de entrada';



CREATE INDEX "idx_inventory_entries_warehouse_date" ON "public"."inventory_entries" USING "btree" ("warehouse_id", "created_at" DESC);



COMMENT ON INDEX "public"."idx_inventory_entries_warehouse_date" IS 'Optimiza consultas de entradas por bodega ordenadas por fecha';



CREATE INDEX "idx_inventory_entry_cancellations_active" ON "public"."inventory_entry_cancellations" USING "btree" ("inventory_entry_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_inventory_exit_cancellations_active" ON "public"."inventory_exit_cancellations" USING "btree" ("inventory_exit_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_inventory_exits_created_at" ON "public"."inventory_exits" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inventory_exits_created_by" ON "public"."inventory_exits" USING "btree" ("created_by", "created_at" DESC);



COMMENT ON INDEX "public"."idx_inventory_exits_created_by" IS 'Optimiza búsquedas de salidas por usuario';



CREATE INDEX "idx_inventory_exits_delivered_to_customer" ON "public"."inventory_exits" USING "btree" ("delivered_to_customer_id") WHERE ("delivered_to_customer_id" IS NOT NULL);



CREATE INDEX "idx_inventory_exits_delivered_to_customer_id" ON "public"."inventory_exits" USING "btree" ("delivered_to_customer_id") WHERE ("delivered_to_customer_id" IS NOT NULL);



CREATE INDEX "idx_inventory_exits_delivered_to_user" ON "public"."inventory_exits" USING "btree" ("delivered_to_user_id") WHERE ("delivered_to_user_id" IS NOT NULL);



CREATE INDEX "idx_inventory_exits_delivery_order_id" ON "public"."inventory_exits" USING "btree" ("delivery_order_id") WHERE ("delivery_order_id" IS NOT NULL);



CREATE INDEX "idx_inventory_exits_product_date" ON "public"."inventory_exits" USING "btree" ("product_id", "created_at" DESC);



COMMENT ON INDEX "public"."idx_inventory_exits_product_date" IS 'Optimiza reportes de salidas por producto y fecha';



CREATE INDEX "idx_inventory_exits_warehouse_date" ON "public"."inventory_exits" USING "btree" ("warehouse_id", "created_at" DESC);



COMMENT ON INDEX "public"."idx_inventory_exits_warehouse_date" IS 'Optimiza consultas de salidas por bodega ordenadas por fecha';



CREATE INDEX "idx_item_approvals_approved_at" ON "public"."delivery_order_item_approvals" USING "btree" ("approved_at" DESC);



CREATE INDEX "idx_item_approvals_delivered_by" ON "public"."delivery_order_item_approvals" USING "btree" ("delivered_by_user_id") WHERE ("delivered_by_user_id" IS NOT NULL);



CREATE INDEX "idx_item_approvals_delivery_order" ON "public"."delivery_order_item_approvals" USING "btree" ("delivery_order_id");



CREATE INDEX "idx_permisos_active" ON "public"."permisos" USING "btree" ("id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_products_barcode" ON "public"."products" USING "btree" ("barcode") WHERE ("deleted_at" IS NULL);



COMMENT ON INDEX "public"."idx_products_barcode" IS 'Optimiza búsquedas por código de barras en productos activos';



CREATE INDEX "idx_products_category_brand" ON "public"."products" USING "btree" ("category_id", "brand_id") WHERE ("deleted_at" IS NULL);



COMMENT ON INDEX "public"."idx_products_category_brand" IS 'Optimiza filtros combinados por categoría y marca';



CREATE INDEX "idx_products_color_id" ON "public"."products" USING "btree" ("color_id") WHERE ("color_id" IS NOT NULL);



CREATE INDEX "idx_products_name_trgm" ON "public"."products" USING "gin" ("name" "public"."gin_trgm_ops") WHERE ("deleted_at" IS NULL);



COMMENT ON INDEX "public"."idx_products_name_trgm" IS 'Optimiza búsquedas por nombre usando trigram (búsqueda parcial)';



CREATE INDEX "idx_products_search" ON "public"."products" USING "gin" ("to_tsvector"('"spanish"'::"regconfig", (((("name" || ' '::"text") || COALESCE("sku", ''::"text")) || ' '::"text") || COALESCE("barcode", ''::"text"))));



CREATE INDEX "idx_products_sku" ON "public"."products" USING "btree" ("sku") WHERE ("deleted_at" IS NULL);



COMMENT ON INDEX "public"."idx_products_sku" IS 'Optimiza búsquedas por SKU en productos activos';



CREATE INDEX "idx_products_status_created_at" ON "public"."products" USING "btree" ("status", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_purchase_order_items_active" ON "public"."purchase_order_items" USING "btree" ("purchase_order_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_purchase_order_items_order" ON "public"."purchase_order_items" USING "btree" ("purchase_order_id");



COMMENT ON INDEX "public"."idx_purchase_order_items_order" IS 'Optimiza consultas de items por orden de compra';



CREATE INDEX "idx_purchase_order_items_product" ON "public"."purchase_order_items" USING "btree" ("product_id");



COMMENT ON INDEX "public"."idx_purchase_order_items_product" IS 'Optimiza búsquedas de órdenes que contienen un producto';



CREATE INDEX "idx_purchase_orders_deleted_at" ON "public"."purchase_orders" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "idx_purchase_orders_order_number" ON "public"."purchase_orders" USING "btree" ("order_number") WHERE (("order_number" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_purchase_orders_status_date" ON "public"."purchase_orders" USING "btree" ("status", "created_at" DESC);



COMMENT ON INDEX "public"."idx_purchase_orders_status_date" IS 'Optimiza filtros de órdenes por estado y fecha';



CREATE INDEX "idx_purchase_orders_supplier" ON "public"."purchase_orders" USING "btree" ("supplier_id", "created_at" DESC);



COMMENT ON INDEX "public"."idx_purchase_orders_supplier" IS 'Optimiza búsquedas de órdenes por proveedor';



CREATE INDEX "idx_remission_delivery_orders_deleted_at" ON "public"."remission_delivery_orders" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_remission_delivery_orders_remission_id" ON "public"."remission_delivery_orders" USING "btree" ("remission_id");



CREATE INDEX "idx_remission_delivery_orders_source_id" ON "public"."remission_delivery_orders" USING "btree" ("source_delivery_order_id");



CREATE INDEX "idx_returns_created_at" ON "public"."returns" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_returns_inventory_entry_id" ON "public"."returns" USING "btree" ("inventory_entry_id") WHERE ("inventory_entry_id" IS NOT NULL);



CREATE INDEX "idx_returns_inventory_exit_id" ON "public"."returns" USING "btree" ("inventory_exit_id") WHERE ("inventory_exit_id" IS NOT NULL);



CREATE INDEX "idx_returns_lookup_for_trigger" ON "public"."returns" USING "btree" ("product_id", "warehouse_id", "created_at", "created_by") WHERE ("inventory_entry_id" IS NULL);



COMMENT ON INDEX "public"."idx_returns_lookup_for_trigger" IS 'Optimiza la búsqueda de return_type en el trigger fn_update_stock_on_entry(). Índice parcial que solo incluye returns sin inventory_entry_id vinculado.';



CREATE INDEX "idx_returns_order_id" ON "public"."returns" USING "btree" ("order_id");



CREATE INDEX "idx_returns_product_id" ON "public"."returns" USING "btree" ("product_id");



CREATE INDEX "idx_returns_return_type" ON "public"."returns" USING "btree" ("return_type");



CREATE INDEX "idx_returns_warehouse_id" ON "public"."returns" USING "btree" ("warehouse_id");



CREATE INDEX "idx_roles_active" ON "public"."roles" USING "btree" ("id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_roles_permisos_active" ON "public"."roles_permisos" USING "btree" ("rol_id", "permiso_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_status_observations_action" ON "public"."purchase_order_status_observations" USING "btree" ("status_action");



CREATE INDEX "idx_status_observations_created_at" ON "public"."purchase_order_status_observations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_status_observations_order_id" ON "public"."purchase_order_status_observations" USING "btree" ("purchase_order_id");



CREATE INDEX "idx_stock_adjustment_logs_created_at" ON "public"."stock_adjustment_logs" USING "btree" ("created_at" DESC);



COMMENT ON INDEX "public"."idx_stock_adjustment_logs_created_at" IS 'Optimiza ordenamiento descendente del historial';



CREATE INDEX "idx_stock_adjustment_logs_product_id" ON "public"."stock_adjustment_logs" USING "btree" ("product_id");



COMMENT ON INDEX "public"."idx_stock_adjustment_logs_product_id" IS 'Optimiza consultas de historial por producto';



CREATE INDEX "idx_stock_adjustment_logs_warehouse_id" ON "public"."stock_adjustment_logs" USING "btree" ("warehouse_id");



CREATE INDEX "idx_stock_transfers_created_at" ON "public"."stock_transfers" USING "btree" ("created_at");



CREATE INDEX "idx_stock_transfers_destination_warehouse" ON "public"."stock_transfers" USING "btree" ("destination_warehouse_id");



CREATE INDEX "idx_stock_transfers_product_id" ON "public"."stock_transfers" USING "btree" ("product_id");



CREATE INDEX "idx_stock_transfers_source_warehouse" ON "public"."stock_transfers" USING "btree" ("source_warehouse_id");



CREATE INDEX "idx_suppliers_name" ON "public"."suppliers" USING "btree" ("name");



CREATE UNIQUE INDEX "idx_unique_source_delivery_order_active" ON "public"."remission_delivery_orders" USING "btree" ("source_delivery_order_id") WHERE ("deleted_at" IS NULL);



COMMENT ON INDEX "public"."idx_unique_source_delivery_order_active" IS 'Ensures that a customer delivery order can only be assigned to one active (non-deleted) remission at a time. Allows reassignment after remission is deleted.';



CREATE INDEX "idx_warehouse_stock_low_stock" ON "public"."warehouse_stock" USING "btree" ("product_id", "quantity") WHERE (("quantity" > (0)::numeric) AND ("quantity" <= (10)::numeric));



COMMENT ON INDEX "public"."idx_warehouse_stock_low_stock" IS 'Optimiza búsquedas de productos con stock bajo';



CREATE INDEX "idx_warehouse_stock_quantity" ON "public"."warehouse_stock" USING "btree" ("quantity") WHERE ("quantity" <= (50)::numeric);



CREATE INDEX "idx_warehouse_stock_warehouse_product" ON "public"."warehouse_stock" USING "btree" ("warehouse_id", "product_id") WHERE ("quantity" > (0)::numeric);



COMMENT ON INDEX "public"."idx_warehouse_stock_warehouse_product" IS 'Optimiza consultas de stock por bodega y producto';



CREATE INDEX "idx_warehouses_active" ON "public"."warehouses" USING "btree" ("id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_warehouses_name" ON "public"."warehouses" USING "btree" ("name");



CREATE INDEX "idx_zones_created_at" ON "public"."zones" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_zones_deleted_at" ON "public"."zones" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_zones_name" ON "public"."zones" USING "btree" ("name");



CREATE UNIQUE INDEX "idx_zones_name_unique" ON "public"."zones" USING "btree" ("lower"(TRIM(BOTH FROM "name"))) WHERE ("deleted_at" IS NULL);



CREATE OR REPLACE TRIGGER "set_timestamp" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_purchase_order_items" BEFORE UPDATE ON "public"."purchase_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



COMMENT ON TRIGGER "set_updated_at_purchase_order_items" ON "public"."purchase_order_items" IS 'Automatically updates updated_at column to NOW() on row modifications';



CREATE OR REPLACE TRIGGER "trg_adjust_stock_on_delivery_order_item_update" AFTER UPDATE ON "public"."delivery_order_items" FOR EACH ROW WHEN (("old"."quantity" IS DISTINCT FROM "new"."quantity")) EXECUTE FUNCTION "public"."fn_adjust_stock_on_delivery_order_item_change"();



COMMENT ON TRIGGER "trg_adjust_stock_on_delivery_order_item_update" ON "public"."delivery_order_items" IS 'Automatically adjusts warehouse stock when ORDER quantity changes. Does NOT trigger on delivered_quantity changes.';



CREATE OR REPLACE TRIGGER "trg_cancel_inventory_entry_on_cancellation" AFTER INSERT ON "public"."inventory_entry_cancellations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_cancel_inventory_entry_on_cancellation"();



CREATE OR REPLACE TRIGGER "trg_process_delivery_order_return" AFTER INSERT ON "public"."delivery_order_returns" FOR EACH ROW EXECUTE FUNCTION "public"."fn_process_delivery_order_return"();



CREATE OR REPLACE TRIGGER "trg_process_return_inventory" AFTER INSERT ON "public"."returns" FOR EACH ROW EXECUTE FUNCTION "public"."process_return_inventory"();



CREATE OR REPLACE TRIGGER "trg_reserve_stock_on_delivery_order_item" AFTER INSERT ON "public"."delivery_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_reserve_stock_on_delivery_order_item"();



COMMENT ON TRIGGER "trg_reserve_stock_on_delivery_order_item" ON "public"."delivery_order_items" IS 'Automatically reserves warehouse stock when a delivery order item is created. Ensures stock availability and prevents inventory inconsistencies.';



CREATE OR REPLACE TRIGGER "trg_revert_stock_on_delivery_order_delete" AFTER UPDATE ON "public"."delivery_orders" FOR EACH ROW WHEN ((("old"."deleted_at" IS NULL) AND ("new"."deleted_at" IS NOT NULL))) EXECUTE FUNCTION "public"."fn_revert_stock_on_delivery_order_delete"();



COMMENT ON TRIGGER "trg_revert_stock_on_delivery_order_delete" ON "public"."delivery_orders" IS 'Automatically reverts warehouse stock when a delivery order is deleted via soft delete. Only reverts reserved stock that was not delivered.';



CREATE OR REPLACE TRIGGER "trg_revert_stock_on_delivery_order_item_delete" AFTER DELETE ON "public"."delivery_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_revert_stock_on_delivery_order_item"();



COMMENT ON TRIGGER "trg_revert_stock_on_delivery_order_item_delete" ON "public"."delivery_order_items" IS 'Automatically reverts warehouse stock when a delivery order item is deleted. Only reverts reserved stock that was not delivered.';



CREATE OR REPLACE TRIGGER "trg_revert_stock_on_delivery_order_item_soft_delete" AFTER UPDATE ON "public"."delivery_order_items" FOR EACH ROW WHEN ((("old"."deleted_at" IS NULL) AND ("new"."deleted_at" IS NOT NULL))) EXECUTE FUNCTION "public"."fn_revert_stock_on_delivery_order_item_soft_delete"();



CREATE OR REPLACE TRIGGER "trg_revert_stock_on_exit_cancellation" AFTER INSERT ON "public"."inventory_exit_cancellations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_revert_stock_on_exit_cancellation"();



CREATE OR REPLACE TRIGGER "trg_revert_stock_on_inventory_entry_soft_delete" AFTER UPDATE ON "public"."inventory_entries" FOR EACH ROW WHEN ((("old"."deleted_at" IS NULL) AND ("new"."deleted_at" IS NOT NULL))) EXECUTE FUNCTION "public"."fn_revert_stock_on_inventory_entry_soft_delete"();



CREATE OR REPLACE TRIGGER "trg_soft_delete_remission_relationships" AFTER UPDATE OF "deleted_at" ON "public"."delivery_orders" FOR EACH ROW WHEN (("old"."order_type" = 'remission'::"text")) EXECUTE FUNCTION "public"."fn_soft_delete_remission_relationships"();



COMMENT ON TRIGGER "trg_soft_delete_remission_relationships" ON "public"."delivery_orders" IS 'Soft-deletes or restores remission relationships when a remission is soft-deleted or restored.';



CREATE OR REPLACE TRIGGER "trg_sync_remission_items_on_order_edit" AFTER INSERT OR DELETE OR UPDATE ON "public"."delivery_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_sync_remission_items_on_order_edit"();



COMMENT ON TRIGGER "trg_sync_remission_items_on_order_edit" ON "public"."delivery_order_items" IS 'Automatically synchronizes remission items when source order items are inserted, updated, or deleted. Ensures remission items stay in sync with their source orders.';



CREATE OR REPLACE TRIGGER "trg_update_status_on_remission_assignment" AFTER INSERT OR DELETE ON "public"."remission_delivery_orders" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_order_status_on_remission_assignment"();



COMMENT ON TRIGGER "trg_update_status_on_remission_assignment" ON "public"."remission_delivery_orders" IS 'Automatically changes order status to sent_by_remission when assigned to a remission, and reverts to approved when unassigned. Creates audit records in delivery_order_status_observations.';



CREATE OR REPLACE TRIGGER "trg_update_stock_on_entry" AFTER INSERT ON "public"."inventory_entries" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_stock_on_entry"();



COMMENT ON TRIGGER "trg_update_stock_on_entry" ON "public"."inventory_entries" IS 'Actualiza warehouse_stock automáticamente al crear entradas de inventario. Maneja la dirección (suma/resta) según el tipo de devolución. Este trigger faltaba y causaba que las devoluciones no actualizaran el stock.';



CREATE OR REPLACE TRIGGER "trg_update_stock_on_exit" AFTER INSERT ON "public"."inventory_exits" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_stock_on_exit"();



CREATE OR REPLACE TRIGGER "trg_validate_inventory_entry" BEFORE INSERT ON "public"."inventory_entries" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_inventory_entry"();



CREATE OR REPLACE TRIGGER "trg_validate_inventory_entry_quantity" BEFORE INSERT OR UPDATE ON "public"."inventory_entries" FOR EACH ROW WHEN (("new"."purchase_order_id" IS NOT NULL)) EXECUTE FUNCTION "public"."validate_inventory_entry_quantity"();



COMMENT ON TRIGGER "trg_validate_inventory_entry_quantity" ON "public"."inventory_entries" IS 'Validates inventory entry quantities against purchase orders before insert/update. Prevents exceeding ordered quantities.';



CREATE OR REPLACE TRIGGER "trg_validate_inventory_exit_quantity" BEFORE INSERT OR UPDATE ON "public"."inventory_exits" FOR EACH ROW WHEN (("new"."delivery_order_id" IS NOT NULL)) EXECUTE FUNCTION "public"."validate_inventory_exit_quantity"();



COMMENT ON TRIGGER "trg_validate_inventory_exit_quantity" ON "public"."inventory_exits" IS 'Validates inventory exit quantities against delivery orders before insert/update. Prevents exceeding ordered quantities.';



CREATE OR REPLACE TRIGGER "trg_validate_remission_assignment_exclusivity" BEFORE INSERT ON "public"."remission_delivery_orders" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_remission_assignment_exclusivity"();



CREATE OR REPLACE TRIGGER "trg_validate_remission_delivery_order_types" BEFORE INSERT OR UPDATE ON "public"."remission_delivery_orders" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_remission_delivery_order_types"();



COMMENT ON TRIGGER "trg_validate_remission_delivery_order_types" ON "public"."remission_delivery_orders" IS 'Valida los tipos de orden antes de insertar o actualizar relaciones remisión-órdenes.';



CREATE OR REPLACE TRIGGER "trg_validate_remission_items_exclusivity" BEFORE INSERT OR UPDATE ON "public"."delivery_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_remission_items_exclusivity"();



CREATE OR REPLACE TRIGGER "trg_validate_return_quantity" BEFORE INSERT OR UPDATE ON "public"."returns" FOR EACH ROW EXECUTE FUNCTION "public"."validate_return_quantity"();



CREATE OR REPLACE TRIGGER "trigger_auto_update_remission_status_on_delivery" AFTER UPDATE OF "status" ON "public"."delivery_orders" FOR EACH ROW EXECUTE FUNCTION "public"."fn_auto_update_remission_status_on_delivery"();



COMMENT ON TRIGGER "trigger_auto_update_remission_status_on_delivery" ON "public"."delivery_orders" IS 'Dispara la actualización automática del estado de remisión cuando una orden de cliente cambia a delivered';



CREATE OR REPLACE TRIGGER "trigger_generate_delivery_order_number" BEFORE INSERT ON "public"."delivery_orders" FOR EACH ROW WHEN (("new"."order_number" IS NULL)) EXECUTE FUNCTION "public"."generate_delivery_order_number"();



CREATE OR REPLACE TRIGGER "trigger_generate_purchase_order_number" BEFORE INSERT ON "public"."purchase_orders" FOR EACH ROW WHEN (("new"."order_number" IS NULL)) EXECUTE FUNCTION "public"."generate_purchase_order_number"();



CREATE OR REPLACE TRIGGER "trigger_log_delivery_order_delivered" AFTER UPDATE OF "status" ON "public"."delivery_orders" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_delivery_order_delivered"();



CREATE OR REPLACE TRIGGER "trigger_update_colors_updated_at" BEFORE UPDATE ON "public"."colors" FOR EACH ROW EXECUTE FUNCTION "public"."update_colors_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_delivery_edit_observation_updated_at" BEFORE UPDATE ON "public"."delivery_order_edit_observations" FOR EACH ROW EXECUTE FUNCTION "public"."update_delivery_order_edit_observation_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_delivery_order_return_updated_at" BEFORE UPDATE ON "public"."delivery_order_returns" FOR EACH ROW EXECUTE FUNCTION "public"."update_delivery_order_return_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_delivery_orders_updated_at" BEFORE UPDATE ON "public"."delivery_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_delivery_orders_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_delivery_status_observation_updated_at" BEFORE UPDATE ON "public"."delivery_order_status_observations" FOR EACH ROW EXECUTE FUNCTION "public"."update_delivery_status_observation_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_edit_observation_updated_at" BEFORE UPDATE ON "public"."purchase_order_edit_observations" FOR EACH ROW EXECUTE FUNCTION "public"."update_purchase_order_edit_observation_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_entry_cancellation_updated_at" BEFORE UPDATE ON "public"."inventory_entry_cancellations" FOR EACH ROW EXECUTE FUNCTION "public"."update_entry_cancellation_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_exit_cancellation_updated_at" BEFORE UPDATE ON "public"."inventory_exit_cancellations" FOR EACH ROW EXECUTE FUNCTION "public"."update_exit_cancellation_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_returns_updated_at" BEFORE UPDATE ON "public"."returns" FOR EACH ROW EXECUTE FUNCTION "public"."update_returns_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_status_observation_updated_at" BEFORE UPDATE ON "public"."purchase_order_status_observations" FOR EACH ROW EXECUTE FUNCTION "public"."update_status_observation_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_zones_updated_at" BEFORE UPDATE ON "public"."zones" FOR EACH ROW EXECUTE FUNCTION "public"."update_zones_updated_at"();



CREATE OR REPLACE TRIGGER "update_profiles_timestamp" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."delivery_order_item_approvals"
    ADD CONSTRAINT "delivery_order_item_approvals_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_order_item_approvals"
    ADD CONSTRAINT "delivery_order_item_approvals_delivered_by_user_id_fkey" FOREIGN KEY ("delivered_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_order_item_approvals"
    ADD CONSTRAINT "delivery_order_item_approvals_delivery_order_id_fkey" FOREIGN KEY ("delivery_order_id") REFERENCES "public"."delivery_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_order_items"
    ADD CONSTRAINT "delivery_order_items_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "public"."delivery_order_item_approvals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_order_pickup_assignments"
    ADD CONSTRAINT "delivery_order_pickup_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_order_pickup_assignments"
    ADD CONSTRAINT "delivery_order_pickup_assignments_delivery_order_id_fkey" FOREIGN KEY ("delivery_order_id") REFERENCES "public"."delivery_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_order_pickup_assignments"
    ADD CONSTRAINT "delivery_order_pickup_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."delivery_orders"
    ADD CONSTRAINT "delivery_orders_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_order_edit_observations"
    ADD CONSTRAINT "fk_delivery_edit_observation_order" FOREIGN KEY ("delivery_order_id") REFERENCES "public"."delivery_orders"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_order_edit_observations"
    ADD CONSTRAINT "fk_delivery_edit_observation_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_order_edit_observations"
    ADD CONSTRAINT "fk_delivery_edit_observation_user" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_orders"
    ADD CONSTRAINT "fk_delivery_order_assigned_to_user" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."delivery_orders"
    ADD CONSTRAINT "fk_delivery_order_created_by" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_orders"
    ADD CONSTRAINT "fk_delivery_order_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."delivery_order_items"
    ADD CONSTRAINT "fk_delivery_order_item_approved_by" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_order_items"
    ADD CONSTRAINT "fk_delivery_order_item_order" FOREIGN KEY ("delivery_order_id") REFERENCES "public"."delivery_orders"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_order_items"
    ADD CONSTRAINT "fk_delivery_order_item_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."delivery_order_items"
    ADD CONSTRAINT "fk_delivery_order_item_source" FOREIGN KEY ("source_delivery_order_id") REFERENCES "public"."delivery_orders"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_order_items"
    ADD CONSTRAINT "fk_delivery_order_item_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."delivery_order_status_observations"
    ADD CONSTRAINT "fk_delivery_status_observation_order" FOREIGN KEY ("delivery_order_id") REFERENCES "public"."delivery_orders"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_order_status_observations"
    ADD CONSTRAINT "fk_delivery_status_observation_user" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_order_edit_observations"
    ADD CONSTRAINT "fk_edit_observation_order" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_order_edit_observations"
    ADD CONSTRAINT "fk_edit_observation_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_order_edit_observations"
    ADD CONSTRAINT "fk_edit_observation_user" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_entry_cancellations"
    ADD CONSTRAINT "fk_entry_cancellation_entry" FOREIGN KEY ("inventory_entry_id") REFERENCES "public"."inventory_entries"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_entry_cancellations"
    ADD CONSTRAINT "fk_entry_cancellation_user" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_entries"
    ADD CONSTRAINT "fk_entry_delivery_order_return" FOREIGN KEY ("delivery_order_return_id") REFERENCES "public"."delivery_order_returns"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operation_error_logs"
    ADD CONSTRAINT "fk_error_log_user" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_exit_cancellations"
    ADD CONSTRAINT "fk_exit_cancellation_exit" FOREIGN KEY ("inventory_exit_id") REFERENCES "public"."inventory_exits"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_exit_cancellations"
    ADD CONSTRAINT "fk_exit_cancellation_user" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_exits"
    ADD CONSTRAINT "fk_inventory_exit_delivery_order" FOREIGN KEY ("delivery_order_id") REFERENCES "public"."delivery_orders"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "fk_po_supplier" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "fk_po_user" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "fk_poi_po" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "fk_poi_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."remission_delivery_orders"
    ADD CONSTRAINT "fk_remission_delivery_orders_remission" FOREIGN KEY ("remission_id") REFERENCES "public"."delivery_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."remission_delivery_orders"
    ADD CONSTRAINT "fk_remission_delivery_orders_source" FOREIGN KEY ("source_delivery_order_id") REFERENCES "public"."delivery_orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."delivery_order_returns"
    ADD CONSTRAINT "fk_return_delivery_order" FOREIGN KEY ("delivery_order_id") REFERENCES "public"."delivery_orders"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."delivery_order_returns"
    ADD CONSTRAINT "fk_return_inventory_entry" FOREIGN KEY ("inventory_entry_id") REFERENCES "public"."inventory_entries"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."returns"
    ADD CONSTRAINT "fk_return_inventory_entry" FOREIGN KEY ("inventory_entry_id") REFERENCES "public"."inventory_entries"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_order_returns"
    ADD CONSTRAINT "fk_return_inventory_exit" FOREIGN KEY ("inventory_exit_id") REFERENCES "public"."inventory_exits"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."returns"
    ADD CONSTRAINT "fk_return_inventory_exit" FOREIGN KEY ("inventory_exit_id") REFERENCES "public"."inventory_exits"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."delivery_order_returns"
    ADD CONSTRAINT "fk_return_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."returns"
    ADD CONSTRAINT "fk_return_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."delivery_order_returns"
    ADD CONSTRAINT "fk_return_user" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."returns"
    ADD CONSTRAINT "fk_return_user" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_order_returns"
    ADD CONSTRAINT "fk_return_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."returns"
    ADD CONSTRAINT "fk_return_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."purchase_order_status_observations"
    ADD CONSTRAINT "fk_status_observation_order" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_order_status_observations"
    ADD CONSTRAINT "fk_status_observation_user" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_entries"
    ADD CONSTRAINT "inventory_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_entries"
    ADD CONSTRAINT "inventory_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_entries"
    ADD CONSTRAINT "inventory_entries_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_entries"
    ADD CONSTRAINT "inventory_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_entries"
    ADD CONSTRAINT "inventory_entries_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_exits"
    ADD CONSTRAINT "inventory_exits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_exits"
    ADD CONSTRAINT "inventory_exits_delivered_to_customer_id_fkey" FOREIGN KEY ("delivered_to_customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."inventory_exits"
    ADD CONSTRAINT "inventory_exits_delivered_to_user_id_fkey" FOREIGN KEY ("delivered_to_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."inventory_exits"
    ADD CONSTRAINT "inventory_exits_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_exits"
    ADD CONSTRAINT "inventory_exits_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."product_suppliers"
    ADD CONSTRAINT "product_suppliers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_suppliers"
    ADD CONSTRAINT "product_suppliers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "public"."colors"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roles_permisos"
    ADD CONSTRAINT "roles_permisos_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "public"."permisos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roles_permisos"
    ADD CONSTRAINT "roles_permisos_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_adjustment_logs"
    ADD CONSTRAINT "stock_adjustment_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."stock_adjustment_logs"
    ADD CONSTRAINT "stock_adjustment_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_adjustment_logs"
    ADD CONSTRAINT "stock_adjustment_logs_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_destination_warehouse_id_fkey" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_source_warehouse_id_fkey" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."warehouse_stock"
    ADD CONSTRAINT "warehouse_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_stock"
    ADD CONSTRAINT "warehouse_stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



CREATE POLICY "Admin puede actualizar permisos" ON "public"."permisos" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text")))));



CREATE POLICY "Admin puede actualizar proveedores" ON "public"."suppliers" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text")))));



CREATE POLICY "Admin puede actualizar roles" ON "public"."roles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text")))));



CREATE POLICY "Admin puede actualizar roles_permisos" ON "public"."roles_permisos" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text")))));



CREATE POLICY "Admin puede crear proveedores" ON "public"."suppliers" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text")))));



CREATE POLICY "Admin puede insertar permisos" ON "public"."permisos" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text")))));



CREATE POLICY "Admin puede insertar roles" ON "public"."roles" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text")))));



CREATE POLICY "Admin puede insertar roles_permisos" ON "public"."roles_permisos" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text")))));



CREATE POLICY "Admin puede insertar user_roles" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text")))));



CREATE POLICY "Authenticated users can insert stock_transfers" ON "public"."stock_transfers" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can read stock_transfers" ON "public"."stock_transfers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Create color" ON "public"."colors" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable all for authenticated" ON "public"."delivery_order_item_approvals" TO "authenticated" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Insert" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Insert" ON "public"."delivery_order_items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Insert" ON "public"."delivery_orders" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Insert" ON "public"."zones" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Insert entries" ON "public"."inventory_entries" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Select all zones" ON "public"."zones" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Selected" ON "public"."delivery_order_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Selected all" ON "public"."customers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Selected all" ON "public"."delivery_orders" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Selected all -- authenticated" ON "public"."inventory_exits" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Selected all --- authenticated" ON "public"."inventory_entries" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Selected all --- authenticated" ON "public"."products" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Selected all --- authenticated" ON "public"."warehouse_stock" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Selected all --- authenticated" ON "public"."warehouses" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Selected all entries" ON "public"."inventory_entries" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Selected all orders" ON "public"."purchase_orders" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Selected all provedores" ON "public"."suppliers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Solo admin puede insertar product_suppliers" ON "public"."product_suppliers" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text")))));



CREATE POLICY "Solo admin puede insertar relaciones producto-proveedor" ON "public"."product_suppliers" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text")))));



CREATE POLICY "Update" ON "public"."customers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Update" ON "public"."delivery_order_items" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Update" ON "public"."delivery_orders" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Update color" ON "public"."colors" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Update entries" ON "public"."inventory_entries" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Update table purchase order items" ON "public"."purchase_order_items" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Update zone" ON "public"."zones" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Users can create delivery edit observations" ON "public"."delivery_order_edit_observations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can create delivery order items" ON "public"."delivery_order_items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can create delivery orders" ON "public"."delivery_orders" FOR INSERT TO "authenticated" WITH CHECK (true);



COMMENT ON POLICY "Users can create delivery orders" ON "public"."delivery_orders" IS 'Permite a usuarios autenticados crear órdenes de entrega';



CREATE POLICY "Users can create delivery returns" ON "public"."delivery_order_returns" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can create delivery status observations" ON "public"."delivery_order_status_observations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can create edit observations" ON "public"."purchase_order_edit_observations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can create entry cancellations" ON "public"."inventory_entry_cancellations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can create error logs" ON "public"."operation_error_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can create exit cancellations" ON "public"."inventory_exit_cancellations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can create remission delivery orders" ON "public"."remission_delivery_orders" FOR INSERT TO "authenticated" WITH CHECK (true);



COMMENT ON POLICY "Users can create remission delivery orders" ON "public"."remission_delivery_orders" IS 'Permite a usuarios autenticados crear relaciones remisión-órdenes';



CREATE POLICY "Users can create returns" ON "public"."returns" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can create status observations" ON "public"."purchase_order_status_observations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can insert delivery order pickup assignments" ON "public"."delivery_order_pickup_assignments" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can update delivery order items" ON "public"."delivery_order_items" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Users can update delivery order pickup assignments" ON "public"."delivery_order_pickup_assignments" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Users can update delivery orders" ON "public"."delivery_orders" FOR UPDATE TO "authenticated" USING (("deleted_at" IS NULL)) WITH CHECK (("deleted_at" IS NULL));



COMMENT ON POLICY "Users can update delivery orders" ON "public"."delivery_orders" IS 'Permite a usuarios autenticados actualizar órdenes de entrega no eliminadas';



CREATE POLICY "Users can update own delivery edit observations" ON "public"."delivery_order_edit_observations" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can update own delivery status observations" ON "public"."delivery_order_status_observations" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can update own edit observations" ON "public"."purchase_order_edit_observations" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can update own entry cancellations" ON "public"."inventory_entry_cancellations" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can update own exit cancellations" ON "public"."inventory_exit_cancellations" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can update own status observations" ON "public"."purchase_order_status_observations" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can update remission delivery orders" ON "public"."remission_delivery_orders" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Users can update returns" ON "public"."returns" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Users can view delivery edit observations" ON "public"."delivery_order_edit_observations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view delivery order items" ON "public"."delivery_order_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view delivery order pickup assignments" ON "public"."delivery_order_pickup_assignments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view delivery orders" ON "public"."delivery_orders" FOR SELECT TO "authenticated" USING (("deleted_at" IS NULL));



COMMENT ON POLICY "Users can view delivery orders" ON "public"."delivery_orders" IS 'Permite a usuarios autenticados ver todas las órdenes de entrega no eliminadas';



CREATE POLICY "Users can view delivery returns" ON "public"."delivery_order_returns" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view delivery status observations" ON "public"."delivery_order_status_observations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view edit observations" ON "public"."purchase_order_edit_observations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view entry cancellations" ON "public"."inventory_entry_cancellations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view error logs" ON "public"."operation_error_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view exit cancellations" ON "public"."inventory_exit_cancellations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view remission delivery orders" ON "public"."remission_delivery_orders" FOR SELECT TO "authenticated" USING (true);



COMMENT ON POLICY "Users can view remission delivery orders" ON "public"."remission_delivery_orders" IS 'Permite a usuarios autenticados ver todas las relaciones remisión-órdenes';



CREATE POLICY "Users can view returns" ON "public"."returns" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view status observations" ON "public"."purchase_order_status_observations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden editar products" ON "public"."products" FOR UPDATE TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Usuarios autenticados pueden leer permisos" ON "public"."permisos" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Usuarios autenticados pueden leer product_suppliers" ON "public"."product_suppliers" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Usuarios autenticados pueden leer purchase_order_items" ON "public"."purchase_order_items" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Usuarios autenticados pueden leer roles" ON "public"."roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Usuarios autenticados pueden leer roles_permisos" ON "public"."roles_permisos" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Usuarios autenticados pueden registrar productos" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Usuarios pueden actualizar su propio perfil" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Usuarios pueden crear purchase_order_items" ON "public"."purchase_order_items" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Usuarios pueden crear purchase_orders" ON "public"."purchase_orders" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Usuarios pueden editar purchase_orders" ON "public"."purchase_orders" FOR UPDATE TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Usuarios pueden ver su propio perfil" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Usuarios ven solo sus roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."brands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."category" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."colors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "create brand" ON "public"."brands" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "create one category" ON "public"."category" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_order_edit_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_order_item_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_order_pickup_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_order_returns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_order_status_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_entry_cancellations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_exit_cancellations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_exits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_exits_insert" ON "public"."inventory_exits" FOR INSERT WITH CHECK (true);



CREATE POLICY "inventory_exits_select" ON "public"."inventory_exits" FOR SELECT USING (true);



CREATE POLICY "inventory_exits_update" ON "public"."inventory_exits" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."operation_error_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permisos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_edit_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_status_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."remission_delivery_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."returns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles_permisos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "selected all brands" ON "public"."brands" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "selected all categories" ON "public"."category" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "selected all colors" ON "public"."colors" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "selected all users" ON "public"."profiles" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."stock_adjustment_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_adjustment_logs_insert" ON "public"."stock_adjustment_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "stock_adjustment_logs_select" ON "public"."stock_adjustment_logs" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."stock_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update brand" ON "public"."brands" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "update category" ON "public"."category" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouse_stock" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warehouse_stock_insert" ON "public"."warehouse_stock" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "warehouse_stock_update" ON "public"."warehouse_stock" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warehouses_insert" ON "public"."warehouses" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text")))));



CREATE POLICY "warehouses_update" ON "public"."warehouses" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("r"."nombre" = 'admin'::"text"))))) WITH CHECK (true);



ALTER TABLE "public"."zones" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."adjust_product_stock"("p_product_id" "uuid", "p_warehouse_id" "uuid", "p_new_quantity" numeric, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_product_stock"("p_product_id" "uuid", "p_warehouse_id" "uuid", "p_new_quantity" numeric, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_product_stock"("p_product_id" "uuid", "p_warehouse_id" "uuid", "p_new_quantity" numeric, "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_orders_to_remission_batch"("p_remission_id" "uuid", "p_order_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."assign_orders_to_remission_batch"("p_remission_id" "uuid", "p_order_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_orders_to_remission_batch"("p_remission_id" "uuid", "p_order_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_delivery_order_with_items"("p_order_id" "uuid", "p_cancelled_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_delivery_order_with_items"("p_order_id" "uuid", "p_cancelled_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_delivery_order_with_items"("p_order_id" "uuid", "p_cancelled_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."edit_delivery_order_items"("p_delivery_order_id" "uuid", "p_items" "jsonb", "p_notes" "text", "p_delivery_address" "text", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."edit_delivery_order_items"("p_delivery_order_id" "uuid", "p_items" "jsonb", "p_notes" "text", "p_delivery_address" "text", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."edit_delivery_order_items"("p_delivery_order_id" "uuid", "p_items" "jsonb", "p_notes" "text", "p_delivery_address" "text", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."edit_purchase_order_items"("p_purchase_order_id" "uuid", "p_items" "jsonb", "p_supplier_id" "uuid", "p_notes" "text", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."edit_purchase_order_items"("p_purchase_order_id" "uuid", "p_items" "jsonb", "p_supplier_id" "uuid", "p_notes" "text", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."edit_purchase_order_items"("p_purchase_order_id" "uuid", "p_items" "jsonb", "p_supplier_id" "uuid", "p_notes" "text", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_adjust_stock_on_delivery_order_item_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_adjust_stock_on_delivery_order_item_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_adjust_stock_on_delivery_order_item_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_auto_update_remission_status_on_delivery"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_auto_update_remission_status_on_delivery"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_auto_update_remission_status_on_delivery"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_cancel_inventory_entry_on_cancellation"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_cancel_inventory_entry_on_cancellation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_cancel_inventory_entry_on_cancellation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_log_delivery_order_delivered"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_log_delivery_order_delivered"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_log_delivery_order_delivered"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_process_delivery_order_return"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_process_delivery_order_return"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_process_delivery_order_return"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_reserve_stock_on_delivery_order_item"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_reserve_stock_on_delivery_order_item"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_reserve_stock_on_delivery_order_item"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_delivery_order_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_delivery_order_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_delivery_order_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_delivery_order_item"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_delivery_order_item"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_delivery_order_item"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_delivery_order_item_soft_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_delivery_order_item_soft_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_delivery_order_item_soft_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_exit_cancellation"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_exit_cancellation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_exit_cancellation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_inventory_entry_soft_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_inventory_entry_soft_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_revert_stock_on_inventory_entry_soft_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_soft_delete_remission_relationships"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_soft_delete_remission_relationships"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_soft_delete_remission_relationships"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_remission_items_on_order_edit"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_remission_items_on_order_edit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_remission_items_on_order_edit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_update_order_status_on_remission_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_update_order_status_on_remission_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_update_order_status_on_remission_assignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_update_stock_on_entry"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_update_stock_on_entry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_update_stock_on_entry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_update_stock_on_exit"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_update_stock_on_exit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_update_stock_on_exit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_validate_inventory_entry"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_validate_inventory_entry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_validate_inventory_entry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_validate_remission_assignment_exclusivity"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_validate_remission_assignment_exclusivity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_validate_remission_assignment_exclusivity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_validate_remission_delivery_order_types"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_validate_remission_delivery_order_types"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_validate_remission_delivery_order_types"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_validate_remission_items_exclusivity"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_validate_remission_items_exclusivity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_validate_remission_items_exclusivity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_delivery_order_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_delivery_order_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_delivery_order_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_purchase_order_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_purchase_order_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_purchase_order_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customer_delivery_orders"("customer_id_param" "uuid", "page" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_customer_delivery_orders"("customer_id_param" "uuid", "page" integer, "page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_delivery_orders"("customer_id_param" "uuid", "page" integer, "page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customer_exit_history"("customer_id_param" "uuid", "page" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_customer_exit_history"("customer_id_param" "uuid", "page" integer, "page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_exit_history"("customer_id_param" "uuid", "page" integer, "page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customers"("search_term" "text", "page" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_customers"("search_term" "text", "page" integer, "page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customers"("search_term" "text", "page" integer, "page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customers_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_customers_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customers_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customers_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_customers_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customers_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_delivery_orders_admin_list"("search_term" "text", "page" integer, "page_size" integer, "order_type_filter" "text", "status_filter" "text", "start_ts" timestamp with time zone, "end_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_delivery_orders_admin_list"("search_term" "text", "page" integer, "page_size" integer, "order_type_filter" "text", "status_filter" "text", "start_ts" timestamp with time zone, "end_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_delivery_orders_admin_list"("search_term" "text", "page" integer, "page_size" integer, "order_type_filter" "text", "status_filter" "text", "start_ts" timestamp with time zone, "end_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_delivery_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_delivery_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_delivery_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_delivery_orders_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_delivery_orders_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_delivery_orders_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_entries_dashboard"("search_term" "text", "page" integer, "page_size" integer, "date_from" timestamp with time zone, "date_to" timestamp with time zone, "supplier_filter" "uuid", "user_filter" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_entries_dashboard"("search_term" "text", "page" integer, "page_size" integer, "date_from" timestamp with time zone, "date_to" timestamp with time zone, "supplier_filter" "uuid", "user_filter" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_entries_dashboard"("search_term" "text", "page" integer, "page_size" integer, "date_from" timestamp with time zone, "date_to" timestamp with time zone, "supplier_filter" "uuid", "user_filter" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_entries_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_entries_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_entries_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_exits_dashboard"("search_term" "text", "page" integer, "page_size" integer, "date_from" timestamp with time zone, "date_to" timestamp with time zone, "warehouse_filter" "uuid", "user_filter" "uuid", "status_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_exits_dashboard"("search_term" "text", "page" integer, "page_size" integer, "date_from" timestamp with time zone, "date_to" timestamp with time zone, "warehouse_filter" "uuid", "user_filter" "uuid", "status_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_exits_dashboard"("search_term" "text", "page" integer, "page_size" integer, "date_from" timestamp with time zone, "date_to" timestamp with time zone, "warehouse_filter" "uuid", "user_filter" "uuid", "status_filter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_exits_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_exits_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_exits_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_movements_by_period"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "movement_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_movements_by_period"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "movement_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_movements_by_period"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "movement_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_orders_for_return"("return_type_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_orders_for_return"("return_type_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_orders_for_return"("return_type_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_orders_for_return"("return_type_param" "text", "search_term" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_orders_for_return"("return_type_param" "text", "search_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_orders_for_return"("return_type_param" "text", "search_term" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_period_stats"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "period_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_period_stats"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "period_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_period_stats"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "period_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_product_movement_timeline"("p_product_id" "uuid", "p_page" integer, "p_page_size" integer, "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_movement_types" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_product_movement_timeline"("p_product_id" "uuid", "p_page" integer, "p_page_size" integer, "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_movement_types" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_product_movement_timeline"("p_product_id" "uuid", "p_page" integer, "p_page_size" integer, "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_movement_types" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_product_timeline_summary"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_product_timeline_summary"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_product_timeline_summary"("p_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_product_traceability"("product_ids" "uuid"[], "search_term" "text", "products_limit" integer, "events_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_product_traceability"("product_ids" "uuid"[], "search_term" "text", "products_limit" integer, "events_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_product_traceability"("product_ids" "uuid"[], "search_term" "text", "products_limit" integer, "events_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_products_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_products_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_products_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_products_for_return"("return_type_param" "text", "order_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_products_for_return"("return_type_param" "text", "order_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_products_for_return"("return_type_param" "text", "order_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_products_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_products_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_products_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_products_with_stock_for_delivery"("search_term" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_products_with_stock_for_delivery"("search_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_products_with_stock_for_delivery"("search_term" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_purchase_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_purchase_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_purchase_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_purchase_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer, "status_filter" "text", "date_from" timestamp with time zone, "date_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_purchase_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer, "status_filter" "text", "date_from" timestamp with time zone, "date_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_purchase_orders_dashboard"("search_term" "text", "page" integer, "page_size" integer, "status_filter" "text", "date_from" timestamp with time zone, "date_to" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_purchase_orders_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_purchase_orders_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_purchase_orders_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_reports_stats_today"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_reports_stats_today"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reports_stats_today"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_returns_dashboard"("search_term" "text", "page" integer, "page_size" integer, "return_type_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_returns_dashboard"("search_term" "text", "page" integer, "page_size" integer, "return_type_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_returns_dashboard"("search_term" "text", "page" integer, "page_size" integer, "return_type_filter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_stock_by_product_for_delivery"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_stock_by_product_for_delivery"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stock_by_product_for_delivery"("p_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_stock_validation"("p_search_term" "text", "p_page" integer, "p_page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_stock_validation"("p_search_term" "text", "p_page" integer, "p_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stock_validation"("p_search_term" "text", "p_page" integer, "p_page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_activities_today"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_activities_today"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_activities_today"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_delivery_orders_expanded"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_delivery_orders_expanded"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_delivery_orders_expanded"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_users_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_dashboard"("search_term" "text", "page" integer, "page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_users_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_warehouses_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_warehouses_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_warehouses_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_return_inventory"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_return_inventory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_return_inventory"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_customers"("search_term" "text", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_customers"("search_term" "text", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_customers"("search_term" "text", "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_products_for_delivery_order"("p_search_term" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_products_for_delivery_order"("p_search_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_products_for_delivery_order"("p_search_term" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_product_between_warehouses"("p_product_id" "uuid", "p_source_warehouse_id" "uuid", "p_destination_warehouse_id" "uuid", "p_quantity" integer, "p_observations" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_product_between_warehouses"("p_product_id" "uuid", "p_source_warehouse_id" "uuid", "p_destination_warehouse_id" "uuid", "p_quantity" integer, "p_observations" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_product_between_warehouses"("p_product_id" "uuid", "p_source_warehouse_id" "uuid", "p_destination_warehouse_id" "uuid", "p_quantity" integer, "p_observations" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_colors_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_colors_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_colors_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_delivery_order_edit_observation_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_delivery_order_edit_observation_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_delivery_order_edit_observation_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_delivery_order_progress"("order_id_param" "uuid", "product_id_param" "uuid", "warehouse_id_param" "uuid", "quantity_delivered_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_delivery_order_progress"("order_id_param" "uuid", "product_id_param" "uuid", "warehouse_id_param" "uuid", "quantity_delivered_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_delivery_order_progress"("order_id_param" "uuid", "product_id_param" "uuid", "warehouse_id_param" "uuid", "quantity_delivered_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_delivery_order_progress_batch"("order_id_param" "uuid", "items_param" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_delivery_order_progress_batch"("order_id_param" "uuid", "items_param" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_delivery_order_progress_batch"("order_id_param" "uuid", "items_param" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_delivery_order_return_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_delivery_order_return_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_delivery_order_return_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_delivery_orders_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_delivery_orders_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_delivery_orders_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_delivery_status_observation_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_delivery_status_observation_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_delivery_status_observation_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_entry_cancellation_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_entry_cancellation_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_entry_cancellation_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_exit_cancellation_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_exit_cancellation_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_exit_cancellation_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_purchase_order_edit_observation_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_purchase_order_edit_observation_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_purchase_order_edit_observation_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_purchase_order_progress"("order_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_purchase_order_progress"("order_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_purchase_order_progress"("order_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_returns_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_returns_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_returns_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_status_observation_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_status_observation_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_status_observation_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_zones_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_zones_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_zones_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_inventory_entry_quantity"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_inventory_entry_quantity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_inventory_entry_quantity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_inventory_exit_quantity"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_inventory_exit_quantity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_inventory_exit_quantity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_return_quantity"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_return_quantity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_return_quantity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."brands" TO "anon";
GRANT ALL ON TABLE "public"."brands" TO "authenticated";
GRANT ALL ON TABLE "public"."brands" TO "service_role";



GRANT ALL ON TABLE "public"."category" TO "anon";
GRANT ALL ON TABLE "public"."category" TO "authenticated";
GRANT ALL ON TABLE "public"."category" TO "service_role";



GRANT ALL ON TABLE "public"."colors" TO "anon";
GRANT ALL ON TABLE "public"."colors" TO "authenticated";
GRANT ALL ON TABLE "public"."colors" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_order_edit_observations" TO "anon";
GRANT ALL ON TABLE "public"."delivery_order_edit_observations" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_order_edit_observations" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_order_item_approvals" TO "anon";
GRANT ALL ON TABLE "public"."delivery_order_item_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_order_item_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_order_items" TO "anon";
GRANT ALL ON TABLE "public"."delivery_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_order_pickup_assignments" TO "anon";
GRANT ALL ON TABLE "public"."delivery_order_pickup_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_order_pickup_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_order_returns" TO "anon";
GRANT ALL ON TABLE "public"."delivery_order_returns" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_order_returns" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_order_status_observations" TO "anon";
GRANT ALL ON TABLE "public"."delivery_order_status_observations" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_order_status_observations" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_orders" TO "anon";
GRANT ALL ON TABLE "public"."delivery_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_orders" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_entries" TO "anon";
GRANT ALL ON TABLE "public"."inventory_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_entries" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_entry_cancellations" TO "anon";
GRANT ALL ON TABLE "public"."inventory_entry_cancellations" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_entry_cancellations" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_exit_cancellations" TO "anon";
GRANT ALL ON TABLE "public"."inventory_exit_cancellations" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_exit_cancellations" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_exits" TO "anon";
GRANT ALL ON TABLE "public"."inventory_exits" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_exits" TO "service_role";



GRANT ALL ON TABLE "public"."operation_error_logs" TO "anon";
GRANT ALL ON TABLE "public"."operation_error_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."operation_error_logs" TO "service_role";



GRANT ALL ON TABLE "public"."permisos" TO "anon";
GRANT ALL ON TABLE "public"."permisos" TO "authenticated";
GRANT ALL ON TABLE "public"."permisos" TO "service_role";



GRANT ALL ON TABLE "public"."product_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."product_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."product_suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_edit_observations" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_edit_observations" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_edit_observations" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_status_observations" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_status_observations" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_status_observations" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."remission_delivery_orders" TO "anon";
GRANT ALL ON TABLE "public"."remission_delivery_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."remission_delivery_orders" TO "service_role";



GRANT ALL ON TABLE "public"."returns" TO "anon";
GRANT ALL ON TABLE "public"."returns" TO "authenticated";
GRANT ALL ON TABLE "public"."returns" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."roles_permisos" TO "anon";
GRANT ALL ON TABLE "public"."roles_permisos" TO "authenticated";
GRANT ALL ON TABLE "public"."roles_permisos" TO "service_role";



GRANT ALL ON TABLE "public"."stock_adjustment_logs" TO "anon";
GRANT ALL ON TABLE "public"."stock_adjustment_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_adjustment_logs" TO "service_role";



GRANT ALL ON TABLE "public"."stock_transfers" TO "anon";
GRANT ALL ON TABLE "public"."stock_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_transfers" TO "service_role";



GRANT ALL ON TABLE "public"."warehouses" TO "anon";
GRANT ALL ON TABLE "public"."warehouses" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouses" TO "service_role";



GRANT ALL ON TABLE "public"."stock_transfers_searchable" TO "anon";
GRANT ALL ON TABLE "public"."stock_transfers_searchable" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_transfers_searchable" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."v_cancelled_entries" TO "anon";
GRANT ALL ON TABLE "public"."v_cancelled_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."v_cancelled_entries" TO "service_role";



GRANT ALL ON TABLE "public"."v_cancelled_exits" TO "anon";
GRANT ALL ON TABLE "public"."v_cancelled_exits" TO "authenticated";
GRANT ALL ON TABLE "public"."v_cancelled_exits" TO "service_role";



GRANT ALL ON TABLE "public"."warehouse_stock" TO "anon";
GRANT ALL ON TABLE "public"."warehouse_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouse_stock" TO "service_role";



GRANT ALL ON TABLE "public"."zones" TO "anon";
GRANT ALL ON TABLE "public"."zones" TO "authenticated";
GRANT ALL ON TABLE "public"."zones" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































