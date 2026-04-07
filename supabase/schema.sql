-- ============================================================
-- PIGNORA APP — Schema de base de datos en Supabase
-- Ejecutar en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- Habilitar extensiones necesarias
create extension if not exists "uuid-ossp";

-- ── TIPOS ENUM ──────────────────────────────────────────────
create type user_role as enum ('admin', 'oficial', 'cajero', 'auditor');
create type garantia_tipo as enum ('inmueble', 'vehiculo', 'joya', 'electrodomestico', 'otro');
create type garantia_estado as enum ('disponible', 'en_garantia', 'devuelta', 'ejecutada');
create type cliente_estado as enum ('activo', 'inactivo', 'moroso');
create type documento_tipo as enum ('ci', 'pasaporte', 'ruc');
create type prestamo_estado as enum ('solicitado', 'aprobado', 'activo', 'cancelado', 'vencido', 'ejecutado');
create type tipo_amortizacion as enum ('francesa', 'alemana');
create type cuota_estado as enum ('pendiente', 'pagada', 'vencida', 'parcial');
create type metodo_pago as enum ('efectivo', 'transferencia', 'cheque');
create type tipo_asiento as enum ('prestamo', 'pago_capital', 'pago_interes', 'mora', 'devolucion_garantia');

-- ── PROFILES (extiende auth.users) ──────────────────────────
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  nombre      text not null,
  apellido    text not null,
  telefono    text,
  rol         user_role not null default 'cajero',
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Trigger: auto-crear profile al registrar usuario
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nombre, apellido, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', 'Usuario'),
    coalesce(new.raw_user_meta_data->>'apellido', ''),
    coalesce((new.raw_user_meta_data->>'rol')::user_role, 'cajero')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Trigger: actualizar updated_at
