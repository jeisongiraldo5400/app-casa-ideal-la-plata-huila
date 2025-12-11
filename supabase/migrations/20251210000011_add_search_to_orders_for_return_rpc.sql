-- ============================================================================
-- MIGRACIÓN: Agregar búsqueda a get_orders_for_return
-- Descripción: Actualiza la función RPC para permitir búsqueda por número de orden
--               o display_name, facilitando la selección cuando hay muchas órdenes.
-- Fecha: 2025-12-10
-- ============================================================================

-- Actualizar la función RPC get_orders_for_return para incluir búsqueda
CREATE OR REPLACE FUNCTION public.get_orders_for_return(
    return_type_param text,
    search_term text DEFAULT ''
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
          AND (
              search_term = ''
              OR LOWER(po.order_number) LIKE '%' || LOWER(search_term) || '%'
              OR LOWER(COALESCE(po.order_number, 'OC-' || SUBSTRING(po.id::text, 1, 8))) LIKE '%' || LOWER(search_term) || '%'
              OR po.id::text LIKE '%' || search_term || '%'
          )
        ORDER BY po.created_at DESC
        LIMIT 50; -- Limitar resultados para mejor rendimiento
        
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
          AND (
              search_term = ''
              OR LOWER(dord.order_number) LIKE '%' || LOWER(search_term) || '%'
              OR LOWER(COALESCE(dord.order_number, 'OE-' || SUBSTRING(dord.id::text, 1, 8))) LIKE '%' || LOWER(search_term) || '%'
              OR dord.id::text LIKE '%' || search_term || '%'
          )
        ORDER BY dord.created_at DESC
        LIMIT 50; -- Limitar resultados para mejor rendimiento
    ELSE
        -- Retornar vacío si el tipo no es válido
        RETURN;
    END IF;
END;
$function$;

COMMENT ON FUNCTION public.get_orders_for_return(text, text) IS 
    'Devuelve órdenes disponibles para devolución con búsqueda. Incluye todas las órdenes con productos recibidos/entregados, excepto las canceladas. Permite buscar por número de orden o ID. Limita resultados a 50 para mejor rendimiento.';
