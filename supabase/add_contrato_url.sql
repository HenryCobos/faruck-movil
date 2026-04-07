-- ============================================================
-- PIGNORA — Agregar columna contrato_url a préstamos
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

ALTER TABLE prestamos
  ADD COLUMN IF NOT EXISTS contrato_url text;

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'prestamos' AND column_name = 'contrato_url';
