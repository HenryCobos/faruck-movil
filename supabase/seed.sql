-- ============================================================
-- PIGNORA APP — Datos de prueba
-- ⚠️  SOLO PARA DESARROLLO — NO EJECUTAR EN PRODUCCIÓN ⚠️
-- Ejecutar DESPUÉS del schema.sql, únicamente en entornos de
-- desarrollo o staging con datos de prueba.
-- ============================================================

-- NOTA: Los usuarios se crean desde Supabase Dashboard > Authentication > Users
-- Luego actualiza el rol en la tabla profiles:

-- Ejemplo para dar rol admin al primer usuario:
-- UPDATE profiles SET rol = 'admin', nombre = 'Admin', apellido = 'Principal' 
-- WHERE email = 'admin@pignora.com';

-- ── CLIENTES DE PRUEBA ───────────────────────────────────────
insert into clientes (nombre, apellido, documento_tipo, documento_numero, telefono, email, direccion, scoring) values
  ('Juan Carlos', 'Pérez Morales', 'ci', '1234567', '0991234567', 'juan.perez@email.com', 'Av. Principal 123', 75),
  ('Ana María', 'García López', 'ci', '2345678', '0982345678', 'ana.garcia@email.com', 'Calle Sucre 456', 90),
  ('Carlos Antonio', 'López Ramírez', 'ci', '3456789', '0973456789', null, 'Barrio Norte 789', 60),
  ('María Elena', 'Torres Vega', 'pasaporte', 'AB123456', '0964567890', 'maria.torres@email.com', 'Centro Comercial 12', 85),
  ('Roberto', 'Mendoza Silva', 'ruc', '1234567890001', '0955678901', 'roberto@empresa.com', 'Zona Industrial 5', 70);

-- ── GARANTÍAS DE PRUEBA ──────────────────────────────────────
insert into garantias (cliente_id, tipo, descripcion, valor_avaluo, estado)
select id, 'vehiculo', 'Toyota Corolla 2019, color blanco, placa ABC-1234', 15000.00, 'disponible'
from clientes where documento_numero = '1234567';

insert into garantias (cliente_id, tipo, descripcion, valor_avaluo, estado)
select id, 'inmueble', 'Casa de 120m², barrio residencial, escritura a nombre del propietario', 45000.00, 'disponible'
from clientes where documento_numero = '2345678';

insert into garantias (cliente_id, tipo, descripcion, valor_avaluo, estado)
select id, 'joya', 'Cadena de oro 18k, 20 gramos. Certificado de autenticidad adjunto', 800.00, 'disponible'
from clientes where documento_numero = '3456789';
