-- ============================================================
-- PIGNORA APP — Políticas DELETE faltantes
-- Ejecutar en SQL Editor de Supabase
-- ============================================================

-- ── prestamos: solo admin puede eliminar ─────────────────────
DROP POLICY IF EXISTS "Solo admin elimina prestamos" ON prestamos;
CREATE POLICY "Solo admin elimina prestamos"
  ON prestamos FOR DELETE
  USING (get_my_role() = 'admin');

-- ── cuotas: solo admin puede eliminar (el CASCADE de prestamos
--    lo necesita, pero también para borrado manual si aplica) ──
DROP POLICY IF EXISTS "Solo admin elimina cuotas" ON cuotas;
CREATE POLICY "Solo admin elimina cuotas"
  ON cuotas FOR DELETE
  USING (get_my_role() = 'admin');

-- ── garantias: solo admin puede eliminar ─────────────────────
DROP POLICY IF EXISTS "Solo admin elimina garantias" ON garantias;
CREATE POLICY "Solo admin elimina garantias"
  ON garantias FOR DELETE
  USING (get_my_role() = 'admin');

-- ── clientes: política ya existía, recrear por consistencia ───
DROP POLICY IF EXISTS "Solo admin elimina clientes" ON clientes;
CREATE POLICY "Solo admin elimina clientes"
  ON clientes FOR DELETE
  USING (get_my_role() = 'admin');

-- ── pagos: solo admin puede eliminar ─────────────────────────
-- Necesario para limpiar pagos antes de borrar un préstamo
DROP POLICY IF EXISTS "Solo admin elimina pagos" ON pagos;
CREATE POLICY "Solo admin elimina pagos"
  ON pagos FOR DELETE
  USING (get_my_role() = 'admin');

-- ── asientos_contables: solo admin puede eliminar ─────────────
DROP POLICY IF EXISTS "Solo admin elimina asientos" ON asientos_contables;
CREATE POLICY "Solo admin elimina asientos"
  ON asientos_contables FOR DELETE
  USING (get_my_role() = 'admin');
