-- ============================================================
-- PIGNORA APP — Función atómica para registrar pagos
-- Ejecutar en SQL Editor de Supabase DESPUÉS del schema.sql
-- ============================================================

-- Función principal: registrar un pago completo
CREATE OR REPLACE FUNCTION registrar_pago(
  p_cuota_id      UUID,
  p_cajero_id     UUID,
  p_monto_pagado  NUMERIC,
  p_mora_cobrada  NUMERIC DEFAULT 0,
  p_metodo_pago   metodo_pago DEFAULT 'efectivo',
  p_observaciones TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuota         cuotas%ROWTYPE;
  v_prestamo      prestamos%ROWTYPE;
  v_recibo_num    TEXT;
  v_pago_id       UUID;
  v_cuenta_caja   UUID;
  v_cuenta_cartera UUID;
  v_cuenta_interes UUID;
  v_cuenta_mora   UUID;
  v_capital_part  NUMERIC;
  v_interes_part  NUMERIC;
  v_todas_pagadas BOOLEAN;
BEGIN
  -- Obtener cuota
  SELECT * INTO v_cuota FROM cuotas WHERE id = p_cuota_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuota no encontrada';
  END IF;
  IF v_cuota.estado = 'pagada' THEN
    RAISE EXCEPTION 'Esta cuota ya fue pagada';
  END IF;

  -- Obtener préstamo
  SELECT * INTO v_prestamo FROM prestamos WHERE id = v_cuota.prestamo_id;

  -- Generar número de recibo único
  v_recibo_num := 'REC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                  LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');

  -- Obtener cuentas contables
  SELECT id INTO v_cuenta_caja     FROM plan_cuentas WHERE codigo = '1110' LIMIT 1;
  SELECT id INTO v_cuenta_cartera  FROM plan_cuentas WHERE codigo = '1210' LIMIT 1;
  SELECT id INTO v_cuenta_interes  FROM plan_cuentas WHERE codigo = '4110' LIMIT 1;
  SELECT id INTO v_cuenta_mora     FROM plan_cuentas WHERE codigo = '4130' LIMIT 1;

  -- Calcular proporciones capital e interés del pago
  v_capital_part  := LEAST(p_monto_pagado - p_mora_cobrada, v_cuota.capital);
  v_interes_part  := LEAST(p_monto_pagado - p_mora_cobrada - v_capital_part, v_cuota.interes);
  v_capital_part  := GREATEST(v_capital_part, 0);
  v_interes_part  := GREATEST(v_interes_part, 0);

  -- Registrar el pago
  INSERT INTO pagos (
    cuota_id, cajero_id, monto_pagado, mora_cobrada,
    metodo_pago, numero_recibo, observaciones
  ) VALUES (
    p_cuota_id, p_cajero_id, p_monto_pagado, p_mora_cobrada,
    p_metodo_pago, v_recibo_num, p_observaciones
  ) RETURNING id INTO v_pago_id;

  -- Actualizar estado de la cuota y limpiar mora acumulada
  UPDATE cuotas
  SET
    estado         = 'pagada',
    fecha_pago     = NOW(),
    mora_acumulada = 0
  WHERE id = p_cuota_id;

  -- ── ASIENTOS CONTABLES ──────────────────────────────────────

  -- 1. Ingreso de caja total (DEBE)
  IF v_cuenta_caja IS NOT NULL THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'Cobro cuota #' || v_cuota.numero_cuota || ' — Préstamo ' || v_prestamo.id,
      p_monto_pagado, 0, v_cuenta_caja, v_pago_id, 'pago_capital', p_cajero_id);
  END IF;

  -- 2. Reducción cartera (HABER)
  IF v_cuenta_cartera IS NOT NULL AND v_capital_part > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'Recuperación capital cuota #' || v_cuota.numero_cuota,
      0, v_capital_part, v_cuenta_cartera, v_pago_id, 'pago_capital', p_cajero_id);
  END IF;

  -- 3. Ingreso por intereses (HABER)
  IF v_cuenta_interes IS NOT NULL AND v_interes_part > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'Interés cuota #' || v_cuota.numero_cuota,
      0, v_interes_part, v_cuenta_interes, v_pago_id, 'pago_interes', p_cajero_id);
  END IF;

  -- 4. Ingreso por mora (HABER)
  IF v_cuenta_mora IS NOT NULL AND p_mora_cobrada > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'Mora cuota #' || v_cuota.numero_cuota,
      0, p_mora_cobrada, v_cuenta_mora, v_pago_id, 'mora', p_cajero_id);
  END IF;

  -- Verificar si todas las cuotas del préstamo están pagadas
  SELECT NOT EXISTS (
    SELECT 1 FROM cuotas
    WHERE prestamo_id = v_cuota.prestamo_id
      AND estado != 'pagada'
  ) INTO v_todas_pagadas;

  IF v_todas_pagadas THEN
    UPDATE prestamos SET estado = 'cancelado' WHERE id = v_cuota.prestamo_id;
    -- Liberar la garantía
    UPDATE garantias SET estado = 'devuelta'
    WHERE id = v_prestamo.garantia_id;
  END IF;

  -- Retornar resultado
  RETURN jsonb_build_object(
    'pago_id',      v_pago_id,
    'recibo_num',   v_recibo_num,
    'capital',      v_capital_part,
    'interes',      v_interes_part,
    'mora',         p_mora_cobrada,
    'total',        p_monto_pagado,
    'prestamo_cancelado', v_todas_pagadas
  );
