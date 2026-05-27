-- ── PATCH: Soporte de plazo_dias en renovar_prestamo ──────────────────────────
-- Ejecutar en Supabase SQL Editor después de add_renovacion.sql
-- Permite que préstamos renovados de tipo "anticipado" conserven el plazo exacto
-- en días, igual que los préstamos nuevos creados desde nuevo.tsx.
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
  p_nuevo_plazo_dias      INTEGER  DEFAULT NULL   -- días exactos para tipo 'anticipado'
)
RETURNS UUID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_anterior  prestamos%ROWTYPE;
  v_nuevo_id  UUID;
BEGIN
  -- ── Validaciones ────────────────────────────────────────────────────────
  SELECT * INTO v_anterior FROM prestamos WHERE id = p_prestamo_anterior_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Préstamo no encontrado: %', p_prestamo_anterior_id;
  END IF;
  IF v_anterior.estado NOT IN ('activo', 'cancelado') THEN
    RAISE EXCEPTION 'Solo se pueden renovar préstamos activos o liquidados. Estado actual: %', v_anterior.estado;
  END IF;

  -- ── Cerrar préstamo anterior ─────────────────────────────────────────────
  UPDATE prestamos SET estado = 'renovado' WHERE id = p_prestamo_anterior_id;

  IF v_anterior.estado = 'activo' THEN
    DELETE FROM cuotas
    WHERE prestamo_id = p_prestamo_anterior_id
      AND estado IN ('pendiente', 'vencida', 'parcial');
  ELSE
    UPDATE garantias SET estado = 'en_garantia' WHERE id = v_anterior.garantia_id;
  END IF;

  -- ── Crear nuevo préstamo con plazo_dias si aplica ────────────────────────
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
