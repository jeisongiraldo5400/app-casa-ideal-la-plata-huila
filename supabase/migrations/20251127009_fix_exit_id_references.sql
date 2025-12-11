-- ============================================================================
-- Fix: Corregir referencias incorrectas a exit_id en funciones RPC
-- ============================================================================
-- Error: column iec.exit_id does not exist
-- Solución: Reemplazar todas las referencias a iec.exit_id por iec.inventory_exit_id

-- Corregir get_customer_exit_history si existe
CREATE OR REPLACE FUNCTION public.get_customer_exit_history(
    customer_id_param uuid,
    page integer DEFAULT 1,
    page_size integer DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    product_name text,
    warehouse_name text,
    quantity numeric,
    created_at timestamptz,
    created_by_name text,
    is_cancelled boolean,
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
        FROM public.inventory_exits ie
        WHERE ie.delivered_to_customer_id = customer_id_param
    )
    SELECT 
        ie.id,
        p.name::text AS product_name,
        w.name::text AS warehouse_name,
        ie.quantity,
        ie.created_at,
        creator.full_name::text AS created_by_name,
        EXISTS(
            SELECT 1 FROM public.inventory_exit_cancellations iec 
            WHERE iec.inventory_exit_id = ie.id
        ) AS is_cancelled,
        total.cnt AS total_count
    FROM public.inventory_exits ie
    LEFT JOIN public.products p ON p.id = ie.product_id
    LEFT JOIN public.warehouses w ON w.id = ie.warehouse_id
    LEFT JOIN public.profiles creator ON creator.id = ie.created_by
    CROSS JOIN total
    WHERE ie.delivered_to_customer_id = customer_id_param
    ORDER BY ie.created_at DESC
    LIMIT GREATEST(COALESCE(page_size, 50), 1)
    OFFSET offset_val;
END;
$function$;

COMMENT ON FUNCTION public.get_customer_exit_history(uuid, integer, integer) IS
    'Devuelve el historial de salidas de inventario para un cliente específico, corrigiendo la referencia a inventory_exit_id.';

-- Asegurar que get_inventory_exits_dashboard esté correcta (por si acaso hay una versión incorrecta en la BD)
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
    'Devuelve salidas de inventario con todas las relaciones (producto, bodega, usuario, cancelación) en una sola consulta optimizada. Corregida referencia a inventory_exit_id.';

