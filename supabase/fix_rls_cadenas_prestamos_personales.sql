-- ============================================================
-- PIGNORA — Cadenas de Ahorro & Préstamos Personales:
--           Visibilidad compartida entre todos los usuarios
--
-- Problema: Las políticas RLS originales filtraban por
--   user_id = auth.uid(), por lo que cada usuario solo veía
--   sus propios registros.
--
-- Solución: Reemplazar por el mismo patrón del resto de la app:
--   SELECT → is_active_user() = true  (todos los usuarios activos ven todo)
--   INSERT → is_active_user() = true  (cualquier usuario activo puede crear)
--   UPDATE → is_active_user() = true  (cualquier usuario activo puede editar)
--   DELETE → get_my_role() = 'admin'  (solo admin puede eliminar)
--
-- El campo user_id se conserva en las tablas para auditoría
-- (saber quién creó el registro), pero deja de ser el filtro
-- de visibilidad.
--
-- Tablas afectadas:
--   cadenas_ahorro, cadena_puestos, cadena_rondas
--   prestamos_personales, pagos_prestamo_personal,
--   cuotas_prestamo_personal
-- ============================================================


-- ─── 1. cadenas_ahorro ───────────────────────────────────────

DROP POLICY IF EXISTS "cadenas_ahorro_own_all" ON cadenas_ahorro;

CREATE POLICY "cadenas_ahorro_select"
  ON cadenas_ahorro FOR SELECT TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "cadenas_ahorro_insert"
  ON cadenas_ahorro FOR INSERT TO authenticated
  WITH CHECK (is_active_user() = true);

CREATE POLICY "cadenas_ahorro_update"
  ON cadenas_ahorro FOR UPDATE TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "cadenas_ahorro_delete"
  ON cadenas_ahorro FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');


-- ─── 2. cadena_puestos ───────────────────────────────────────

DROP POLICY IF EXISTS "cadena_puestos_own_all" ON cadena_puestos;

CREATE POLICY "cadena_puestos_select"
  ON cadena_puestos FOR SELECT TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "cadena_puestos_insert"
  ON cadena_puestos FOR INSERT TO authenticated
  WITH CHECK (is_active_user() = true);

CREATE POLICY "cadena_puestos_update"
  ON cadena_puestos FOR UPDATE TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "cadena_puestos_delete"
  ON cadena_puestos FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');


-- ─── 3. cadena_rondas ────────────────────────────────────────

DROP POLICY IF EXISTS "cadena_rondas_own_all" ON cadena_rondas;

CREATE POLICY "cadena_rondas_select"
  ON cadena_rondas FOR SELECT TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "cadena_rondas_insert"
  ON cadena_rondas FOR INSERT TO authenticated
  WITH CHECK (is_active_user() = true);

CREATE POLICY "cadena_rondas_update"
  ON cadena_rondas FOR UPDATE TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "cadena_rondas_delete"
  ON cadena_rondas FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');


-- ─── 4. prestamos_personales ─────────────────────────────────

DROP POLICY IF EXISTS "pp_own_all" ON prestamos_personales;

CREATE POLICY "pp_select"
  ON prestamos_personales FOR SELECT TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "pp_insert"
  ON prestamos_personales FOR INSERT TO authenticated
  WITH CHECK (is_active_user() = true);

CREATE POLICY "pp_update"
  ON prestamos_personales FOR UPDATE TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "pp_delete"
  ON prestamos_personales FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');


-- ─── 5. pagos_prestamo_personal ──────────────────────────────

DROP POLICY IF EXISTS "pago_pp_own_all" ON pagos_prestamo_personal;

CREATE POLICY "pago_pp_select"
  ON pagos_prestamo_personal FOR SELECT TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "pago_pp_insert"
  ON pagos_prestamo_personal FOR INSERT TO authenticated
  WITH CHECK (is_active_user() = true);

CREATE POLICY "pago_pp_update"
  ON pagos_prestamo_personal FOR UPDATE TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "pago_pp_delete"
  ON pagos_prestamo_personal FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');


-- ─── 6. cuotas_prestamo_personal ─────────────────────────────

DROP POLICY IF EXISTS "cuotas_pp_own_all" ON cuotas_prestamo_personal;

CREATE POLICY "cuotas_pp_select"
  ON cuotas_prestamo_personal FOR SELECT TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "cuotas_pp_insert"
  ON cuotas_prestamo_personal FOR INSERT TO authenticated
  WITH CHECK (is_active_user() = true);

CREATE POLICY "cuotas_pp_update"
  ON cuotas_prestamo_personal FOR UPDATE TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "cuotas_pp_delete"
  ON cuotas_prestamo_personal FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');


-- ─── VERIFICACIÓN ────────────────────────────────────────────
-- Confirma que las políticas nuevas quedaron registradas

SELECT
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN (
  'cadenas_ahorro',
  'cadena_puestos',
  'cadena_rondas',
  'prestamos_personales',
  'pagos_prestamo_personal',
  'cuotas_prestamo_personal'
)
ORDER BY tablename, cmd;
