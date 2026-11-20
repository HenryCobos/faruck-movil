-- ============================================================
-- CATEGORÍAS DE VENTA A CRÉDITO (producto)
-- Ejecutar en SQL Editor de Supabase.
-- ============================================================

alter table prestamos
  add column if not exists categoria_producto text;

alter table prestamos
  add column if not exists categoria_producto_otro text;

alter table prestamos drop constraint if exists prestamos_categoria_producto_check;
alter table prestamos add constraint prestamos_categoria_producto_check check (
  categoria_producto is null
  or categoria_producto in (
    'celular',
    'vehiculo',
    'inmueble',
    'joya',
    'electrodomestico',
    'motocicleta',
    'otro'
  )
);

-- Si la categoría es "otro", exigir texto personalizado (mín. 2 caracteres)
alter table prestamos drop constraint if exists prestamos_categoria_producto_otro_check;
alter table prestamos add constraint prestamos_categoria_producto_otro_check check (
  categoria_producto is distinct from 'otro'
  or (
    categoria_producto_otro is not null
    and length(trim(categoria_producto_otro)) >= 2
    and length(categoria_producto_otro) <= 40
  )
);

-- Sin "otro" no debe guardarse texto personalizado
alter table prestamos drop constraint if exists prestamos_categoria_producto_otro_solo_otro;
alter table prestamos add constraint prestamos_categoria_producto_otro_solo_otro check (
  categoria_producto = 'otro'
  or categoria_producto_otro is null
);
