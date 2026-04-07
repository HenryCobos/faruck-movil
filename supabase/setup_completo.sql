-- ============================================================
-- PIGNORA — Setup completo: configuracion + auditoria + storage
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Es seguro ejecutarlo varias veces (idempotente)
-- ============================================================

-- ── 1. TABLA CONFIGURACION ───────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracion (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre_empresa   text        NOT NULL DEFAULT 'PIGNORA',
  slogan           text,
  direccion        text,
  telefono         text,
  email            text,
  ruc_nit          text,
  moneda           text        NOT NULL DEFAULT 'Bs',
  simbolo_moneda   text        NOT NULL DEFAULT '$',
  tasa_mora_diaria numeric(7,5) NOT NULL DEFAULT 0.00100,
  tasa_mora_label  text        NOT NULL DEFAULT '0.1% diario',
  dias_gracia      integer     NOT NULL DEFAULT 0,
  logo_url         text,
  color_primario   text        NOT NULL DEFAULT '#0D1B2A',
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid        REFERENCES profiles(id)
);

-- Fila inicial (si la tabla estaba vacía)
INSERT INTO configuracion (nombre_empresa, slogan, moneda, simbolo_moneda)
VALUES ('PIGNORA', 'Sistema de Créditos con Garantía', 'Bs', '$')
ON CONFLICT DO NOTHING;

-- RLS configuracion
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cfg_select"  ON configuracion;
DROP POLICY IF EXISTS "cfg_insert"  ON configuracion;
DROP POLICY IF EXISTS "cfg_update"  ON configuracion;

CREATE POLICY "cfg_select" ON configuracion FOR SELECT TO authenticated USING (is_active_user() = true);
CREATE POLICY "cfg_insert" ON configuracion FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "cfg_update" ON configuracion FOR UPDATE TO authenticated USING (get_my_role() = 'admin');

-- ── 2. TABLA AUDITORIA ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS auditoria (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tabla       text        NOT NULL,
  accion      text        NOT NULL,
  registro_id uuid,
  descripcion text        NOT NULL DEFAULT '',
  datos       jsonb,
  usuario_id  uuid        REFERENCES profiles(id),
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Columnas faltantes si la tabla ya existía sin ellas
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS descripcion text NOT NULL DEFAULT '';
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS datos       jsonb;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS ip_address  text;

-- Índices
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabla   ON auditoria(tabla);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha   ON auditoria(created_at DESC);

-- RLS auditoria
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aud_select" ON auditoria;
DROP POLICY IF EXISTS "aud_insert" ON auditoria;

CREATE POLICY "aud_select" ON auditoria FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'auditor'));
CREATE POLICY "aud_insert" ON auditoria FOR INSERT TO authenticated
  WITH CHECK (is_active_user() = true);

-- ── 3. FUNCIÓN registrar_auditoria ──────────────────────────
CREATE OR REPLACE FUNCTION registrar_auditoria(
  p_tabla       text,
  p_accion      text,
  p_registro_id uuid,
  p_descripcion text,
  p_datos       jsonb DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO auditoria (tabla, accion, registro_id, descripcion, datos, usuario_id)
  VALUES (p_tabla, p_accion, p_registro_id, p_descripcion, p_datos, auth.uid());
END;
$$;

-- ── 4. VISTA v_auditoria ─────────────────────────────────────
DROP VIEW IF EXISTS v_auditoria;
CREATE VIEW v_auditoria
WITH (security_invoker = true)
AS
SELECT
  a.id, a.tabla, a.accion, a.registro_id,
  a.descripcion, a.datos, a.created_at,
  p.nombre   AS usuario_nombre,
  p.apellido AS usuario_apellido,
  p.email    AS usuario_email,
  p.rol      AS usuario_rol
FROM auditoria a
LEFT JOIN profiles p ON p.id = a.usuario_id
ORDER BY a.created_at DESC;

GRANT SELECT ON v_auditoria TO authenticated;

-- ── 5. POLÍTICAS STORAGE (bucket logos) ─────────────────────
DROP POLICY IF EXISTS "logos_select"  ON storage.objects;
DROP POLICY IF EXISTS "logos_insert"  ON storage.objects;
DROP POLICY IF EXISTS "logos_update"  ON storage.objects;
DROP POLICY IF EXISTS "logos_delete"  ON storage.objects;

CREATE POLICY "logos_select" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'logos');

CREATE POLICY "logos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos' AND (SELECT get_my_role()) = 'admin');

CREATE POLICY "logos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND (SELECT get_my_role()) = 'admin');

CREATE POLICY "logos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'logos' AND (SELECT get_my_role()) = 'admin');

-- ── 6. VERIFICACIÓN FINAL ────────────────────────────────────
SELECT 'OK: configuracion' AS resultado, count(*) AS filas FROM configuracion
UNION ALL
SELECT 'OK: auditoria',    count(*) FROM auditoria;
