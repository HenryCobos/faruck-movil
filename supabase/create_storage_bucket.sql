-- ============================================================
-- PIGNORA — Crear bucket pignora-fotos en Supabase Storage
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Crear el bucket (público para que las URLs sean accesibles directamente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pignora-fotos',
  'pignora-fotos',
  true,
  20971520,  -- 20 MB máximo por archivo
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'application/pdf'
  ];

-- 2. Políticas RLS para storage.objects
DROP POLICY IF EXISTS "pignora_fotos_select"  ON storage.objects;
DROP POLICY IF EXISTS "pignora_fotos_insert"  ON storage.objects;
DROP POLICY IF EXISTS "pignora_fotos_update"  ON storage.objects;
DROP POLICY IF EXISTS "pignora_fotos_delete"  ON storage.objects;

-- Lectura pública (URLs de fotos y contratos accesibles sin autenticación)
CREATE POLICY "pignora_fotos_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'pignora-fotos');

-- Subida: solo usuarios autenticados y activos
CREATE POLICY "pignora_fotos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pignora-fotos'
    AND (SELECT is_active_user())
  );

-- Actualización: admin y oficial
CREATE POLICY "pignora_fotos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pignora-fotos'
    AND (SELECT get_my_role()) IN ('admin', 'oficial')
  );

-- Eliminación: solo admin
CREATE POLICY "pignora_fotos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'pignora-fotos'
    AND (SELECT get_my_role()) = 'admin'
  );

-- 3. Verificación
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'pignora-fotos';
