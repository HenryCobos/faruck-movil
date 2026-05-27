-- ============================================================
-- Préstamos Personales
-- Tracker personal de deudas propias.
-- Completamente independiente del módulo de créditos.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE estado_prestamo_personal AS ENUM ('activo', 'pagado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Préstamo / deuda personal
CREATE TABLE IF NOT EXISTS prestamos_personales (
  id               uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acreedor_nombre  text          NOT NULL,
  monto_original   numeric(12,2) NOT NULL CHECK (monto_original > 0),
  tasa_interes     numeric(6,4)  NOT NULL DEFAULT 0 CHECK (tasa_interes >= 0),  -- % mensual
  fecha_inicio     date          NOT NULL,
  descripcion      text,
  estado           estado_prestamo_personal NOT NULL DEFAULT 'activo',
  notas            text,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

-- Pagos registrados contra el préstamo
CREATE TABLE IF NOT EXISTS pagos_prestamo_personal (
  id           uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prestamo_id  uuid          NOT NULL REFERENCES prestamos_personales(id) ON DELETE CASCADE,
  monto_pagado numeric(12,2) NOT NULL CHECK (monto_pagado > 0),
  capital      numeric(12,2) NOT NULL DEFAULT 0 CHECK (capital >= 0),
  interes      numeric(12,2) NOT NULL DEFAULT 0 CHECK (interes >= 0),
  fecha_pago   date          NOT NULL,
  metodo       text          CHECK (metodo IN ('efectivo', 'transferencia', 'otro')),
  notas        text,
  created_at   timestamptz   NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_prestamos_personales_user ON prestamos_personales (user_id);
CREATE INDEX IF NOT EXISTS idx_pagos_pp_prestamo         ON pagos_prestamo_personal (prestamo_id);
CREATE INDEX IF NOT EXISTS idx_pagos_pp_fecha            ON pagos_prestamo_personal (prestamo_id, fecha_pago);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_prestamos_personales_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prestamos_personales_updated_at ON prestamos_personales;
CREATE TRIGGER trg_prestamos_personales_updated_at
  BEFORE UPDATE ON prestamos_personales
  FOR EACH ROW EXECUTE FUNCTION update_prestamos_personales_updated_at();

-- ─── Row Level Security ───────────────────────────────────────
ALTER TABLE prestamos_personales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_prestamo_personal   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_own_all" ON prestamos_personales;
CREATE POLICY "pp_own_all"
  ON prestamos_personales FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "pago_pp_own_all" ON pagos_prestamo_personal;
CREATE POLICY "pago_pp_own_all"
  ON pagos_prestamo_personal FOR ALL TO authenticated
  USING  (prestamo_id IN (SELECT id FROM prestamos_personales WHERE user_id = auth.uid()))
  WITH CHECK (prestamo_id IN (SELECT id FROM prestamos_personales WHERE user_id = auth.uid()));
