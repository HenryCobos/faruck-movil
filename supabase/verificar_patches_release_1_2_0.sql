-- ============================================================
-- Verificación rápida — patches requeridos para release 1.2.0
-- Ejecutar en Supabase SQL Editor (solo lectura)
-- ============================================================

-- 1) Saldo pendiente en registrar_pago
SELECT
  CASE WHEN pg_get_functiondef(p.oid) ILIKE '%saldo_pendiente%'
       THEN 'OK' ELSE 'FALTA — ejecutar patch_registrar_pago_saldo_pendiente.sql'
  END AS patch_saldo_pendiente
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'registrar_pago';

-- 2) Liquidación en aplicar_abono_capital
SELECT
  CASE WHEN pg_get_functiondef(p.oid) ILIKE '%prestamo_cancelado%'
       THEN 'OK' ELSE 'FALTA — ejecutar patch_abono_capital_liquidacion.sql'
  END AS patch_liquidacion_abono
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'aplicar_abono_capital';

-- 3) RLS compartido cadenas / préstamos personales (política is_active_user)
SELECT
  CASE WHEN COUNT(*) >= 6 THEN 'OK (' || COUNT(*) || ' políticas)'
       ELSE 'FALTA — ejecutar fix_rls_cadenas_prestamos_personales.sql'
  END AS patch_rls_compartido
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'cadenas_ahorro', 'cadena_puestos', 'cadena_rondas',
    'prestamos_personales', 'pagos_prestamo_personal', 'cuotas_prestamo_personal'
  )
  AND qual ILIKE '%is_active_user%';

-- 4) Tablas base de módulos nuevos
SELECT 'cadenas_ahorro' AS tabla, COUNT(*) AS registros FROM cadenas_ahorro
UNION ALL SELECT 'prestamos_personales', COUNT(*) FROM prestamos_personales
UNION ALL SELECT 'abonos_capital (tabla)', COUNT(*) FROM abonos_capital;
