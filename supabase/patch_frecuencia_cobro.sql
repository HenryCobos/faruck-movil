-- ============================================================
-- PIGNORA — Frecuencia de cobro (semanal, quincenal, mensual)
-- Ejecutar en Supabase SQL Editor.
-- Datos existentes: columna DEFAULT 'mensual' (sin recalcular cuotas).
-- ============================================================

DO $$ BEGIN
  CREATE TYPE frecuencia_cobro AS ENUM ('mensual', 'quincenal', 'semanal');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE prestamos
  ADD COLUMN IF NOT EXISTS frecuencia_cobro frecuencia_cobro NOT NULL DEFAULT 'mensual';

-- Tasa mensual → tasa por periodo de cobro
CREATE OR REPLACE FUNCTION tasa_periodo_cobro(tasa_mensual NUMERIC, freq frecuencia_cobro)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE freq
    WHEN 'semanal'    THEN tasa_mensual / 4
    WHEN 'quincenal'  THEN tasa_mensual / 2
    ELSE tasa_mensual
  END;
$$;

-- Cuota i vence en fecha_base + i periodos (igual convención que + i meses hoy)
CREATE OR REPLACE FUNCTION fecha_cuota_cobro(fecha_base DATE, numero INTEGER, freq frecuencia_cobro)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE freq
    WHEN 'semanal'   THEN fecha_base + (numero * INTERVAL '7 days')
    WHEN 'quincenal' THEN fecha_base + (numero * INTERVAL '15 days')
    ELSE fecha_base + (numero * INTERVAL '1 month')
  END;
$$;

-- Avance desde una fecha ancla (p. ej. primera cuota pendiente tras abono)
CREATE OR REPLACE FUNCTION avanzar_fecha_cobro(fecha_inicio DATE, pasos INTEGER, freq frecuencia_cobro)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN pasos <= 0 THEN fecha_inicio
    WHEN freq = 'semanal'   THEN fecha_inicio + (pasos * INTERVAL '7 days')
    WHEN freq = 'quincenal' THEN fecha_inicio + (pasos * INTERVAL '15 days')
    ELSE fecha_inicio + (pasos * INTERVAL '1 month')
  END;
$$;

-- ── generar_cronograma (consolidado + frecuencia) ───────────────────────────
CREATE OR REPLACE FUNCTION generar_cronograma(prestamo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p           prestamos%rowtype;
  r           numeric;
  freq        frecuencia_cobro;
  cuota_fija  numeric;
  saldo       numeric;
  capital     numeric;
  interes     numeric;
  fecha_v     date;
  i           integer;
BEGIN
  SELECT * INTO p FROM prestamos WHERE id = prestamo_id;
  freq := COALESCE(p.frecuencia_cobro, 'mensual'::frecuencia_cobro);
  r    := tasa_periodo_cobro(p.tasa_mensual, freq);
  saldo := p.monto_principal;

  -- Crédito producto / tasa 0: cuotas iguales sin interés
  IF r = 0 THEN
    capital := round(p.monto_principal / p.plazo_meses, 2);
    FOR i IN 1..p.plazo_meses LOOP
      IF i = p.plazo_meses THEN capital := round(saldo, 2); END IF;
      fecha_v := fecha_cuota_cobro(p.fecha_desembolso, i, freq);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, capital, 0, capital);
      saldo := saldo - capital;
    END LOOP;
    RETURN;
  END IF;

  IF p.tipo_amortizacion = 'francesa' THEN
    cuota_fija := saldo * (r * power(1 + r, p.plazo_meses)) / (power(1 + r, p.plazo_meses) - 1);
    FOR i IN 1..p.plazo_meses LOOP
      interes := round(saldo * r, 2);
      capital := round(cuota_fija - interes, 2);
      IF i = p.plazo_meses THEN capital := saldo; END IF;
      saldo   := saldo - capital;
      fecha_v := fecha_cuota_cobro(p.fecha_desembolso, i, freq);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, capital, interes, capital + interes);
    END LOOP;

  ELSIF p.tipo_amortizacion = 'alemana' THEN
    capital := round(p.monto_principal / p.plazo_meses, 2);
    FOR i IN 1..p.plazo_meses LOOP
      interes := round(saldo * r, 2);
      IF i = p.plazo_meses THEN capital := saldo; END IF;
      saldo   := saldo - capital;
      fecha_v := fecha_cuota_cobro(p.fecha_desembolso, i, freq);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, capital, interes, capital + interes);
    END LOOP;

  ELSIF p.tipo_amortizacion = 'solo_interes' THEN
    interes := round(p.monto_principal * r, 2);
    FOR i IN 1..p.plazo_meses LOOP
      capital := CASE WHEN i = p.plazo_meses THEN p.monto_principal ELSE 0 END;
      fecha_v := fecha_cuota_cobro(p.fecha_desembolso, i, freq);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, capital, interes, capital + interes);
    END LOOP;

  ELSIF p.tipo_amortizacion = 'solo_interes_adelantado' THEN
    interes := round(p.monto_principal * r, 2);
    FOR i IN 1..p.plazo_meses LOOP
      fecha_v := avanzar_fecha_cobro(p.fecha_desembolso, i - 1, freq);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, 0, interes, interes);
    END LOOP;
    INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
      VALUES (p.id, p.plazo_meses + 1,
        fecha_cuota_cobro(p.fecha_desembolso, p.plazo_meses, freq),
        p.monto_principal, 0, p.monto_principal);

  ELSIF p.tipo_amortizacion = 'anticipado' THEN
    IF p.plazo_dias IS NOT NULL AND p.plazo_dias > 0 THEN
      interes := round(p.monto_principal * p.tasa_mensual * p.plazo_dias / 30, 2);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, 1, p.fecha_desembolso, 0, interes, interes);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, 2, p.fecha_desembolso + (p.plazo_dias * INTERVAL '1 day'),
          p.monto_principal, 0, p.monto_principal);
    ELSE
      interes := round(p.monto_principal * r * p.plazo_meses, 2);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, 1, p.fecha_desembolso, 0, interes, interes);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, 2,
          fecha_cuota_cobro(p.fecha_desembolso, p.plazo_meses, freq),
          p.monto_principal, 0, p.monto_principal);
    END IF;
  END IF;
