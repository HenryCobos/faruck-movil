-- ============================================================
-- PIGNORA — Abono a capital: permitir liquidación total
--
-- Cambios:
--  • Permite abonar el 100% del capital pendiente (liquidación).
--  • Al liquidar: elimina cuotas pendientes (incl. intereses futuros),
--    cancela el préstamo y libera la garantía.
--  • Rechaza solo si el monto supera el saldo de capital.
--  • Retorna prestamo_cancelado e interes_ahorrado en el JSON.
-- ============================================================

CREATE OR REPLACE FUNCTION aplicar_abono_capital(
  p_prestamo_id   UUID,
  p_cajero_id     UUID,
  p_monto         NUMERIC,
  p_metodo_pago   metodo_pago DEFAULT 'efectivo',
  p_observaciones TEXT        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prestamo            prestamos%ROWTYPE;
  v_saldo_pendiente     NUMERIC;
  v_nuevo_saldo         NUMERIC;
  v_n_cuotas            INTEGER;
  v_primera_fecha       DATE;
  v_ultimo_numero       INTEGER;
  v_recibo_num          TEXT;
  v_abono_id            UUID;
  v_cuenta_caja         UUID;
  v_cuenta_cartera      UUID;
  v_es_liquidacion      BOOLEAN;
  v_monto_efectivo      NUMERIC;
  v_interes_ahorrado    NUMERIC := 0;
  -- loop vars
  v_r                   NUMERIC;
  v_saldo               NUMERIC;
  v_capital             NUMERIC;
  v_interes             NUMERIC;
  v_cuota_fija          NUMERIC;
  v_capital_fijo        NUMERIC;
  v_interes_mensual     NUMERIC;
  v_fecha_v             DATE;
  v_i                   INTEGER;
  v_nueva_cuota_monto   NUMERIC;
BEGIN
  -- ── Obtener préstamo ────────────────────────────────────────
  SELECT * INTO v_prestamo FROM prestamos WHERE id = p_prestamo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Préstamo no encontrado';
  END IF;
  IF v_prestamo.estado != 'activo' THEN
    RAISE EXCEPTION 'Solo se puede abonar a capital en préstamos activos';
  END IF;

  -- ── Calcular saldo y cuotas pendientes ─────────────────────
  SELECT
    COUNT(*),
    COALESCE(SUM(capital), 0),
    MIN(fecha_vencimiento)
  INTO v_n_cuotas, v_saldo_pendiente, v_primera_fecha
  FROM cuotas
  WHERE prestamo_id = p_prestamo_id
    AND estado != 'pagada';

  IF v_n_cuotas = 0 THEN
    RAISE EXCEPTION 'No hay cuotas pendientes en este préstamo';
  END IF;

  IF p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser mayor a cero';
  END IF;

  IF p_monto > v_saldo_pendiente THEN
    RAISE EXCEPTION 'El abono (%) supera el saldo pendiente de capital (%)',
      p_monto, v_saldo_pendiente;
  END IF;

  -- Liquidación total: abono igual al capital pendiente
  v_es_liquidacion   := (p_monto >= v_saldo_pendiente);
  v_monto_efectivo   := CASE WHEN v_es_liquidacion THEN v_saldo_pendiente ELSE p_monto END;
  v_nuevo_saldo      := v_saldo_pendiente - v_monto_efectivo;

  -- Intereses futuros que se cancelan al liquidar
  IF v_es_liquidacion THEN
    SELECT COALESCE(SUM(interes), 0)
    INTO v_interes_ahorrado
    FROM cuotas
    WHERE prestamo_id = p_prestamo_id
      AND estado != 'pagada';
  END IF;

  -- Número de la última cuota pagada (para renumerar a continuación)
  SELECT COALESCE(MAX(numero_cuota), 0)
  INTO v_ultimo_numero
  FROM cuotas
  WHERE prestamo_id = p_prestamo_id AND estado = 'pagada';

  -- ── Verificar que no haya pagos vigentes en cuotas pendientes ─
  IF EXISTS (
    SELECT 1
    FROM pagos pg
    JOIN cuotas c ON c.id = pg.cuota_id
    WHERE c.prestamo_id = p_prestamo_id
      AND c.estado      != 'pagada'
      AND pg.anulado    = false
  ) THEN
    RAISE EXCEPTION
      'Existen pagos vigentes en cuotas pendientes (cuotas con pago parcial). '
      'Anula esos pagos primero y luego vuelve a aplicar el abono.';
  END IF;

  DELETE FROM pagos
  WHERE anulado = true
    AND cuota_id IN (
      SELECT id FROM cuotas
      WHERE prestamo_id = p_prestamo_id
        AND estado != 'pagada'
    );

  -- ── Eliminar cuotas pendientes ─────────────────────────────
  DELETE FROM cuotas
  WHERE prestamo_id = p_prestamo_id
    AND estado != 'pagada';

  -- ── Regenerar cronograma (solo abono parcial) ───────────────
  IF NOT v_es_liquidacion THEN
    v_r     := v_prestamo.tasa_mensual;
    v_saldo := v_nuevo_saldo;

    IF v_r = 0 THEN
      v_capital_fijo := ROUND(v_nuevo_saldo / v_n_cuotas, 2);
      FOR v_i IN 1..v_n_cuotas LOOP
        v_capital := v_capital_fijo;
        IF v_i = v_n_cuotas THEN v_capital := ROUND(v_saldo, 2); END IF;
        v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
        INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
          VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_capital, 0, v_capital);
        v_saldo := v_saldo - v_capital;
      END LOOP;
      v_nueva_cuota_monto := ROUND(v_nuevo_saldo / v_n_cuotas, 2);

    ELSIF v_prestamo.tipo_amortizacion = 'francesa' THEN
      v_cuota_fija := v_saldo * (v_r * POWER(1 + v_r, v_n_cuotas))
                              / (POWER(1 + v_r, v_n_cuotas) - 1);
      v_nueva_cuota_monto := ROUND(v_cuota_fija, 2);
      FOR v_i IN 1..v_n_cuotas LOOP
        v_interes := ROUND(v_saldo * v_r, 2);
        v_capital := ROUND(v_cuota_fija - v_interes, 2);
        IF v_i = v_n_cuotas THEN v_capital := ROUND(v_saldo, 2); END IF;
        v_saldo   := v_saldo - v_capital;
        v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
        INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
          VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_capital, v_interes, v_capital + v_interes);
      END LOOP;

    ELSIF v_prestamo.tipo_amortizacion = 'alemana' THEN
      v_capital_fijo      := ROUND(v_nuevo_saldo / v_n_cuotas, 2);
      v_nueva_cuota_monto := v_capital_fijo + ROUND(v_nuevo_saldo * v_r, 2);
      FOR v_i IN 1..v_n_cuotas LOOP
        v_interes := ROUND(v_saldo * v_r, 2);
        v_capital := CASE WHEN v_i = v_n_cuotas THEN ROUND(v_saldo, 2) ELSE v_capital_fijo END;
        v_saldo   := v_saldo - v_capital;
        v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
        INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
          VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_capital, v_interes, v_capital + v_interes);
      END LOOP;

    ELSIF v_prestamo.tipo_amortizacion = 'solo_interes' THEN
      v_interes_mensual   := ROUND(v_nuevo_saldo * v_r, 2);
      v_nueva_cuota_monto := v_interes_mensual;
      FOR v_i IN 1..v_n_cuotas LOOP
        v_capital := CASE WHEN v_i = v_n_cuotas THEN v_nuevo_saldo ELSE 0 END;
        v_interes := v_interes_mensual;
        v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
        INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
          VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_capital, v_interes, v_capital + v_interes);
      END LOOP;

    ELSIF v_prestamo.tipo_amortizacion = 'solo_interes_adelantado' THEN
      v_interes_mensual   := ROUND(v_nuevo_saldo * v_r, 2);
      v_nueva_cuota_monto := v_interes_mensual;
      FOR v_i IN 1..v_n_cuotas LOOP
        IF v_i < v_n_cuotas THEN
          v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
          INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
            VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, 0, v_interes_mensual, v_interes_mensual);
        ELSE
          v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
          INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
            VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_nuevo_saldo, 0, v_nuevo_saldo);
          v_nueva_cuota_monto := v_nuevo_saldo;
        END IF;
      END LOOP;

    ELSIF v_prestamo.tipo_amortizacion = 'anticipado' THEN
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p_prestamo_id, v_ultimo_numero + 1, v_primera_fecha, v_nuevo_saldo, 0, v_nuevo_saldo);
      v_nueva_cuota_monto := v_nuevo_saldo;
    END IF;

  ELSE
    -- Liquidación: cerrar préstamo
    v_nueva_cuota_monto := 0;
    UPDATE prestamos SET estado = 'cancelado' WHERE id = p_prestamo_id;
    IF v_prestamo.garantia_id IS NOT NULL THEN
      UPDATE garantias SET estado = 'devuelta' WHERE id = v_prestamo.garantia_id;
    END IF;
  END IF;

  -- ── Número de recibo ───────────────────────────────────────
  v_recibo_num := 'ABONO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                  LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');

  -- ── Registrar abono ────────────────────────────────────────
  INSERT INTO abonos_capital (
    prestamo_id, cajero_id, monto_abono, saldo_anterior, saldo_nuevo,
    metodo_pago, numero_recibo, observaciones, n_cuotas_restantes
  ) VALUES (
    p_prestamo_id, p_cajero_id, v_monto_efectivo, v_saldo_pendiente, v_nuevo_saldo,
    p_metodo_pago, v_recibo_num, p_observaciones,
    CASE WHEN v_es_liquidacion THEN 0 ELSE v_n_cuotas END
  ) RETURNING id INTO v_abono_id;

  -- ── Asientos contables ─────────────────────────────────────
  SELECT id INTO v_cuenta_caja    FROM plan_cuentas WHERE codigo = '1110' LIMIT 1;
  SELECT id INTO v_cuenta_cartera FROM plan_cuentas WHERE codigo = '1210' LIMIT 1;

  IF v_cuenta_caja IS NOT NULL THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      CASE WHEN v_es_liquidacion
        THEN 'Liquidación anticipada — Préstamo ' || p_prestamo_id || ' · Recibo ' || v_recibo_num
        ELSE 'Abono a capital — Préstamo ' || p_prestamo_id || ' · Recibo ' || v_recibo_num
      END,
      v_monto_efectivo, 0, v_cuenta_caja, v_abono_id, 'pago_capital', p_cajero_id);
  END IF;

  IF v_cuenta_cartera IS NOT NULL THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      CASE WHEN v_es_liquidacion
        THEN 'Liquidación cartera — Préstamo ' || p_prestamo_id
        ELSE 'Reducción cartera — Abono capital Préstamo ' || p_prestamo_id
      END,
      0, v_monto_efectivo, v_cuenta_cartera, v_abono_id, 'pago_capital', p_cajero_id);
  END IF;

  RETURN jsonb_build_object(
    'abono_id',           v_abono_id,
    'recibo_num',         v_recibo_num,
    'saldo_anterior',     v_saldo_pendiente,
    'saldo_nuevo',        v_nuevo_saldo,
    'n_cuotas',           CASE WHEN v_es_liquidacion THEN 0 ELSE v_n_cuotas END,
    'nueva_cuota_monto',  ROUND(v_nueva_cuota_monto, 2),
    'prestamo_cancelado', v_es_liquidacion,
    'interes_ahorrado',   ROUND(v_interes_ahorrado, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION aplicar_abono_capital(UUID, UUID, NUMERIC, metodo_pago, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aplicar_abono_capital(UUID, UUID, NUMERIC, metodo_pago, TEXT) TO authenticated;
