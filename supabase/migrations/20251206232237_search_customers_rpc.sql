-- ============================================================================
-- RPC: search_customers
-- Búsqueda optimizada de clientes para autocomplete (solo nombre e id_number)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.search_customers(
    search_term text DEFAULT ''::text,
    limit_count integer DEFAULT 20
)
RETURNS TABLE (
    id uuid,
    name text,
    id_number text,
    address text
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    _search text := COALESCE(LOWER(TRIM(search_term)), '');
    _limit integer := GREATEST(COALESCE(limit_count, 20), 1);
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.name::text,
        c.id_number::text,
        c.address::text
    FROM public.customers c
    WHERE c.deleted_at IS NULL
      AND (
        _search = ''
        OR LOWER(c.name) LIKE '%' || _search || '%'
        OR LOWER(c.id_number) LIKE '%' || _search || '%'
      )
    ORDER BY c.name ASC
    LIMIT _limit;
END;
$function$;

COMMENT ON FUNCTION public.search_customers(text, integer) IS
    'Búsqueda optimizada de clientes por nombre o número de identificación para autocomplete. Usa índices idx_customers_name e idx_customers_id_number.';
