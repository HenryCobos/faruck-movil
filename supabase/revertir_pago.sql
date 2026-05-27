-- ============================================================
-- PIGNORA APP — Anulación / reversión de pagos
-- Ejecutar en SQL Editor de Supabase
-- ============================================================

-- ── 1. MIGRACIÓN: columnas de anulación en tabla pagos ───────

ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS anulado          boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anulado_at       timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_por      uuid         REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS motivo_anulacion text;

-- Índice para filtrar rápido pagos vigentes
CREATE INDEX IF NOT EXISTS idx_pagos_anulado ON pagos(anulado);

-- ── 2. FUNCIÓN ATÓMICA: revertir_pago ────────────────────────
--
-- Hace todo en una sola transacción:
--   a) Valida que el pago exista, no esté ya anulado y que el
--      préstamo no haya sido renovado (eso crearía inconsistencia).
--   b) Crea asientos contables de REVERSA (no borra los originales).
--   c) Marca el pago como anulado.
--   d) Resetea la cuota a pendiente / vencida según la fecha.
--   e) Si el préstamo pasó a "cancelado" por este pago → activo.
--   f) Si la garantía quedó "devuelta" por este pago → en_garantia.
--   g) Registra en auditoría.
-- ──────────────────────────────────────────────────────────────

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
  v_pago            pagos%ROWTYPE;
  v_cuota           cuotas%ROWTYPE;
  v_prestamo        prestamos%ROWTYPE;
  v_nuevo_estado_cuota  cuota_estado;
  v_prestamo_revertido  boolean := false;
  v_garantia_revertida  boolean := false;
  v_cuenta_caja     UUID;
  v_cuenta_cartera  UUID;
  v_cuenta_interes  UUID;
  v_cuenta_mora     UUID;
  v_capital_part    NUMERIC;
  v_interes_part    NUMERIC;
BEGIN
  -- ── Obtener pago ────────────────────────────────────────────
  SELECT * INTO v_pago FROM pagos WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;
  IF v_pago.anulado THEN
    RAISE EXCEPTION 'Este pago ya fue anulado anteriormente';
  END IF;

  -- ── Obtener cuota y préstamo ─────────────────────────────────
  SELECT * INTO v_cuota    FROM cuotas    WHERE id = v_pago.cuota_id;
  SELECT * INTO v_prestamo FROM prestamos WHERE id = v_cuota.prestamo_id;

  -- ── Bloquear si el préstamo fue renovado ────────────────────
  -- Un préstamo renovado genera un nuevo préstamo hijo; revertir
  -- un pago del padre crearía inconsistencia en el saldo.
  IF v_prestamo.estado = 'renovado' THEN
    RAISE EXCEPTION 'No se puede anular un pago de un préstamo que ya fue renovado';
  END IF;

  -- ── Cuentas contables ───────────────────────────────────────
  SELECT id INTO v_cuenta_caja    FROM plan_cuentas WHERE codigo = '1110' LIMIT 1;
  SELECT id INTO v_cuenta_cartera FROM plan_cuentas WHERE codigo = '1210' LIMIT 1;
  SELECT id INTO v_cuenta_interes FROM plan_cuentas WHERE codigo = '4110' LIMIT 1;
  SELECT id INTO v_cuenta_mora    FROM plan_cuentas WHERE codigo = '4130' LIMIT 1;

  -- Recalcular proporciones igual que en registrar_pago
  v_capital_part := LEAST(v_pago.monto_pagado - v_pago.mora_cobrada, v_cuota.capital);
  v_interes_part := LEAST(v_pago.monto_pagado - v_pago.mora_cobrada - v_capital_part, v_cuota.interes);
  v_capital_part := GREATEST(v_capital_part, 0);
  v_interes_part := GREATEST(v_interes_part, 0);

  -- ── Asientos de REVERSA ─────────────────────────────────────
  -- Los asientos originales NO se borran; se crean los contra-asientos.

  -- Reversa de ingreso de caja (HABER)
  IF v_cuenta_caja IS NOT NULL THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'REVERSA — Anulación pago cuota #' || v_cuota.numero_cuota || ' — Recibo ' || v_pago.numero_recibo,
      0, v_pago.monto_pagado, v_cuenta_caja, p_pago_id, 'devolucion_garantia', p_admin_id);
  END IF;

  -- Reversa de reducción cartera (DEBE)
  IF v_cuenta_cartera IS NOT NULL AND v_capital_part > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'REVERSA capital cuota #' || v_cuota.numero_cuota,
      v_capital_part, 0, v_cuenta_cartera, p_pago_id, 'pago_capital', p_admin_id);
  END IF;

  -- Reversa de intereses (DEBE)
  IF v_cuenta_interes IS NOT NULL AND v_interes_part > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'REVERSA interés cuota #' || v_cuota.numero_cuota,
      v_interes_part, 0, v_cuenta_interes, p_pago_id, 'pago_interes', p_admin_id);
  END IF;

  -- Reversa de mora (DEBE)
  IF v_cuenta_mora IS NOT NULL AND v_pago.mora_cobrada > 0 THEN
    INSERT INTO asientos_contables (fecha, concepto, debe, haber, cuenta_id, referencia_id, tipo_referencia, usuario_id)
    VALUES (CURRENT_DATE,
      'REVERSA mora cuota #' || v_cuota.numero_cuota,
      v_pago.mora_cobrada, 0, v_cuenta_mora, p_pago_id, 'mora', p_admin_id);
  END IF;

  -- ── Marcar pago como anulado ─────────────────────────────────
  UPDATE pagos
  SET
    anulado          = true,
    anulado_at       = NOW(),
    anulado_por      = p_admin_id,
    motivo_anulacion = p_motivo
  WHERE id = p_pago_id;

  -- ── Resetear estado de la cuota ─────────────────────────────
  -- Si la fecha de vencimiento ya pasó → vencida, si no → pendiente
  v_nuevo_estado_cuota := CASE
    WHEN v_cuota.fecha_vencimiento < CURRENT_DATE THEN 'vencida'::cuota_estado
    ELSE 'pendiente'::cuota_estado
  END;

  UPDATE cuotas
  SET
    estado     = v_nuevo_estado_cuota,
    fecha_pago = NULL
  WHERE id = v_cuota.id;

  -- ── Revertir estado del préstamo si aplica ───────────────────
  -- Si el préstamo fue cancelado automáticamente por ser el último
  -- pago, al anularlo debe volver a activo.
  IF v_prestamo.estado = 'cancelado' THEN
    -- Verificar si ahora quedan cuotas sin pagar (la que acabamos de
    -- revertir más cualquier otra que ya estuviera pendiente)
    IF EXISTS (
      SELECT 1 FROM cuotas
      WHERE prestamo_id = v_prestamo.id
        AND estado != 'pagada'
    ) THEN
      UPDATE prestamos SET estado = 'activo' WHERE id = v_prestamo.id;
      v_prestamo_revertido := true;

      -- Revertir la garantía si fue marcada 'devuelta' por el último pago
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

  -- ── Auditoría ────────────────────────────────────────────────
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

