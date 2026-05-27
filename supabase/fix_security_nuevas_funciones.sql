-- ============================================================
-- PIGNORA — Corrección de warnings nuevas funciones
-- Ejecutar en el SQL Editor de Supabase
--
-- Warnings que resuelve:
--
--  [2x] Function Search Path Mutable:
--       update_cadenas_ahorro_updated_at
--       update_prestamos_personales_updated_at
--
--  [1x] Public Can Execute SECURITY DEFINER Function:
--       aplicar_abono_capital (reconfirma REVOKE/GRANT)
--
-- Los warnings de storage.logos y storage.pignora-fotos
-- ya están cubiertos en fix_security_advisor.sql.
-- Si aún aparecen, volver a ejecutar ese archivo.
-- ============================================================

-- ── FIX 1: update_cadenas_ahorro_updated_at ──────────────────
-- Agregar SET search_path = '' para fijar el esquema de
-- búsqueda y prevenir ataques de sustitución de objetos.

CREATE OR REPLACE FUNCTION update_cadenas_ahorro_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── FIX 2: update_prestamos_personales_updated_at ────────────

CREATE OR REPLACE FUNCTION update_prestamos_personales_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── FIX 3: aplicar_abono_capital — REVOKE / GRANT ────────────
-- Por defecto PostgreSQL otorga EXECUTE a PUBLIC.
-- Revocamos y solo concedemos a usuarios autenticados.

REVOKE EXECUTE ON FUNCTION public.aplicar_abono_capital(
  UUID, UUID, NUMERIC, metodo_pago, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.aplicar_abono_capital(
  UUID, UUID, NUMERIC, metodo_pago, TEXT
) TO authenticated;

-- ── VERIFICACIÓN ─────────────────────────────────────────────

SELECT
  routine_name,
  external_language,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'update_cadenas_ahorro_updated_at',
    'update_prestamos_personales_updated_at',
    'aplicar_abono_capital'
  )
ORDER BY routine_name;

SELECT
  p.proname                                         AS funcion,
  r.rolname                                         AS rol,
  has_function_privilege(r.oid, p.oid, 'EXECUTE')  AS puede_ejecutar
FROM pg_proc p
CROSS JOIN pg_roles r
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'aplicar_abono_capital'
  AND r.rolname IN ('anon', 'authenticated');
