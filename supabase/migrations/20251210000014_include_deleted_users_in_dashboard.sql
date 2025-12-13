-- ============================================================================
-- Modificar get_users_dashboard para incluir usuarios eliminados
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_users_dashboard(
    search_term text DEFAULT ''::text,
    page integer DEFAULT 1,
    page_size integer DEFAULT 5
)
RETURNS TABLE (
    id uuid,
    email text,
    full_name text,
    avatar_url text,
    deleted_at timestamptz,
    created_at timestamptz,
    roles jsonb,
    total_count bigint
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    _limit integer := GREATEST(COALESCE(page_size, 5), 1);
    _offset integer := GREATEST((COALESCE(page, 1) - 1) * _limit, 0);
    _search text := COALESCE(search_term, '');
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            p.id,
            p.email,
            p.full_name,
            p.avatar_url,
            p.deleted_at,
            p.created_at
        FROM public.profiles p
        WHERE (
            _search = ''
            OR p.full_name ILIKE '%' || _search || '%'
            OR p.email ILIKE '%' || _search || '%'
        )
    ),
    enriched AS (
        SELECT
            f.*,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'id', r.id,
                        'nombre', r.nombre
                    )
                ) FILTER (WHERE r.id IS NOT NULL),
                '[]'::jsonb
            ) AS roles
        FROM filtered f
        LEFT JOIN public.user_roles ur ON ur.user_id = f.id
        LEFT JOIN public.roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
        GROUP BY
            f.id,
            f.email,
            f.full_name,
            f.avatar_url,
            f.deleted_at,
            f.created_at
    ),
    numbered AS (
        SELECT
            e.*,
            COUNT(*) OVER () AS total_count,
            ROW_NUMBER() OVER (ORDER BY e.deleted_at NULLS FIRST, e.created_at DESC) AS row_number
        FROM enriched e
        -- Removido el filtro WHERE e.deleted_at IS NULL para incluir usuarios eliminados
    )
    SELECT
        n.id,
        n.email,
        n.full_name,
        n.avatar_url,
        n.deleted_at,
        n.created_at,
        n.roles,
        n.total_count
    FROM numbered n
    WHERE n.row_number > _offset
    ORDER BY n.row_number
    LIMIT _limit;
END;
$function$;

COMMENT ON FUNCTION public.get_users_dashboard(text, integer, integer) IS
    'Devuelve usuarios con roles agregados y total_count, incluyendo usuarios eliminados. Ordena primero usuarios activos, luego eliminados.';
