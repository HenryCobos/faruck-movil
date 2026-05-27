-- ============================================================
-- Préstamos Personales — Soporte de Amortización
-- Agrega tipo de deuda (simple | amortizable), tasa mensual,
-- plazo y tipo de amortización. Crea tabla de cuotas.
-- ============================================================

-- ── 1. Nuevas columnas en prestamos_personales ──────────────

ALTER TABLE prestamos_personales
  ADD COLUMN IF NOT EXISTS tipo_deuda        text         NOT NULL DEFAULT 'simple'
    CHECK (tipo_deuda IN ('simple', 'amortizable')),
  ADD COLUMN IF NOT EXISTS tasa_mensual      numeric(6,4),   -- % mensual (ej: 2.5 → 2.5%)
  ADD COLUMN IF NOT EXISTS plazo_meses       integer,
  ADD COLUMN IF NOT EXISTS plazo_dias        integer,        -- solo para tipo anticipado
  ADD COLUMN IF NOT EXISTS tipo_amortizacion text
    CHECK (tipo_amortizacion IS NULL OR tipo_amortizacion IN
      ('francesa','alemana','solo_interes','solo_interes_adelantado','anticipado'));

-- ── 2. cuota_id en pagos (referencia opcional) ─────────────

ALTER TABLE pagos_prestamo_personal
  ADD COLUMN IF NOT EXISTS cuota_id uuid;

-- ── 3. Tabla de cuotas ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS cuotas_prestamo_personal (
  id                uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prestamo_id       uuid          NOT NULL REFERENCES prestamos_personales(id) ON DELETE CASCADE,
  numero_cuota      integer       NOT NULL,
  fecha_vencimiento date          NOT NULL,
  capital           numeric(12,2) NOT NULL CHECK (capital >= 0),
  interes           numeric(12,2) NOT NULL DEFAULT 0 CHECK (interes >= 0),
  monto_total       numeric(12,2) NOT NULL CHECK (monto_total >= 0),
  monto_pagado      numeric(12,2) NOT NULL DEFAULT 0 CHECK (monto_pagado >= 0),
  estado            text          NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','pagada','vencida','parcial')),
  fecha_pago        date,
  notas             text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (prestamo_id, numero_cuota)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cuotas_pp_prestamo ON cuotas_prestamo_personal (prestamo_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_pp_estado   ON cuotas_prestamo_personal (prestamo_id, estado);
CREATE INDEX IF NOT EXISTS idx_pagos_pp_cuota      ON pagos_prestamo_personal (cuota_id);

-- FK diferida para cuota_id (la tabla acaba de crearse)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_pago_pp_cuota'
  ) THEN
    ALTER TABLE pagos_prestamo_personal
      ADD CONSTRAINT fk_pago_pp_cuota
      FOREIGN KEY (cuota_id) REFERENCES cuotas_prestamo_personal(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 4. RLS para cuotas ──────────────────────────────────────

ALTER TABLE cuotas_prestamo_personal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cuotas_pp_own_all" ON cuotas_prestamo_personal;
CREATE POLICY "cuotas_pp_own_all"
  ON cuotas_prestamo_personal FOR ALL TO authenticated
  USING (
    prestamo_id IN (
      SELECT id FROM prestamos_personales WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    prestamo_id IN (
      SELECT id FROM prestamos_personales WHERE user_id = auth.uid()
    )
  );
