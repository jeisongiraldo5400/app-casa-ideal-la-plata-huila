-- Bucket para firmas de negocios (cliente / fiador / vendedor)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'negocios-firmas',
  'negocios-firmas',
  true,
  1048576, -- 1 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Lectura pública (las URLs se muestran en el detalle del negocio)
DROP POLICY IF EXISTS "negocios_firmas_public_read" ON storage.objects;
CREATE POLICY "negocios_firmas_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'negocios-firmas');

-- Subida: admin o vendedor autenticado
DROP POLICY IF EXISTS "negocios_firmas_auth_insert" ON storage.objects;
CREATE POLICY "negocios_firmas_auth_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'negocios-firmas'
  AND public.is_admin_or_vendedor()
);

-- Actualización / reemplazo de firma
DROP POLICY IF EXISTS "negocios_firmas_auth_update" ON storage.objects;
CREATE POLICY "negocios_firmas_auth_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'negocios-firmas'
  AND public.is_admin_or_vendedor()
)
WITH CHECK (
  bucket_id = 'negocios-firmas'
  AND public.is_admin_or_vendedor()
);

-- Borrado opcional
DROP POLICY IF EXISTS "negocios_firmas_auth_delete" ON storage.objects;
CREATE POLICY "negocios_firmas_auth_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'negocios-firmas'
  AND public.is_admin_or_vendedor()
);
