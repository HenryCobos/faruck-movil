-- ============================================================
-- PIGNORA — Reset completo de CRÉDITOS (cartera principal)
-- ============================================================
--
-- OBJETIVO
--   Borrar TODOS los créditos (prestamos) y su historial operativo:
--   cuotas, pagos/cobros, abonos a capital y asientos contables.
--   Deja en cero: dashboard, cartera, cobros, reportes y contabilidad
--   de la cartera principal.
--
-- SE CONSERVA (no se toca)
--   · clientes
--   · garantías (solo se liberan las que estaban en_garantia)
--   · cadenas_ahorro, cadena_puestos, cadena_rondas
--   · prestamos_personales, cuotas_prestamo_personal, pagos_prestamo_personal
--   · profiles, configuracion, plan_cuentas (estructura contable)
--
-- ⚠️  ANTES DE EJECUTAR
--   1. Hacer backup en Supabase: Project Settings → Database → Backups
--   2. Ejecutar en horario de baja actividad (nadie cobrando)
--   3. Correr primero SOLO el bloque "CONTEO PREVIO" y revisar números
--   4. Luego ejecutar el bloque "BORRADO" y revisar "CONTEO POSTERIOR"
--   5. Si algo no cuadra: ROLLBACK; (no COMMIT)
--
-- NOTA: Los PDF de contratos en Storage (bucket pignora-fotos/contratos/)
--       NO se borran con este script. Supabase bloquea DELETE en storage.objects.
--       Opciones:
--         A) Dashboard → Storage → pignora-fotos → contratos → seleccionar todo → Delete
--         B) node scripts/borrar-contratos-storage.mjs  (ver script en /scripts)
-- ============================================================


-- ── CONTEO PREVIO ───────────────────────────────────────────
SELECT 'ANTES' AS momento, 'prestamos' AS tabla, COUNT(*) AS total FROM prestamos
UNION ALL SELECT 'ANTES', 'cuotas',           COUNT(*) FROM cuotas
UNION ALL SELECT 'ANTES', 'pagos',            COUNT(*) FROM pagos
UNION ALL SELECT 'ANTES', 'abonos_capital',   COUNT(*) FROM abonos_capital
UNION ALL SELECT 'ANTES', 'asientos_contables', COUNT(*) FROM asientos_contables
UNION ALL SELECT 'ANTES', 'garantias en_garantia', COUNT(*) FROM garantias WHERE estado = 'en_garantia'
-- Lo que NO debe cambiar:
UNION ALL SELECT 'ANTES', 'clientes',         COUNT(*) FROM clientes
UNION ALL SELECT 'ANTES', 'prestamos_personales', COUNT(*) FROM prestamos_personales
UNION ALL SELECT 'ANTES', 'cadenas_ahorro',   COUNT(*) FROM cadenas_ahorro
ORDER BY tabla;


-- ── BORRADO (descomenta BEGIN/COMMIT cuando estés listo) ──────

BEGIN;

-- 1. Romper auto-referencia de renovaciones (prestamo_padre_id)
UPDATE prestamos SET prestamo_padre_id = NULL WHERE prestamo_padre_id IS NOT NULL;

-- 2. Contabilidad: todos los movimientos (solo los genera la cartera de créditos)
DELETE FROM asientos_contables;

-- 3. Cobros: vigentes Y anulados (no debe quedar ningún registro de cobro)
DELETE FROM pagos;

-- 4. Abonos a capital (por si algún FK impide el cascade)
DELETE FROM abonos_capital;

-- 5. Créditos + cuotas (cuotas caen en CASCADE)
DELETE FROM prestamos;

-- 6. Liberar garantías que quedaron bloqueadas por créditos
UPDATE garantias
SET    estado = 'disponible'
WHERE  estado = 'en_garantia';

-- 7. (Opcional) Clientes marcados morosos por la cartera anterior
UPDATE clientes
SET    estado = 'activo'
WHERE  estado = 'moroso';

-- 8. (Opcional) Limpiar auditoría de operaciones de créditos
-- DELETE FROM auditoria
-- WHERE tabla IN ('prestamos', 'cuotas', 'pagos', 'abonos_capital', 'asientos_contables');

COMMIT;


-- ── CONTEO POSTERIOR (debe dar 0 en tablas de créditos) ───────
SELECT 'DESPUES' AS momento, 'prestamos' AS tabla, COUNT(*) AS total FROM prestamos
UNION ALL SELECT 'DESPUES', 'cuotas',           COUNT(*) FROM cuotas
UNION ALL SELECT 'DESPUES', 'pagos',            COUNT(*) FROM pagos
UNION ALL SELECT 'DESPUES', 'abonos_capital',   COUNT(*) FROM abonos_capital
UNION ALL SELECT 'DESPUES', 'asientos_contables', COUNT(*) FROM asientos_contables
UNION ALL SELECT 'DESPUES', 'garantias en_garantia', COUNT(*) FROM garantias WHERE estado = 'en_garantia'
UNION ALL SELECT 'DESPUES', 'clientes',         COUNT(*) FROM clientes
UNION ALL SELECT 'DESPUES', 'prestamos_personales', COUNT(*) FROM prestamos_personales
UNION ALL SELECT 'DESPUES', 'cadenas_ahorro',   COUNT(*) FROM cadenas_ahorro
ORDER BY tabla;
