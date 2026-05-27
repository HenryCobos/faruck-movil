-- ============================================================
-- PARCHE: v_cuotas_pendientes — agrega alias del cliente
-- Se hace DROP + CREATE porque PostgreSQL no permite insertar
-- nuevas columnas en medio de una vista existente con OR REPLACE.
-- ============================================================

DROP VIEW IF EXISTS v_cuotas_pendientes;

CREATE VIEW v_cuotas_pendientes
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.prestamo_id,
  c.numero_cuota,
  c.fecha_vencimiento,
  c.capital,
  c.interes,
  c.monto_total,
  c.mora_acumulada,
  c.estado,
  CASE
    WHEN c.fecha_vencimiento < CURRENT_DATE AND c.estado != 'pagada'
    THEN CURRENT_DATE - c.fecha_vencimiento
    ELSE 0
  END AS dias_mora,
  CASE
    WHEN c.fecha_vencimiento < CURRENT_DATE AND c.estado != 'pagada'
    THEN ROUND(c.monto_total * 0.001 * (CURRENT_DATE - c.fecha_vencimiento), 2)
    ELSE 0
  END AS mora_calculada,
  p.monto_principal,
  p.tasa_mensual,
  cl.nombre           AS cliente_nombre,
  cl.apellido         AS cliente_apellido,
  cl.alias            AS cliente_alias,
  cl.telefono         AS cliente_telefono,
  cl.documento_numero AS cliente_documento,
  g.tipo              AS garantia_tipo,
  g.descripcion       AS garantia_descripcion
FROM cuotas c
JOIN  prestamos p  ON p.id  = c.prestamo_id
JOIN  clientes  cl ON cl.id = p.cliente_id
LEFT JOIN garantias g  ON g.id  = p.garantia_id
WHERE c.estado IN ('pendiente', 'vencida', 'parcial');

GRANT SELECT ON v_cuotas_pendientes TO authenticated;
