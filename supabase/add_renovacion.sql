-- ── MIGRACIÓN: Renovación de préstamos ───────────────────────────────────────
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Nuevo estado: distingue préstamos renovados de cancelados/liquidados
ALTER TYPE prestamo_estado ADD VALUE IF NOT EXISTS 'renovado';

-- 2. Columna que enlaza un préstamo renovado con su predecesor
ALTER TABLE prestamos
  ADD COLUMN IF NOT EXISTS prestamo_padre_id UUID REFERENCES prestamos(id);

CREATE INDEX IF NOT EXISTS idx_prestamos_padre ON prestamos(prestamo_padre_id)
  WHERE prestamo_padre_id IS NOT NULL;

-- 3. Función: capital pendiente de un préstamo activo
CREATE OR REPLACE FUNCTION calcular_saldo_pendiente(p_prestamo_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(capital), 0)
  FROM cuotas
  WHERE prestamo_id = p_prestamo_id
    AND estado IN ('pendiente', 'vencida', 'parcial');
$$;

-- 4. Función atómica de renovación
--
--   · Escenario "al terminar"  (p_estado_anterior = 'cancelado'):
--     La garantía fue liberada (devuelta); se vuelve a marcar en_garantia.
--
--   · Escenario "anticipado"   (p_estado_anterior = 'activo'):
--     Se eliminan las cuotas no cobradas del préstamo anterior,
--     la garantía permanece en_garantia (sigue vinculada).
--
--   El préstamo anterior queda en estado 'renovado' en ambos casos.
--   El nuevo préstamo empieza en 'solicitado' (mismo flujo de aprobación).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION renovar_prestamo(
  p_prestamo_anterior_id  UUID,
  p_nuevo_monto           NUMERIC,
  p_nueva_tasa            NUMERIC,
  p_nuevo_plazo           INTEGER,
  p_nuevo_tipo            TEXT,        -- acepta cualquier valor del enum
  p_oficial_id            UUID,
  p_nueva_comision        NUMERIC  DEFAULT 0,
  p_observaciones         TEXT     DEFAULT NULL
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
    -- Eliminar cuotas no cobradas (quedan las pagadas como historial)
    DELETE FROM cuotas
    WHERE prestamo_id = p_prestamo_anterior_id
      AND estado IN ('pendiente', 'vencida', 'parcial');
    -- Garantía ya está en_garantia; se transfiere al nuevo préstamo implícitamente
  ELSE
    -- Préstamo liquidado: la garantía fue devuelta, hay que re-vincularla
    UPDATE garantias SET estado = 'en_garantia' WHERE id = v_anterior.garantia_id;
  END IF;

  -- ── Crear nuevo préstamo ─────────────────────────────────────────────────
  INSERT INTO prestamos (
    cliente_id, garantia_id, oficial_id,
    monto_principal, tasa_mensual, plazo_meses,
    tipo_amortizacion, comision_apertura, observaciones,
    prestamo_padre_id, estado
  ) VALUES (
    v_anterior.cliente_id,
    v_anterior.garantia_id,
    p_oficial_id,
    p_nuevo_monto,
    p_nueva_tasa,
    p_nuevo_plazo,
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
