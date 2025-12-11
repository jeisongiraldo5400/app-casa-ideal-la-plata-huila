-- ============================================================================
-- MIGRACIÓN: Actualizar get_orders_for_return para incluir todos los estados
-- Descripción: Actualiza la función RPC para incluir todas las órdenes con 
--               productos recibidos/entregados, excepto las canceladas.
--               Esto permite devolver productos de órdenes pendientes, aprobadas
--               y recibidas (para purchase orders) o pendientes y aprobadas (para delivery orders).
-- Fecha: 2025-12-10
-- ============================================================================

-- Actualizar la función RPC get_orders_for_return
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
        WHERE po.status != 'cancelled'
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
        WHERE dord.status != 'cancelled'
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
    'Devuelve órdenes disponibles para devolución. Incluye todas las órdenes con productos recibidos/entregados, excepto las canceladas. Permite devolver productos de órdenes en cualquier estado (pending, approved, received) siempre que tengan productos recibidos/entregados.';
