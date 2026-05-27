-- ============================================================
-- PIGNORA — Corrección de Warnings del Security Advisor
-- Ejecutar en el SQL Editor de Supabase
--
-- Warnings que resuelve:
--
--  [12x] Public Can Execute SECURITY DEFINER Function:
--        renovar_prestamo (ambas versiones), revertir_pago,
--        calcular_mora_cuota, calcular_mora_diaria,
--        calcular_saldo_pendiente, delete_own_account,
--        generar_cronograma, get_my_role, handle_new_user,
--        is_active_user, registrar_auditoria, registrar_pago
--
--  [2x]  Public Bucket Allows Listing:
--        storage.logos, storage.pignora-fotos
--
--  (!) Leaked Password Protection Disabled:
--        NO se puede corregir con SQL.
--        Ir a: Dashboard → Authentication → Sign In/Up
--        → Password Security → activar "Leaked Password Protection"
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- BLOQUE 1: REVOKE / GRANT en funciones SECURITY DEFINER
-- ══════════════════════════════════════════════════════════════
--
-- Por defecto PostgreSQL otorga EXECUTE a PUBLIC (incluye anon).
-- Revocamos de PUBLIC y sólo concedemos a los roles que realmente
-- necesitan llamar cada función desde la app.
--
-- Estrategia por función:
--   • authenticated  → funciones que la app llama con sesión activa
--   • (ninguno)      → funciones de trigger/cron (service_role las
--                       ejecuta internamente sin necesitar GRANT)
-- ──────────────────────────────────────────────────────────────

-- ── 1. renovar_prestamo ──────────────────────────────────────
-- Versión original (8 parámetros — add_renovacion.sql)
REVOKE EXECUTE ON FUNCTION public.renovar_prestamo(
  UUID, NUMERIC, NUMERIC, INTEGER, TEXT, UUID, NUMERIC, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.renovar_prestamo(
  UUID, NUMERIC, NUMERIC, INTEGER, TEXT, UUID, NUMERIC, TEXT
) TO authenticated;

-- Versión extendida con plazo_dias (9 parámetros — patch_renovacion_plazo_dias.sql)
-- Si este overload no existe aún en Supabase, ejecutar patch_renovacion_plazo_dias.sql primero.
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.renovar_prestamo(
    UUID, NUMERIC, NUMERIC, INTEGER, TEXT, UUID, NUMERIC, TEXT, INTEGER
  ) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.renovar_prestamo(
    UUID, NUMERIC, NUMERIC, INTEGER, TEXT, UUID, NUMERIC, TEXT, INTEGER
  ) TO authenticated';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'renovar_prestamo (9 args) aún no existe — ejecutar patch_renovacion_plazo_dias.sql primero';
END;
$$;

-- ── 2. revertir_pago ─────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.revertir_pago(UUID, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revertir_pago(UUID, UUID, TEXT) TO authenticated;

-- ── 3. registrar_pago ────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.registrar_pago(
  UUID, UUID, NUMERIC, NUMERIC, metodo_pago, TEXT
) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_pago(
  UUID, UUID, NUMERIC, NUMERIC, metodo_pago, TEXT
) TO authenticated;

-- ── 4. generar_cronograma ────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.generar_cronograma(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generar_cronograma(UUID) TO authenticated;

-- ── 5. calcular_saldo_pendiente ──────────────────────────────
REVOKE EXECUTE ON FUNCTION public.calcular_saldo_pendiente(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calcular_saldo_pendiente(UUID) TO authenticated;

-- ── 6. calcular_mora_cuota ───────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.calcular_mora_cuota(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calcular_mora_cuota(UUID) TO authenticated;

-- ── 7. registrar_auditoria ───────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.registrar_auditoria(TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_auditoria(TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

-- ── 8. get_my_role ───────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- ── 9. is_active_user ────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.is_active_user() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_active_user() TO authenticated;

-- ── 10. delete_own_account ───────────────────────────────────
-- Permite que un usuario autenticado elimine su propia cuenta.
-- Sólo debe ser llamable por el propio usuario (authenticated).
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC';
  EXECUTE 'GRANT  EXECUTE ON FUNCTION public.delete_own_account() TO authenticated';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'delete_own_account() no encontrada — omitiendo';
END;
$$;

-- ── 11. calcular_mora_diaria ─────────────────────────────────
-- Función de mantenimiento: cron job / service_role.
-- NO se concede a authenticated — sólo service_role la llama.
REVOKE EXECUTE ON FUNCTION public.calcular_mora_diaria() FROM PUBLIC;
-- (service_role siempre tiene acceso independientemente del GRANT)

-- ── 12. handle_new_user ──────────────────────────────────────
-- Trigger en auth.users — NO debe ser llamable directamente por usuarios.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
-- Triggers se ejecutan como el dueño de la función (SECURITY DEFINER),
-- no necesitan GRANT a ningún rol de usuario.


-- ══════════════════════════════════════════════════════════════
-- BLOQUE 2: Storage — restringir LISTING de buckets
-- ══════════════════════════════════════════════════════════════
--
-- El bucket permanece público (las URLs directas siguen funcionando
-- sin autenticación via CDN). Solo restringimos la operación de
-- LISTAR archivos via la API, que no necesita ser pública.
-- ──────────────────────────────────────────────────────────────

-- ── pignora-fotos ─────────────────────────────────────────────
DROP POLICY IF EXISTS "pignora_fotos_select" ON storage.objects;

CREATE POLICY "pignora_fotos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pignora-fotos');

-- ── logos ─────────────────────────────────────────────────────
-- Eliminar cualquier política de SELECT pública en el bucket logos
DROP POLICY IF EXISTS "logos_select"         ON storage.objects;
DROP POLICY IF EXISTS "logos_public_select"  ON storage.objects;
DROP POLICY IF EXISTS "Public can view logos" ON storage.objects;

CREATE POLICY "logos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'logos');

-- Subida de logos: solo admin
DROP POLICY IF EXISTS "logos_insert" ON storage.objects;
CREATE POLICY "logos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (SELECT get_my_role()) = 'admin'
  );

-- Actualización: solo admin
DROP POLICY IF EXISTS "logos_update" ON storage.objects;
CREATE POLICY "logos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (SELECT get_my_role()) = 'admin'
  );

-- Eliminación: solo admin
DROP POLICY IF EXISTS "logos_delete" ON storage.objects;
CREATE POLICY "logos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (SELECT get_my_role()) = 'admin'
  );


-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════

-- Confirmar que anon ya no tiene EXECUTE en las funciones críticas
SELECT
  p.proname                                   AS funcion,
  r.rolname                                   AS rol,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS puede_ejecutar
FROM pg_proc p
CROSS JOIN pg_roles r
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'renovar_prestamo', 'revertir_pago', 'registrar_pago',
    'generar_cronograma', 'calcular_mora_cuota', 'registrar_auditoria',
    'get_my_role', 'is_active_user', 'calcular_mora_diaria', 'handle_new_user'
  )
  AND r.rolname IN ('anon', 'authenticated')
ORDER BY p.proname, r.rolname;

-- ── NOTA FINAL ────────────────────────────────────────────────
-- "Leaked Password Protection Disabled":
--   Activar manualmente en:
--   Dashboard → Authentication → Sign In / Up
--   → Password Security → "Leaked Password Protection (HaveIBeenPwned)"
-- ─────────────────────────────────────────────────────────────
