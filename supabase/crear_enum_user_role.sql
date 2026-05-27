-- Si aparece: ERROR: 42704: type "user_role" does not exist
-- Ejecuta esto UNA vez en el SQL Editor (mismo proyecto Supabase que usará la app).
-- Si el tipo ya existe, no hace nada.

DO $$
BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'oficial', 'cajero', 'auditor');
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END;
$$;
