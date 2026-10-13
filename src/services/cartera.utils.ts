import { supabase } from '../lib/supabase';
import {
  sumaCapitalPendienteActivos,
  sumaMontoPrincipalActivos,
  type PrestamoConEstadoSaldo,
} from '../utils/amortizacion';

/** Select mínimo para capital pendiente (cuotas parciales con pagos). */
export const PRESTAMOS_ACTIVOS_CARTERA_SELECT = `
  monto_principal,
  estado,
  cuotas(estado, capital, interes, pagos(monto_pagado, mora_cobrada, anulado))
`;

export type PrestamosActivosCarteraFetch = {
  data: PrestamoConEstadoSaldo[];
  usedFallback: boolean;
};

export async function fetchPrestamosActivosParaCartera(): Promise<PrestamosActivosCarteraFetch> {
  const withCuotas = await supabase
    .from('prestamos')
    .select(PRESTAMOS_ACTIVOS_CARTERA_SELECT)
    .eq('estado', 'activo');

  if (!withCuotas.error) {
    return { data: (withCuotas.data ?? []) as PrestamoConEstadoSaldo[], usedFallback: false };
  }

  const fallback = await supabase
    .from('prestamos')
    .select('monto_principal, estado')
    .eq('estado', 'activo');

  if (fallback.error) throw fallback.error;

  console.warn('[cartera] consulta con cuotas falló; usando monto_principal:', withCuotas.error.message);
  return { data: (fallback.data ?? []) as PrestamoConEstadoSaldo[], usedFallback: true };
}

/** Capital pendiente de préstamos activos (KPI cartera vigente). */
export function capitalPendienteDesdeFetch(fetch: PrestamosActivosCarteraFetch): number {
  return sumaCapitalPendienteActivos(fetch.data);
}

/** Desembolsado en activos (reportes / rentabilidad). */
export function montoDesembolsadoActivos(
  prestamos: Array<{ monto_principal?: number | null; estado?: string }>,
): number {
  return sumaMontoPrincipalActivos(prestamos);
}