END;
$$;

-- ── renovar_prestamo: copiar / aceptar frecuencia ───────────────────────────
CREATE OR REPLACE FUNCTION renovar_prestamo(
  p_prestamo_anterior_id  UUID,
  p_nuevo_monto           NUMERIC,
  p_nueva_tasa            NUMERIC,
  p_nuevo_plazo           INTEGER,
  p_nuevo_tipo            TEXT,
  p_oficial_id            UUID,
  p_nueva_comision        NUMERIC  DEFAULT 0,
  p_observaciones         TEXT     DEFAULT NULL,
  p_nuevo_plazo_dias      INTEGER  DEFAULT NULL,
  p_frecuencia_cobro      frecuencia_cobro DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anterior  prestamos%ROWTYPE;
  v_nuevo_id  UUID;
  v_freq      frecuencia_cobro;
BEGIN
  SELECT * INTO v_anterior FROM prestamos WHERE id = p_prestamo_anterior_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Préstamo no encontrado: %', p_prestamo_anterior_id;
  END IF;
  IF v_anterior.estado NOT IN ('activo', 'cancelado') THEN
    RAISE EXCEPTION 'Solo se pueden renovar préstamos activos o liquidados. Estado actual: %', v_anterior.estado;
  END IF;

  v_freq := COALESCE(p_frecuencia_cobro, v_anterior.frecuencia_cobro, 'mensual'::frecuencia_cobro);

  UPDATE prestamos SET estado = 'renovado' WHERE id = p_prestamo_anterior_id;

  IF v_anterior.estado = 'activo' THEN
    UPDATE cuotas c
    SET
      estado     = 'pagada',
      fecha_pago = COALESCE(c.fecha_pago, CURRENT_DATE)
    WHERE c.prestamo_id = p_prestamo_anterior_id
      AND c.estado IN ('pendiente', 'vencida', 'parcial')
      AND EXISTS (
        SELECT 1 FROM pagos p
        WHERE p.cuota_id = c.id AND NOT p.anulado
      );

    DELETE FROM cuotas c
    WHERE c.prestamo_id = p_prestamo_anterior_id
      AND c.estado IN ('pendiente', 'vencida', 'parcial')
      AND NOT EXISTS (
        SELECT 1 FROM pagos p
        WHERE p.cuota_id = c.id AND NOT p.anulado
      );
  ELSE
    UPDATE garantias SET estado = 'en_garantia' WHERE id = v_anterior.garantia_id;
  END IF;

  INSERT INTO prestamos (
    cliente_id, garantia_id, oficial_id,
    monto_principal, tasa_mensual, plazo_meses, plazo_dias,
    tipo_amortizacion, comision_apertura, observaciones,
    prestamo_padre_id, estado, frecuencia_cobro
  ) VALUES (
    v_anterior.cliente_id,
    v_anterior.garantia_id,
    p_oficial_id,
    p_nuevo_monto,
    p_nueva_tasa,
    p_nuevo_plazo,
    p_nuevo_plazo_dias,
    p_nuevo_tipo::tipo_amortizacion,
    p_nueva_comision,
    p_observaciones,
    p_prestamo_anterior_id,
    'solicitado',
    v_freq
  )
  RETURNING id INTO v_nuevo_id;

  RETURN v_nuevo_id;
END;
$$;

-- ── aplicar_abono_capital: regeneración con frecuencia del préstamo ─────────
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
  v_r                   NUMERIC;
  v_freq                frecuencia_cobro;
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
  SELECT * INTO v_prestamo FROM prestamos WHERE id = p_prestamo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Préstamo no encontrado';
  END IF;
  IF v_prestamo.estado != 'activo' THEN
    RAISE EXCEPTION 'Solo se puede abonar a capital en préstamos activos';
  END IF;

  v_freq := COALESCE(v_prestamo.frecuencia_cobro, 'mensual'::frecuencia_cobro);

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

  v_es_liquidacion   := (p_monto >= v_saldo_pendiente);
  v_monto_efectivo   := CASE WHEN v_es_liquidacion THEN v_saldo_pendiente ELSE p_monto END;
  v_nuevo_saldo      := v_saldo_pendiente - v_monto_efectivo;

  IF v_es_liquidacion THEN
    SELECT COALESCE(SUM(interes), 0)
    INTO v_interes_ahorrado
    FROM cuotas
    WHERE prestamo_id = p_prestamo_id
      AND estado != 'pagada';
  END IF;

  SELECT COALESCE(MAX(numero_cuota), 0)
  INTO v_ultimo_numero
  FROM cuotas
  WHERE prestamo_id = p_prestamo_id AND estado = 'pagada';

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

  DELETE FROM cuotas
  WHERE prestamo_id = p_prestamo_id
    AND estado != 'pagada';

  IF NOT v_es_liquidacion THEN
    v_r     := tasa_periodo_cobro(v_prestamo.tasa_mensual, v_freq);
    v_saldo := v_nuevo_saldo;

    IF v_r = 0 THEN
      v_capital_fijo := ROUND(v_nuevo_saldo / v_n_cuotas, 2);
      FOR v_i IN 1..v_n_cuotas LOOP
        v_capital := v_capital_fijo;
        IF v_i = v_n_cuotas THEN v_capital := ROUND(v_saldo, 2); END IF;
        v_fecha_v := avanzar_fecha_cobro(v_primera_fecha, v_i - 1, v_freq);
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
        v_fecha_v := avanzar_fecha_cobro(v_primera_fecha, v_i - 1, v_freq);
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
        v_fecha_v := avanzar_fecha_cobro(v_primera_fecha, v_i - 1, v_freq);
        INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
          VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_capital, v_interes, v_capital + v_interes);
      END LOOP;

    ELSIF v_prestamo.tipo_amortizacion = 'solo_interes' THEN
      v_interes_mensual   := ROUND(v_nuevo_saldo * v_r, 2);
      v_nueva_cuota_monto := v_interes_mensual;
      FOR v_i IN 1..v_n_cuotas LOOP
        v_capital := CASE WHEN v_i = v_n_cuotas THEN v_nuevo_saldo ELSE 0 END;
        v_interes := v_interes_mensual;
        v_fecha_v := avanzar_fecha_cobro(v_primera_fecha, v_i - 1, v_freq);
        INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
          VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_capital, v_interes, v_capital + v_interes);
      END LOOP;

    ELSIF v_prestamo.tipo_amortizacion = 'solo_interes_adelantado' THEN
      v_interes_mensual   := ROUND(v_nuevo_saldo * v_r, 2);
      v_nueva_cuota_monto := v_interes_mensual;
      FOR v_i IN 1..v_n_cuotas LOOP
        v_fecha_v := avanzar_fecha_cobro(v_primera_fecha, v_i - 1, v_freq);
        IF v_i < v_n_cuotas THEN
          INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
            VALUES (p_prestamo_id, v_ultimo_numero + v_i, v_fecha_v, 0, v_interes_mensual, v_interes_mensual);
        ELSE
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
    v_nueva_cuota_monto := 0;
    UPDATE prestamos SET estado = 'cancelado' WHERE id = p_prestamo_id;
    IF v_prestamo.garantia_id IS NOT NULL THEN
      UPDATE garantias SET estado = 'devuelta' WHERE id = v_prestamo.garantia_id;
    END IF;
  END IF;

  v_recibo_num := 'ABONO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                  LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');

  INSERT INTO abonos_capital (
    prestamo_id, cajero_id, monto_abono, saldo_anterior, saldo_nuevo,
    metodo_pago, numero_recibo, observaciones, n_cuotas_restantes
  ) VALUES (
    p_prestamo_id, p_cajero_id, v_monto_efectivo, v_saldo_pendiente, v_nuevo_saldo,
    p_metodo_pago, v_recibo_num, p_observaciones,
    CASE WHEN v_es_liquidacion THEN 0 ELSE v_n_cuotas END
  ) RETURNING id INTO v_abono_id;

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
