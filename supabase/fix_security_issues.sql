-- ============================================================
-- PIGNORA — Corrección de problemas de seguridad (Supabase Linter)
-- Ejecutar en el SQL Editor de Supabase
--
-- Problemas que resuelve:
--  1. Security Definer View → v_cuotas_pendientes
--  2. Security Definer View → v_estado_resultados
--  3. Security Definer View → v_auditoria
--  4. RLS Disabled in Public → plan_cuentas
-- ============================================================

-- ── FIX 1 & 2: Vistas con security_invoker ───────────────────
-- Por defecto las vistas en PostgreSQL corren como el creador
-- (security definer), lo que bypasea RLS. Con security_invoker = true
-- la vista respeta las políticas RLS del usuario que la consulta.

CREATE OR REPLACE VIEW v_cuotas_pendientes
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.prestamo_id,
  c.numero_cuota,
  c.fecha_vencimiento,
  c.capital,
  c.interes,
  c.monto_total,
  c.mora_acumulada,
  c.estado,
  CASE
    WHEN c.fecha_vencimiento < CURRENT_DATE AND c.estado != 'pagada'
    THEN CURRENT_DATE - c.fecha_vencimiento
    ELSE 0
  END AS dias_mora,
  CASE
    WHEN c.fecha_vencimiento < CURRENT_DATE AND c.estado != 'pagada'
    THEN ROUND(c.monto_total * 0.001 * (CURRENT_DATE - c.fecha_vencimiento), 2)
    ELSE 0
  END AS mora_calculada,
  p.monto_principal,
  p.tasa_mensual,
  cl.nombre           AS cliente_nombre,
  cl.apellido         AS cliente_apellido,
  cl.telefono         AS cliente_telefono,
  cl.documento_numero AS cliente_documento,
  g.tipo              AS garantia_tipo,
  g.descripcion       AS garantia_descripcion
FROM cuotas c
JOIN prestamos p  ON p.id  = c.prestamo_id
JOIN clientes  cl ON cl.id = p.cliente_id
JOIN garantias g  ON g.id  = p.garantia_id
WHERE c.estado IN ('pendiente', 'vencida', 'parcial');

GRANT SELECT ON v_cuotas_pendientes TO authenticated;

-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_estado_resultados
WITH (security_invoker = true)
AS
SELECT
  DATE_TRUNC('month', fecha) AS mes,
  SUM(CASE WHEN pc.codigo = '4110' THEN haber ELSE 0 END) AS ingresos_intereses,
  SUM(CASE WHEN pc.codigo = '4120' THEN haber ELSE 0 END) AS ingresos_comisiones,
  SUM(CASE WHEN pc.codigo = '4130' THEN haber ELSE 0 END) AS ingresos_mora,
  SUM(CASE WHEN pc.tipo = 'egreso'  THEN debe  ELSE 0 END) AS egresos,
  SUM(CASE WHEN pc.tipo = 'ingreso' THEN haber ELSE 0 END) -
  SUM(CASE WHEN pc.tipo = 'egreso'  THEN debe  ELSE 0 END) AS utilidad_neta
FROM asientos_contables ac
JOIN plan_cuentas pc ON pc.id = ac.cuenta_id
GROUP BY DATE_TRUNC('month', fecha)
ORDER BY mes DESC;

GRANT SELECT ON v_estado_resultados TO authenticated;

-- ── FIX 3: Vista v_auditoria con security_invoker ────────────

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
  p.nombre   AS usuario_nombre,
  p.apellido AS usuario_apellido,
  p.email    AS usuario_email,
  p.rol      AS usuario_rol
FROM auditoria a
LEFT JOIN profiles p ON p.id = a.usuario_id
ORDER BY a.created_at DESC;

GRANT SELECT ON v_auditoria TO authenticated;

-- ── FIX 4: Habilitar RLS en plan_cuentas ─────────────────────
-- La tabla no tenía RLS activo, dejándola expuesta públicamente.

ALTER TABLE plan_cuentas ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios activos pueden consultar el plan de cuentas
-- (necesario para reportes contables y función registrar_pago)
DROP POLICY IF EXISTS "Usuarios activos ven plan de cuentas" ON plan_cuentas;
CREATE POLICY "Usuarios activos ven plan de cuentas"
  ON plan_cuentas FOR SELECT
  USING (is_active_user() = true);

-- Solo admin puede modificar la estructura contable
DROP POLICY IF EXISTS "Solo admin inserta cuentas" ON plan_cuentas;
CREATE POLICY "Solo admin inserta cuentas"
  ON plan_cuentas FOR INSERT
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Solo admin actualiza cuentas" ON plan_cuentas;
CREATE POLICY "Solo admin actualiza cuentas"
  ON plan_cuentas FOR UPDATE
  USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Solo admin elimina cuentas" ON plan_cuentas;
CREATE POLICY "Solo admin elimina cuentas"
  ON plan_cuentas FOR DELETE
  USING (get_my_role() = 'admin');

-- ── VERIFICACIÓN ─────────────────────────────────────────────
SELECT
  schemaname,
  viewname,
  definition
FROM pg_views
WHERE viewname IN ('v_cuotas_pendientes', 'v_estado_resultados', 'v_auditoria')
  AND schemaname = 'public';

SELECT
  tablename,
  rowsecurity AS rls_activo
FROM pg_tables
WHERE tablename = 'plan_cuentas'
  AND schemaname = 'public';
