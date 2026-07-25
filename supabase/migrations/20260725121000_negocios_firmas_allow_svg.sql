-- Permitir SVG (firmas desde app móvil)
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml'
]
WHERE id = 'negocios-firmas';
