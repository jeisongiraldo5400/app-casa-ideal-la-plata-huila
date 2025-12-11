-- ============================================================================
-- RPC: get_products_for_return
-- Devuelve productos disponibles para devolución con cantidades calculadas
-- Usa agregaciones GROUP BY para evitar problemas N+1
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_products_for_return(
    return_type_param text,
    order_id_param uuid
)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    product_sku text,
    warehouse_id uuid,
    warehouse_name text,
    max_returnable numeric,
    already_returned numeric
)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
    IF return_type_param = 'purchase_order' THEN
        RETURN QUERY
        WITH received_by_product_warehouse AS (
            -- Calcular cantidades recibidas por producto-bodega
            SELECT
                ie.product_id,
                ie.warehouse_id,
                SUM(ie.quantity) AS total_received
            FROM public.inventory_entries ie
            WHERE ie.purchase_order_id = order_id_param
            GROUP BY ie.product_id, ie.warehouse_id
        ),
        returned_by_product_warehouse AS (
            -- Calcular cantidades ya devueltas por producto-bodega
            SELECT
                r.product_id,
                r.warehouse_id,
                SUM(r.quantity) AS total_returned
            FROM public.returns r
            WHERE r.return_type = 'purchase_order'
              AND r.order_id = order_id_param
            GROUP BY r.product_id, r.warehouse_id
        ),
        products_with_quantities AS (
            SELECT
                r.product_id,
                r.warehouse_id,
                r.total_received,
                COALESCE(ret.total_returned, 0) AS total_returned,
                (r.total_received - COALESCE(ret.total_returned, 0)) AS max_returnable
            FROM received_by_product_warehouse r
            LEFT JOIN returned_by_product_warehouse ret 
                ON ret.product_id = r.product_id 
                AND ret.warehouse_id = r.warehouse_id
            WHERE (r.total_received - COALESCE(ret.total_returned, 0)) > 0
        )
        SELECT
            pwq.product_id,
            p.name::text AS product_name,
            p.sku::text AS product_sku,
            pwq.warehouse_id,
            w.name::text AS warehouse_name,
            pwq.max_returnable,
            pwq.total_returned AS already_returned
        FROM products_with_quantities pwq
        LEFT JOIN public.products p ON p.id = pwq.product_id
        LEFT JOIN public.warehouses w ON w.id = pwq.warehouse_id
        WHERE p.id IS NOT NULL
        ORDER BY p.name, w.name;
        
    ELSIF return_type_param = 'delivery_order' THEN
        RETURN QUERY
        WITH returned_by_product_warehouse AS (
            -- Calcular cantidades ya devueltas por producto-bodega
            SELECT
                r.product_id,
                r.warehouse_id,
                SUM(r.quantity) AS total_returned
            FROM public.returns r
            WHERE r.return_type = 'delivery_order'
              AND r.order_id = order_id_param
            GROUP BY r.product_id, r.warehouse_id
        ),
        items_with_returns AS (
            SELECT
                doi.product_id,
                doi.warehouse_id,
                doi.delivered_quantity,
                COALESCE(ret.total_returned, 0) AS total_returned,
                (doi.delivered_quantity - COALESCE(ret.total_returned, 0)) AS max_returnable
            FROM public.delivery_order_items doi
            LEFT JOIN returned_by_product_warehouse ret 
                ON ret.product_id = doi.product_id 
                AND ret.warehouse_id = doi.warehouse_id
            WHERE doi.delivery_order_id = order_id_param
              AND doi.delivered_quantity > 0
              AND (doi.delivered_quantity - COALESCE(ret.total_returned, 0)) > 0
        )
        SELECT
            iwr.product_id,
            p.name::text AS product_name,
            p.sku::text AS product_sku,
            iwr.warehouse_id,
            w.name::text AS warehouse_name,
            iwr.max_returnable,
            iwr.total_returned AS already_returned
        FROM items_with_returns iwr
        LEFT JOIN public.products p ON p.id = iwr.product_id
        LEFT JOIN public.warehouses w ON w.id = iwr.warehouse_id
        WHERE p.id IS NOT NULL
        ORDER BY p.name, w.name;
    ELSE
        -- Retornar vacío si el tipo no es válido
        RETURN;
    END IF;
END;
$function$;

COMMENT ON FUNCTION public.get_products_for_return(text, uuid) IS 
    'Devuelve productos disponibles para devolución con cantidades calculadas usando agregaciones. Evita problemas N+1.';


