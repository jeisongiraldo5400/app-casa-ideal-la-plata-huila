-- ============================================================================
-- RPC: get_delivery_orders_dashboard
-- Devuelve órdenes de entrega con información de cliente, items y estado
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_delivery_orders_dashboard(
    search_term text DEFAULT ''::text,
    page integer DEFAULT 1,
    page_size integer DEFAULT 5
)
RETURNS TABLE (
    id uuid,
    customer_id uuid,
    customer_name text,
    customer_id_number text,
    status text,
    notes text,
    delivery_address text,
    created_at timestamptz,
    created_by uuid,
    created_by_name text,
    total_items bigint,
    total_quantity numeric,
    delivered_items bigint,
    delivered_quantity numeric,
    items jsonb,
    total_count bigint
)
LANGUAGE plpgsql
STABLE
AS $function$
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
$function$;

COMMENT ON FUNCTION public.get_delivery_orders_dashboard(text, integer, integer) IS
    'Devuelve órdenes de entrega con información de cliente, items agregados y estado de completitud.';

-- ============================================================================
-- RPC: get_delivery_orders_stats
-- Calcula estadísticas globales de órdenes de entrega
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_delivery_orders_stats()
RETURNS TABLE (
    total_orders bigint,
    pending_orders bigint,
    preparing_orders bigint,
    ready_orders bigint,
    delivered_orders bigint,
    cancelled_orders bigint,
    total_items_pending bigint,
    total_quantity_pending numeric
)
LANGUAGE sql
STABLE
AS $function$
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
$function$;

COMMENT ON FUNCTION public.get_delivery_orders_stats() IS
    'Calcula estadísticas globales de órdenes de entrega en una sola consulta agregada.';

-- ============================================================================
-- RPC: get_customer_delivery_orders
-- Historial de órdenes de entrega de un cliente específico
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_customer_delivery_orders(
    customer_id_param uuid,
    page integer DEFAULT 1,
    page_size integer DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    status text,
    notes text,
    delivery_address text,
    created_at timestamptz,
    created_by_name text,
    total_items bigint,
    total_quantity numeric,
    delivered_quantity numeric,
    is_complete boolean,
    total_count bigint
)
LANGUAGE plpgsql
STABLE
AS $function$
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
$function$;

COMMENT ON FUNCTION public.get_customer_delivery_orders(uuid, integer, integer) IS
    'Devuelve el historial de órdenes de entrega para un cliente específico.';

