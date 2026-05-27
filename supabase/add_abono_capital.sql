-- ============================================================
-- PIGNORA APP — Abono a Capital
-- Ejecutar en SQL Editor de Supabase
--
-- Implementa:
--  1. Tabla abonos_capital para historial de abonos
--  2. Función aplicar_abono_capital: valida, elimina cuotas
--     pendientes, regenera el cronograma con el nuevo saldo
--     (mismo número de cuotas, cuota más pequeña) y registra
--     asientos contables.
--  3. RLS y permisos
-- ============================================================

-- ── 1. TABLA abonos_capital ──────────────────────────────────

CREATE TABLE IF NOT EXISTS abonos_capital (
  id                 uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  prestamo_id        uuid        NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  cajero_id          uuid        NOT NULL REFERENCES profiles(id),
  monto_abono        numeric(14,2) NOT NULL CHECK (monto_abono > 0),
  saldo_anterior     numeric(14,2) NOT NULL,
  saldo_nuevo        numeric(14,2) NOT NULL,
  metodo_pago        metodo_pago NOT NULL DEFAULT 'efectivo',
  numero_recibo      text        NOT NULL UNIQUE,
  observaciones      text,
  n_cuotas_restantes integer     NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abonos_prestamo ON abonos_capital(prestamo_id);
CREATE INDEX IF NOT EXISTS idx_abonos_fecha    ON abonos_capital(created_at);

ALTER TABLE abonos_capital ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios activos ven abonos" ON abonos_capital;
CREATE POLICY "Usuarios activos ven abonos"
  ON abonos_capital FOR SELECT
  USING (is_active_user() = true);

DROP POLICY IF EXISTS "Admin cajero y oficial registran abonos" ON abonos_capital;
CREATE POLICY "Admin cajero y oficial registran abonos"
  ON abonos_capital FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'cajero', 'oficial') AND is_active_user() = true);

