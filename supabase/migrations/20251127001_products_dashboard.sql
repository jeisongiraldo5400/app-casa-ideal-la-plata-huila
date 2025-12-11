-- ============================================================================
-- RPC: get_products_dashboard
-- Devuelve productos con marca/categoría y stock agregado, con búsqueda y paginación
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_products_dashboard(
    search_term text DEFAULT ''::text,
    page integer DEFAULT 1,
    page_size integer DEFAULT 5
)
RETURNS TABLE (
    id uuid,
    name text,
    sku text,
    barcode text,
    status boolean,
    created_at timestamptz,
    brand_id uuid,
    brand_name text,
    category_id uuid,
    category_name text,
    total_stock numeric,
    stock_by_warehouse jsonb,
    total_count bigint
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    _offset integer := GREATEST((COALESCE(page, 1) - 1) * COALESCE(page_size, 5), 0);
    _limit integer := GREATEST(COALESCE(page_size, 5), 1);
    _search text := COALESCE(search_term, '');
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            p.*,
            b.name AS brand_name,
            c.name AS category_name
        FROM public.products p
        LEFT JOIN public.brands b ON b.id = p.brand_id
        LEFT JOIN public.category c ON c.id = p.category_id
        WHERE p.deleted_at IS NULL
          AND (
            _search = ''
            OR p.name ILIKE '%' || _search || '%'
            OR p.sku ILIKE '%' || _search || '%'
            OR p.barcode ILIKE '%' || _search || '%'
            OR b.name ILIKE '%' || _search || '%'
            OR c.name ILIKE '%' || _search || '%'
          )
    ),
    enriched AS (
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
            COALESCE(
                SUM(ws.quantity) FILTER (WHERE w.is_active),
                0
            ) AS total_stock,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'warehouseId', ws.warehouse_id,
                        'warehouseName', w.name,
                        'quantity', ws.quantity
                    )
                ) FILTER (WHERE w.is_active),
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
            f.category_name
    )
    SELECT
        e.*,
        COUNT(*) OVER () AS total_count
    FROM enriched e
    ORDER BY e.created_at DESC
    LIMIT _limit
    OFFSET _offset;
END;
$function$;

COMMENT ON FUNCTION public.get_products_dashboard(text, integer, integer) IS
    'Devuelve productos con marca/categoría y stock agregado. Incluye paginación, búsqueda y total_count.';

-- ============================================================================
-- RPC: get_products_stats
-- Devuelve métricas globales del módulo de productos
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_products_stats()
RETURNS TABLE (
    total_products bigint,
    products_with_barcode bigint,
    products_with_internal_barcode bigint,
    unique_categories bigint
)
LANGUAGE sql
STABLE
AS $function$
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
$function$;

COMMENT ON FUNCTION public.get_products_stats() IS
    'Retorna totales globales del módulo de productos sin traer todas las filas.';

