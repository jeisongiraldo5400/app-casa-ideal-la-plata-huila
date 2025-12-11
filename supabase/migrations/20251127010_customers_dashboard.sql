-- ============================================================================
-- RPC: get_customers_dashboard
-- Devuelve clientes con estadísticas agregadas (salidas) y total_count
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_customers_dashboard(
    search_term text DEFAULT ''::text,
    page integer DEFAULT 1,
    page_size integer DEFAULT 5
)
RETURNS TABLE (
    id uuid,
    name text,
    id_number text,
    email text,
    phone text,
    address text,
    notes text,
    created_at timestamptz,
    created_by uuid,
    created_by_name text,
    total_exits bigint,
    last_exit_date timestamptz,
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
            c.id,
            c.name,
            c.id_number,
            c.email,
            c.phone,
            c.address,
            c.notes,
            c.created_at,
            c.created_by
        FROM public.customers c
        WHERE c.deleted_at IS NULL
          AND (
            _search = ''
            OR LOWER(c.name) LIKE '%' || _search || '%'
            OR LOWER(c.id_number) LIKE '%' || _search || '%'
            OR LOWER(COALESCE(c.email, '')) LIKE '%' || _search || '%'
            OR LOWER(COALESCE(c.phone, '')) LIKE '%' || _search || '%'
          )
    ),
    enriched AS (
        SELECT
            f.*,
            pr.full_name AS created_by_name,
            COALESCE(exit_stats.total_exits, 0)::bigint AS total_exits,
            exit_stats.last_exit_date
        FROM filtered f
        LEFT JOIN public.profiles pr ON pr.id = f.created_by
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*)::bigint AS total_exits,
                MAX(ie.created_at) AS last_exit_date
            FROM public.inventory_exits ie
            WHERE ie.delivered_to_customer_id = f.id
        ) exit_stats ON true
    ),
    numbered AS (
        SELECT
            e.*,
            COUNT(*) OVER () AS total_count,
            ROW_NUMBER() OVER (ORDER BY e.created_at DESC) AS row_number
        FROM enriched e
    )
    SELECT
        n.id,
        n.name::text,
        n.id_number::text,
        n.email::text,
        n.phone::text,
        n.address::text,
        n.notes::text,
        n.created_at,
        n.created_by,
        n.created_by_name::text,
        n.total_exits,
        n.last_exit_date,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$function$;

COMMENT ON FUNCTION public.get_customers_dashboard(text, integer, integer) IS
    'Devuelve clientes con estadísticas agregadas (total de salidas, última salida) en una sola consulta optimizada.';

-- ============================================================================
-- RPC: get_customers_stats
-- Calcula estadísticas globales de clientes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_customers_stats()
RETURNS TABLE (
    total_customers bigint,
    customers_with_exits bigint,
    customers_without_exits bigint,
    total_exits_to_customers bigint
)
LANGUAGE sql
STABLE
AS $function$
WITH customer_exits AS (
    SELECT
        c.id AS customer_id,
        COUNT(ie.id) AS exit_count
    FROM public.customers c
    LEFT JOIN public.inventory_exits ie ON ie.delivered_to_customer_id = c.id
    WHERE c.deleted_at IS NULL
    GROUP BY c.id
)
SELECT
    COUNT(DISTINCT ce.customer_id) AS total_customers,
    COUNT(DISTINCT ce.customer_id) FILTER (WHERE ce.exit_count > 0) AS customers_with_exits,
    COUNT(DISTINCT ce.customer_id) FILTER (WHERE ce.exit_count = 0) AS customers_without_exits,
    COALESCE(SUM(ce.exit_count), 0)::bigint AS total_exits_to_customers
FROM customer_exits ce;
$function$;

COMMENT ON FUNCTION public.get_customers_stats() IS
    'Calcula estadísticas globales de clientes en una sola consulta agregada.';

-- ============================================================================
-- Índices para optimizar búsquedas y filtros
-- ============================================================================

-- Índice para filtrar clientes activos (deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at 
    ON public.customers(deleted_at) 
    WHERE deleted_at IS NULL;

-- Índice para búsqueda por nombre (usando B-tree para ILIKE)
CREATE INDEX IF NOT EXISTS idx_customers_name 
    ON public.customers(name);

-- Índice para búsqueda por número de identificación
CREATE INDEX IF NOT EXISTS idx_customers_id_number 
    ON public.customers(id_number);

-- Índice para búsqueda por email (si se usa frecuentemente)
CREATE INDEX IF NOT EXISTS idx_customers_email 
    ON public.customers(email) 
    WHERE email IS NOT NULL;

-- Índice para búsqueda por teléfono
CREATE INDEX IF NOT EXISTS idx_customers_phone 
    ON public.customers(phone) 
    WHERE phone IS NOT NULL;

-- Índice para filtrar por creador (si se usa)
CREATE INDEX IF NOT EXISTS idx_customers_created_by 
    ON public.customers(created_by) 
    WHERE created_by IS NOT NULL;

-- Índice para optimizar joins con inventory_exits
CREATE INDEX IF NOT EXISTS idx_inventory_exits_delivered_to_customer_id 
    ON public.inventory_exits(delivered_to_customer_id) 
    WHERE delivered_to_customer_id IS NOT NULL;

-- Nota: Si se necesita búsqueda de texto más avanzada con ILIKE, 
-- se puede habilitar la extensión pg_trgm y usar índices GIN:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON public.customers USING gin(name gin_trgm_ops);

