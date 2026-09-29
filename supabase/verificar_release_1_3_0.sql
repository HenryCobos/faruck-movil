-- ============================================================
-- Verificación post-parches Release 1.3.0
-- Ejecutar DESPUÉS de (en orden):
--   1. patch_frecuencia_cobro.sql
--   2. patch_cronograma_manual.sql
--   3. patch_contratos_adjuntos.sql
-- ============================================================

-- Columnas esperadas en prestamos
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'prestamos'
  AND column_name IN (
    'frecuencia_cobro',
    'origen_cronograma',
    'cronograma_manual',
    'contratos_adjuntos',
    'contrato_url'
  )
ORDER BY column_name;

-- Frecuencia: existentes deben quedar en mensual (default)
SELECT
  COUNT(*) AS total_prestamos,
  COUNT(*) FILTER (WHERE frecuencia_cobro = 'mensual') AS frecuencia_mensual,
  COUNT(*) FILTER (WHERE origen_cronograma = 'calculado') AS cronograma_calculado
FROM prestamos;

-- Contratos: migración contrato_url → array
SELECT
  COUNT(*) FILTER (WHERE contrato_url IS NOT NULL AND btrim(contrato_url) <> '') AS con_contrato_url,
  COUNT(*) FILTER (WHERE jsonb_array_length(contratos_adjuntos) > 0) AS con_adjuntos_json,
  COUNT(*) FILTER (
    WHERE contrato_url IS NOT NULL AND btrim(contrato_url) <> ''
      AND jsonb_array_length(contratos_adjuntos) = 0
  ) AS url_sin_migrar
FROM prestamos;

-- Funciones clave presentes
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'generar_cronograma',
    'aplicar_abono_capital',
    'renovar_prestamo',
    'fecha_cuota_cobro',
    'assert_cronograma_manual_valido',
    'validar_cronograma_manual'
  )
ORDER BY routine_name;
