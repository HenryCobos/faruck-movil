# Release 1.3.3 (iOS)

**Producción anterior:** 1.3.2 (build 20)  
**Objetivo:** 1.3.3 (build 21 vía EAS `autoIncrement`)  
**Commit de referencia:** `0a40982` (config EAS local + 1.3.3); tag `v1.3.2` → `901a9f3`.

## Cambios incluidos (delta respecto a 1.3.2)

- **Préstamo con interés:** categoría de producto **opcional** al crear; en comprobantes: `Préstamo · {categoría}` cuando aplica.
- **Créditos existentes:** admin y oficial pueden **editar o quitar** categoría desde el detalle (préstamos y ventas a crédito).
- **Lista de créditos:** muestra chip de categoría cuando está asignada.
- **Inicio / alertas:** conteo de cuotas vencidas alineado con criterio por calendario (préstamos activos).

La base de 1.3.2 (recibos por tipo, categoría obligatoria en venta a crédito, buscador de clientes) está documentada en [RELEASE_1.3.2.md](./RELEASE_1.3.2.md).

## Supabase

**No hay parches SQL nuevos** en 1.3.3. La edición de categoría usa las columnas de [add_categoria_producto.sql](../supabase/add_categoria_producto.sql).

Verificar en producción (mismo query que 1.3.2):

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'prestamos'
  and column_name in ('categoria_producto', 'categoria_producto_otro');
```

## Build iOS

**Build 1.3.3 (21)** — [EAS build](https://expo.dev/accounts/henryapper/projects/faruck-movil/builds/b964ee4f-fbfa-4fee-aee7-7c46e00b965d) · [submission](https://expo.dev/accounts/henryapper/projects/faruck-movil/submissions/7f4b8b7d-a209-4bbb-86ad-bf0b65724d21)

```bash
cd /Users/henryrimarachincobos/faruck-movil
npx tsc --noEmit
npx eas-cli build --platform ios --profile production --auto-submit
```

Versión **1.3.3** y build **21**: [`app.json`](../app.json) (`expo.version`, `ios.buildNumber` en 20) + [`eas.json`](../eas.json) con `appVersionSource: "local"` y `autoIncrement` en production (siguiente build = 21).

Si volvés a `appVersionSource: remote`, ejecutá antes `npx eas-cli build:version:set -p ios` en terminal interactiva para fijar la versión en EAS.

## App Store Connect — What's New (español)

```
- Al crear un préstamo puedes indicar la categoría del producto (opcional); los comprobantes muestran «Préstamo · …» cuando aplique.
- En el detalle del crédito, administradores y oficiales pueden corregir o quitar la categoría en préstamos y ventas ya registrados.
- La lista de créditos muestra la categoría cuando está asignada.
- Mejora en el conteo de cuotas vencidas en la pantalla de inicio.
```

**App Review:** reutilizar datos de 1.3.2 (Sign-in, contacto de revisión). Sin permisos ni capacidades nuevas.

## Orden de despliegue recomendado

1. Confirmar SQL `add_categoria_producto` ya aplicado en Supabase producción.
2. `npx tsc --noEmit` y pruebas manuales (checklist).
3. Commit release 1.3.3 y push a `main`.
4. `eas build:version:set` → `1.3.3`, luego `eas build` production + auto-submit.
5. App Store Connect: What’s New, build 21, enviar a revisión.

## Checklist manual

| # | Caso | OK |
|---|------|-----|
| 1 | SQL categorías en Supabase producción | |
| 2 | Nuevo préstamo categoría Celular → cobro → `Préstamo · Celular` | |
| 3 | Crédito legacy sin categoría → Editar → guardar → recibo regenerado | |
| 4 | Quitar categoría → recibo sin sufijo `· …` | |
| 5 | Cajero: no ve «Editar categoría» | |
| 6 | Venta a crédito + buscador cliente (regresión) | |
| 7 | Inicio: cuotas vencidas coherente con Cobros | |
| 8 | `npx tsc --noEmit` | |

## Android (opcional)

```bash
npx eas-cli build --platform android --profile production
```