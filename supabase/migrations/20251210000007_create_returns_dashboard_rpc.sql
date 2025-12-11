-- ============================================================================
-- RPC: get_returns_dashboard
-- Devuelve devoluciones con información completa usando JOINs optimizados
-- Evita problemas N+1 haciendo todas las relaciones en una sola query
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_returns_dashboard(
    search_term text DEFAULT ''::text,
    page integer DEFAULT 1,
    page_size integer DEFAULT 50,
    return_type_filter text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    return_type text,
    order_id uuid,
    order_number text,
    product_id uuid,
    product_name text,
    product_sku text,
    warehouse_id uuid,
    warehouse_name text,
    quantity numeric,
    return_reason text,
    observations text,
    created_by uuid,
    created_by_name text,
    created_at timestamptz,
    inventory_entry_id uuid,
    total_count bigint
)
LANGUAGE plpgsql
STABLE
AS $function$
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
$function$;

COMMENT ON FUNCTION public.get_returns_dashboard(text, integer, integer, text) IS 
    'Devuelve devoluciones con información completa usando JOINs optimizados. Evita problemas N+1.';


