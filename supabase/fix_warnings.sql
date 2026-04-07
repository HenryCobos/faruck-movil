-- ============================================================
-- PIGNORA — Corrección de Warnings del Security Advisor
-- Ejecutar en el SQL Editor de Supabase
--
-- Warnings que resuelve (10 de 11 — el restante es un ajuste
-- del Dashboard de Auth, ver nota al final):
--
--  [8x] Function Search Path Mutable:
--       set_updated_at, get_my_role, is_active_user,
--       generar_cronograma, calcular_mora_diaria,
--       registrar_pago, calcular_mora_cuota, registrar_auditoria
--
--  [2x] RLS Policy Always True:
--       auditoria → aud_insert WITH CHECK (true)
--       configuracion → cfg_select USING (true)
--                       cfg_insert WITH CHECK (true)
-- ============================================================

-- ── FIX 1-5: Funciones en schema.sql ─────────────────────────
-- Agregar SET search_path = public para fijar el esquema de
-- búsqueda y evitar ataques de sustitución de objetos.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_active_user()
RETURNS boolean LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT activo FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION generar_cronograma(prestamo_id uuid)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p         prestamos%ROWTYPE;
  r         numeric;
  cuota_fija numeric;
  saldo     numeric;
  capital   numeric;
  interes   numeric;
  fecha_v   date;
  i         integer;
BEGIN
  SELECT * INTO p FROM prestamos WHERE id = prestamo_id;

  r     := p.tasa_mensual;
  saldo := p.monto_principal;
  fecha_v := p.fecha_desembolso;

  IF p.tipo_amortizacion = 'francesa' THEN
    cuota_fija := saldo * (r * power(1 + r, p.plazo_meses)) / (power(1 + r, p.plazo_meses) - 1);
    FOR i IN 1..p.plazo_meses LOOP
      interes := round(saldo * r, 2);
      capital := round(cuota_fija - interes, 2);
      IF i = p.plazo_meses THEN capital := saldo; END IF;
      saldo   := saldo - capital;
      fecha_v := fecha_v + interval '1 month';
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, capital, interes, capital + interes);
    END LOOP;

  ELSIF p.tipo_amortizacion = 'alemana' THEN
    capital := round(p.monto_principal / p.plazo_meses, 2);
    FOR i IN 1..p.plazo_meses LOOP
      interes := round(saldo * r, 2);
      IF i = p.plazo_meses THEN capital := saldo; END IF;
      saldo   := saldo - capital;
      fecha_v := fecha_v + interval '1 month';
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, capital, interes, capital + interes);
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION calcular_mora_diaria()
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tasa_mora_diaria CONSTANT numeric := 0.001;
BEGIN
  UPDATE cuotas
  SET
    mora_acumulada = mora_acumulada + (monto_total * tasa_mora_diaria),
    estado = 'vencida'
  WHERE
    estado IN ('pendiente', 'parcial')
    AND fecha_vencimiento < current_date;
END;
$$;

-- ── FIX 6-7: Funciones en registrar_pago.sql ─────────────────

CREATE OR REPLACE FUNCTION registrar_pago(
  p_cuota_id      UUID,
  p_cajero_id     UUID,
  p_monto_pagado  NUMERIC,
  p_mora_cobrada  NUMERIC DEFAULT 0,
  p_metodo_pago   metodo_pago DEFAULT 'efectivo',
  p_observaciones TEXT DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuota          cuotas%ROWTYPE;
  v_prestamo       prestamos%ROWTYPE;
  v_recibo_num     TEXT;
  v_pago_id        UUID;
  v_cuenta_caja    UUID;
  v_cuenta_cartera UUID;
  v_cuenta_interes UUID;
  v_cuenta_mora    UUID;
  v_capital_part   NUMERIC;
  v_interes_part   NUMERIC;
  v_todas_pagadas  BOOLEAN;
BEGIN
  SELECT * INTO v_cuota FROM cuotas WHERE id = p_cuota_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuota no encontrada'; END IF;
  IF v_cuota.estado = 'pagada' THEN RAISE EXCEPTION 'Esta cuota ya fue pagada'; END IF;

  SELECT * INTO v_prestamo FROM prestamos WHERE id = v_cuota.prestamo_id;

  v_recibo_num := 'REC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                  LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');

  SELECT id INTO v_cuenta_caja     FROM plan_cuentas WHERE codigo = '1110' LIMIT 1;
  SELECT id INTO v_cuenta_cartera  FROM plan_cuentas WHERE codigo = '1210' LIMIT 1;
  SELECT id INTO v_cuenta_interes  FROM plan_cuentas WHERE codigo = '4110' LIMIT 1;
  SELECT id INTO v_cuenta_mora     FROM plan_cuentas WHERE codigo = '4130' LIMIT 1;

  v_capital_part := LEAST(p_monto_pagado - p_mora_cobrada, v_cuota.capital);
  v_interes_part := LEAST(p_monto_pagado - p_mora_cobrada - v_capital_part, v_cuota.interes);
  v_capital_part := GREATEST(v_capital_part, 0);
  v_interes_part := GREATEST(v_interes_part, 0);

  INSERT INTO pagos (cuota_id, cajero_id, monto_pagado, mora_cobrada, metodo_pago, numero_recibo, observaciones)
  VALUES (p_cuota_id, p_cajero_id, p_monto_pagado, p_mora_cobrada, p_metodo_pago, v_recibo_num, p_observaciones)
  RETURNING id INTO v_pago_id;

  UPDATE cuotas SET estado = 'pagada', fecha_pago = NOW() WHERE id = p_cuota_id;

  IF v_cuenta_caja IS NOT NULL THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE, 'Cobro cuota #' || v_cuota.numero_cuota || ' — Préstamo ' || v_prestamo.id,
            p_monto_pagado, 0, v_cuenta_caja, v_pago_id, 'pago_capital', p_cajero_id);
  END IF;
  IF v_cuenta_cartera IS NOT NULL AND v_capital_part > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE, 'Recuperación capital cuota #' || v_cuota.numero_cuota,
            0, v_capital_part, v_cuenta_cartera, v_pago_id, 'pago_capital', p_cajero_id);
  END IF;
  IF v_cuenta_interes IS NOT NULL AND v_interes_part > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE, 'Interés cuota #' || v_cuota.numero_cuota,
            0, v_interes_part, v_cuenta_interes, v_pago_id, 'pago_interes', p_cajero_id);
  END IF;
  IF v_cuenta_mora IS NOT NULL AND p_mora_cobrada > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE, 'Mora cuota #' || v_cuota.numero_cuota,
            0, p_mora_cobrada, v_cuenta_mora, v_pago_id, 'mora', p_cajero_id);
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM cuotas WHERE prestamo_id = v_cuota.prestamo_id AND estado != 'pagada'
  ) INTO v_todas_pagadas;

  IF v_todas_pagadas THEN
    UPDATE prestamos  SET estado = 'cancelado' WHERE id = v_cuota.prestamo_id;
    UPDATE garantias  SET estado = 'devuelta'  WHERE id = v_prestamo.garantia_id;
  END IF;

  RETURN jsonb_build_object(
    'pago_id', v_pago_id, 'recibo_num', v_recibo_num,
    'capital', v_capital_part, 'interes', v_interes_part,
    'mora', p_mora_cobrada, 'total', p_monto_pagado,
    'prestamo_cancelado', v_todas_pagadas
  );
