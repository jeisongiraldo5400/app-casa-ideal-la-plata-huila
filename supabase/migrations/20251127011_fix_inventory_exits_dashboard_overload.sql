-- ============================================================================
-- Fix: Eliminar sobrecarga de función get_inventory_exits_dashboard
-- ============================================================================
-- Error: PGRST203 - Could not choose the best candidate function
-- Causa: Hay dos versiones de la función con diferentes órdenes de parámetros
-- Solución: Eliminar todas las versiones y crear una sola con el orden correcto

-- Eliminar todas las versiones existentes de la función
DROP FUNCTION IF EXISTS public.get_inventory_exits_dashboard(text, integer, integer);
DROP FUNCTION IF EXISTS public.get_inventory_exits_dashboard(integer, integer, text);
DROP FUNCTION IF EXISTS public.get_inventory_exits_dashboard();

-- Crear la función con el orden correcto de parámetros: search_term, page, page_size
CREATE OR REPLACE FUNCTION public.get_inventory_exits_dashboard(
    search_term text DEFAULT ''::text,
    page integer DEFAULT 1,
    page_size integer DEFAULT 5
)
RETURNS TABLE (
    id uuid,
    product_id uuid,
    product_name text,
    product_sku text,
    product_barcode text,
    warehouse_id uuid,
    warehouse_name text,
    quantity numeric,
    barcode_scanned text,
    created_by uuid,
    created_by_name text,
    created_at timestamptz,
    is_cancelled boolean,
    cancellation_id uuid,
    cancellation_observations text,
    cancellation_created_at timestamptz,
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
            ie.id,
            ie.product_id,
            ie.warehouse_id,
            ie.quantity,
            ie.barcode_scanned,
            ie.created_by,
            ie.created_at,
            p.name AS product_name,
            p.sku AS product_sku,
            p.barcode AS product_barcode,
            w.name AS warehouse_name,
            pr.full_name AS created_by_name,
            iec.id AS cancellation_id,
            iec.observations AS cancellation_observations,
            iec.created_at AS cancellation_created_at
        FROM public.inventory_exits ie
        LEFT JOIN public.products p ON p.id = ie.product_id
        LEFT JOIN public.warehouses w ON w.id = ie.warehouse_id
        LEFT JOIN public.profiles pr ON pr.id = ie.created_by
        LEFT JOIN public.inventory_exit_cancellations iec ON iec.inventory_exit_id = ie.id
        WHERE (
            _search = ''
            OR LOWER(p.name) LIKE '%' || _search || '%'
            OR LOWER(p.sku) LIKE '%' || _search || '%'
            OR LOWER(p.barcode) LIKE '%' || _search || '%'
            OR LOWER(w.name) LIKE '%' || _search || '%'
            OR LOWER(pr.full_name) LIKE '%' || _search || '%'
            OR LOWER(ie.barcode_scanned) LIKE '%' || _search || '%'
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
        n.product_id,
        n.product_name::text,
        n.product_sku::text,
        n.product_barcode::text,
        n.warehouse_id,
        n.warehouse_name::text,
        n.quantity,
        n.barcode_scanned::text,
        n.created_by,
        n.created_by_name::text,
        n.created_at,
        (n.cancellation_id IS NOT NULL) AS is_cancelled,
        n.cancellation_id,
        n.cancellation_observations::text,
        n.cancellation_created_at,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$function$;

COMMENT ON FUNCTION public.get_inventory_exits_dashboard(text, integer, integer) IS
    'Devuelve salidas de inventario con todas las relaciones (producto, bodega, usuario, cancelación) en una sola consulta optimizada. Orden de parámetros: search_term, page, page_size.';

