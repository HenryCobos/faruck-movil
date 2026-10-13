# Release 1.3.1 (iOS)

**Producción anterior:** 1.3.0 (build 18)  
**Objetivo:** 1.3.1 (build 19 vía EAS `autoIncrement`)

## Cambios incluidos

- Lista de **Créditos**: capital pendiente en grande, monto original debajo (como la ficha del cliente); chip Cartera alineado.
- **Inicio**, **Informes** y **Contabilidad**: KPIs de cartera con capital pendiente real (cuotas parciales incluidas).
- **Eliminar préstamo renovado**: mensaje claro y enlace al préstamo de renovación (sin error técnico de base de datos).

## Supabase

**No hay parches SQL nuevos** en 1.3.1. La app 1.3.0+ sigue requiriendo los parches documentados en [RELEASE_1.3.0.md](./RELEASE_1.3.0.md).

## Build iOS

```bash
cd /Users/henryrimarachincobos/faruck-movil
npx eas-cli build --platform ios --profile production --auto-submit
```

## App Store Connect — What's New (español)

- La lista de créditos y el inicio muestran el capital pendiente por cobrar, alineado con la ficha del cliente.
- Informes y contabilidad: cartera vigente basada en saldo real, no solo monto desembolsado.
- Al intentar eliminar un préstamo renovado, la app explica el vínculo y te lleva al préstamo actual.

**App Review:** reutilizar datos de 1.3.0 (Sign-in, contacto de revisión).

## Checklist manual

| # | Caso | OK |
|---|------|-----|
| 1 | Créditos: activo con pagos → saldo grande + Original | |
| 2 | Inicio Cartera activa ≈ chip Cartera en Créditos | |
| 3 | Informes / Contabilidad coherente con Inicio | |
| 4 | Renovado con hijo → Eliminar → alerta + ir al hijo | |
| 5 | Regresión: cobro, crédito mensual | |