END;
$$;

CREATE OR REPLACE FUNCTION calcular_mora_cuota(p_cuota_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuota cuotas%ROWTYPE;
  v_dias  INTEGER;
  v_tasa_mora_diaria CONSTANT NUMERIC := 0.001;
BEGIN
  SELECT * INTO v_cuota FROM cuotas WHERE id = p_cuota_id;
  IF NOT FOUND OR v_cuota.estado = 'pagada' THEN RETURN 0; END IF;
  IF v_cuota.fecha_vencimiento >= CURRENT_DATE THEN RETURN 0; END IF;
  v_dias := (CURRENT_DATE - v_cuota.fecha_vencimiento);
  RETURN ROUND(v_cuota.monto_total * v_tasa_mora_diaria * v_dias, 2);
END;
$$;

-- ── FIX 8: registrar_auditoria ────────────────────────────────

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

-- ── FIX 9: RLS Policy Always True → configuracion ────────────
-- cfg_select USING (true)  → solo usuarios activos
-- cfg_insert WITH CHECK (true) → solo admin puede insertar

DROP POLICY IF EXISTS "cfg_select" ON configuracion;
DROP POLICY IF EXISTS "cfg_insert" ON configuracion;
DROP POLICY IF EXISTS "cfg_update" ON configuracion;
DROP POLICY IF EXISTS "Todos los usuarios autenticados pueden leer configuración" ON configuracion;
DROP POLICY IF EXISTS "Solo admin puede actualizar configuración"                 ON configuracion;
DROP POLICY IF EXISTS "Insertar configuración inicial si vacía"                   ON configuracion;

CREATE POLICY "cfg_select" ON configuracion
  FOR SELECT TO authenticated
  USING (is_active_user() = true);

CREATE POLICY "cfg_insert" ON configuracion
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "cfg_update" ON configuracion
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- ── FIX 10: RLS Policy Always True → auditoria ───────────────
-- aud_insert WITH CHECK (true) → solo usuarios activos pueden
-- insertar directamente. Los inserts via registrar_auditoria()
-- (SECURITY DEFINER) ya bypassean RLS de todas formas.

DROP POLICY IF EXISTS "aud_select" ON auditoria;
DROP POLICY IF EXISTS "aud_insert" ON auditoria;
DROP POLICY IF EXISTS "Solo admin ve auditoría"            ON auditoria;
DROP POLICY IF EXISTS "Admin y auditor pueden ver auditoría" ON auditoria;

CREATE POLICY "aud_select" ON auditoria
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'auditor'));

CREATE POLICY "aud_insert" ON auditoria
  FOR INSERT TO authenticated
  WITH CHECK (is_active_user() = true);

-- ── VERIFICACIÓN ─────────────────────────────────────────────
SELECT
  routine_name,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'set_updated_at','get_my_role','is_active_user','generar_cronograma',
    'calcular_mora_diaria','registrar_pago','calcular_mora_cuota','registrar_auditoria'
  )
ORDER BY routine_name;

-- ── NOTA: Warning pendiente (no se puede corregir con SQL) ────
-- "Leaked Password Protection Disabled"
-- Corregir en el Dashboard de Supabase:
--   Authentication → Sign In / Up → Password Security
--   → Activar "Leaked Password Protection (HaveIBeenPwned)"
-- ─────────────────────────────────────────────────────────────
