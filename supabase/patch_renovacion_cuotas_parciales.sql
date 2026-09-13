-- ── PATCH: renovar_prestamo — cuotas parciales con pagos registrados ──────────
-- Ejecutar en Supabase SQL Editor después de patch_renovacion_plazo_dias.sql
--
-- Problema: al renovar un préstamo activo, se hacía DELETE de cuotas
-- pendiente/vencida/parcial. Si una cuota parcial tiene pagos vigentes,
-- la FK pagos_cuota_id_fkey bloquea el borrado.
--
-- Solución: cuotas con pagos vigentes se cierran como 'pagada' (conserva
-- historial y recibos). Cuotas sin pagos se eliminan como antes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION renovar_prestamo(
  p_prestamo_anterior_id  UUID,
  p_nuevo_monto           NUMERIC,
  p_nueva_tasa            NUMERIC,
  p_nuevo_plazo           INTEGER,
  p_nuevo_tipo            TEXT,
  p_oficial_id            UUID,
  p_nueva_comision        NUMERIC  DEFAULT 0,
  p_observaciones         TEXT     DEFAULT NULL,
  p_nuevo_plazo_dias      INTEGER  DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_anterior  prestamos%ROWTYPE;
  v_nuevo_id  UUID;
BEGIN
  SELECT * INTO v_anterior FROM prestamos WHERE id = p_prestamo_anterior_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Préstamo no encontrado: %', p_prestamo_anterior_id;
  END IF;
  IF v_anterior.estado NOT IN ('activo', 'cancelado') THEN
    RAISE EXCEPTION 'Solo se pueden renovar préstamos activos o liquidados. Estado actual: %', v_anterior.estado;
  END IF;

  UPDATE prestamos SET estado = 'renovado' WHERE id = p_prestamo_anterior_id;

  IF v_anterior.estado = 'activo' THEN
    -- Cuotas con pagos vigentes: cerrar, no borrar (respeta FK pagos_cuota_id_fkey)
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

    -- Cuotas sin pagos: eliminar (comportamiento previo)
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
    prestamo_padre_id, estado
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
    'solicitado'
  )
  RETURNING id INTO v_nuevo_id;

  RETURN v_nuevo_id;
END;
$$;
