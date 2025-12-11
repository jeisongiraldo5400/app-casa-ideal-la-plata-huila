-- ============================================================================
-- RPC: get_orders_for_return
-- Devuelve órdenes disponibles para devolución usando EXISTS subqueries
-- Evita problemas N+1 filtrando en una sola query
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_orders_for_return(
    return_type_param text
)
RETURNS TABLE (
    id uuid,
    order_number text,
    display_name text
)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
    IF return_type_param = 'purchase_order' THEN
        RETURN QUERY
        SELECT
            po.id,
            po.order_number,
            COALESCE(po.order_number, 'OC-' || SUBSTRING(po.id::text, 1, 8)) AS display_name
        FROM public.purchase_orders po
        WHERE po.status IN ('approved', 'received')
          AND po.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 
              FROM public.inventory_entries ie
              WHERE ie.purchase_order_id = po.id
          )
        ORDER BY po.created_at DESC;
        
    ELSIF return_type_param = 'delivery_order' THEN
        RETURN QUERY
        SELECT
            dord.id,
            dord.order_number,
            COALESCE(dord.order_number, 'OE-' || SUBSTRING(dord.id::text, 1, 8)) AS display_name
        FROM public.delivery_orders dord
        WHERE dord.status IN ('approved', 'delivered')
          AND dord.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 
              FROM public.inventory_exits iex
              WHERE iex.delivery_order_id = dord.id
          )
        ORDER BY dord.created_at DESC;
    ELSE
        -- Retornar vacío si el tipo no es válido
        RETURN;
    END IF;
END;
$function$;

COMMENT ON FUNCTION public.get_orders_for_return(text) IS 
    'Devuelve órdenes disponibles para devolución usando EXISTS subqueries. Evita problemas N+1.';

