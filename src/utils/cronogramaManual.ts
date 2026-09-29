import { fechaVencimientoCuota, type ResumenAmortizacion } from './amortizacion';
import type { FrecuenciaCobro } from './frecuenciaCobro';

export type CuotaManualFila = {
  numero: number;
  capital: number;
};

const TOLERANCIA = 0.01;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Plantilla inicial: cuotas iguales con ajuste en la última (como SQL tasa 0). */
export function buildCuotasIguales(principal: number, nCuotas: number): CuotaManualFila[] {
  if (nCuotas <= 0 || principal <= 0) return [];
  const base = round(principal / nCuotas);
  let saldo = principal;
  const filas: CuotaManualFila[] = [];
  for (let i = 1; i <= nCuotas; i++) {
    const capital = i === nCuotas ? round(saldo) : base;
    filas.push({ numero: i, capital });
    saldo = round(saldo - capital);
  }
  return filas;
}

export function sumaCapitalFilas(filas: CuotaManualFila[]): number {
  return round(filas.reduce((s, f) => s + (Number(f.capital) || 0), 0));
}

export function validarCronogramaManual(
  principal: number,
  filas: CuotaManualFila[],
  nCuotasEsperadas?: number,
): { ok: boolean; suma: number; diferencia: number; errores: string[] } {
  const errores: string[] = [];
  const n = nCuotasEsperadas ?? filas.length;

  if (n <= 0) errores.push('Indica el número de cuotas');
  if (filas.length !== n) errores.push(`Debes definir ${n} cuotas (tienes ${filas.length})`);

  filas.forEach((f, idx) => {
    const cap = Number(f.capital);
    if (!Number.isFinite(cap) || cap <= 0) {
      errores.push(`Cuota ${idx + 1}: monto inválido`);
    }
  });

  const suma = sumaCapitalFilas(filas);
  const diferencia = round(principal - suma);
  if (Math.abs(diferencia) > TOLERANCIA) {
    errores.push(`La suma (${suma.toLocaleString('es')}) no coincide con el monto (${principal.toLocaleString('es')})`);
  }

  return {
    ok: errores.length === 0,
    suma,
    diferencia,
    errores,
  };
}

/** Ajusta la última cuota para cuadrar con el principal. */
export function ajustarUltimaCuota(filas: CuotaManualFila[], principal: number): CuotaManualFila[] {
  if (filas.length === 0) return filas;
  const copia = filas.map(f => ({ ...f, capital: Number(f.capital) || 0 }));
  const sinUltima = copia.slice(0, -1);
  const sumaParcial = sumaCapitalFilas(sinUltima);
  const ultima = round(principal - sumaParcial);
  copia[copia.length - 1] = { ...copia[copia.length - 1], capital: Math.max(0, ultima) };
  return copia;
}

export function cronogramaManualToResumen(
  filas: CuotaManualFila[],
  principal: number,
  fechaInicio: Date,
  frecuencia: FrecuenciaCobro = 'mensual',
): ResumenAmortizacion {
  let saldo = principal;
  let totalCapital = 0;
  const cuotas = filas.map(f => {
    const capital = round(Number(f.capital));
    saldo = round(saldo - capital);
    totalCapital += capital;
    const fechaVencimiento = fechaVencimientoCuota(fechaInicio, f.numero, frecuencia);
    return {
      numero: f.numero,
      fechaVencimiento,
      capital,
      interes: 0,
      cuotaTotal: capital,
      saldo: Math.max(0, saldo),
    };
  });

  return {
    cuotas,
    totalCapital: round(totalCapital),
    totalIntereses: 0,
    totalPagar: round(totalCapital),
    primeraCuota: cuotas[0]?.cuotaTotal ?? 0,
    ultimaCuota: cuotas[cuotas.length - 1]?.cuotaTotal ?? 0,
  };
}

export function filasToCronogramaJson(filas: CuotaManualFila[]): CuotaManualFila[] {
  return filas.map(f => ({
    numero: f.numero,
    capital: round(Number(f.capital)),
  }));
}
