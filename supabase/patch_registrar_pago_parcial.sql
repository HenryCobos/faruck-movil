-- ============================================================
-- PIGNORA — Patch: pagos parciales y solo interés del periodo
--
-- Permite pagar solo el interés de una cuota francesa/alemana.
-- El capital queda pendiente en la misma cuota (estado 'parcial').
-- Asignación interés-primero sobre saldos restantes.
-- ============================================================

DROP FUNCTION IF EXISTS registrar_pago(UUID, UUID, NUMERIC, NUMERIC, metodo_pago, TEXT, DATE);

-- Helper: saldos restantes de una cuota simulando pagos vigentes (interés-primero)
CREATE OR REPLACE FUNCTION calcular_saldos_restantes_cuota(
  p_cuota_id        UUID,
  p_excluir_pago_id UUID DEFAULT NULL
)
RETURNS TABLE (
  saldo_interes  NUMERIC,
  saldo_capital  NUMERIC,
  saldo_total    NUMERIC,
  pagado_total   NUMERIC
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_cuota         cuotas%ROWTYPE;
  v_pago          RECORD;
  v_saldo_int     NUMERIC;
  v_saldo_cap     NUMERIC;
  v_monto_neto    NUMERIC;
  v_a_interes     NUMERIC;
  v_a_capital     NUMERIC;
BEGIN
  SELECT * INTO v_cuota FROM cuotas WHERE id = p_cuota_id;
  IF NOT FOUND THEN
    saldo_interes := 0; saldo_capital := 0; saldo_total := 0; pagado_total := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  v_saldo_int := v_cuota.interes;
  v_saldo_cap := v_cuota.capital;
  pagado_total := 0;

  FOR v_pago IN
    SELECT id, monto_pagado, mora_cobrada
    FROM pagos
    WHERE cuota_id = p_cuota_id
      AND anulado = false
      AND (p_excluir_pago_id IS NULL OR id != p_excluir_pago_id)
    ORDER BY fecha_pago ASC, created_at ASC
  LOOP
    pagado_total := pagado_total + v_pago.monto_pagado;
    v_monto_neto := GREATEST(v_pago.monto_pagado - v_pago.mora_cobrada, 0);

    v_a_interes := LEAST(v_monto_neto, v_saldo_int);
    v_saldo_int := GREATEST(v_saldo_int - v_a_interes, 0);

    v_a_capital := LEAST(v_monto_neto - v_a_interes, v_saldo_cap);
    v_saldo_cap := GREATEST(v_saldo_cap - v_a_capital, 0);
  END LOOP;

  saldo_interes := v_saldo_int;
  saldo_capital := v_saldo_cap;
  saldo_total   := v_saldo_int + v_saldo_cap;
  RETURN NEXT;
END;
$$;

-- Helper: asignar un monto neto sobre saldos dados (interés-primero)
CREATE OR REPLACE FUNCTION asignar_pago_interes_primero(
  p_monto_neto    NUMERIC,
  p_saldo_interes NUMERIC,
  p_saldo_capital NUMERIC
)
RETURNS TABLE (
  interes_part  NUMERIC,
  capital_part  NUMERIC
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  interes_part := LEAST(GREATEST(p_monto_neto, 0), GREATEST(p_saldo_interes, 0));
  capital_part := LEAST(GREATEST(p_monto_neto - interes_part, 0), GREATEST(p_saldo_capital, 0));
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION registrar_pago(
  p_cuota_id      UUID,
  p_cajero_id     UUID,
  p_monto_pagado  NUMERIC,
  p_mora_cobrada  NUMERIC DEFAULT 0,
  p_metodo_pago   metodo_pago DEFAULT 'efectivo',
  p_observaciones TEXT DEFAULT NULL,
  p_fecha_pago    DATE DEFAULT CURRENT_DATE,
  p_solo_interes  BOOLEAN DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuota                   cuotas%ROWTYPE;
  v_prestamo                prestamos%ROWTYPE;
  v_recibo_num              TEXT;
  v_pago_id                 UUID;
  v_cuenta_caja             UUID;
  v_cuenta_cartera          UUID;
  v_cuenta_interes          UUID;
  v_cuenta_mora             UUID;
  v_capital_part            NUMERIC;
  v_interes_part            NUMERIC;
  v_saldo_int_antes         NUMERIC;
  v_saldo_cap_antes         NUMERIC;
  v_saldo_total_antes       NUMERIC;
  v_saldo_int_despues       NUMERIC;
  v_saldo_cap_despues       NUMERIC;
  v_saldo_cuota_restante    NUMERIC;
  v_nuevo_estado            cuota_estado;
  v_todas_pagadas           BOOLEAN;
  v_saldo_pendiente         NUMERIC;
  v_saldo_capital_pendiente NUMERIC;
  v_monto_neto              NUMERIC;
  v_es_solo_interes         BOOLEAN;
BEGIN
  SELECT * INTO v_cuota FROM cuotas WHERE id = p_cuota_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuota no encontrada';
  END IF;
  IF v_cuota.estado = 'pagada' THEN
    RAISE EXCEPTION 'Esta cuota ya fue pagada';
  END IF;

  SELECT * INTO v_prestamo FROM prestamos WHERE id = v_cuota.prestamo_id;

  SELECT s.saldo_interes, s.saldo_capital, s.saldo_total
  INTO v_saldo_int_antes, v_saldo_cap_antes, v_saldo_total_antes
  FROM calcular_saldos_restantes_cuota(p_cuota_id) s;

  IF p_monto_pagado <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  IF p_monto_pagado > v_saldo_total_antes + p_mora_cobrada THEN
    RAISE EXCEPTION 'El monto excede el saldo restante de la cuota (%)',
      TO_CHAR(v_saldo_total_antes, 'FM999G999G999G990D00');
  END IF;

  v_monto_neto := GREATEST(p_monto_pagado - p_mora_cobrada, 0);

  IF p_solo_interes THEN
    IF v_saldo_int_antes <= 0 THEN
      RAISE EXCEPTION 'No hay interés pendiente en esta cuota';
    END IF;
    IF v_monto_neto > v_saldo_int_antes THEN
      RAISE EXCEPTION 'En pago solo interés el monto no puede superar el interés pendiente (%)',
        TO_CHAR(v_saldo_int_antes, 'FM999G999G999G990D00');
    END IF;
  END IF;

  SELECT a.interes_part, a.capital_part
  INTO v_interes_part, v_capital_part
  FROM asignar_pago_interes_primero(v_monto_neto, v_saldo_int_antes, v_saldo_cap_antes) a;

  v_saldo_int_despues := GREATEST(v_saldo_int_antes - v_interes_part, 0);
  v_saldo_cap_despues := GREATEST(v_saldo_cap_antes - v_capital_part, 0);
  v_saldo_cuota_restante := v_saldo_int_despues + v_saldo_cap_despues;
  v_es_solo_interes := (v_capital_part = 0 AND v_interes_part > 0);

  v_recibo_num := 'REC-' || TO_CHAR(p_fecha_pago, 'YYYYMMDD') || '-' ||
                  LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');

  SELECT id INTO v_cuenta_caja     FROM plan_cuentas WHERE codigo = '1110' LIMIT 1;
  SELECT id INTO v_cuenta_cartera  FROM plan_cuentas WHERE codigo = '1210' LIMIT 1;
  SELECT id INTO v_cuenta_interes  FROM plan_cuentas WHERE codigo = '4110' LIMIT 1;
  SELECT id INTO v_cuenta_mora     FROM plan_cuentas WHERE codigo = '4130' LIMIT 1;

  INSERT INTO pagos (
    cuota_id, cajero_id, monto_pagado, mora_cobrada,
    metodo_pago, numero_recibo, observaciones, fecha_pago
  ) VALUES (
    p_cuota_id, p_cajero_id, p_monto_pagado, p_mora_cobrada,
    p_metodo_pago, v_recibo_num, p_observaciones, p_fecha_pago
  ) RETURNING id INTO v_pago_id;

  v_nuevo_estado := CASE
    WHEN v_saldo_cuota_restante <= 0 THEN 'pagada'::cuota_estado
    ELSE 'parcial'::cuota_estado
  END;

  UPDATE cuotas
  SET
    estado         = v_nuevo_estado,
    fecha_pago     = CASE WHEN v_nuevo_estado = 'pagada' THEN p_fecha_pago ELSE fecha_pago END,
    mora_acumulada = CASE WHEN v_nuevo_estado = 'pagada' THEN 0 ELSE mora_acumulada END
  WHERE id = p_cuota_id;

  IF v_cuenta_caja IS NOT NULL THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (p_fecha_pago,
      'Cobro cuota #' || v_cuota.numero_cuota || ' — Préstamo ' || v_prestamo.id,
      p_monto_pagado, 0, v_cuenta_caja, v_pago_id, 'pago_capital', p_cajero_id);
  END IF;

  IF v_cuenta_cartera IS NOT NULL AND v_capital_part > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (p_fecha_pago,
      'Recuperación capital cuota #' || v_cuota.numero_cuota,
      0, v_capital_part, v_cuenta_cartera, v_pago_id, 'pago_capital', p_cajero_id);
  END IF;

  IF v_cuenta_interes IS NOT NULL AND v_interes_part > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (p_fecha_pago,
      'Interés cuota #' || v_cuota.numero_cuota,
      0, v_interes_part, v_cuenta_interes, v_pago_id, 'pago_interes', p_cajero_id);
  END IF;

  IF v_cuenta_mora IS NOT NULL AND p_mora_cobrada > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (p_fecha_pago,
      'Mora cuota #' || v_cuota.numero_cuota,
      0, p_mora_cobrada, v_cuenta_mora, v_pago_id, 'mora', p_cajero_id);
  END IF;

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

  SELECT COALESCE(SUM(
    CASE
      WHEN c.estado = 'parcial' THEN sr.saldo_total
      ELSE c.monto_total
    END
  ), 0)
  INTO v_saldo_pendiente
  FROM cuotas c
  LEFT JOIN LATERAL calcular_saldos_restantes_cuota(c.id) sr ON true
  WHERE c.prestamo_id = v_cuota.prestamo_id
    AND c.estado != 'pagada';

  SELECT COALESCE(SUM(
    CASE
      WHEN c.estado = 'parcial' THEN sr.saldo_capital
      ELSE c.capital
    END
  ), 0)
  INTO v_saldo_capital_pendiente
  FROM cuotas c
  LEFT JOIN LATERAL calcular_saldos_restantes_cuota(c.id) sr ON true
  WHERE c.prestamo_id = v_cuota.prestamo_id
    AND c.estado != 'pagada';

  RETURN jsonb_build_object(
    'pago_id',                 v_pago_id,
    'recibo_num',              v_recibo_num,
    'capital',                 v_capital_part,
    'interes',                 v_interes_part,
    'mora',                    p_mora_cobrada,
    'total',                   p_monto_pagado,
    'prestamo_cancelado',      v_todas_pagadas,
    'saldo_pendiente',         v_saldo_pendiente,
    'saldo_capital_pendiente', v_saldo_capital_pendiente,
    'solo_interes',            v_es_solo_interes,
    'cuota_estado',            v_nuevo_estado,
    'saldo_cuota_restante',    v_saldo_cuota_restante
  );
END;
$$;

GRANT EXECUTE ON FUNCTION calcular_saldos_restantes_cuota(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION asignar_pago_interes_primero(NUMERIC, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_pago(UUID, UUID, NUMERIC, NUMERIC, metodo_pago, TEXT, DATE, BOOLEAN) TO authenticated;
