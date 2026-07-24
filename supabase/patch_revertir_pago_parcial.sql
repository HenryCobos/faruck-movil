-- ============================================================
-- PIGNORA — Patch: revertir_pago compatible con cuotas parciales
-- Requiere: patch_registrar_pago_parcial.sql
-- ============================================================

CREATE OR REPLACE FUNCTION revertir_pago(
  p_pago_id         UUID,
  p_admin_id        UUID,
  p_motivo          TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago                pagos%ROWTYPE;
  v_cuota               cuotas%ROWTYPE;
  v_prestamo            prestamos%ROWTYPE;
  v_nuevo_estado_cuota  cuota_estado;
  v_prestamo_revertido  boolean := false;
  v_garantia_revertida  boolean := false;
  v_cuenta_caja         UUID;
  v_cuenta_cartera      UUID;
  v_cuenta_interes      UUID;
  v_cuenta_mora         UUID;
  v_capital_part        NUMERIC;
  v_interes_part        NUMERIC;
  v_saldo_int_antes     NUMERIC;
  v_saldo_cap_antes     NUMERIC;
  v_otros_pagos         INTEGER;
BEGIN
  SELECT * INTO v_pago FROM pagos WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;
  IF v_pago.anulado THEN
    RAISE EXCEPTION 'Este pago ya fue anulado anteriormente';
  END IF;

  SELECT * INTO v_cuota    FROM cuotas    WHERE id = v_pago.cuota_id FOR UPDATE;
  SELECT * INTO v_prestamo FROM prestamos WHERE id = v_cuota.prestamo_id;

  IF v_prestamo.estado = 'renovado' THEN
    RAISE EXCEPTION 'No se puede anular un pago de un préstamo que ya fue renovado';
  END IF;

  SELECT id INTO v_cuenta_caja    FROM plan_cuentas WHERE codigo = '1110' LIMIT 1;
  SELECT id INTO v_cuenta_cartera FROM plan_cuentas WHERE codigo = '1210' LIMIT 1;
  SELECT id INTO v_cuenta_interes FROM plan_cuentas WHERE codigo = '4110' LIMIT 1;
  SELECT id INTO v_cuenta_mora    FROM plan_cuentas WHERE codigo = '4130' LIMIT 1;

  -- Saldos antes de este pago (excluyéndolo) → asignación interés-primero del pago anulado
  SELECT s.saldo_interes, s.saldo_capital
  INTO v_saldo_int_antes, v_saldo_cap_antes
  FROM calcular_saldos_restantes_cuota(v_cuota.id, p_pago_id) s;

  SELECT a.interes_part, a.capital_part
  INTO v_interes_part, v_capital_part
  FROM asignar_pago_interes_primero(
    GREATEST(v_pago.monto_pagado - v_pago.mora_cobrada, 0),
    v_saldo_int_antes,
    v_saldo_cap_antes
  ) a;

  IF v_cuenta_caja IS NOT NULL THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'REVERSA — Anulación pago cuota #' || v_cuota.numero_cuota || ' — Recibo ' || v_pago.numero_recibo,
      0, v_pago.monto_pagado, v_cuenta_caja, p_pago_id, 'devolucion_garantia', p_admin_id);
  END IF;

  IF v_cuenta_cartera IS NOT NULL AND v_capital_part > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'REVERSA capital cuota #' || v_cuota.numero_cuota,
      v_capital_part, 0, v_cuenta_cartera, p_pago_id, 'pago_capital', p_admin_id);
  END IF;

  IF v_cuenta_interes IS NOT NULL AND v_interes_part > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'REVERSA interés cuota #' || v_cuota.numero_cuota,
      v_interes_part, 0, v_cuenta_interes, p_pago_id, 'pago_interes', p_admin_id);
  END IF;

  IF v_cuenta_mora IS NOT NULL AND v_pago.mora_cobrada > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'REVERSA mora cuota #' || v_cuota.numero_cuota,
      v_pago.mora_cobrada, 0, v_cuenta_mora, p_pago_id, 'mora', p_admin_id);
  END IF;

  UPDATE pagos
  SET
    anulado          = true,
    anulado_at       = NOW(),
    anulado_por      = p_admin_id,
    motivo_anulacion = p_motivo
  WHERE id = p_pago_id;

  SELECT COUNT(*) INTO v_otros_pagos
  FROM pagos
  WHERE cuota_id = v_cuota.id
    AND anulado = false;

  IF v_otros_pagos > 0 THEN
    v_nuevo_estado_cuota := 'parcial'::cuota_estado;
  ELSE
    v_nuevo_estado_cuota := CASE
      WHEN v_cuota.fecha_vencimiento < CURRENT_DATE THEN 'vencida'::cuota_estado
      ELSE 'pendiente'::cuota_estado
    END;
  END IF;

  UPDATE cuotas
  SET
    estado     = v_nuevo_estado_cuota,
    fecha_pago = CASE WHEN v_nuevo_estado_cuota = 'pagada' THEN fecha_pago ELSE NULL END
  WHERE id = v_cuota.id;

  IF v_prestamo.estado = 'cancelado' THEN
    IF EXISTS (
      SELECT 1 FROM cuotas
      WHERE prestamo_id = v_prestamo.id
        AND estado != 'pagada'
    ) THEN
      UPDATE prestamos SET estado = 'activo' WHERE id = v_prestamo.id;
      v_prestamo_revertido := true;

      IF v_prestamo.garantia_id IS NOT NULL THEN
        UPDATE garantias
        SET estado = 'en_garantia'
        WHERE id = v_prestamo.garantia_id
          AND estado = 'devuelta';

        GET DIAGNOSTICS v_garantia_revertida = ROW_COUNT;
        v_garantia_revertida := (v_garantia_revertida::int > 0);
      END IF;
    END IF;
  END IF;

  PERFORM registrar_auditoria(
    'pagos',
    'eliminar',
    p_pago_id,
    'Pago anulado — Recibo ' || v_pago.numero_recibo ||
      ' · $' || v_pago.monto_pagado ||
      ' · Cuota #' || v_cuota.numero_cuota ||
      ' · Motivo: ' || p_motivo,
    jsonb_build_object(
      'recibo',             v_pago.numero_recibo,
      'monto',              v_pago.monto_pagado,
      'mora',               v_pago.mora_cobrada,
      'metodo',             v_pago.metodo_pago,
      'cuota_numero',       v_cuota.numero_cuota,
      'cuota_nuevo_estado', v_nuevo_estado_cuota,
      'prestamo_revertido', v_prestamo_revertido,
      'garantia_revertida', v_garantia_revertida,
      'motivo',             p_motivo
    )
  );

  RETURN jsonb_build_object(
    'ok',                   true,
    'pago_id',              p_pago_id,
    'recibo',               v_pago.numero_recibo,
    'cuota_nuevo_estado',   v_nuevo_estado_cuota,
    'prestamo_revertido',   v_prestamo_revertido,
    'garantia_revertida',   v_garantia_revertida
  );
END;
$$;

GRANT EXECUTE ON FUNCTION revertir_pago(UUID, UUID, TEXT) TO authenticated;
