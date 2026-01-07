-- ============================================================================
-- Fix: Filtrar bodegas con stock 0 en get_products_dashboard
-- ============================================================================
-- Problema: La función incluía todas las bodegas activas sin importar si
-- tenían stock > 0, causando que se mostraran bodegas vacías en el inventario.
-- Solución: Agregar filtro AND ws.quantity > 0 al jsonb_agg y al SUM.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_products_dashboard(text, integer, integer);

CREATE FUNCTION public.get_products_dashboard(
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
    color_id uuid,
    color_name text,
    total_stock numeric,
    stock_by_warehouse jsonb,
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
                SUM(ws.quantity) FILTER (WHERE w.is_active AND ws.quantity > 0)::numeric,
                0::numeric
            ) AS total_stock,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'warehouseId', ws.warehouse_id,
                        'warehouseName', w.name,
                        'quantity', ws.quantity
                    )
                ) FILTER (WHERE w.is_active AND ws.quantity > 0),
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
$function$;

COMMENT ON FUNCTION public.get_products_dashboard(text, integer, integer) IS
    'Devuelve productos con marca/categoría/color y stock agregado. Solo incluye bodegas con stock > 0.';