END;
$$;

-- Función auxiliar: calcular mora actual de una cuota (usa tasa de configuracion)
CREATE OR REPLACE FUNCTION calcular_mora_cuota(p_cuota_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuota            cuotas%ROWTYPE;
  v_dias             INTEGER;
  v_tasa_mora_diaria NUMERIC := 0.001; -- fallback si no hay config
BEGIN
  SELECT * INTO v_cuota FROM cuotas WHERE id = p_cuota_id;
  IF NOT FOUND OR v_cuota.estado = 'pagada' THEN RETURN 0; END IF;
  IF v_cuota.fecha_vencimiento >= CURRENT_DATE THEN RETURN 0; END IF;

  -- Leer tasa de mora configurable
  SELECT COALESCE(tasa_mora_diaria, 0.001) INTO v_tasa_mora_diaria
  FROM configuracion LIMIT 1;

  v_dias := (CURRENT_DATE - v_cuota.fecha_vencimiento);
  RETURN ROUND(v_cuota.monto_total * v_tasa_mora_diaria * v_dias, 2);
END;
$$;

-- Vista: cuotas pendientes enriquecidas (muy útil para la pantalla de cobros)
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
    THEN ROUND(c.monto_total * COALESCE((SELECT tasa_mora_diaria FROM configuracion LIMIT 1), 0.001) * (CURRENT_DATE - c.fecha_vencimiento), 2)
    ELSE 0
  END AS mora_calculada,
  p.monto_principal,
  p.tasa_mensual,
  cl.nombre        AS cliente_nombre,
  cl.apellido      AS cliente_apellido,
  cl.telefono      AS cliente_telefono,
  cl.documento_numero AS cliente_documento,
  g.tipo           AS garantia_tipo,
  g.descripcion    AS garantia_descripcion
FROM cuotas c
JOIN prestamos p  ON p.id  = c.prestamo_id
JOIN clientes  cl ON cl.id = p.cliente_id
JOIN garantias g  ON g.id  = p.garantia_id
WHERE c.estado IN ('pendiente', 'vencida', 'parcial');

-- Vista: estado de resultados mensual
CREATE OR REPLACE VIEW v_estado_resultados
WITH (security_invoker = true)
AS
SELECT
  DATE_TRUNC('month', fecha) AS mes,
  SUM(CASE WHEN pc.codigo = '4110' THEN haber ELSE 0 END) AS ingresos_intereses,
  SUM(CASE WHEN pc.codigo = '4120' THEN haber ELSE 0 END) AS ingresos_comisiones,
  SUM(CASE WHEN pc.codigo = '4130' THEN haber ELSE 0 END) AS ingresos_mora,
  SUM(CASE WHEN pc.tipo = 'egreso' THEN debe ELSE 0 END)  AS egresos,
  SUM(CASE WHEN pc.tipo = 'ingreso' THEN haber ELSE 0 END) -
  SUM(CASE WHEN pc.tipo = 'egreso' THEN debe ELSE 0 END)  AS utilidad_neta
FROM asientos_contables ac
JOIN plan_cuentas pc ON pc.id = ac.cuenta_id
GROUP BY DATE_TRUNC('month', fecha)
ORDER BY mes DESC;

-- Política RLS para las vistas
GRANT SELECT ON v_cuotas_pendientes TO authenticated;
GRANT SELECT ON v_estado_resultados  TO authenticated;
