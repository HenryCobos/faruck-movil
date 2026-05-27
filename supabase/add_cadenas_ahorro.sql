-- ============================================================
-- Cadenas de Ahorro (Panderos / Tontinas)
-- Tracker personal: cada usuario registra sus propias cadenas.
-- Los montos son completamente independientes del módulo de
-- créditos y cobros existente.
-- ============================================================

-- Tipos enumerados
DO $$ BEGIN
  CREATE TYPE frecuencia_cadena AS ENUM ('semanal', 'quincenal', 'mensual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_cadena AS ENUM ('activa', 'completada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabla principal: una cadena de ahorro
CREATE TABLE IF NOT EXISTS cadenas_ahorro (
  id                uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre            text          NOT NULL,
  descripcion       text,
  num_participantes int           NOT NULL CHECK (num_participantes >= 2),
  monto_aporte      numeric(12,2) NOT NULL CHECK (monto_aporte > 0),
  frecuencia        frecuencia_cadena NOT NULL DEFAULT 'mensual',
  fecha_inicio      date          NOT NULL,
  estado            estado_cadena NOT NULL DEFAULT 'activa',
  notas             text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

-- Posiciones/puestos del usuario en la cadena (soporta múltiples puestos)
-- Cada puesto representa un turno en el que el usuario cobra el pozo completo
CREATE TABLE IF NOT EXISTS cadena_puestos (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cadena_id    uuid NOT NULL REFERENCES cadenas_ahorro(id) ON DELETE CASCADE,
  numero_turno int  NOT NULL CHECK (numero_turno >= 1),
  notas        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cadena_id, numero_turno)
);

-- Cronograma de rondas auto-generado al crear la cadena
-- Una ronda por participante; el campo pagado solo aplica a rondas de aporte
CREATE TABLE IF NOT EXISTS cadena_rondas (
  id                  uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cadena_id           uuid    NOT NULL REFERENCES cadenas_ahorro(id) ON DELETE CASCADE,
  numero_ronda        int     NOT NULL CHECK (numero_ronda >= 1),
  fecha_vencimiento   date    NOT NULL,
  beneficiario_nombre text,
  pagado              boolean NOT NULL DEFAULT false,
  fecha_pago          date,
  notas               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cadena_id, numero_ronda)
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_cadenas_ahorro_user_id  ON cadenas_ahorro (user_id);
CREATE INDEX IF NOT EXISTS idx_cadena_puestos_cadena   ON cadena_puestos  (cadena_id);
CREATE INDEX IF NOT EXISTS idx_cadena_rondas_cadena    ON cadena_rondas   (cadena_id);
CREATE INDEX IF NOT EXISTS idx_cadena_rondas_fecha     ON cadena_rondas   (cadena_id, fecha_vencimiento);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_cadenas_ahorro_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cadenas_ahorro_updated_at ON cadenas_ahorro;
CREATE TRIGGER trg_cadenas_ahorro_updated_at
  BEFORE UPDATE ON cadenas_ahorro
  FOR EACH ROW EXECUTE FUNCTION update_cadenas_ahorro_updated_at();

-- ─── Row Level Security ──────────────────────────────────────
ALTER TABLE cadenas_ahorro ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadena_puestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadena_rondas  ENABLE ROW LEVEL SECURITY;

-- Cada usuario accede únicamente a sus propias cadenas
DROP POLICY IF EXISTS "cadenas_ahorro_own_all" ON cadenas_ahorro;
CREATE POLICY "cadenas_ahorro_own_all"
  ON cadenas_ahorro FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "cadena_puestos_own_all" ON cadena_puestos;
CREATE POLICY "cadena_puestos_own_all"
  ON cadena_puestos FOR ALL TO authenticated
  USING  (cadena_id IN (SELECT id FROM cadenas_ahorro WHERE user_id = auth.uid()))
  WITH CHECK (cadena_id IN (SELECT id FROM cadenas_ahorro WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "cadena_rondas_own_all" ON cadena_rondas;
CREATE POLICY "cadena_rondas_own_all"
  ON cadena_rondas FOR ALL TO authenticated
  USING  (cadena_id IN (SELECT id FROM cadenas_ahorro WHERE user_id = auth.uid()))
  WITH CHECK (cadena_id IN (SELECT id FROM cadenas_ahorro WHERE user_id = auth.uid()));
