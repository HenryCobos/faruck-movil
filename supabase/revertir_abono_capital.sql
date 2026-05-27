-- ============================================================
-- PIGNORA APP — Anulación de Abonos a Capital
-- Ejecutar en SQL Editor de Supabase
--
-- Implementa:
--  1. Columnas de anulación en abonos_capital
--  2. Función revertir_abono_capital: valida, restaura el
--     cronograma anterior, crea asientos de reversa y
--     marca el abono como anulado.
--  3. Permisos y política RLS actualizada
-- ============================================================

-- ── 1. COLUMNAS DE ANULACIÓN ─────────────────────────────────

ALTER TABLE abonos_capital
  ADD COLUMN IF NOT EXISTS anulado          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anulado_at       timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_por      uuid        REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS motivo_anulacion text;

CREATE INDEX IF NOT EXISTS idx_abonos_anulado ON abonos_capital(anulado);

-- ── 2. FUNCIÓN revertir_abono_capital ───────────────────────
--
-- Pasos:
--  a) Valida que el abono exista, no esté ya anulado y sea el
--     más reciente activo del préstamo (LIFO).
--  b) Elimina las cuotas pendientes actuales (regeneradas por
--     el abono).
--  c) Regenera el cronograma con saldo_anterior y el mismo
--     n_cuotas_restantes, desde la primera fecha pendiente.
--  d) Marca el abono como anulado.
--  e) Crea asientos contables de REVERSA (Haber Caja/Debe Cartera).
--  f) Registra en auditoría.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION revertir_abono_capital(
  p_abono_id   UUID,
  p_admin_id   UUID,
  p_motivo     TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_abono           abonos_capital%ROWTYPE;
  v_prestamo        prestamos%ROWTYPE;
  v_ultima_id       UUID;
  v_n_cuotas        INTEGER;
  v_primera_fecha   DATE;
  v_ultimo_numero   INTEGER;
  v_cuenta_caja     UUID;
  v_cuenta_cartera  UUID;
  -- vars de regeneración
  v_r               NUMERIC;
  v_saldo           NUMERIC;
  v_capital         NUMERIC;
  v_interes         NUMERIC;
  v_cuota_fija      NUMERIC;
  v_capital_fijo    NUMERIC;
  v_interes_mensual NUMERIC;
  v_fecha_v         DATE;
  v_i               INTEGER;
BEGIN
  -- ── Obtener abono ────────────────────────────────────────────
  SELECT * INTO v_abono FROM abonos_capital WHERE id = p_abono_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abono no encontrado';
  END IF;
  IF v_abono.anulado THEN
    RAISE EXCEPTION 'Este abono ya fue anulado anteriormente';
  END IF;

  -- ── Validar LIFO: solo se puede anular el abono más reciente ─
  SELECT id INTO v_ultima_id
  FROM abonos_capital
  WHERE prestamo_id = v_abono.prestamo_id
    AND anulado = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_ultima_id IS DISTINCT FROM p_abono_id THEN
    RAISE EXCEPTION 'Solo se puede anular el abono más reciente. Anule primero los abonos posteriores.';
  END IF;

  -- ── Obtener préstamo ─────────────────────────────────────────
  SELECT * INTO v_prestamo FROM prestamos WHERE id = v_abono.prestamo_id;
  IF v_prestamo.estado != 'activo' THEN
    RAISE EXCEPTION 'Solo se puede anular un abono de un préstamo activo';
  END IF;

  -- ── Datos de las cuotas pendientes actuales ──────────────────
  SELECT COUNT(*), MIN(fecha_vencimiento)
  INTO v_n_cuotas, v_primera_fecha
  FROM cuotas
  WHERE prestamo_id = v_abono.prestamo_id
    AND estado != 'pagada';

  -- Número de la última cuota pagada (base de renumeración)
  SELECT COALESCE(MAX(numero_cuota), 0)
  INTO v_ultimo_numero
  FROM cuotas
  WHERE prestamo_id = v_abono.prestamo_id AND estado = 'pagada';

  -- ── Verificar que no haya pagos vigentes en cuotas pendientes ─
  -- Un pago vigente (no anulado) en una cuota parcial impediría el
  -- borrado por la FK pagos_cuota_id_fkey. En ese caso el usuario
  -- debe anular esos pagos primero.
  IF EXISTS (
    SELECT 1
    FROM pagos pg
    JOIN cuotas c ON c.id = pg.cuota_id
    WHERE c.prestamo_id = v_abono.prestamo_id
      AND c.estado      != 'pagada'
      AND pg.anulado    = false
  ) THEN
    RAISE EXCEPTION
      'Existen pagos vigentes en cuotas pendientes de este préstamo. '
      'Anula esos pagos primero y luego vuelve a intentar la anulación del abono.';
  END IF;

  -- Eliminar pagos ya anulados que referencien las cuotas pendientes
  -- (no es necesario conservarlos; el historial queda en auditoría)
  DELETE FROM pagos
  WHERE anulado = true
    AND cuota_id IN (
      SELECT id FROM cuotas
      WHERE prestamo_id = v_abono.prestamo_id
        AND estado != 'pagada'
    );

  -- ── Eliminar cuotas pendientes actuales ──────────────────────
  DELETE FROM cuotas
  WHERE prestamo_id = v_abono.prestamo_id
    AND estado != 'pagada';

  -- ── Regenerar cronograma con saldo_anterior ──────────────────
  v_r      := v_prestamo.tasa_mensual;
  v_saldo  := v_abono.saldo_anterior;
  v_n_cuotas := v_abono.n_cuotas_restantes;

  IF v_r = 0 THEN
    v_capital_fijo := ROUND(v_saldo / v_n_cuotas, 2);
    FOR v_i IN 1..v_n_cuotas LOOP
      v_capital := v_capital_fijo;
      IF v_i = v_n_cuotas THEN v_capital := ROUND(v_saldo, 2); END IF;
      v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (v_abono.prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_capital, 0, v_capital);
      v_saldo := v_saldo - v_capital;
    END LOOP;

  ELSIF v_prestamo.tipo_amortizacion = 'francesa' THEN
    v_cuota_fija := v_saldo * (v_r * POWER(1 + v_r, v_n_cuotas))
                             / (POWER(1 + v_r, v_n_cuotas) - 1);
    FOR v_i IN 1..v_n_cuotas LOOP
      v_interes := ROUND(v_saldo * v_r, 2);
      v_capital := ROUND(v_cuota_fija - v_interes, 2);
      IF v_i = v_n_cuotas THEN v_capital := ROUND(v_saldo, 2); END IF;
      v_saldo   := v_saldo - v_capital;
      v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (v_abono.prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_capital, v_interes, v_capital + v_interes);
    END LOOP;

  ELSIF v_prestamo.tipo_amortizacion = 'alemana' THEN
    v_capital_fijo := ROUND(v_saldo / v_n_cuotas, 2);
    FOR v_i IN 1..v_n_cuotas LOOP
      v_interes := ROUND(v_saldo * v_r, 2);
      v_capital := CASE WHEN v_i = v_n_cuotas THEN ROUND(v_saldo, 2) ELSE v_capital_fijo END;
      v_saldo   := v_saldo - v_capital;
      v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (v_abono.prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_capital, v_interes, v_capital + v_interes);
    END LOOP;

  ELSIF v_prestamo.tipo_amortizacion = 'solo_interes' THEN
    v_interes_mensual := ROUND(v_abono.saldo_anterior * v_r, 2);
    FOR v_i IN 1..v_n_cuotas LOOP
      v_capital := CASE WHEN v_i = v_n_cuotas THEN v_abono.saldo_anterior ELSE 0 END;
      v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (v_abono.prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_capital, v_interes_mensual, v_capital + v_interes_mensual);
    END LOOP;

  ELSIF v_prestamo.tipo_amortizacion = 'solo_interes_adelantado' THEN
    v_interes_mensual := ROUND(v_abono.saldo_anterior * v_r, 2);
    FOR v_i IN 1..v_n_cuotas LOOP
      IF v_i < v_n_cuotas THEN
        v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
        INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
          VALUES (v_abono.prestamo_id, v_ultimo_numero + v_i, v_fecha_v, 0, v_interes_mensual, v_interes_mensual);
      ELSE
        v_fecha_v := v_primera_fecha + ((v_i - 1) * INTERVAL '1 month');
        INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
          VALUES (v_abono.prestamo_id, v_ultimo_numero + v_i, v_fecha_v, v_abono.saldo_anterior, 0, v_abono.saldo_anterior);
      END IF;
    END LOOP;

  ELSIF v_prestamo.tipo_amortizacion = 'anticipado' THEN
    INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
      VALUES (v_abono.prestamo_id, v_ultimo_numero + 1, v_primera_fecha, v_abono.saldo_anterior, 0, v_abono.saldo_anterior);
  END IF;

  -- ── Marcar abono como anulado ────────────────────────────────
  UPDATE abonos_capital
  SET
    anulado          = true,
    anulado_at       = NOW(),
    anulado_por      = p_admin_id,
    motivo_anulacion = p_motivo
  WHERE id = p_abono_id;

  -- ── Asientos contables de REVERSA ────────────────────────────
  -- Los asientos originales NO se borran; se crean los contra-asientos.
  SELECT id INTO v_cuenta_caja    FROM plan_cuentas WHERE codigo = '1110' LIMIT 1;
  SELECT id INTO v_cuenta_cartera FROM plan_cuentas WHERE codigo = '1210' LIMIT 1;

  IF v_cuenta_caja IS NOT NULL THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'REVERSA — Anulación abono capital · Recibo ' || v_abono.numero_recibo,
      0, v_abono.monto_abono, v_cuenta_caja, p_abono_id, 'pago_capital', p_admin_id);
  END IF;

  IF v_cuenta_cartera IS NOT NULL THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'REVERSA cartera — Anulación abono capital · Recibo ' || v_abono.numero_recibo,
      v_abono.monto_abono, 0, v_cuenta_cartera, p_abono_id, 'pago_capital', p_admin_id);
  END IF;

  -- ── Auditoría ────────────────────────────────────────────────
  PERFORM registrar_auditoria(
    'abonos_capital',
    'eliminar',
    p_abono_id,
    'Abono a capital anulado — Recibo ' || v_abono.numero_recibo ||
      ' · $' || v_abono.monto_abono ||
      ' · Motivo: ' || p_motivo,
    jsonb_build_object(
      'recibo',           v_abono.numero_recibo,
      'monto',            v_abono.monto_abono,
      'saldo_restaurado', v_abono.saldo_anterior,
      'motivo',           p_motivo
    )
  );

  RETURN jsonb_build_object(
    'ok',               true,
    'abono_id',         p_abono_id,
    'recibo',           v_abono.numero_recibo,
    'monto',            v_abono.monto_abono,
    'saldo_restaurado', v_abono.saldo_anterior
  );
END;
$$;

-- ── 3. PERMISOS ──────────────────────────────────────────────

REVOKE ALL ON FUNCTION revertir_abono_capital(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revertir_abono_capital(UUID, UUID, TEXT) TO authenticated;

-- ── 4. ACTUALIZAR RLS: admin y auditor ven abonos anulados ───

DROP POLICY IF EXISTS "Usuarios activos ven abonos" ON abonos_capital;
CREATE POLICY "Usuarios activos ven abonos"
  ON abonos_capital FOR SELECT
  USING (
    is_active_user() = true
    AND (
      anulado = false
      OR get_my_role() IN ('admin', 'auditor')
    )
  );

-- UPDATE lo hace la función SECURITY DEFINER; no se necesita política UPDATE.
