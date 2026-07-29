-- =============================================================================
-- Soporte para Negocios creados desde Mercancía en Remisión
-- =============================================================================

-- 1) Agregar columna remission_id en negocios
ALTER TABLE public.negocios
  ADD COLUMN IF NOT EXISTS remission_id uuid REFERENCES public.delivery_orders(id);

CREATE INDEX IF NOT EXISTS idx_negocios_remission
  ON public.negocios(remission_id) WHERE deleted_at IS NULL AND remission_id IS NOT NULL;

COMMENT ON COLUMN public.negocios.remission_id IS
  'ID de la remisión de origen si la venta se realizó con mercancía que ya estaba en remisión en ruta.';

-- 2) Actualizar la función activate_negocio para manejar ambos orígenes
CREATE OR REPLACE FUNCTION public.activate_negocio(p_negocio_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_negocio public.negocios%ROWTYPE;
  v_order_id uuid := NULL;
  v_item record;
  v_due date;
  v_i integer;
  v_interval interval;
  v_user uuid := auth.uid();
  v_stock numeric;
  v_remission_status text;
  v_remission_item_qty numeric;
  v_already_sold_qty numeric;
  v_rem_available numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT public.is_admin_or_vendedor() THEN
    RAISE EXCEPTION 'Sin permiso para activar negocios';
  END IF;

  SELECT * INTO v_negocio
  FROM public.negocios
  WHERE id = p_negocio_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negocio no encontrado';
  END IF;

  IF v_negocio.status NOT IN ('borrador', 'por_firmar') THEN
    RAISE EXCEPTION 'Solo se pueden activar negocios en borrador o por firmar';
  END IF;

  IF v_negocio.customer_signature_url IS NULL OR btrim(v_negocio.customer_signature_url) = '' THEN
    RAISE EXCEPTION 'Se requiere firma del cliente';
  END IF;

  IF v_negocio.delivery_order_id IS NOT NULL AND v_negocio.remission_id IS NULL THEN
    RAISE EXCEPTION 'El negocio ya tiene orden de entrega';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.negocio_items
    WHERE negocio_id = p_negocio_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El negocio no tiene productos';
  END IF;

  IF v_negocio.first_due_date IS NULL THEN
    RAISE EXCEPTION 'Debe indicar fecha de primera cuota';
  END IF;

  -----------------------------------------------------------------------------
  -- CASO 1: Negocio generado desde Mercancía en Remisión (remission_id IS NOT NULL)
  -----------------------------------------------------------------------------
  IF v_negocio.remission_id IS NOT NULL THEN
    -- Validar que la remisión exista y sea del tipo 'remission'
    SELECT status INTO v_remission_status
    FROM public.delivery_orders
    WHERE id = v_negocio.remission_id
      AND order_type = 'remission'
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La remisión seleccionada no existe o no es válida';
    END IF;

    -- Validar que los ítems del negocio estén presentes y tengan saldo en la remisión
    FOR v_item IN
      SELECT
        ni.product_id,
        ni.warehouse_id,
        ni.quantity,
        COALESCE(ni.description, p.name, 'Producto') AS product_name
      FROM public.negocio_items ni
      JOIN public.products p ON p.id = ni.product_id
      WHERE ni.negocio_id = p_negocio_id AND ni.deleted_at IS NULL
    LOOP
      -- Cantidad total en la remisión original
      SELECT COALESCE(SUM(doi.quantity), 0) INTO v_remission_item_qty
      FROM public.delivery_order_items doi
      WHERE doi.delivery_order_id = v_negocio.remission_id
        AND doi.product_id = v_item.product_id
        AND doi.deleted_at IS NULL;

      -- Cantidad ya vendida en otros negocios asociados a esta misma remisión
      SELECT COALESCE(SUM(ni2.quantity), 0) INTO v_already_sold_qty
      FROM public.negocios n2
      JOIN public.negocio_items ni2 ON ni2.negocio_id = n2.id
      WHERE n2.remission_id = v_negocio.remission_id
        AND n2.id <> p_negocio_id
        AND n2.status IN ('activo', 'entregado', 'cerrado')
        AND n2.deleted_at IS NULL
        AND ni2.product_id = v_item.product_id
        AND ni2.deleted_at IS NULL;

      v_rem_available := v_remission_item_qty - v_already_sold_qty;

      IF v_remission_item_qty = 0 THEN
        RAISE EXCEPTION 'El producto "%" no está presente en la remisión seleccionada.', v_item.product_name;
      END IF;

      IF v_rem_available < v_item.quantity THEN
        RAISE EXCEPTION 'La remisión no cuenta con suficiente saldo para "%". Disponible en remisión: %, Solicitado: %.',
          v_item.product_name, v_rem_available, v_item.quantity;
      END IF;
    END LOOP;

    -- NO se crea una nueva orden de entrega ni se descuenta warehouse_stock
    v_order_id := v_negocio.remission_id;

  -----------------------------------------------------------------------------
  -- CASO 2: Negocio generado desde Bodega Central (remission_id IS NULL)
  -----------------------------------------------------------------------------
  ELSE
    -- Validar stock en la bodega indicada en cada ítem (antes de crear OE)
    FOR v_item IN
      SELECT
        ni.product_id,
        ni.warehouse_id,
        ni.quantity,
        COALESCE(ni.description, p.name, 'Producto') AS product_name,
        w.name AS warehouse_name
      FROM public.negocio_items ni
      JOIN public.products p ON p.id = ni.product_id
      JOIN public.warehouses w ON w.id = ni.warehouse_id
      WHERE ni.negocio_id = p_negocio_id AND ni.deleted_at IS NULL
    LOOP
      SELECT ws.quantity INTO v_stock
      FROM public.warehouse_stock ws
      WHERE ws.product_id = v_item.product_id
        AND ws.warehouse_id = v_item.warehouse_id;

      IF NOT FOUND OR COALESCE(v_stock, 0) < v_item.quantity THEN
        IF COALESCE(v_stock, 0) = 0 THEN
          RAISE EXCEPTION
            'No hay stock de "%" en %. Verifique la bodega del ítem (puede haber stock en otra bodega).',
            v_item.product_name, v_item.warehouse_name;
        END IF;

        RAISE EXCEPTION
          'Stock insuficiente para "%" en %. Disponible: %, solicitado: %.',
          v_item.product_name, v_item.warehouse_name, COALESCE(v_stock, 0), v_item.quantity;
      END IF;
    END LOOP;

    -- Crear la Orden de Entrega de Cliente
    INSERT INTO public.delivery_orders (
      order_type, customer_id, created_by, status, notes, delivery_address, negocio_id
    )
    VALUES (
      'customer',
      v_negocio.customer_id,
      v_user,
      'pending',
      'Generada desde negocio #' || v_negocio.numero::text,
      (SELECT address FROM public.customers WHERE id = v_negocio.customer_id),
      v_negocio.id
    )
    RETURNING id INTO v_order_id;

    FOR v_item IN
      SELECT * FROM public.negocio_items
      WHERE negocio_id = p_negocio_id AND deleted_at IS NULL
    LOOP
      INSERT INTO public.delivery_order_items (
        delivery_order_id, product_id, quantity, warehouse_id,
        delivered_quantity, requested_by_user_id
      ) VALUES (
        v_order_id, v_item.product_id, v_item.quantity, v_item.warehouse_id,
        0, v_negocio.seller_id
      );
    END LOOP;

    INSERT INTO public.delivery_order_pickup_assignments (delivery_order_id, user_id)
    VALUES (v_order_id, v_negocio.seller_id);
  END IF;

  -----------------------------------------------------------------------------
  -- Generación de Cuotas y Pago de Cuota Inicial
  -----------------------------------------------------------------------------
  v_interval := CASE v_negocio.frequency
    WHEN 'semanal' THEN interval '7 days'
    WHEN 'quincenal' THEN interval '15 days'
    ELSE interval '1 month'
  END;

  DELETE FROM public.negocio_cuotas WHERE negocio_id = p_negocio_id;

  FOR v_i IN 1..v_negocio.installments_count LOOP
    v_due := (v_negocio.first_due_date::timestamp + (v_interval * (v_i - 1)))::date;
    INSERT INTO public.negocio_cuotas (
      negocio_id, installment_number, due_date, amount, status
    ) VALUES (
      p_negocio_id, v_i, v_due, v_negocio.installment_amount, 'pendiente'
    );
  END LOOP;

  IF COALESCE(v_negocio.down_payment, 0) > 0 THEN
    INSERT INTO public.negocio_pagos (
      negocio_id, cuota_id, amount, paid_at, receipt_number, created_by, notes
    ) VALUES (
      p_negocio_id,
      NULL,
      v_negocio.down_payment,
      COALESCE(v_negocio.deal_date, CURRENT_DATE),
      NULL,
      v_user,
      'Cuota inicial'
    );
  END IF;

  -----------------------------------------------------------------------------
  -- Actualizar estado del Negocio
  -----------------------------------------------------------------------------
  UPDATE public.negocios
  SET
    status = CASE WHEN v_negocio.remission_id IS NOT NULL THEN 'entregado' ELSE 'activo' END,
    delivery_order_id = v_order_id,
    signed_at = COALESCE(signed_at, now()),
    updated_at = now()
  WHERE id = p_negocio_id;

  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION public.activate_negocio(uuid) IS
  'Activa negocio: si tiene remission_id no crea OE ni descuenta stock y pasa a entregado; si es bodega central crea OE y descuenta stock.';
