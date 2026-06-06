-- ============================================================
-- PIGNORA — Patch: registrar_pago retorna saldo_pendiente
--
-- Agrega el campo saldo_pendiente al resultado de la función,
-- calculado DESPUÉS de marcar la cuota como pagada, por lo que
-- refleja exactamente cuánto le queda por pagar al cliente.
-- ============================================================

CREATE OR REPLACE FUNCTION registrar_pago(
  p_cuota_id      UUID,
  p_cajero_id     UUID,
  p_monto_pagado  NUMERIC,
  p_mora_cobrada  NUMERIC DEFAULT 0,
  p_metodo_pago   metodo_pago DEFAULT 'efectivo',
  p_observaciones TEXT DEFAULT NULL,
  p_fecha_pago    DATE DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuota           cuotas%ROWTYPE;
  v_prestamo        prestamos%ROWTYPE;
  v_recibo_num      TEXT;
  v_pago_id         UUID;
  v_cuenta_caja     UUID;
  v_cuenta_cartera  UUID;
  v_cuenta_interes  UUID;
  v_cuenta_mora     UUID;
  v_capital_part    NUMERIC;
  v_interes_part    NUMERIC;
  v_todas_pagadas           BOOLEAN;
  v_saldo_pendiente         NUMERIC;
  v_saldo_capital_pendiente NUMERIC;
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

  -- Generar número de recibo único (usa la fecha elegida por el usuario)
  v_recibo_num := 'REC-' || TO_CHAR(p_fecha_pago, 'YYYYMMDD') || '-' ||
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

  -- Registrar el pago (con la fecha elegida por el usuario)
  INSERT INTO pagos (
    cuota_id, cajero_id, monto_pagado, mora_cobrada,
    metodo_pago, numero_recibo, observaciones, fecha_pago
  ) VALUES (
    p_cuota_id, p_cajero_id, p_monto_pagado, p_mora_cobrada,
    p_metodo_pago, v_recibo_num, p_observaciones, p_fecha_pago
  ) RETURNING id INTO v_pago_id;

  -- Actualizar estado de la cuota y limpiar mora acumulada
  UPDATE cuotas
  SET
    estado         = 'pagada',
    fecha_pago     = p_fecha_pago,
    mora_acumulada = 0
  WHERE id = p_cuota_id;

  -- ── ASIENTOS CONTABLES ──────────────────────────────────────

  -- 1. Ingreso de caja total (DEBE)
  IF v_cuenta_caja IS NOT NULL THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (p_fecha_pago,
      'Cobro cuota #' || v_cuota.numero_cuota || ' — Préstamo ' || v_prestamo.id,
      p_monto_pagado, 0, v_cuenta_caja, v_pago_id, 'pago_capital', p_cajero_id);
  END IF;

  -- 2. Reducción cartera (HABER)
  IF v_cuenta_cartera IS NOT NULL AND v_capital_part > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (p_fecha_pago,
      'Recuperación capital cuota #' || v_cuota.numero_cuota,
      0, v_capital_part, v_cuenta_cartera, v_pago_id, 'pago_capital', p_cajero_id);
  END IF;

  -- 3. Ingreso por intereses (HABER)
  IF v_cuenta_interes IS NOT NULL AND v_interes_part > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (p_fecha_pago,
      'Interés cuota #' || v_cuota.numero_cuota,
      0, v_interes_part, v_cuenta_interes, v_pago_id, 'pago_interes', p_cajero_id);
  END IF;

  -- 4. Ingreso por mora (HABER)
  IF v_cuenta_mora IS NOT NULL AND p_mora_cobrada > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (p_fecha_pago,
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
    UPDATE garantias SET estado = 'devuelta'
    WHERE id = v_prestamo.garantia_id;
  END IF;

  -- Saldo total pendiente (capital + intereses futuros)
  SELECT COALESCE(SUM(monto_total), 0)
  INTO v_saldo_pendiente
  FROM cuotas
  WHERE prestamo_id = v_cuota.prestamo_id
    AND estado != 'pagada';

  -- Saldo de capital pendiente (solo capital de cuotas no pagadas)
  SELECT COALESCE(SUM(capital), 0)
  INTO v_saldo_capital_pendiente
  FROM cuotas
  WHERE prestamo_id = v_cuota.prestamo_id
    AND estado != 'pagada';

  RETURN jsonb_build_object(
    'pago_id',                 v_pago_id,
    'recibo_num',              v_recibo_num,
    'capital',                 v_capital_part,
    'interes',                 v_interes_part,
    'mora',                    p_mora_cobrada,
    'total',                   p_monto_pagado,
    'prestamo_cancelado',      v_todas_pagadas,
    'saldo_pendiente',         v_saldo_pendiente,
    'saldo_capital_pendiente', v_saldo_capital_pendiente
  );
END;
$$;
