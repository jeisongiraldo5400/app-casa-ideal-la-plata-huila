-- =============================================================================
-- Operación de crédito: pagos, cartera, mora, estados, anulación
-- =============================================================================

-- Cargo de mora opcional por cuota
ALTER TABLE public.negocio_cuotas
  ADD COLUMN IF NOT EXISTS late_fee_amount numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (late_fee_amount >= 0);

-- ---------------------------------------------------------------------------
-- Recalcular estado de una cuota según paid_amount / due_date / late_fee
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_negocio_cuota_status(p_cuota_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.negocio_cuotas%ROWTYPE;
  v_due_total numeric(14, 2);
  v_new_status text;
BEGIN
  SELECT * INTO v_c FROM public.negocio_cuotas WHERE id = p_cuota_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_c.status = 'anulada' THEN
    RETURN;
  END IF;

  v_due_total := v_c.amount + COALESCE(v_c.late_fee_amount, 0);

  IF v_c.paid_amount >= v_due_total THEN
    v_new_status := 'pagada';
  ELSIF v_c.paid_amount > 0 THEN
    v_new_status := 'parcial';
  ELSIF v_c.due_date < CURRENT_DATE THEN
    v_new_status := 'mora';
  ELSE
    v_new_status := 'pendiente';
  END IF;

  UPDATE public.negocio_cuotas
  SET
    status = v_new_status,
    paid_at = CASE
      WHEN v_new_status = 'pagada' THEN COALESCE(paid_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_cuota_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Registrar pago (VALOR / FECHA / RECIBO) — asignación FIFO o cuota explícita
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_negocio_pago(
  p_negocio_id uuid,
  p_amount numeric,
  p_paid_at date DEFAULT CURRENT_DATE,
  p_receipt_number text DEFAULT NULL,
  p_cuota_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_negocio public.negocios%ROWTYPE;
  v_pago_id uuid;
  v_remaining numeric(14, 2);
  v_cuota record;
  v_apply numeric(14, 2);
  v_due_total numeric(14, 2);
  v_open_count integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT public.is_admin_or_vendedor() THEN
    RAISE EXCEPTION 'Sin permiso para registrar pagos';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;

  SELECT * INTO v_negocio
  FROM public.negocios
  WHERE id = p_negocio_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negocio no encontrado';
  END IF;

  IF v_negocio.status NOT IN ('activo', 'entregado') THEN
    RAISE EXCEPTION 'Solo se pueden registrar pagos en negocios activos o entregados';
  END IF;

  IF NOT public.has_role('admin')
     AND v_negocio.seller_id IS DISTINCT FROM v_user
     AND v_negocio.created_by IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Sin permiso sobre este negocio';
  END IF;

  INSERT INTO public.negocio_pagos (
    negocio_id, cuota_id, amount, paid_at, receipt_number, created_by, notes
  ) VALUES (
    p_negocio_id,
    p_cuota_id,
    p_amount,
    COALESCE(p_paid_at, CURRENT_DATE),
    NULLIF(btrim(p_receipt_number), ''),
    v_user,
    NULLIF(btrim(p_notes), '')
  )
  RETURNING id INTO v_pago_id;

  v_remaining := p_amount;

  IF p_cuota_id IS NOT NULL THEN
    FOR v_cuota IN
      SELECT *
      FROM public.negocio_cuotas
      WHERE id = p_cuota_id
        AND negocio_id = p_negocio_id
        AND deleted_at IS NULL
        AND status <> 'anulada'
      FOR UPDATE
    LOOP
      v_due_total := v_cuota.amount + COALESCE(v_cuota.late_fee_amount, 0);
      v_apply := LEAST(v_remaining, GREATEST(v_due_total - v_cuota.paid_amount, 0));
      IF v_apply > 0 THEN
        UPDATE public.negocio_cuotas
        SET
          paid_amount = paid_amount + v_apply,
          receipt_number = COALESCE(NULLIF(btrim(p_receipt_number), ''), receipt_number),
          updated_at = now()
        WHERE id = v_cuota.id;
        PERFORM public.recalc_negocio_cuota_status(v_cuota.id);
        v_remaining := v_remaining - v_apply;
      END IF;
    END LOOP;
  ELSE
    FOR v_cuota IN
      SELECT *
      FROM public.negocio_cuotas
      WHERE negocio_id = p_negocio_id
        AND deleted_at IS NULL
        AND status <> 'anulada'
        AND paid_amount < (amount + COALESCE(late_fee_amount, 0))
      ORDER BY installment_number
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_due_total := v_cuota.amount + COALESCE(v_cuota.late_fee_amount, 0);
      v_apply := LEAST(v_remaining, v_due_total - v_cuota.paid_amount);
      IF v_apply > 0 THEN
        UPDATE public.negocio_cuotas
        SET
          paid_amount = paid_amount + v_apply,
          receipt_number = COALESCE(NULLIF(btrim(p_receipt_number), ''), receipt_number),
          updated_at = now()
        WHERE id = v_cuota.id;
        PERFORM public.recalc_negocio_cuota_status(v_cuota.id);
        v_remaining := v_remaining - v_apply;
      END IF;
    END LOOP;
  END IF;

  IF v_remaining > 0.009 THEN
    RAISE EXCEPTION 'El monto supera el saldo pendiente de las cuotas (sobra %)', v_remaining;
  END IF;

  SELECT COUNT(*) INTO v_open_count
  FROM public.negocio_cuotas
  WHERE negocio_id = p_negocio_id
    AND deleted_at IS NULL
    AND status <> 'anulada'
    AND status <> 'pagada';

  IF v_open_count = 0 THEN
    UPDATE public.negocios
    SET status = 'cerrado', updated_at = now()
    WHERE id = p_negocio_id;
  END IF;

  RETURN v_pago_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Anular (soft) un pago y recalcular cuotas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_negocio_pago(p_pago_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pago public.negocio_pagos%ROWTYPE;
  v_negocio public.negocios%ROWTYPE;
  v_cuota record;
  v_to_remove numeric(14, 2);
  v_remove numeric(14, 2);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede anular pagos';
  END IF;

  SELECT * INTO v_pago
  FROM public.negocio_pagos
  WHERE id = p_pago_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;

  SELECT * INTO v_negocio
  FROM public.negocios
  WHERE id = v_pago.negocio_id AND deleted_at IS NULL
  FOR UPDATE;

  UPDATE public.negocio_pagos
  SET deleted_at = now()
  WHERE id = p_pago_id;

  -- Revertir desde la última cuota hacia atrás (heurística)
  v_to_remove := v_pago.amount;
  FOR v_cuota IN
    SELECT *
    FROM public.negocio_cuotas
    WHERE negocio_id = v_pago.negocio_id
      AND deleted_at IS NULL
      AND status <> 'anulada'
      AND paid_amount > 0
    ORDER BY installment_number DESC
    FOR UPDATE
  LOOP
    EXIT WHEN v_to_remove <= 0;
    v_remove := LEAST(v_to_remove, v_cuota.paid_amount);
    UPDATE public.negocio_cuotas
    SET paid_amount = paid_amount - v_remove, updated_at = now()
    WHERE id = v_cuota.id;
    PERFORM public.recalc_negocio_cuota_status(v_cuota.id);
    v_to_remove := v_to_remove - v_remove;
  END LOOP;

  IF v_negocio.status = 'cerrado' THEN
    UPDATE public.negocios
    SET
      status = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.delivery_orders
          WHERE id = v_negocio.delivery_order_id AND status = 'delivered' AND deleted_at IS NULL
        ) THEN 'entregado'
        ELSE 'activo'
      END,
      updated_at = now()
    WHERE id = v_negocio.id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Marcar mora + cargo según late_fee_rate_pct del snapshot / config
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_cuotas_en_mora(p_negocio_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_rate numeric(8, 4);
  v_row record;
  v_fee numeric(14, 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  FOR v_row IN
    SELECT c.*, n.formula_snapshot
    FROM public.negocio_cuotas c
    JOIN public.negocios n ON n.id = c.negocio_id
    WHERE c.deleted_at IS NULL
      AND n.deleted_at IS NULL
      AND n.status IN ('activo', 'entregado')
      AND c.status IN ('pendiente', 'parcial', 'mora')
      AND c.due_date < CURRENT_DATE
      AND c.paid_amount < (c.amount + COALESCE(c.late_fee_amount, 0))
      AND (p_negocio_id IS NULL OR c.negocio_id = p_negocio_id)
  LOOP
    v_rate := COALESCE(
      (v_row.formula_snapshot->>'late_fee_rate_pct')::numeric,
      (SELECT late_fee_rate_pct FROM public.credit_settings
       WHERE deleted_at IS NULL AND is_active = true
       ORDER BY created_at DESC LIMIT 1),
      0
    );

    -- Cargo de mora una sola vez (si aún no hay late_fee y tasa > 0)
    IF COALESCE(v_row.late_fee_amount, 0) = 0 AND v_rate > 0 THEN
      v_fee := ROUND((v_row.amount - v_row.paid_amount) * v_rate / 100.0, 0);
      UPDATE public.negocio_cuotas
      SET late_fee_amount = GREATEST(v_fee, 0), updated_at = now()
      WHERE id = v_row.id;
    END IF;

    PERFORM public.recalc_negocio_cuota_status(v_row.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Anular negocio
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_negocio(p_negocio_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_negocio public.negocios%ROWTYPE;
  v_oe_status text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT public.is_admin_or_vendedor() THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  SELECT * INTO v_negocio
  FROM public.negocios
  WHERE id = p_negocio_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negocio no encontrado';
  END IF;

  IF v_negocio.status IN ('cerrado', 'anulado') THEN
    RAISE EXCEPTION 'El negocio ya está %', v_negocio.status;
  END IF;

  IF v_negocio.delivery_order_id IS NOT NULL THEN
    SELECT status INTO v_oe_status
    FROM public.delivery_orders
    WHERE id = v_negocio.delivery_order_id AND deleted_at IS NULL;

    IF v_oe_status = 'delivered' THEN
      RAISE EXCEPTION 'No se puede anular: la orden de entrega ya fue entregada';
    END IF;

    -- Soft-cancel OE pendiente
    UPDATE public.delivery_orders
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_negocio.delivery_order_id
      AND status <> 'delivered'
      AND deleted_at IS NULL;
  END IF;

  UPDATE public.negocio_cuotas
  SET status = 'anulada', updated_at = now()
  WHERE negocio_id = p_negocio_id AND deleted_at IS NULL AND status <> 'pagada';

  UPDATE public.negocios
  SET
    status = 'anulado',
    notes = CASE
      WHEN p_reason IS NOT NULL AND btrim(p_reason) <> '' THEN
        COALESCE(notes || E'\n', '') || 'Anulado: ' || btrim(p_reason)
      ELSE notes
    END,
    updated_at = now()
  WHERE id = p_negocio_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: OE delivered → negocio entregado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_negocio_on_delivery_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered'
     AND (OLD.status IS DISTINCT FROM 'delivered')
     AND NEW.negocio_id IS NOT NULL
     AND NEW.deleted_at IS NULL THEN
    UPDATE public.negocios
    SET status = 'entregado', updated_at = now()
    WHERE id = NEW.negocio_id
      AND deleted_at IS NULL
      AND status = 'activo';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_negocio_on_oe_delivered ON public.delivery_orders;
CREATE TRIGGER trg_sync_negocio_on_oe_delivered
  AFTER UPDATE OF status ON public.delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_negocio_on_delivery_order_delivered();

-- ---------------------------------------------------------------------------
-- Cartera: listado de cuotas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cartera_cuotas(
  p_filter text DEFAULT 'todas', -- todas | por_vencer | vencidas | mora
  p_days integer DEFAULT 15,
  p_search text DEFAULT '',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS TABLE (
  cuota_id uuid,
  negocio_id uuid,
  negocio_numero integer,
  customer_name text,
  seller_name text,
  installment_number integer,
  due_date date,
  amount numeric,
  paid_amount numeric,
  late_fee_amount numeric,
  saldo numeric,
  status text,
  negocio_status text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_offset integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_is_admin := public.has_role('admin');
  v_offset := GREATEST(COALESCE(p_page, 1) - 1, 0) * GREATEST(COALESCE(p_page_size, 25), 1);

  RETURN QUERY
  WITH base AS (
    SELECT
      c.id AS cuota_id,
      n.id AS negocio_id,
      n.numero AS negocio_numero,
      cust.name AS customer_name,
      prof.full_name AS seller_name,
      c.installment_number,
      c.due_date,
      c.amount,
      c.paid_amount,
      c.late_fee_amount,
      GREATEST(c.amount + COALESCE(c.late_fee_amount, 0) - c.paid_amount, 0) AS saldo,
      c.status,
      n.status AS negocio_status
    FROM public.negocio_cuotas c
    JOIN public.negocios n ON n.id = c.negocio_id
    LEFT JOIN public.customers cust ON cust.id = n.customer_id
    LEFT JOIN public.profiles prof ON prof.id = n.seller_id
    WHERE c.deleted_at IS NULL
      AND n.deleted_at IS NULL
      AND n.status IN ('activo', 'entregado')
      AND c.status IN ('pendiente', 'parcial', 'mora')
      AND (v_is_admin OR n.seller_id = v_user OR n.created_by = v_user)
      AND (
        COALESCE(p_search, '') = ''
        OR n.numero::text = btrim(p_search)
        OR cust.name ILIKE '%' || btrim(p_search) || '%'
      )
      AND (
        COALESCE(p_filter, 'todas') = 'todas'
        OR (p_filter = 'mora' AND c.status = 'mora')
        OR (
          p_filter = 'vencidas'
          AND c.due_date < CURRENT_DATE
          AND c.status IN ('pendiente', 'parcial', 'mora')
        )
        OR (
          p_filter = 'por_vencer'
          AND c.due_date >= CURRENT_DATE
          AND c.due_date <= (CURRENT_DATE + GREATEST(COALESCE(p_days, 15), 1))
        )
      )
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER() AS total_count FROM base b
  )
  SELECT
    counted.cuota_id,
    counted.negocio_id,
    counted.negocio_numero,
    counted.customer_name,
    counted.seller_name,
    counted.installment_number,
    counted.due_date,
    counted.amount,
    counted.paid_amount,
    counted.late_fee_amount,
    counted.saldo,
    counted.status,
    counted.negocio_status,
    counted.total_count
  FROM counted
  ORDER BY counted.due_date ASC, counted.negocio_numero ASC, counted.installment_number ASC
  OFFSET v_offset
  LIMIT GREATEST(COALESCE(p_page_size, 25), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_negocio_cuota_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_negocio_pago(uuid, numeric, date, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_negocio_pago(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_cuotas_en_mora(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_negocio(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cartera_cuotas(text, integer, text, integer, integer) TO authenticated;
