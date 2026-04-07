-- ============================================================
-- VERIFICACIÓN DE SETUP — Ejecutar en SQL Editor de Supabase
-- ============================================================

-- 1. Verificar que todas las tablas existen
select
  table_name,
  '✅ OK' as estado
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles','clientes','garantias','prestamos','cuotas','pagos','plan_cuentas','asientos_contables','auditoria')
order by table_name;

-- 2. Verificar los tipos ENUM creados
select
  typname as enum_name,
  '✅ OK' as estado
from pg_type
where typtype = 'e'
  and typname in ('user_role','garantia_tipo','garantia_estado','cliente_estado','prestamo_estado','tipo_amortizacion','cuota_estado','metodo_pago','tipo_asiento')
order by typname;

-- 3. Verificar clientes de prueba (seed)
select
  nombre || ' ' || apellido as cliente,
  documento_numero,
  scoring,
  estado
from clientes
order by nombre;

-- 4. Verificar garantías de prueba (seed)
select
  g.tipo,
  g.descripcion,
  g.valor_avaluo,
  g.estado,
  c.nombre || ' ' || c.apellido as propietario
from garantias g
join clientes c on c.id = g.cliente_id;

-- 5. Verificar plan de cuentas
select count(*) as total_cuentas from plan_cuentas;

-- 6. Verificar RLS habilitado
select
  tablename,
  rowsecurity as rls_activo
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','clientes','garantias','prestamos','cuotas','pagos')
order by tablename;

-- 7. Verificar funciones creadas
select
  routine_name as funcion,
  '✅ OK' as estado
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('generar_cronograma','calcular_mora_diaria','get_my_role','is_active_user','handle_new_user','set_updated_at')
order by routine_name;
