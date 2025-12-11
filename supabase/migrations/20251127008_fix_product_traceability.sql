-- Fix ambiguous column reference in get_product_traceability function
CREATE OR REPLACE FUNCTION public.get_product_traceability(
    product_ids uuid[] DEFAULT NULL,
    search_term text DEFAULT NULL,
    products_limit integer DEFAULT 5,
    events_limit integer DEFAULT 5
)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    product_sku text,
    product_barcode text,
    events jsonb
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    _product_ids uuid[];
    _search text := COALESCE(LOWER(TRIM(search_term)), '');
BEGIN
    -- Si se proporcionan product_ids, usarlos
    IF product_ids IS NOT NULL AND array_length(product_ids, 1) > 0 THEN
        _product_ids := product_ids;
    -- Si hay término de búsqueda, buscar productos
    ELSIF _search <> '' THEN
        SELECT array_agg(p.id)
        INTO _product_ids
        FROM (
            SELECT id
            FROM public.products
            WHERE deleted_at IS NULL
              AND (
                LOWER(name) LIKE '%' || _search || '%'
                OR LOWER(sku) LIKE '%' || _search || '%'
                OR LOWER(barcode) LIKE '%' || _search || '%'
              )
            LIMIT products_limit
        ) p;
    -- Si no hay filtros, obtener productos con movimientos recientes
    ELSE
        WITH recent_products AS (
            (SELECT ie.product_id, ie.created_at
             FROM public.inventory_entries ie
             ORDER BY ie.created_at DESC
             LIMIT products_limit * 2)
            
            UNION
            
            (SELECT iex.product_id, iex.created_at
             FROM public.inventory_exits iex
             ORDER BY iex.created_at DESC
             LIMIT products_limit * 2)
        )
        SELECT array_agg(DISTINCT limited.product_id)
        INTO _product_ids
        FROM (
            SELECT rp.product_id, rp.created_at
            FROM recent_products rp
            ORDER BY rp.created_at DESC
            LIMIT products_limit
        ) limited;
    END IF;

    -- Si no hay productos, retornar vacío
    IF _product_ids IS NULL OR array_length(_product_ids, 1) = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH product_events AS (
        -- Entradas
        SELECT
            ie.product_id,
            jsonb_build_object(
                'id', ie.id,
                'type', 'entry',
                'date', ie.created_at,
                'description', CASE
                    WHEN ie.purchase_order_id IS NOT NULL
                    THEN 'Recibido (OC-' || SUBSTRING(ie.purchase_order_id::text, 1, 8) || '...)'
                    ELSE 'Recibido'
                END,
                'user', COALESCE(pr.full_name, NULL),
                'warehouse', w.name,
                'purchaseOrder', ie.purchase_order_id,
                'quantity', ie.quantity
            ) AS event,
            ie.created_at AS event_date
        FROM public.inventory_entries ie
        LEFT JOIN public.profiles pr ON pr.id = ie.created_by
        LEFT JOIN public.warehouses w ON w.id = ie.warehouse_id
        WHERE ie.product_id = ANY(_product_ids)
        
        UNION ALL
        
        -- Salidas
        SELECT
            iex.product_id,
            jsonb_build_object(
                'id', iex.id,
                'type', 'exit',
                'date', iex.created_at,
                'description', 'Despachado',
                'user', COALESCE(pr.full_name, NULL),
                'warehouse', w.name,
                'purchaseOrder', NULL,
                'quantity', iex.quantity
            ) AS event,
            iex.created_at AS event_date
        FROM public.inventory_exits iex
        LEFT JOIN public.profiles pr ON pr.id = iex.created_by
        LEFT JOIN public.warehouses w ON w.id = iex.warehouse_id
        WHERE iex.product_id = ANY(_product_ids)
    ),
    ranked_events AS (
        SELECT
            pe.product_id,
            pe.event,
            ROW_NUMBER() OVER (PARTITION BY pe.product_id ORDER BY pe.event_date DESC) AS rn
        FROM product_events pe
    ),
    aggregated_events AS (
        SELECT
            re.product_id,
            jsonb_agg(re.event ORDER BY (re.event->>'date')::timestamptz DESC) AS events
        FROM ranked_events re
        WHERE re.rn <= events_limit
        GROUP BY re.product_id
    )
    SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.sku AS product_sku,
        p.barcode AS product_barcode,
        COALESCE(ae.events, '[]'::jsonb) AS events
    FROM public.products p
    LEFT JOIN aggregated_events ae ON ae.product_id = p.id
    WHERE p.id = ANY(_product_ids)
      AND p.deleted_at IS NULL;
END;
$function$;
