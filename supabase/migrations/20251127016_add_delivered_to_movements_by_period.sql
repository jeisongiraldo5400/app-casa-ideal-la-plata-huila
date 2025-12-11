-- ============================================================================
-- Agregar información de "Entregado a" en get_movements_by_period
-- ============================================================================
-- Agrega los campos delivered_to_name, delivered_to_id_number, delivered_to_type
-- para mostrar a quién se entregó cada salida de inventario en el reporte

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
    'Retorna movimientos (entradas y salidas) en un período con todas las relaciones, incluyendo información de "Entregado a" para salidas. Incluye LIMIT para evitar descargas masivas.';

