-- ============================================================
-- Verificación — patch renovación con cuotas parciales
-- Ejecutar en Supabase SQL Editor después de aplicar:
--   1. patch_renovacion_cuotas_parciales.sql
--   2. patch_v_cuotas_pendientes_activos.sql
-- ============================================================

-- 1) renovar_prestamo cierra cuotas con pagos (UPDATE) en lugar de DELETE ciego
SELECT
  CASE
    WHEN pg_get_functiondef(p.oid) ILIKE '%EXISTS (%'
     AND pg_get_functiondef(p.oid) ILIKE '%FROM pagos p%'
     AND pg_get_functiondef(p.oid) ILIKE '%estado     = ''pagada''%'
    THEN 'OK'
    ELSE 'FALTA — ejecutar patch_renovacion_cuotas_parciales.sql'
  END AS patch_renovacion_cuotas_parciales
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'renovar_prestamo'
ORDER BY p.oid DESC
LIMIT 1;

-- 2) v_cuotas_pendientes filtra solo préstamos activos
SELECT
  CASE
    WHEN pg_get_viewdef('v_cuotas_pendientes'::regclass, true) ILIKE '%estado = ''activo''%'
    THEN 'OK'
    ELSE 'FALTA — ejecutar patch_v_cuotas_pendientes_activos.sql'
  END AS patch_v_cuotas_pendientes_activos;

-- 3) Resumen de cuotas parciales en préstamos activos (diagnóstico previo a renovar)
SELECT
  p.id AS prestamo_id,
  cl.nombre || ' ' || cl.apellido AS cliente,
  c.numero_cuota,
  c.estado AS cuota_estado,
  c.capital,
  COUNT(pg.id) FILTER (WHERE NOT pg.anulado) AS pagos_vigentes
FROM prestamos p
JOIN cuotas c ON c.prestamo_id = p.id
JOIN clientes cl ON cl.id = p.cliente_id
LEFT JOIN pagos pg ON pg.cuota_id = c.id
WHERE p.estado = 'activo'
  AND c.estado = 'parcial'
GROUP BY p.id, cl.nombre, cl.apellido, c.numero_cuota, c.estado, c.capital
ORDER BY cl.apellido, c.numero_cuota;
