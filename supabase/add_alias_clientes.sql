-- Agrega campo alias opcional a la tabla clientes
-- El alias sirve como nombre alternativo para identificar fácilmente al cliente

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS alias TEXT;

-- Índice para búsqueda rápida por alias
CREATE INDEX IF NOT EXISTS idx_clientes_alias ON clientes (alias);
