-- ============================================================
-- PIGNORA — Fix de seguridad completo (ejecutar todo de una vez)
-- Copia y pega en el SQL Editor de Supabase → Run
--
-- Resuelve TODOS los warnings activos:
--  • Function Search Path Mutable (trigger functions nuevas)
--  • Public Can Execute SECURITY DEFINER (todas las funciones)
--  • Public Bucket Allows Listing (logos + pignora-fotos)
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- BLOQUE 1 — Search Path en trigger functions nuevas
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_cadenas_ahorro_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_prestamos_personales_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- BLOQUE 2 — REVOKE PUBLIC / GRANT authenticated en todas las
--            funciones SECURITY DEFINER del proyecto
-- ══════════════════════════════════════════════════════════════

-- 1. aplicar_abono_capital
REVOKE EXECUTE ON FUNCTION public.aplicar_abono_capital(
  UUID, UUID, NUMERIC, metodo_pago, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aplicar_abono_capital(
  UUID, UUID, NUMERIC, metodo_pago, TEXT
) TO authenticated;

-- 2. calcular_mora_cuota
REVOKE EXECUTE ON FUNCTION public.calcular_mora_cuota(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calcular_mora_cuota(UUID) TO authenticated;

-- 3. registrar_pago
REVOKE EXECUTE ON FUNCTION public.registrar_pago(
  UUID, UUID, NUMERIC, NUMERIC, metodo_pago, TEXT
) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_pago(
  UUID, UUID, NUMERIC, NUMERIC, metodo_pago, TEXT
) TO authenticated;

-- 4. generar_cronograma
REVOKE EXECUTE ON FUNCTION public.generar_cronograma(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generar_cronograma(UUID) TO authenticated;

-- 5. calcular_saldo_pendiente
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.calcular_saldo_pendiente(UUID) FROM PUBLIC';
  EXECUTE 'GRANT  EXECUTE ON FUNCTION public.calcular_saldo_pendiente(UUID) TO authenticated';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'calcular_saldo_pendiente no encontrada — omitiendo';
END;
$$;

-- 6. registrar_auditoria
REVOKE EXECUTE ON FUNCTION public.registrar_auditoria(TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_auditoria(TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

-- 7. get_my_role
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- 8. is_active_user
REVOKE EXECUTE ON FUNCTION public.is_active_user() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_active_user() TO authenticated;

-- 9. calcular_mora_diaria (solo service_role — NO se concede a authenticated)
REVOKE EXECUTE ON FUNCTION public.calcular_mora_diaria() FROM PUBLIC;

-- 10. handle_new_user (trigger interno — NO se concede a nadie)
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'handle_new_user no encontrada — omitiendo';
END;
$$;

-- 11. delete_own_account
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC';
  EXECUTE 'GRANT  EXECUTE ON FUNCTION public.delete_own_account() TO authenticated';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'delete_own_account no encontrada — omitiendo';
END;
$$;

-- 12. renovar_prestamo (versión 8 parámetros)
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.renovar_prestamo(
    UUID, NUMERIC, NUMERIC, INTEGER, TEXT, UUID, NUMERIC, TEXT
  ) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.renovar_prestamo(
    UUID, NUMERIC, NUMERIC, INTEGER, TEXT, UUID, NUMERIC, TEXT
  ) TO authenticated';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'renovar_prestamo (8 args) no encontrada — omitiendo';
END;
$$;

-- 13. renovar_prestamo (versión 9 parámetros con plazo_dias)
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.renovar_prestamo(
    UUID, NUMERIC, NUMERIC, INTEGER, TEXT, UUID, NUMERIC, TEXT, INTEGER
  ) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.renovar_prestamo(
    UUID, NUMERIC, NUMERIC, INTEGER, TEXT, UUID, NUMERIC, TEXT, INTEGER
  ) TO authenticated';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'renovar_prestamo (9 args) no encontrada — omitiendo';
END;
$$;

-- 14. revertir_pago
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.revertir_pago(UUID, UUID, TEXT) FROM PUBLIC';
  EXECUTE 'GRANT  EXECUTE ON FUNCTION public.revertir_pago(UUID, UUID, TEXT) TO authenticated';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'revertir_pago no encontrada — omitiendo';
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- BLOQUE 3 — Storage: restringir listing de buckets a authenticated
-- ══════════════════════════════════════════════════════════════

-- pignora-fotos
DROP POLICY IF EXISTS "pignora_fotos_select"        ON storage.objects;
DROP POLICY IF EXISTS "pignora fotos select public"  ON storage.objects;
DROP POLICY IF EXISTS "Public can view pignora-fotos" ON storage.objects;

CREATE POLICY "pignora_fotos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pignora-fotos');

-- logos
DROP POLICY IF EXISTS "logos_select"          ON storage.objects;
DROP POLICY IF EXISTS "logos_public_select"   ON storage.objects;
DROP POLICY IF EXISTS "Public can view logos" ON storage.objects;

CREATE POLICY "logos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'logos');

DROP POLICY IF EXISTS "logos_insert" ON storage.objects;
CREATE POLICY "logos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos' AND (SELECT get_my_role()) = 'admin');

DROP POLICY IF EXISTS "logos_update" ON storage.objects;
CREATE POLICY "logos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND (SELECT get_my_role()) = 'admin');

DROP POLICY IF EXISTS "logos_delete" ON storage.objects;
CREATE POLICY "logos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'logos' AND (SELECT get_my_role()) = 'admin');


-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN — Confirmar que anon ya no puede ejecutar
-- ══════════════════════════════════════════════════════════════

SELECT
  p.proname                                        AS funcion,
  r.rolname                                        AS rol,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS puede_ejecutar
FROM pg_proc p
CROSS JOIN pg_roles r
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'aplicar_abono_capital', 'calcular_mora_cuota', 'calcular_mora_diaria',
    'calcular_saldo_pendiente', 'registrar_pago', 'generar_cronograma',
    'registrar_auditoria', 'get_my_role', 'is_active_user',
    'delete_own_account', 'renovar_prestamo', 'revertir_pago', 'handle_new_user'
  )
  AND r.rolname IN ('anon', 'authenticated')
ORDER BY p.proname, r.rolname;

-- ── NOTA FINAL ────────────────────────────────────────────────
-- "Leaked Password Protection Disabled" NO se puede corregir con SQL.
-- Ir a: Dashboard → Authentication → Sign In / Up
-- → Password Security → activar "Leaked Password Protection"
-- ─────────────────────────────────────────────────────────────
