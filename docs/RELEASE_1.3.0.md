# Release 1.3.0 (iOS)

**Producción anterior:** 1.2.5 (build 17)  
**Objetivo:** 1.3.0 (build 18 vía EAS `autoIncrement`)

## 1. Supabase (obligatorio antes de publicar la app)

Ejecutar en el SQL Editor **en este orden**:

1. [`supabase/patch_frecuencia_cobro.sql`](../supabase/patch_frecuencia_cobro.sql)
2. [`supabase/patch_cronograma_manual.sql`](../supabase/patch_cronograma_manual.sql)
3. [`supabase/patch_contratos_adjuntos.sql`](../supabase/patch_contratos_adjuntos.sql)

Verificar con [`supabase/verificar_release_1_3_0.sql`](../supabase/verificar_release_1_3_0.sql).

**No ejecutar:** `reset_prestamos_personales.sql`, scripts de borrado masivo.

**Recomendado (si no está en prod):** `patch_renovacion_cuotas_parciales.sql` (1.2.4).

## 2. Build iOS

**Build 1.3.0 (18)** — [EAS build logs](https://expo.dev/accounts/henryapper/projects/faruck-movil/builds/89df6862-f86e-4330-aa36-3e9f86294a8d) · [submission](https://expo.dev/accounts/henryapper/projects/faruck-movil/submissions/6e24094f-fa30-474e-9708-d19cf09ade01)

```bash
cd /Users/henryrimarachincobos/faruck-movil
npx eas-cli build --platform ios --profile production --auto-submit
```

## 3. App Store Connect — What's New (español)

- Cobros semanales, quincenales o mensuales al crear préstamos y ventas a crédito.
- Montos distintos por cuota en créditos sin interés.
- Hasta 5 documentos por contrato o acuerdo (ver, compartir y eliminar).

## 4. Checklist manual

| # | Caso | OK |
|---|------|-----|
| 1 | Préstamo activo antiguo: cronograma sin cambios | |
| 2 | Venta a crédito semanal, 5 cuotas | |
| 3 | Cuotas personalizadas 0% (ej. 5×1M + 1×1.5M) | |
| 4 | Hasta 5 PDFs en acuerdo; eliminar uno | |
| 5 | Renovación con cuota parcial | |
