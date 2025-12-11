-- ============================================================================
-- RPC: get_users_dashboard
-- Devuelve usuarios con roles agregados y total_count
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
            ROW_NUMBER() OVER (ORDER BY e.created_at DESC) AS row_number
        FROM enriched e
        WHERE e.deleted_at IS NULL
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
    'Devuelve usuarios con roles agregados y total_count, filtrando por nombre/email/rol.';

-- ============================================================================
-- RPC: get_users_stats
-- Devuelve totales agregados del módulo de usuarios
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_users_stats()
RETURNS TABLE (
    total bigint,
    active bigint,
    admins bigint,
    bodegueros bigint,
    vendedores bigint
)
LANGUAGE sql
STABLE
AS $function$
WITH base AS (
    SELECT
        p.id,
        p.deleted_at,
        ARRAY_REMOVE(
            ARRAY_AGG(LOWER(r.nombre)) FILTER (WHERE r.id IS NOT NULL),
            NULL
        ) AS role_names
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
    GROUP BY p.id, p.deleted_at
)
SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE b.deleted_at IS NULL) AS active,
    COUNT(*) FILTER (WHERE 'admin' = ANY(role_names)) AS admins,
    COUNT(*) FILTER (WHERE 'bodeguero' = ANY(role_names)) AS bodegueros,
    COUNT(*) FILTER (WHERE 'vendedor' = ANY(role_names)) AS vendedores
FROM base b;
$function$;

COMMENT ON FUNCTION public.get_users_stats() IS
    'Calcula totales de usuarios, activos y por rol en una sola consulta.';

