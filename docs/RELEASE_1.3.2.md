# Release 1.3.2 (iOS)

**Producción anterior:** 1.3.1 (build 19)  
**Objetivo:** 1.3.2 (build 20 vía EAS `autoIncrement`)

## Cambios incluidos

- **Recibos de pago y PDF:** distinguen **Préstamo** vs **Venta a crédito**; textos de saldo pendiente y mensaje de operación saldada adaptados al tipo.
- **Venta a crédito — categorías:** Celular, Vehículo, Inmueble, Joya, Electrodoméstico, Motocicleta o Personalizada; en el recibo: `Venta a crédito · {categoría}`.
- **Selector de cliente:** buscador al crear **Nuevo préstamo** y **Venta a crédito** (y al registrar garantía con cliente), filtrando por nombre, alias, correo, documento y teléfono.

## Supabase (obligatorio antes de usar categorías en producción)

Ejecutar en el SQL Editor del proyecto **de producción**:

1. [`supabase/add_categoria_producto.sql`](../supabase/add_categoria_producto.sql)

Sin este script, las ventas a crédito **nuevas con categoría** fallan al guardar. Las ventas antiguas sin categoría y los préstamos normales siguen funcionando.

**No ejecutar** scripts de borrado masivo. Los parches de [RELEASE_1.3.0.md](./RELEASE_1.3.0.md) y [RELEASE_1.3.1.md](./RELEASE_1.3.1.md) siguen vigentes.

### Verificación rápida post-SQL

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'prestamos'
  and column_name in ('categoria_producto', 'categoria_producto_otro');
```

Deben aparecer las dos columnas.

## Build iOS

**Build 1.3.2 (20)** — [EAS build](https://expo.dev/accounts/henryapper/projects/faruck-movil/builds/c5591512-f991-4976-923c-62072acbd8e0) · [submission](https://expo.dev/accounts/henryapper/projects/faruck-movil/submissions/fc0c23cb-51f6-4009-a264-7c9423783b73)

```bash
cd /Users/henryrimarachincobos/faruck-movil
npx tsc --noEmit
npx eas-cli build --platform ios --profile production --auto-submit
```

## App Store Connect — What's New (español)

```
- Los comprobantes de pago indican si la operación es un préstamo o una venta a crédito, con textos adaptados al tipo de operación.
- Al registrar una venta a crédito puedes elegir la categoría del producto; el recibo muestra la categoría (por ejemplo: Venta a crédito · Celular).
- Buscador en la lista de clientes al crear un préstamo o una venta a crédito (nombre, alias, correo y documento).
```

**App Review:** reutilizar datos de 1.3.1 (Sign-in, contacto de revisión). Sin permisos ni capacidades nuevas.

## Orden de despliegue recomendado

1. SQL `add_categoria_producto` en Supabase producción (mismo día o antes que la app).
2. Probar en simulador: venta con categoría + cobro + recibo/PDF.
3. Commit con versión 1.3.2 y este documento.
4. `eas build` production + auto-submit.
5. Pegar **What's New** en App Store Connect si hace falta; enviar a revisión.

## Checklist manual

| # | Caso | OK |
|---|------|-----|
| 1 | SQL `add_categoria_producto` aplicado en Supabase producción | |
| 2 | Venta a crédito categoría Celular → cobro → recibo y PDF con `· Celular` | |
| 3 | Venta categoría Personalizada → recibo con texto personalizado | |
| 4 | Préstamo normal → recibo muestra **Préstamo** | |
| 5 | Nuevo préstamo / venta a crédito: buscar cliente por alias o correo | |
| 6 | Regresión: cobro, lista créditos, venta antigua sin categoría (si existe) | |
| 7 | `npx tsc --noEmit` | |

## Android (opcional)

Si publicas Android en el mismo ciclo:

```bash
npx eas-cli build --platform android --profile production
```
