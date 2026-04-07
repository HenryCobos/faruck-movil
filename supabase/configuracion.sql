-- ============================================================
-- PIGNORA — Tabla de configuración de la empresa
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS configuracion (
  id                 uuid primary key default uuid_generate_v4(),
  nombre_empresa     text not null default 'PIGNORA',
  slogan             text,
  direccion          text,
  telefono           text,
  email              text,
  ruc_nit            text,
  moneda             text not null default 'Bs',
  simbolo_moneda     text not null default '$',
  tasa_mora_diaria   numeric(7,5) not null default 0.00100,
  tasa_mora_label    text not null default '0.1% diario',
  dias_gracia        integer not null default 0,
  logo_url           text,
  color_primario     text not null default '#0D1B2A',
  updated_at         timestamptz not null default now(),
  updated_by         uuid references profiles(id)
);

-- Solo debe existir UN registro de configuración
INSERT INTO configuracion (nombre_empresa, slogan, moneda, simbolo_moneda)
VALUES ('PIGNORA', 'Sistema de Créditos con Garantía', 'Bs', '$')
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos los usuarios autenticados pueden leer configuración"
  ON configuracion FOR SELECT TO authenticated USING (is_active_user() = true);

CREATE POLICY "Solo admin puede actualizar configuración"
  ON configuracion FOR UPDATE USING (get_my_role() = 'admin');

-- Solo admin puede insertar configuración
CREATE POLICY "Insertar configuración inicial si vacía"
  ON configuracion FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');

-- ============================================================
-- Tabla de auditoría
-- ============================================================
CREATE TABLE IF NOT EXISTS auditoria (
  id          uuid primary key default uuid_generate_v4(),
  tabla       text not null,
  accion      text not null CHECK (accion IN ('crear', 'actualizar', 'eliminar', 'aprobar', 'activar', 'pago', 'cancelar')),
  registro_id uuid,
  descripcion text not null,
  datos       jsonb,
  usuario_id  uuid references profiles(id),
  ip_address  text,
  created_at  timestamptz not null default now()
);

-- Índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabla   ON auditoria(tabla);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha   ON auditoria(created_at DESC);

-- RLS
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin y auditor pueden ver auditoría"
  ON auditoria FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'auditor'));

-- Función para registrar eventos de auditoría
CREATE OR REPLACE FUNCTION registrar_auditoria(
  p_tabla       text,
  p_accion      text,
  p_registro_id uuid,
  p_descripcion text,
  p_datos       jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO auditoria (tabla, accion, registro_id, descripcion, datos, usuario_id)
  VALUES (p_tabla, p_accion, p_registro_id, p_descripcion, p_datos, auth.uid());
END;
$$;

-- Vista enriquecida de auditoría con datos del usuario
CREATE OR REPLACE VIEW v_auditoria
WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.tabla,
  a.accion,
  a.registro_id,
  a.descripcion,
  a.datos,
  a.created_at,
  p.nombre        AS usuario_nombre,
  p.apellido      AS usuario_apellido,
  p.email         AS usuario_email,
  p.rol           AS usuario_rol
FROM auditoria a
LEFT JOIN profiles p ON p.id = a.usuario_id
ORDER BY a.created_at DESC;

GRANT SELECT ON v_auditoria TO authenticated;
