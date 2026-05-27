-- ── MIGRACIÓN: Nuevos tipos de garantía ─────────────────────────────────────
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- Agrega dos nuevos tipos de bien aceptable como garantía:
--   · cheque          — Cheque bancario
--   · letra_de_cambio — Letra de cambio / pagaré
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE garantia_tipo ADD VALUE IF NOT EXISTS 'cheque';
ALTER TYPE garantia_tipo ADD VALUE IF NOT EXISTS 'letra_de_cambio';
