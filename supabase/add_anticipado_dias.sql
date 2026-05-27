-- ── MIGRACIÓN: Soporte de plazo en días para tipo "anticipado" ──────────────
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- Permite especificar el plazo exacto en días para créditos de tipo "anticipado".
-- Créditos existentes (plazo_dias = NULL) siguen usando plazo_meses × 30 como
-- días efectivos (retrocompatibilidad total).
--
-- Convención de interés: base 30 días comerciales
--   intereses = monto × tasa_mensual × (plazo_dias / 30.0)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Agregar columna plazo_dias (nullable — solo para tipo anticipado)
ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS plazo_dias integer;

-- 2. Reemplazar generar_cronograma con soporte de plazo_dias
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
  dias_efectivos  integer;   -- para tipo anticipado con plazo en días
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

  -- ── Solo intereses vencidos: interés mensual + capital total en última cuota ─
  ELSIF p.tipo_amortizacion = 'solo_interes' THEN
    interes_mensual := round(p.monto_principal * r, 2);
    FOR i IN 1..p.plazo_meses LOOP
      capital := CASE WHEN i = p.plazo_meses THEN p.monto_principal ELSE 0 END;
      interes := interes_mensual;
      fecha_v := p.fecha_desembolso + (interval '1 month' * i);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, capital, interes, capital + interes);
    END LOOP;

  -- ── Solo intereses adelantados: 1ª cuota en día 0, capital al final ─────
  ELSIF p.tipo_amortizacion = 'solo_interes_adelantado' THEN
    interes_mensual := round(p.monto_principal * r, 2);
    FOR i IN 1..p.plazo_meses LOOP
      fecha_v := p.fecha_desembolso + (interval '1 month' * (i - 1));
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, 0, interes_mensual, interes_mensual);
    END LOOP;
    INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
      VALUES (p.id, p.plazo_meses + 1,
              p.fecha_desembolso + (interval '1 month' * p.plazo_meses),
              p.monto_principal, 0, p.monto_principal);

  -- ── Anticipado: interés el día del desembolso + capital al vencimiento ──
  -- Si plazo_dias está definido, lo usa para calcular interés y fecha de capital.
  -- Si no, usa plazo_meses × 30 como días efectivos (retrocompatibilidad).
  ELSIF p.tipo_amortizacion = 'anticipado' THEN
    dias_efectivos  := COALESCE(p.plazo_dias, p.plazo_meses * 30);
    total_intereses := round(p.monto_principal * r * dias_efectivos / 30.0, 2);

    -- Cuota 1: interés total, vence el mismo día del desembolso
    INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
      VALUES (p.id, 1, p.fecha_desembolso, 0, total_intereses, total_intereses);

    -- Cuota 2: capital completo, vence en fecha_desembolso + dias_efectivos
    INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
      VALUES (p.id, 2,
              p.fecha_desembolso + (dias_efectivos * interval '1 day'),
              p.monto_principal, 0, p.monto_principal);
  END IF;
END;
$$;