create or replace function set_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── CLIENTES ────────────────────────────────────────────────
create table clientes (
  id                uuid primary key default uuid_generate_v4(),
  nombre            text not null,
  apellido          text not null,
  documento_tipo    documento_tipo not null default 'ci',
  documento_numero  text not null unique,
  telefono          text not null,
  email             text,
  direccion         text not null,
  foto_url          text,
  estado            cliente_estado not null default 'activo',
  scoring           integer not null default 50 check (scoring >= 0 and scoring <= 100),
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger clientes_updated_at before update on clientes
  for each row execute procedure set_updated_at();

-- ── GARANTÍAS ───────────────────────────────────────────────
create table garantias (
  id             uuid primary key default uuid_generate_v4(),
  cliente_id     uuid not null references clientes(id) on delete restrict,
  tipo           garantia_tipo not null,
  descripcion    text not null,
  valor_avaluo   numeric(14,2) not null check (valor_avaluo > 0),
  fotos          text[] not null default '{}',
  documentos     jsonb not null default '{}',
  estado         garantia_estado not null default 'disponible',
  observaciones  text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger garantias_updated_at before update on garantias
  for each row execute procedure set_updated_at();

-- ── PRÉSTAMOS ───────────────────────────────────────────────
create table prestamos (
  id                  uuid primary key default uuid_generate_v4(),
  cliente_id          uuid not null references clientes(id) on delete restrict,
  garantia_id         uuid not null references garantias(id) on delete restrict,
  oficial_id          uuid not null references profiles(id),
  monto_principal     numeric(14,2) not null check (monto_principal > 0),
  tasa_mensual        numeric(6,4) not null check (tasa_mensual > 0),
  plazo_meses         integer not null check (plazo_meses > 0),
  tipo_amortizacion   tipo_amortizacion not null default 'francesa',
  comision_apertura   numeric(14,2) not null default 0,
  estado              prestamo_estado not null default 'solicitado',
  fecha_desembolso    date,
  fecha_vencimiento   date,
  observaciones       text,
  aprobado_por        uuid references profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger prestamos_updated_at before update on prestamos
  for each row execute procedure set_updated_at();

-- ── CUOTAS ──────────────────────────────────────────────────
create table cuotas (
  id                uuid primary key default uuid_generate_v4(),
  prestamo_id       uuid not null references prestamos(id) on delete cascade,
  numero_cuota      integer not null,
  fecha_vencimiento date not null,
  capital           numeric(14,2) not null,
  interes           numeric(14,2) not null,
  monto_total       numeric(14,2) not null,
  mora_acumulada    numeric(14,2) not null default 0,
  estado            cuota_estado not null default 'pendiente',
  fecha_pago        timestamptz,
  unique(prestamo_id, numero_cuota)
);

-- ── PAGOS ───────────────────────────────────────────────────
create table pagos (
  id              uuid primary key default uuid_generate_v4(),
  cuota_id        uuid not null references cuotas(id) on delete restrict,
  cajero_id       uuid not null references profiles(id),
  monto_pagado    numeric(14,2) not null check (monto_pagado > 0),
  mora_cobrada    numeric(14,2) not null default 0,
  fecha_pago      timestamptz not null default now(),
  metodo_pago     metodo_pago not null default 'efectivo',
  numero_recibo   text not null unique,
  observaciones   text,
  created_at      timestamptz not null default now()
);

-- ── PLAN DE CUENTAS ─────────────────────────────────────────
create table plan_cuentas (
  id          uuid primary key default uuid_generate_v4(),
  codigo      text not null unique,
  nombre      text not null,
  tipo        text not null check (tipo in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'egreso')),
  padre_id    uuid references plan_cuentas(id),
  activa      boolean not null default true
);

alter table plan_cuentas enable row level security;

create policy "Usuarios activos ven plan de cuentas"
  on plan_cuentas for select using (is_active_user() = true);

create policy "Solo admin inserta cuentas"
  on plan_cuentas for insert with check (get_my_role() = 'admin');

create policy "Solo admin actualiza cuentas"
  on plan_cuentas for update using (get_my_role() = 'admin');

create policy "Solo admin elimina cuentas"
  on plan_cuentas for delete using (get_my_role() = 'admin');

-- Cuentas base del plan de cuentas
insert into plan_cuentas (codigo, nombre, tipo) values
  ('1000', 'ACTIVOS', 'activo'),
  ('1100', 'Caja y Bancos', 'activo'),
  ('1110', 'Caja General', 'activo'),
  ('1120', 'Banco', 'activo'),
  ('1200', 'Cartera de Créditos', 'activo'),
  ('1210', 'Créditos Vigentes', 'activo'),
  ('1220', 'Créditos Vencidos', 'activo'),
  ('1230', 'Provisión Cartera Dudosa', 'activo'),
  ('1300', 'Garantías en Custodia', 'activo'),
  ('4000', 'INGRESOS', 'ingreso'),
  ('4100', 'Ingresos Financieros', 'ingreso'),
  ('4110', 'Intereses por Créditos', 'ingreso'),
  ('4120', 'Comisiones de Apertura', 'ingreso'),
  ('4130', 'Intereses por Mora', 'ingreso'),
  ('5000', 'EGRESOS', 'egreso'),
  ('5100', 'Gastos Operativos', 'egreso'),
  ('5110', 'Sueldos y Salarios', 'egreso'),
  ('5120', 'Gastos Administrativos', 'egreso');

-- ── ASIENTOS CONTABLES ──────────────────────────────────────
create table asientos_contables (
  id              uuid primary key default uuid_generate_v4(),
  fecha           date not null default current_date,
  concepto        text not null,
  debe            numeric(14,2) not null default 0,
  haber           numeric(14,2) not null default 0,
  cuenta_id       uuid not null references plan_cuentas(id),
  referencia_id   uuid,
  tipo_referencia tipo_asiento,
  usuario_id      uuid references profiles(id),
  created_at      timestamptz not null default now()
);

-- ── AUDITORÍA ───────────────────────────────────────────────
create table auditoria (
  id              uuid primary key default uuid_generate_v4(),
  usuario_id      uuid references profiles(id),
  accion          text not null,
  tabla           text not null,
  registro_id     uuid,
  datos_antes     jsonb,
  datos_despues   jsonb,
  ip              text,
  created_at      timestamptz not null default now()
);

-- ── ROW LEVEL SECURITY (RLS) ────────────────────────────────
alter table profiles enable row level security;
alter table clientes enable row level security;
alter table garantias enable row level security;
alter table prestamos enable row level security;
alter table cuotas enable row level security;
alter table pagos enable row level security;
alter table asientos_contables enable row level security;
alter table auditoria enable row level security;

-- Helper: obtener rol del usuario actual
create or replace function get_my_role()
returns user_role language sql security definer
set search_path = public
as $$
  select rol from public.profiles where id = auth.uid();
$$;

-- Helper: verificar si usuario está activo
create or replace function is_active_user()
returns boolean language sql security definer
set search_path = public
as $$
  select activo from public.profiles where id = auth.uid();
$$;

-- Políticas de profiles
create policy "Usuarios ven su propio perfil"
  on profiles for select using (auth.uid() = id);

create policy "Admin ve todos los perfiles"
  on profiles for select using (get_my_role() = 'admin');

create policy "Admin actualiza perfiles"
  on profiles for update using (get_my_role() = 'admin');

-- Políticas de clientes (todos los roles autenticados y activos pueden leer)
create policy "Usuarios activos ven clientes"
  on clientes for select using (is_active_user() = true);

create policy "Admin y oficial crean clientes"
  on clientes for insert with check (
    get_my_role() in ('admin', 'oficial') and is_active_user() = true
  );

create policy "Admin y oficial editan clientes"
  on clientes for update using (
    get_my_role() in ('admin', 'oficial') and is_active_user() = true
  );

create policy "Solo admin elimina clientes"
  on clientes for delete using (get_my_role() = 'admin');

-- Políticas de garantías
create policy "Usuarios activos ven garantías"
  on garantias for select using (is_active_user() = true);

create policy "Admin y oficial crean garantías"
  on garantias for insert with check (
    get_my_role() in ('admin', 'oficial') and is_active_user() = true
  );

create policy "Admin y oficial editan garantías"
  on garantias for update using (
    get_my_role() in ('admin', 'oficial') and is_active_user() = true
  );

-- Políticas de préstamos
create policy "Usuarios activos ven préstamos"
  on prestamos for select using (is_active_user() = true);

create policy "Admin y oficial crean préstamos"
  on prestamos for insert with check (
    get_my_role() in ('admin', 'oficial') and is_active_user() = true
  );

create policy "Admin aprueba y edita préstamos"
  on prestamos for update using (
    get_my_role() in ('admin', 'oficial') and is_active_user() = true
  );

-- Políticas de cuotas
create policy "Usuarios activos ven cuotas"
  on cuotas for select using (is_active_user() = true);

create policy "Solo sistema crea cuotas"
  on cuotas for insert with check (get_my_role() in ('admin', 'oficial'));

-- Políticas de pagos
create policy "Usuarios activos ven pagos"
  on pagos for select using (is_active_user() = true);

create policy "Admin y cajero registran pagos"
  on pagos for insert with check (
    get_my_role() in ('admin', 'cajero') and is_active_user() = true
  );

-- Políticas de asientos contables
create policy "Admin y auditor ven asientos"
  on asientos_contables for select using (
    get_my_role() in ('admin', 'auditor') and is_active_user() = true
  );

create policy "Sistema crea asientos"
  on asientos_contables for insert with check (get_my_role() = 'admin');

-- Políticas de auditoría
create policy "Solo admin ve auditoría"
  on auditoria for select using (get_my_role() = 'admin');

-- ── FUNCIÓN: GENERAR CRONOGRAMA ──────────────────────────────
-- Llamar después de cambiar préstamo a estado 'activo'
create or replace function generar_cronograma(prestamo_id uuid)
returns void language plpgsql security definer
set search_path = public
as $$
declare
  p         prestamos%rowtype;
  r         numeric;
  cuota_fija numeric;
  saldo     numeric;
  capital   numeric;
  interes   numeric;
  fecha_v   date;
  i         integer;
begin
  select * into p from prestamos where id = prestamo_id;

  r     := p.tasa_mensual;
  saldo := p.monto_principal;
  fecha_v := p.fecha_desembolso;

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
  end if;
end;
$$;

-- ── FUNCIÓN: CALCULAR MORA DIARIA ───────────────────────────
-- Ejecutar con un cron job diario (pg_cron o Supabase Edge Function)
create or replace function calcular_mora_diaria()
returns void language plpgsql security definer
set search_path = public
as $$
declare
  tasa_mora_diaria constant numeric := 0.001; -- 0.1% diario, ajustar según negocio
begin
  update cuotas
  set
    mora_acumulada = mora_acumulada + (monto_total * tasa_mora_diaria),
    estado = 'vencida'
  where
    estado in ('pendiente', 'parcial')
    and fecha_vencimiento < current_date;
end;
$$;

-- ── ÍNDICES ─────────────────────────────────────────────────
create index idx_prestamos_cliente on prestamos(cliente_id);
create index idx_prestamos_estado on prestamos(estado);
create index idx_prestamos_oficial on prestamos(oficial_id);
create index idx_cuotas_prestamo on cuotas(prestamo_id);
create index idx_cuotas_estado on cuotas(estado);
create index idx_cuotas_vencimiento on cuotas(fecha_vencimiento);
create index idx_pagos_cuota on pagos(cuota_id);
create index idx_pagos_fecha_pago on pagos(fecha_pago);
create index idx_garantias_cliente on garantias(cliente_id);
create index idx_asientos_fecha on asientos_contables(fecha);
create index idx_auditoria_usuario on auditoria(usuario_id);
create index idx_auditoria_tabla on auditoria(tabla);
