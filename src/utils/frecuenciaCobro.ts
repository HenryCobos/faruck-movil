export type FrecuenciaCobro = 'mensual' | 'quincenal' | 'semanal';

export const FRECUENCIA_COBRO_OPTIONS: { label: string; value: FrecuenciaCobro; icon: string }[] = [
  { label: 'Mensual', value: 'mensual', icon: '📅' },
  { label: 'Quincenal (cada 15 días)', value: 'quincenal', icon: '🗓️' },
  { label: 'Semanal', value: 'semanal', icon: '📆' },
];

/** Tasa mensual (fracción decimal) → tasa por periodo de cobro. */
export function tasaPorPeriodo(tasaMensual: number, f: FrecuenciaCobro): number {
  switch (f) {
    case 'semanal':
      return tasaMensual / 4;
    case 'quincenal':
      return tasaMensual / 2;
    default:
      return tasaMensual;
  }
}

export function avanzarFechaCobro(date: Date, f: FrecuenciaCobro): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  if (f === 'semanal') {
    d.setDate(d.getDate() + 7);
  } else if (f === 'quincenal') {
    d.setDate(d.getDate() + 15);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

/** Cuota `numeroCuota` (1-based) desde fecha base de desembolso. */
export function fechaVencimientoCuota(fechaBase: Date, numeroCuota: number, f: FrecuenciaCobro): Date {
  const base = new Date(fechaBase.getFullYear(), fechaBase.getMonth(), fechaBase.getDate(), 12, 0, 0);
  if (numeroCuota <= 0) return base;
  let d = base;
  for (let i = 0; i < numeroCuota; i++) {
    d = avanzarFechaCobro(d, f);
  }
  return d;
}

/** Cuota i desde desembolso con convención adelantada: cuota 1 en día 0, cuota i en + (i-1) periodos. */
export function fechaVencimientoCuotaAdelantada(fechaBase: Date, numeroCuota: number, f: FrecuenciaCobro): Date {
  if (numeroCuota <= 1) {
    return new Date(fechaBase.getFullYear(), fechaBase.getMonth(), fechaBase.getDate(), 12, 0, 0);
  }
  let d = new Date(fechaBase.getFullYear(), fechaBase.getMonth(), fechaBase.getDate(), 12, 0, 0);
  for (let i = 0; i < numeroCuota - 1; i++) {
    d = avanzarFechaCobro(d, f);
  }
  return d;
}

export function labelFrecuencia(f: FrecuenciaCobro): string {
  switch (f) {
    case 'semanal':
      return 'Semanal';
    case 'quincenal':
      return 'Quincenal';
    default:
      return 'Mensual';
  }
}

export function periodoSubtitulo(f: FrecuenciaCobro): string {
  switch (f) {
    case 'semanal':
      return 'cada semana';
    case 'quincenal':
      return 'cada quince días';
    default:
      return 'cada mes';
  }
}

/** Texto de plazo para listados: "12 cuotas · Quincenal" o "12 meses" si mensual. */
export function textoPlazoCuotas(plazoCuotas: number, f?: FrecuenciaCobro | null): string {
  const n = plazoCuotas;
  const cuotas = `${n} cuota${n !== 1 ? 's' : ''}`;
  if (!f || f === 'mensual') {
    return `${n} mes${n !== 1 ? 'es' : ''}`;
  }
  return `${cuotas} · ${labelFrecuencia(f)}`;
}
