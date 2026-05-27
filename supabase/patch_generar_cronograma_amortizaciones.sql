-- Parche: si ejecutaste fix_warnings.sql antes que add_tipos_amortizacion.sql,
-- generar_cronograma quedó sin solo_interes ni anticipado (o sin anticipado al desembolso).
-- Ejecuta este script en el SQL Editor de Supabase para alinear la función con add_tipos_amortizacion.sql.

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

  ELSIF p.tipo_amortizacion = 'solo_interes' THEN
    interes_mensual := round(p.monto_principal * r, 2);
    FOR i IN 1..p.plazo_meses LOOP
      capital := CASE WHEN i = p.plazo_meses THEN p.monto_principal ELSE 0 END;
      interes := interes_mensual;
      fecha_v := p.fecha_desembolso + (interval '1 month' * i);
      INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        VALUES (p.id, i, fecha_v, capital, interes, capital + interes);
    END LOOP;

  ELSIF p.tipo_amortizacion = 'anticipado' THEN
    total_intereses := round(p.monto_principal * r * p.plazo_meses, 2);
    INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
      VALUES (p.id, 1, p.fecha_desembolso, 0, total_intereses, total_intereses);
    INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
      VALUES (p.id, 2,
              p.fecha_desembolso + (interval '1 month' * p.plazo_meses),
              p.monto_principal, 0, p.monto_principal);
  END IF;
END;
$$;
