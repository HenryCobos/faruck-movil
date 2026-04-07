-- ============================================================
-- PIGNORA — Corrección de estado de garantías
-- Ejecutar en el SQL Editor de Supabase
--
-- Problema: garantías vinculadas a préstamos activos/aprobados/solicitados
-- seguían mostrando estado 'disponible'.
-- ============================================================

-- 1. Marcar como 'en_garantia' toda garantía que tenga un préstamo
--    en estado solicitado, aprobado o activo
UPDATE garantias
SET estado = 'en_garantia'
WHERE id IN (
  SELECT DISTINCT garantia_id
  FROM prestamos
  WHERE estado IN ('solicitado', 'aprobado', 'activo')
)
AND estado = 'disponible';

-- 2. Liberar garantías cuyo préstamo fue cancelado/ejecutado y siguen bloqueadas
--    (solo si NO tienen otro préstamo activo apuntando a ellas)
UPDATE garantias
SET estado = 'disponible'
WHERE id IN (
  SELECT DISTINCT garantia_id
  FROM prestamos
  WHERE estado IN ('cancelado', 'ejecutado')
)
AND id NOT IN (
  SELECT DISTINCT garantia_id
  FROM prestamos
  WHERE estado IN ('solicitado', 'aprobado', 'activo')
)
AND estado = 'en_garantia';

-- Verificación
SELECT
  g.id,
  g.descripcion,
  g.estado AS estado_garantia,
  p.estado AS estado_prestamo
FROM garantias g
LEFT JOIN prestamos p ON p.garantia_id = g.id
ORDER BY g.created_at;
