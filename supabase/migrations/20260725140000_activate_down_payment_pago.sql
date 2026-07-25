-- Cuota inicial como pago al activar + reforzar activate_negocio
CREATE OR REPLACE FUNCTION public.activate_negocio(p_negocio_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_negocio public.negocios%ROWTYPE;
  v_order_id uuid;
  v_item record;
  v_due date;
  v_i integer;
  v_interval interval;
  v_user uuid := auth.uid();
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

  IF v_negocio.delivery_order_id IS NOT NULL THEN
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

  -- Registrar cuota inicial como pago (no afecta cuotas del plan)
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

  UPDATE public.negocios
  SET
    status = 'activo',
    delivery_order_id = v_order_id,
    signed_at = COALESCE(signed_at, now()),
    updated_at = now()
  WHERE id = p_negocio_id;

  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION public.activate_negocio(uuid) IS
  'Activa negocio: OE + cuotas + pago de cuota inicial si aplica.';
