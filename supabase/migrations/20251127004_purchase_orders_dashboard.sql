-- ============================================================================
-- RPC: get_purchase_orders_dashboard
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_purchase_orders_dashboard(
    search_term text DEFAULT ''::text,
    page integer DEFAULT 1,
    page_size integer DEFAULT 5
)
RETURNS TABLE (
    id uuid,
    status text,
    supplier_id uuid,
    supplier_name text,
    created_at timestamptz,
    notes text,
    total_items numeric,
    total_quantity numeric,
    completion jsonb,
    completion_detail jsonb,
    total_count bigint
)
LANGUAGE plpgsql
STABLE
AS $function$
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
        WHERE (
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
$function$;

COMMENT ON FUNCTION public.get_purchase_orders_dashboard(text, integer, integer) IS
    'Devuelve órdenes de compra con proveedor, items, estado de completitud y total_count.';

-- ============================================================================
-- RPC: get_purchase_orders_stats
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_purchase_orders_stats()
RETURNS TABLE (
    total bigint,
    pending bigint,
    approved bigint,
    received bigint,
    total_items numeric,
    total_quantity numeric
)
LANGUAGE sql
STABLE
AS $function$
WITH orders AS (
    SELECT
        po.id,
        po.status
    FROM public.purchase_orders po
),
items AS (
    SELECT
        poi.purchase_order_id,
        SUM(poi.quantity) AS total_quantity,
        COUNT(*) AS total_items
    FROM public.purchase_order_items poi
    GROUP BY poi.purchase_order_id
)
SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE o.status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE o.status = 'approved') AS approved,
    COUNT(*) FILTER (WHERE o.status = 'received') AS received,
    COALESCE(SUM(i.total_items), 0) AS total_items,
    COALESCE(SUM(i.total_quantity), 0) AS total_quantity
FROM orders o
LEFT JOIN items i ON i.purchase_order_id = o.id;
$function$;

COMMENT ON FUNCTION public.get_purchase_orders_stats() IS
    'Calcula estadísticas globales de órdenes de compra en una sola consulta.';

