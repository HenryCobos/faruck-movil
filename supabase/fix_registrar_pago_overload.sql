-- ============================================================
-- Fix: eliminar overload viejo de registrar_pago (sin saldo_pendiente)
-- Ejecutar en Supabase SQL Editor
--
-- PASO 1: Ejecuta primero patch_registrar_pago_saldo_pendiente.sql
-- PASO 2: Ejecuta este script
-- ============================================================

-- Eliminar la versión antigua de 6 parámetros (sin p_fecha_pago)
DROP FUNCTION IF EXISTS public.registrar_pago(
  uuid, uuid, numeric, numeric, metodo_pago, text
);

-- Verificar: debe quedar UNA sola fila con estado OK
SELECT
  p.proname AS funcion,
  pg_get_function_identity_arguments(p.oid) AS argumentos,
  CASE WHEN pg_get_functiondef(p.oid) ILIKE '%saldo_pendiente%'
       THEN 'OK' ELSE 'FALTA — ejecutar patch_registrar_pago_saldo_pendiente.sql'
  END AS estado
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'registrar_pago';
