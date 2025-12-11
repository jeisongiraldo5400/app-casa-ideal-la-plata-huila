-- ============================================================================
-- Agregar delivery_observations a RPC de salidas y reporte de movimientos
-- ============================================================================
-- Incluye las observaciones de entrega (delivery_observations) en:
--  - get_inventory_exits_dashboard
--  - get_movements_by_period
-- para poder verlas en la tabla de salidas y en el reporte de movimientos.

-- --------------------------------------------------------------------------
-- 1) Actualizar get_inventory_exits_dashboard
-- --------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_inventory_exits_dashboard(text, integer, integer);

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
    delivery_order_id uuid,
    delivery_observations text,
    delivered_to_name text,
    delivered_to_id_number text,
    delivered_to_type text,
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
            ie.delivery_order_id,
            ie.delivery_observations,
            ie.delivered_to_customer_id,
            ie.delivered_to_user_id,
            p.name AS product_name,
            p.sku AS product_sku,
            p.barcode AS product_barcode,
            w.name AS warehouse_name,
            pr.full_name AS created_by_name,
            iec.id AS cancellation_id,
            iec.observations AS cancellation_observations,
            iec.created_at AS cancellation_created_at,
            -- Información de "Entregado a"
            CASE
                WHEN ie.delivered_to_customer_id IS NOT NULL THEN c.name
                WHEN ie.delivered_to_user_id IS NOT NULL THEN pr_delivered.full_name
                ELSE NULL
            END AS delivered_to_name,
            CASE
                WHEN ie.delivered_to_customer_id IS NOT NULL THEN c.id_number
                ELSE NULL
            END AS delivered_to_id_number,
            CASE
                WHEN ie.delivered_to_customer_id IS NOT NULL THEN 'customer'::text
                WHEN ie.delivered_to_user_id IS NOT NULL THEN 'user'::text
                ELSE NULL
            END AS delivered_to_type
        FROM public.inventory_exits ie
        LEFT JOIN public.products p ON p.id = ie.product_id
        LEFT JOIN public.warehouses w ON w.id = ie.warehouse_id
        LEFT JOIN public.profiles pr ON pr.id = ie.created_by
        LEFT JOIN public.inventory_exit_cancellations iec ON iec.inventory_exit_id = ie.id
        LEFT JOIN public.customers c ON c.id = ie.delivered_to_customer_id AND c.deleted_at IS NULL
        LEFT JOIN public.profiles pr_delivered ON pr_delivered.id = ie.delivered_to_user_id
        WHERE (
            _search = ''
            OR LOWER(p.name) LIKE '%' || _search || '%'
            OR LOWER(p.sku) LIKE '%' || _search || '%'
            OR LOWER(p.barcode) LIKE '%' || _search || '%'
            OR LOWER(w.name) LIKE '%' || _search || '%'
            OR LOWER(pr.full_name) LIKE '%' || _search || '%'
            OR LOWER(ie.barcode_scanned) LIKE '%' || _search || '%'
            OR LOWER(COALESCE(c.name, '')) LIKE '%' || _search || '%'
            OR LOWER(COALESCE(pr_delivered.full_name, '')) LIKE '%' || _search || '%'
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
        n.delivery_order_id,
        n.delivery_observations,
        n.delivered_to_name::text,
        n.delivered_to_id_number::text,
        n.delivered_to_type::text,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$function$;

COMMENT ON FUNCTION public.get_inventory_exits_dashboard(text, integer, integer) IS
    'Devuelve salidas de inventario con todas las relaciones (producto, bodega, usuario, cancelación, orden de entrega, observaciones de entrega y entregado a) en una sola consulta optimizada. Orden de parámetros: search_term, page, page_size.';


-- --------------------------------------------------------------------------
-- 2) Actualizar get_movements_by_period
-- --------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_movements_by_period(timestamptz, timestamptz, integer);

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
    delivery_order_id uuid,
    delivery_observations text,
    is_cancelled boolean,
    cancellation_observations text,
    cancelled_by text,
    cancelled_at timestamptz,
    delivered_to_name text,
    delivered_to_id_number text,
    delivered_to_type text
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
        NULL::uuid AS delivery_order_id,
        NULL::text AS delivery_observations,
        iec.id IS NOT NULL AS is_cancelled,
        iec.observations AS cancellation_observations,
        pr_cancel.full_name AS cancelled_by,
        iec.created_at AS cancelled_at,
        NULL::text AS delivered_to_name,
        NULL::text AS delivered_to_id_number,
        NULL::text AS delivered_to_type
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
        iex.delivery_order_id,
        iex.delivery_observations,
        iecx.id IS NOT NULL AS is_cancelled,
        iecx.observations AS cancellation_observations,
        pr_cancel.full_name AS cancelled_by,
        iecx.created_at AS cancelled_at,
        -- Información de "Entregado a"
        CASE
            WHEN iex.delivered_to_customer_id IS NOT NULL THEN c.name
            WHEN iex.delivered_to_user_id IS NOT NULL THEN pr_delivered.full_name
            ELSE NULL
        END AS delivered_to_name,
        CASE
            WHEN iex.delivered_to_customer_id IS NOT NULL THEN c.id_number
            ELSE NULL
        END AS delivered_to_id_number,
        CASE
            WHEN iex.delivered_to_customer_id IS NOT NULL THEN 'customer'::text
            WHEN iex.delivered_to_user_id IS NOT NULL THEN 'user'::text
            ELSE NULL
        END AS delivered_to_type
    FROM public.inventory_exits iex
    LEFT JOIN public.products p ON p.id = iex.product_id
    LEFT JOIN public.warehouses w ON w.id = iex.warehouse_id
    LEFT JOIN public.profiles pr ON pr.id = iex.created_by
    LEFT JOIN public.inventory_exit_cancellations iecx ON iecx.inventory_exit_id = iex.id
    LEFT JOIN public.profiles pr_cancel ON pr_cancel.id = iecx.created_by
    LEFT JOIN public.customers c ON c.id = iex.delivered_to_customer_id AND c.deleted_at IS NULL
    LEFT JOIN public.profiles pr_delivered ON pr_delivered.id = iex.delivered_to_user_id
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
    am.delivery_order_id,
    am.delivery_observations,
    am.is_cancelled,
    am.cancellation_observations,
    am.cancelled_by,
    am.cancelled_at,
    am.delivered_to_name,
    am.delivered_to_id_number,
    am.delivered_to_type
FROM all_movements am
ORDER BY am.created_at DESC
LIMIT movement_limit;
$function$;

COMMENT ON FUNCTION public.get_movements_by_period(timestamptz, timestamptz, integer) IS
    'Retorna movimientos (entradas y salidas) en un período con todas las relaciones, incluyendo orden de compra, orden de entrega, observaciones de entrega e información de "Entregado a" para salidas. Incluye LIMIT para evitar descargas masivas.';


