-- ── MIGRACIÓN: Nuevos tipos de amortización ──────────────────────────────────
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- Agrega dos nuevos tipos de amortización:
--   · solo_interes — Cada mes se paga solo interés; capital completo al final.
--   · anticipado   — Interés total el día del desembolso (entrega del crédito);
--                    el capital se paga íntegro en una cuota al vencimiento del plazo.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Agregar los nuevos valores al tipo enum (IF NOT EXISTS requiere Pg >= 9.6)
ALTER TYPE tipo_amortizacion ADD VALUE IF NOT EXISTS 'solo_interes';
ALTER TYPE tipo_amortizacion ADD VALUE IF NOT EXISTS 'anticipado';

-- 2. Reemplazar la función generar_cronograma para incluir los nuevos tipos
CREATE OR REPLACE FUNCTION generar_cronograma(prestamo_id uuid)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p               prestamos%ROWTYPE;
  r               numeric;
  cuota_fija      numeric;
  capital_fijo    numeric;
  saldo           numeric;
  capital         numeric;
  interes         numeric;
  interes_mensual numeric;
  total_intereses numeric;
  fecha_v         date;
  i               integer;
BEGIN
  SELECT * INTO p FROM prestamos WHERE id = prestamo_id;

  r       := p.tasa_mensual;
  saldo   := p.monto_principal;
  fecha_v := p.fecha_desembolso;

  -- ── Francesa: cuota fija ────────────────────────────────────────────────
  IF p.tipo_amortizacion = 'francesa' THEN
    cuota_fija := saldo * (r * power(1 + r, p.plazo_meses))
                       / (power(1 + r, p.plazo_meses) - 1);
    FOR i IN 1..p.plazo_meses LOOP
      interes := round(saldo * r, 2);
      capital := round(cuota_fija - interes, 2);
      IF i = p.plazo_meses THEN capital := saldo; END IF;
      saldo   := saldo - capital;
      fecha_v := p.fecha_desembolso + (interval '1 month' * i);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, capital, interes, capital + interes);
    END LOOP;

  -- ── Alemana: capital fijo ───────────────────────────────────────────────
  ELSIF p.tipo_amortizacion = 'alemana' THEN
    capital_fijo := round(p.monto_principal / p.plazo_meses, 2);
    FOR i IN 1..p.plazo_meses LOOP
      interes := round(saldo * r, 2);
      capital := CASE WHEN i = p.plazo_meses THEN saldo ELSE capital_fijo END;
      saldo   := saldo - capital;
      fecha_v := p.fecha_desembolso + (interval '1 month' * i);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, capital, interes, capital + interes);
    END LOOP;

  -- ── Solo intereses: interés mensual fijo + capital total en última cuota ─
  ELSIF p.tipo_amortizacion = 'solo_interes' THEN
    interes_mensual := round(p.monto_principal * r, 2);
    FOR i IN 1..p.plazo_meses LOOP
      capital := CASE WHEN i = p.plazo_meses THEN p.monto_principal ELSE 0 END;
      interes := interes_mensual;
      fecha_v := p.fecha_desembolso + (interval '1 month' * i);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, capital, interes, capital + interes);
    END LOOP;

  -- ── Anticipado: todos los intereses en cuota 1 + capital en cuota 2 ─────
  ELSIF p.tipo_amortizacion = 'anticipado' THEN
    total_intereses := round(p.monto_principal * r * p.plazo_meses, 2);

    -- Cuota 1: interés total anticipado (vence el mismo día del desembolso, no +1 mes)
    INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
      VALUES (p.id, 1, p.fecha_desembolso, 0, total_intereses, total_intereses);

    -- Cuota 2: capital completo al vencimiento
    INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
      VALUES (p.id, 2,
              p.fecha_desembolso + (interval '1 month' * p.plazo_meses),
              p.monto_principal, 0, p.monto_principal);
  END IF;
END;
$$;
