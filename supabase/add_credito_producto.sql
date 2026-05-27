-- ============================================================
-- CRÉDITO DE PRODUCTO
-- Ejecutar en SQL Editor de Supabase para habilitar ventas a crédito
-- de productos sin interés.
-- ============================================================

-- 1. Permitir tasa = 0 (eliminar CHECK tasa > 0 y reemplazar con >= 0)
alter table prestamos drop constraint if exists prestamos_tasa_mensual_check;
alter table prestamos add constraint prestamos_tasa_mensual_check check (tasa_mensual >= 0);

-- 2. Hacer garantia_id opcional (puede ser NULL para créditos de producto)
alter table prestamos alter column garantia_id drop not null;

-- 3. Discriminador de tipo de crédito
alter table prestamos
  add column if not exists tipo_prestamo text not null default 'prestamo'
  check (tipo_prestamo in ('prestamo', 'credito_producto'));

-- 4. Descripción del bien vendido a crédito
alter table prestamos
  add column if not exists descripcion_producto text;

-- 5. Índice para filtrar por tipo
create index if not exists idx_prestamos_tipo on prestamos(tipo_prestamo);

-- 6. Parchear generar_cronograma para manejar tasa = 0 (cuotas iguales sin interés)
create or replace function generar_cronograma(prestamo_id uuid)
returns void language plpgsql security definer
set search_path = public
as $$
declare
  p           prestamos%rowtype;
  r           numeric;
  cuota_fija  numeric;
  saldo       numeric;
  capital     numeric;
  interes     numeric;
  fecha_v     date;
  i           integer;
begin
  select * into p from prestamos where id = prestamo_id;

  r       := p.tasa_mensual;
  saldo   := p.monto_principal;
  fecha_v := p.fecha_desembolso;

  -- ── Crédito producto o préstamo con tasa 0: cuotas de capital igual, interés 0
  if r = 0 then
    capital := round(p.monto_principal / p.plazo_meses, 2);
    for i in 1..p.plazo_meses loop
      -- Ajuste de redondeo en la última cuota
      if i = p.plazo_meses then capital := round(saldo, 2); end if;
      fecha_v := fecha_v + interval '1 month';
      insert into cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        values (p.id, i, fecha_v, capital, 0, capital);
      saldo := saldo - capital;
    end loop;
    return;
  end if;

  if p.tipo_amortizacion = 'francesa' then
    cuota_fija := saldo * (r * power(1 + r, p.plazo_meses)) / (power(1 + r, p.plazo_meses) - 1);
    for i in 1..p.plazo_meses loop
      interes := round(saldo * r, 2);
      capital := round(cuota_fija - interes, 2);
      if i = p.plazo_meses then
        capital := saldo;
      end if;
      saldo   := saldo - capital;
      fecha_v := fecha_v + interval '1 month';
      insert into cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        values (p.id, i, fecha_v, capital, interes, capital + interes);
    end loop;

  elsif p.tipo_amortizacion = 'alemana' then
    capital := round(p.monto_principal / p.plazo_meses, 2);
    for i in 1..p.plazo_meses loop
      interes := round(saldo * r, 2);
      if i = p.plazo_meses then capital := saldo; end if;
      saldo   := saldo - capital;
      fecha_v := fecha_v + interval '1 month';
      insert into cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        values (p.id, i, fecha_v, capital, interes, capital + interes);
    end loop;

  elsif p.tipo_amortizacion = 'solo_interes' then
    interes := round(p.monto_principal * r, 2);
    for i in 1..p.plazo_meses loop
      capital := case when i = p.plazo_meses then p.monto_principal else 0 end;
      fecha_v := fecha_v + interval '1 month';
      insert into cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        values (p.id, i, fecha_v, capital, interes, capital + interes);
    end loop;

  elsif p.tipo_amortizacion = 'solo_interes_adelantado' then
    interes := round(p.monto_principal * r, 2);
    -- N cuotas de interés: cuota 1 en día 0, cuotas 2..N en meses 1..N-1
    for i in 1..p.plazo_meses loop
      insert into cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        values (p.id, i,
          p.fecha_desembolso + ((i - 1) * interval '1 month'),
          0, interes, interes);
    end loop;
    -- Cuota N+1: capital completo al final
    insert into cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
      values (p.id, p.plazo_meses + 1,
        p.fecha_desembolso + (p.plazo_meses * interval '1 month'),
        p.monto_principal, 0, p.monto_principal);

  elsif p.tipo_amortizacion = 'anticipado' then
    -- Cuota 1: interés total en día de desembolso
    if p.plazo_dias is not null and p.plazo_dias > 0 then
      interes := round(p.monto_principal * r * p.plazo_dias / 30, 2);
      insert into cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        values (p.id, 1, p.fecha_desembolso, 0, interes, interes);
      insert into cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        values (p.id, 2, p.fecha_desembolso + (p.plazo_dias * interval '1 day'),
          p.monto_principal, 0, p.monto_principal);
    else
      interes := round(p.monto_principal * r * p.plazo_meses, 2);
      insert into cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        values (p.id, 1, p.fecha_desembolso, 0, interes, interes);
      insert into cuotas (prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_total)
        values (p.id, 2,
          p.fecha_desembolso + (p.plazo_meses * interval '1 month'),
          p.monto_principal, 0, p.monto_principal);
    end if;
  end if;
end;
$$;