-- ── 2. FUNCIÓN aplicar_abono_capital ────────────────────────

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
  v_prestamo          prestamos%ROWTYPE;
  v_saldo_pendiente   NUMERIC;
  v_nuevo_saldo       NUMERIC;
  v_n_cuotas          INTEGER;
  v_primera_fecha     DATE;
  v_ultimo_numero     INTEGER;
  v_recibo_num        TEXT;
  v_abono_id          UUID;
  v_cuenta_caja       UUID;
  v_cuenta_cartera    UUID;
  -- loop vars
  v_r                 NUMERIC;
  v_saldo             NUMERIC;
  v_capital           NUMERIC;
  v_interes           NUMERIC;
  v_cuota_fija        NUMERIC;
  v_capital_fijo      NUMERIC;
  v_interes_mensual   NUMERIC;
  v_fecha_v           DATE;
  v_i                 INTEGER;
  v_nueva_cuota_monto NUMERIC;
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

  IF p_monto >= v_saldo_pendiente THEN
    RAISE EXCEPTION 'El abono (%) supera o iguala el saldo pendiente de capital (%). Para cancelar el préstamo usa el cobro normal de cuotas.',
      p_monto, v_saldo_pendiente;
  END IF;

  -- Número de la última cuota pagada (para renumerar a continuación)
  SELECT COALESCE(MAX(numero_cuota), 0)
  INTO v_ultimo_numero
  FROM cuotas
  WHERE prestamo_id = p_prestamo_id AND estado = 'pagada';

  v_nuevo_saldo := v_saldo_pendiente - p_monto;

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

  -- Eliminar pagos ya anulados que referencien las cuotas pendientes
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

  -- ── Regenerar cuotas con nuevo saldo ───────────────────────
  v_r     := v_prestamo.tasa_mensual;
  v_saldo := v_nuevo_saldo;

  -- Tasa 0 (crédito de producto o préstamo sin interés)
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
    v_nueva_cuota_monto := v_capital_fijo + ROUND(v_nuevo_saldo * v_r, 2); -- primera cuota
    FOR v_i IN 1..v_n_cuotas LOOP
      v_interes := ROUND(v_saldo * v_r, 2);
      v_capital := CASE WHEN v_i = v_n_cuotas THEN ROUND(v_saldo, 2) ELSE v_capital_fijo END;
      v_saldo   := v_saldo - v_capital;
      v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_capital, v_interes, v_capital + v_interes);
    END LOOP;

  ELSIF v_prestamo.tipo_amortizacion = 'solo_interes' THEN
    -- Cuotas 1..N-1: solo interés; cuota N: capital + interés
    v_interes_mensual   := ROUND(v_nuevo_saldo * v_r, 2);
    v_nueva_cuota_monto := v_interes_mensual; -- cuotas intermedias
    FOR v_i IN 1..v_n_cuotas LOOP
      v_capital := CASE WHEN v_i = v_n_cuotas THEN v_nuevo_saldo ELSE 0 END;
      v_interes := v_interes_mensual;
      v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_capital, v_interes, v_capital + v_interes);
    END LOOP;

  ELSIF v_prestamo.tipo_amortizacion = 'solo_interes_adelantado' THEN
    -- N-1 cuotas de interés mensual + 1 cuota capital al final
    v_interes_mensual   := ROUND(v_nuevo_saldo * v_r, 2);
    v_nueva_cuota_monto := v_interes_mensual;
    FOR v_i IN 1..v_n_cuotas LOOP
      IF v_i < v_n_cuotas THEN
        -- Cuota de interés
        v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
        INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
          VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, 0, v_interes_mensual, v_interes_mensual);
      ELSE
        -- Última cuota: capital puro
        v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
        INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
          VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_nuevo_saldo, 0, v_nuevo_saldo);
        v_nueva_cuota_monto := v_nuevo_saldo;
      END IF;
    END LOOP;

  ELSIF v_prestamo.tipo_amortizacion = 'anticipado' THEN
    -- Solo queda la cuota de capital (interés ya cobrado al inicio)
    -- Insertar 1 cuota capital = nuevo_saldo en la primera_fecha
    INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
      VALUES (p_prestamo_id, v_ultimo_numero + 1, v_primera_fecha, v_nuevo_saldo, 0, v_nuevo_saldo);
    v_nueva_cuota_monto := v_nuevo_saldo;
  END IF;

  -- ── Número de recibo ───────────────────────────────────────
  v_recibo_num := 'ABONO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                  LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');

  -- ── Registrar abono ────────────────────────────────────────
  INSERT INTO abonos_capital (
    prestamo_id, cajero_id, monto_abono, saldo_anterior, saldo_nuevo,
    metodo_pago, numero_recibo, observaciones, n_cuotas_restantes
  ) VALUES (
    p_prestamo_id, p_cajero_id, p_monto, v_saldo_pendiente, v_nuevo_saldo,
    p_metodo_pago, v_recibo_num, p_observaciones, v_n_cuotas
  ) RETURNING id INTO v_abono_id;

  -- ── Asientos contables ─────────────────────────────────────
  SELECT id INTO v_cuenta_caja    FROM plan_cuentas WHERE codigo = '1110' LIMIT 1;
  SELECT id INTO v_cuenta_cartera FROM plan_cuentas WHERE codigo = '1210' LIMIT 1;

  IF v_cuenta_caja IS NOT NULL THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'Abono a capital — Préstamo ' || p_prestamo_id || ' · Recibo ' || v_recibo_num,
      p_monto, 0, v_cuenta_caja, v_abono_id, 'pago_capital', p_cajero_id);
  END IF;

  IF v_cuenta_cartera IS NOT NULL THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'Reducción cartera — Abono capital Préstamo ' || p_prestamo_id,
      0, p_monto, v_cuenta_cartera, v_abono_id, 'pago_capital', p_cajero_id);
  END IF;

  -- ── Resultado ─────────────────────────────────────────────
  RETURN jsonb_build_object(
    'abono_id',          v_abono_id,
    'recibo_num',        v_recibo_num,
    'saldo_anterior',    v_saldo_pendiente,
    'saldo_nuevo',       v_nuevo_saldo,
    'n_cuotas',          v_n_cuotas,
    'nueva_cuota_monto', ROUND(v_nueva_cuota_monto, 2)
  );
END;
$$;

-- ── 3. PERMISOS ──────────────────────────────────────────────

REVOKE ALL ON FUNCTION aplicar_abono_capital(UUID, UUID, NUMERIC, metodo_pago, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aplicar_abono_capital(UUID, UUID, NUMERIC, metodo_pago, TEXT) TO authenticated;
