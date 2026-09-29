-- ============================================================
-- PIGNORA — Hasta 5 documentos de contrato / acuerdo por préstamo
-- Ejecutar en Supabase SQL Editor.
-- Mantiene contrato_url sincronizado con el primer adjunto (legacy).
-- ============================================================

ALTER TABLE prestamos
  ADD COLUMN IF NOT EXISTS contratos_adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migrar contrato_url existente al array (solo filas aún vacías)
UPDATE prestamos
SET contratos_adjuntos = jsonb_build_array(
  jsonb_build_object(
    'url', contrato_url,
    'nombre', 'Contrato',
    'created_at', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
)
WHERE contrato_url IS NOT NULL
  AND btrim(contrato_url) <> ''
  AND (contratos_adjuntos IS NULL OR contratos_adjuntos = '[]'::jsonb);

-- Red de seguridad: máximo 5 documentos
ALTER TABLE prestamos
  DROP CONSTRAINT IF EXISTS prestamos_contratos_adjuntos_max_5;

ALTER TABLE prestamos
  ADD CONSTRAINT prestamos_contratos_adjuntos_max_5
  CHECK (jsonb_array_length(contratos_adjuntos) <= 5);
