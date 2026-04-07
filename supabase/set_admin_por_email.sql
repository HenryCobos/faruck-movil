-- ============================================================
-- Asignar rol ADMINISTRADOR a un usuario por correo
-- ⚠️  Edita el correo antes de ejecutar. No dejar el correo de
--     prueba (hcobos99@gmail.com) en producción.
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- Cambia el correo antes de ejecutar
UPDATE public.profiles
SET
  rol        = 'admin'::user_role,
  updated_at = now()
WHERE id IN (
  SELECT id
  FROM auth.users
  WHERE lower(trim(email)) = lower(trim('hcobos99@gmail.com'))
);

-- Comprueba que se actualizó (debe mostrar 1 fila con rol admin)
SELECT p.id, p.email, p.nombre, p.apellido, p.rol, p.activo
FROM public.profiles p
WHERE lower(trim(p.email)) = lower(trim('hcobos99@gmail.com'));
