-- =============================================================================
-- Módulo Negocios: precio de contado, crédito, cuotas, config e integración OE
-- =============================================================================

-- 1) Precio de contado en productos
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_price numeric(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.sale_price IS 'Precio de contado del producto. El crédito se calcula solo en negocios.';

-- 2) Campos opcionales en clientes (formulario solicitud de crédito)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_secondary text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS client_code text;

-- 3) Configuración de crédito (singleton lógico por fila activa)
CREATE TABLE IF NOT EXISTS public.credit_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_type text NOT NULL DEFAULT 'financed_balance'
    CHECK (formula_type IN ('cash_includes_interest', 'simple_markup', 'financed_balance')),
  interest_rate_monthly_pct numeric(8, 4) NOT NULL DEFAULT 0,
  late_fee_rate_pct numeric(8, 4) NOT NULL DEFAULT 0,
  rounding_unit integer NOT NULL DEFAULT 1000 CHECK (rounding_unit > 0),
  default_frequency text NOT NULL DEFAULT 'mensual'
    CHECK (default_frequency IN ('mensual', 'quincenal', 'semanal')),
  min_installments integer NOT NULL DEFAULT 1 CHECK (min_installments >= 1),
  max_installments integer NOT NULL DEFAULT 36 CHECK (max_installments >= min_installments),
  legal_text text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE public.credit_settings IS 'Parámetros y fórmula de crédito. El negocio guarda snapshot al firmar.';

INSERT INTO public.credit_settings (
  formula_type, interest_rate_monthly_pct, late_fee_rate_pct, rounding_unit,
  default_frequency, min_installments, max_installments, is_active
)
SELECT 'financed_balance', 0, 0, 1000, 'mensual', 1, 36, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.credit_settings WHERE deleted_at IS NULL AND is_active = true
);

-- 4) Negocios
CREATE TABLE IF NOT EXISTS public.negocios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigserial UNIQUE NOT NULL,
  deal_date date NOT NULL DEFAULT CURRENT_DATE,
  location text,
  seller_id uuid NOT NULL REFERENCES public.profiles(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  codeudor_customer_id uuid REFERENCES public.customers(id),
  codeudor_snapshot jsonb,
  products_subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  interest_amount numeric(14, 2) NOT NULL DEFAULT 0,
  total_credit numeric(14, 2) NOT NULL DEFAULT 0,
  down_payment numeric(14, 2) NOT NULL DEFAULT 0,
  financed_amount numeric(14, 2) NOT NULL DEFAULT 0,
  installments_count integer NOT NULL DEFAULT 1 CHECK (installments_count >= 1),
  installment_amount numeric(14, 2) NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'mensual'
    CHECK (frequency IN ('mensual', 'quincenal', 'semanal')),
  first_due_date date,
  formula_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'borrador'
    CHECK (status IN ('borrador', 'por_firmar', 'activo', 'entregado', 'anulado', 'cerrado')),
  customer_signature_url text,
  guarantor_signature_url text,
  seller_signature_url text,
  signed_at timestamptz,
  delivery_order_id uuid REFERENCES public.delivery_orders(id),
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_negocios_customer ON public.negocios(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_negocios_seller ON public.negocios(seller_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_negocios_status ON public.negocios(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_negocios_numero ON public.negocios(numero);

COMMENT ON TABLE public.negocios IS 'Crédito / solicitud de crédito. Precio contado en ítems; totales con fórmula snapshot.';

-- 5) Ítems del negocio
CREATE TABLE IF NOT EXISTS public.negocio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id uuid NOT NULL REFERENCES public.negocios(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  description text,
  unit_price numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
  subtotal numeric(14, 2) NOT NULL CHECK (subtotal >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_negocio_items_negocio ON public.negocio_items(negocio_id) WHERE deleted_at IS NULL;

-- 6) Cuotas
CREATE TABLE IF NOT EXISTS public.negocio_cuotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id uuid NOT NULL REFERENCES public.negocios(id) ON DELETE CASCADE,
  installment_number integer NOT NULL CHECK (installment_number >= 1),
  due_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  paid_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status text NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'parcial', 'pagada', 'mora', 'anulada')),
  receipt_number text,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (negocio_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_negocio_cuotas_negocio ON public.negocio_cuotas(negocio_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_negocio_cuotas_due ON public.negocio_cuotas(due_date) WHERE deleted_at IS NULL;

-- 7) Pagos / recibos (grid VALOR / FECHA / RECIBO)
CREATE TABLE IF NOT EXISTS public.negocio_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id uuid NOT NULL REFERENCES public.negocios(id) ON DELETE CASCADE,
  cuota_id uuid REFERENCES public.negocio_cuotas(id),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  receipt_number text,
  created_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- 8) Link bidireccional OE ↔ negocio
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS negocio_id uuid REFERENCES public.negocios(id);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_negocio
  ON public.delivery_orders(negocio_id) WHERE deleted_at IS NULL AND negocio_id IS NOT NULL;

-- 9) Actualizar RPC productos para incluir sale_price
-- Postgres no permite cambiar el RETURNS TABLE con CREATE OR REPLACE
DROP FUNCTION IF EXISTS public.get_products_dashboard(text, integer, integer, boolean);

CREATE OR REPLACE FUNCTION public.get_products_dashboard(
  search_term text DEFAULT ''::text,
  page integer DEFAULT 1,
  page_size integer DEFAULT 5,
  include_deleted boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  name text,
  sku text,
  barcode text,
  status boolean,
  created_at timestamptz,
  deleted_at timestamptz,
  brand_id uuid,
  brand_name text,
  category_id uuid,
  category_name text,
  color_id uuid,
  color_name text,
  sale_price numeric,
  total_stock numeric,
  stock_by_warehouse jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  _limit integer := GREATEST(COALESCE(page_size, 5), 1);
  _offset integer := GREATEST((COALESCE(page, 1) - 1) * _limit, 0);
  _search text := COALESCE(search_term, '');
  _include_deleted boolean := COALESCE(include_deleted, false);
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
      p.deleted_at::timestamptz AS deleted_at,
      p.brand_id,
      b.name::text AS brand_name,
      p.category_id,
      c.name::text AS category_name,
      p.color_id,
      col.name::text AS color_name,
      COALESCE(p.sale_price, 0)::numeric AS sale_price
    FROM public.products p
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.category c ON c.id = p.category_id
    LEFT JOIN public.colors col ON col.id = p.color_id AND col.deleted_at IS NULL
    WHERE (_include_deleted OR p.deleted_at IS NULL)
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
      f.id, f.name, f.sku, f.barcode, f.status, f.created_at, f.deleted_at,
      f.brand_id, f.brand_name, f.category_id, f.category_name,
      f.color_id, f.color_name, f.sale_price,
      COALESCE(SUM(ws.quantity) FILTER (WHERE ws.quantity > 0)::numeric, 0::numeric) AS total_stock,
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
      f.id, f.name, f.sku, f.barcode, f.status, f.created_at, f.deleted_at,
      f.brand_id, f.brand_name, f.category_id, f.category_name,
      f.color_id, f.color_name, f.sale_price
  ),
  numbered AS (
    SELECT
      a.*,
      COUNT(*) OVER () AS total_count,
      ROW_NUMBER() OVER (ORDER BY a.created_at DESC) AS row_number
    FROM aggregated a
  )
  SELECT
    n.id, n.name, n.sku, n.barcode, n.status,
    n.created_at, n.deleted_at,
    n.brand_id, n.brand_name,
    n.category_id, n.category_name,
    n.color_id, n.color_name,
    n.sale_price,
    n.total_stock, n.stock_by_warehouse, n.total_count
  FROM numbered n
  WHERE n.row_number > _offset
  ORDER BY n.row_number
  LIMIT _limit;
END;
$$;

-- 10) Helpers de rol
CREATE OR REPLACE FUNCTION public.has_role(role_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.deleted_at IS NULL
      AND lower(r.nombre) = lower(role_name)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_vendedor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role('admin') OR public.has_role('vendedor');
$$;

-- 11) Activar negocio: firmas → OE + cuotas (transaccional)
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
  'Activa un negocio firmado: crea OE + items (reserva stock) + cuotas.';

