-- ============================================================================
-- FASE 1 (CRÍTICO): Funciones RPC para Reportes
-- ============================================================================

-- ============================================================================
-- RPC: get_reports_stats_today
-- Reemplaza useReportsStats - Consolida 5 queries en 1
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_reports_stats_today()
RETURNS TABLE (
    movements_today bigint,
    entries_today bigint,
    exits_today bigint,
    entries_quantity_today numeric,
    exits_quantity_today numeric,
    total_stock numeric,
    cancelled_entries_today bigint,
    cancelled_exits_today bigint
)
LANGUAGE sql
STABLE
AS $function$
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
$function$;

COMMENT ON FUNCTION public.get_reports_stats_today() IS
    'Retorna estadísticas de hoy consolidadas en una sola consulta: movimientos, entradas, salidas, stock total y cancelaciones.';

-- ============================================================================
-- RPC: get_period_stats
-- Reemplaza usePeriodStats - Agregación server-side por período
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_period_stats(
    start_date timestamptz,
    end_date timestamptz,
    period_type text DEFAULT 'daily'
)
RETURNS TABLE (
    period_date date,
    period_label text,
    entries_count bigint,
    exits_count bigint,
    entries_quantity numeric,
    exits_quantity numeric,
    cancellations_count bigint,
    net_movement numeric
)
LANGUAGE plpgsql
STABLE
AS $function$
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
$function$;

COMMENT ON FUNCTION public.get_period_stats(timestamptz, timestamptz, text) IS
    'Retorna estadísticas agregadas por período (daily/weekly/monthly/yearly) con entradas, salidas, cancelaciones y movimiento neto.';

-- ============================================================================
-- RPC: get_user_activities_today
-- Reemplaza useUserActivities - Consolida 3 queries en 1
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_activities_today()
RETURNS TABLE (
    user_id uuid,
    user_name text,
    user_email text,
    entries_count bigint,
    exits_count bigint,
    total_movements bigint
)
LANGUAGE sql
STABLE
AS $function$
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
$function$;

COMMENT ON FUNCTION public.get_user_activities_today() IS
    'Retorna top 10 usuarios con más actividad hoy (entradas y salidas).';

-- ============================================================================
-- RPC: get_product_traceability
-- Reemplaza useProductTraceability - Elimina N+1
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_product_traceability(
    product_ids uuid[] DEFAULT NULL,
    search_term text DEFAULT NULL,
    products_limit integer DEFAULT 5,
    events_limit integer DEFAULT 5
)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    product_sku text,
    product_barcode text,
    events jsonb
)
LANGUAGE plpgsql
STABLE
AS $function$
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
$function$;

COMMENT ON FUNCTION public.get_product_traceability(uuid[], text, integer, integer) IS
    'Retorna trazabilidad de productos con eventos (entradas/salidas) en formato JSON. Elimina N+1 queries.';

-- ============================================================================
-- RPC: get_movements_by_period
-- Reemplaza useMovementsByPeriod - Con LIMIT para evitar descargas masivas
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_movements_by_period(
    start_date timestamptz,
    end_date timestamptz,
    movement_limit integer DEFAULT 1000
)
RETURNS TABLE (
    id uuid,
    movement_type text,
    created_at timestamptz,
    product_name text,
    product_sku text,
    product_barcode text,
    quantity numeric,
    warehouse_name text,
    user_name text,
    supplier_name text,
    purchase_order_id uuid,
    is_cancelled boolean,
    cancellation_observations text,
    cancelled_by text,
    cancelled_at timestamptz
)
LANGUAGE sql
STABLE
AS $function$
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
        iec.id IS NOT NULL AS is_cancelled,
        iec.observations AS cancellation_observations,
        pr_cancel.full_name AS cancelled_by,
        iec.created_at AS cancelled_at
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
        iecx.id IS NOT NULL AS is_cancelled,
        iecx.observations AS cancellation_observations,
        pr_cancel.full_name AS cancelled_by,
        iecx.created_at AS cancelled_at
    FROM public.inventory_exits iex
    LEFT JOIN public.products p ON p.id = iex.product_id
    LEFT JOIN public.warehouses w ON w.id = iex.warehouse_id
    LEFT JOIN public.profiles pr ON pr.id = iex.created_by
    LEFT JOIN public.inventory_exit_cancellations iecx ON iecx.inventory_exit_id = iex.id
    LEFT JOIN public.profiles pr_cancel ON pr_cancel.id = iecx.created_by
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
    am.is_cancelled,
    am.cancellation_observations,
    am.cancelled_by,
    am.cancelled_at
FROM all_movements am
ORDER BY am.created_at DESC
LIMIT movement_limit;
$function$;

COMMENT ON FUNCTION public.get_movements_by_period(timestamptz, timestamptz, integer) IS
    'Retorna movimientos (entradas y salidas) en un período con todas las relaciones. Incluye LIMIT para evitar descargas masivas.';