-- ── 3. RLS: política para que el admin pueda llamar la función ─
-- La función es SECURITY DEFINER, así que se ejecuta con permisos
-- del owner. Solo necesitamos que los usuarios autenticados puedan
-- invocarla; la validación del rol admin se hace desde la app.
REVOKE ALL ON FUNCTION revertir_pago(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revertir_pago(UUID, UUID, TEXT) TO authenticated;

-- ── 4. Actualizar vista de pagos para exponer campo anulado ───
-- Si tienes una vista v_pagos, agrégale las columnas. Si no existe,
-- las columnas quedan disponibles directamente en la tabla pagos.

-- Política RLS: admin y auditor ven pagos anulados;
-- otros roles solo ven los vigentes.
-- (Ajustar si ya tenés políticas en pagos)
DO $$
BEGIN
  -- Habilitar RLS en pagos si no está habilitado
  ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END$$;

DROP POLICY IF EXISTS "Usuarios activos ven pagos" ON pagos;
DROP POLICY IF EXISTS "Usuarios activos ven pagos vigentes" ON pagos;
DROP POLICY IF EXISTS "Admin y cajero registran pagos" ON pagos;
DROP POLICY IF EXISTS "Admin y auditor ven todos los pagos" ON pagos;
DROP POLICY IF EXISTS "Cajeros y admin registran pagos" ON pagos;

CREATE POLICY "Usuarios activos ven pagos vigentes"
  ON pagos FOR SELECT
  USING (
    is_active_user() = true
    AND (
      anulado = false
      OR get_my_role() IN ('admin', 'auditor')
    )
  );

CREATE POLICY "Admin y cajero registran pagos"
  ON pagos FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'cajero'));

-- El UPDATE de anulado lo hace la función SECURITY DEFINER,
-- no necesita política de UPDATE para el cliente.

-- ── 5. CORREGIR v_estado_resultados para netear reversas ─────
--
-- El diseño original solo sumaba HABER en cuentas de ingreso.
-- Los asientos de reversa usan DEBE en esas mismas cuentas, por
-- lo que no se cancelaban. Ahora se calcula haber - debe para
-- que las reversas anulen correctamente los ingresos.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_estado_resultados
WITH (security_invoker = true)
AS
SELECT
  DATE_TRUNC('month', fecha) AS mes,
  -- Intereses netos: haber (cobros) menos debe (reversas de cobros)
  GREATEST(SUM(CASE WHEN pc.codigo = '4110' THEN haber - debe ELSE 0 END), 0) AS ingresos_intereses,
  -- Comisiones netas
  GREATEST(SUM(CASE WHEN pc.codigo = '4120' THEN haber - debe ELSE 0 END), 0) AS ingresos_comisiones,
  -- Mora neta
  GREATEST(SUM(CASE WHEN pc.codigo = '4130' THEN haber - debe ELSE 0 END), 0) AS ingresos_mora,
  -- Egresos netos
  GREATEST(SUM(CASE WHEN pc.tipo = 'egreso' THEN debe - haber ELSE 0 END), 0) AS egresos,
  -- Utilidad neta: ingresos netos menos egresos netos
  SUM(CASE WHEN pc.tipo = 'ingreso' THEN haber - debe ELSE 0 END) -
  SUM(CASE WHEN pc.tipo = 'egreso'  THEN debe - haber ELSE 0 END) AS utilidad_neta
FROM asientos_contables ac
JOIN plan_cuentas pc ON pc.id = ac.cuenta_id
GROUP BY DATE_TRUNC('month', fecha)
ORDER BY mes DESC;

GRANT SELECT ON v_estado_resultados TO authenticated;