-- 12) RLS básica
ALTER TABLE public.credit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negocios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negocio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negocio_cuotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negocio_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_settings_select ON public.credit_settings;
CREATE POLICY credit_settings_select ON public.credit_settings
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS credit_settings_admin_all ON public.credit_settings;
CREATE POLICY credit_settings_admin_all ON public.credit_settings
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS negocios_select ON public.negocios;
CREATE POLICY negocios_select ON public.negocios
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.has_role('admin')
      OR seller_id = auth.uid()
      OR created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS negocios_insert ON public.negocios;
CREATE POLICY negocios_insert ON public.negocios
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_vendedor());

DROP POLICY IF EXISTS negocios_update ON public.negocios;
CREATE POLICY negocios_update ON public.negocios
  FOR UPDATE TO authenticated
  USING (
    public.has_role('admin')
    OR (public.has_role('vendedor') AND seller_id = auth.uid() AND status IN ('borrador', 'por_firmar'))
  )
  WITH CHECK (public.is_admin_or_vendedor());

DROP POLICY IF EXISTS negocio_items_all ON public.negocio_items;
CREATE POLICY negocio_items_all ON public.negocio_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.negocios n
      WHERE n.id = negocio_id AND n.deleted_at IS NULL
        AND (public.has_role('admin') OR n.seller_id = auth.uid() OR n.created_by = auth.uid())
    )
  )
  WITH CHECK (public.is_admin_or_vendedor());

DROP POLICY IF EXISTS negocio_cuotas_all ON public.negocio_cuotas;
CREATE POLICY negocio_cuotas_all ON public.negocio_cuotas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.negocios n
      WHERE n.id = negocio_id AND n.deleted_at IS NULL
        AND (public.has_role('admin') OR n.seller_id = auth.uid() OR n.created_by = auth.uid())
    )
  )
  WITH CHECK (public.is_admin_or_vendedor());

DROP POLICY IF EXISTS negocio_pagos_all ON public.negocio_pagos;
CREATE POLICY negocio_pagos_all ON public.negocio_pagos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.negocios n
      WHERE n.id = negocio_id AND n.deleted_at IS NULL
        AND (public.has_role('admin') OR n.seller_id = auth.uid() OR n.created_by = auth.uid())
    )
  )
  WITH CHECK (public.is_admin_or_vendedor());

GRANT SELECT, INSERT, UPDATE ON public.credit_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.negocios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.negocio_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.negocio_cuotas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.negocio_pagos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.negocios_numero_seq TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_negocio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_vendedor() TO authenticated;
