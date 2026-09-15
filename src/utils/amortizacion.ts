export interface CuotaCalculada {
  numero: number;
  fechaVencimiento: Date;
  capital: number;
  interes: number;
  cuotaTotal: number;
  saldo: number;
}

export interface ResumenAmortizacion {
  cuotas: CuotaCalculada[];
  totalCapital: number;
  totalIntereses: number;
  totalPagar: number;
  primeraCuota: number;
  ultimaCuota: number;
}

export function calcularAmortizacionFrancesa(
  principal: number,
  tasaMensual: number,
  plazoMeses: number,
  fechaInicio: Date = new Date()
): ResumenAmortizacion {
  if (plazoMeses <= 0) {
    return { cuotas: [], totalCapital: principal, totalIntereses: 0, totalPagar: principal, primeraCuota: 0, ultimaCuota: 0 };
  }

  const r = tasaMensual;
  // When r=0 distribute capital evenly (no interest)
  const cuotaFija = r === 0
    ? principal / plazoMeses
    : principal * (r * Math.pow(1 + r, plazoMeses)) / (Math.pow(1 + r, plazoMeses) - 1);
  const cuotas: CuotaCalculada[] = [];
  let saldo = principal;
  let totalIntereses = 0;

  for (let i = 1; i <= plazoMeses; i++) {
    const interes = round(saldo * r);
    let capital = round(cuotaFija - interes);
    if (i === plazoMeses) capital = round(saldo);
    saldo = round(saldo - capital);

    const fechaV = new Date(fechaInicio);
    fechaV.setMonth(fechaV.getMonth() + i);
    totalIntereses += interes;

    cuotas.push({
      numero: i,
      fechaVencimiento: fechaV,
      capital,
      interes,
      cuotaTotal: capital + interes,
      saldo: Math.max(0, saldo),
    });
  }

  return {
    cuotas,
    totalCapital: principal,
    totalIntereses: round(totalIntereses),
    totalPagar: round(principal + totalIntereses),
    primeraCuota: cuotas[0]?.cuotaTotal ?? 0,
    ultimaCuota: cuotas[cuotas.length - 1]?.cuotaTotal ?? 0,
  };
}

export function calcularAmortizacionAlemana(
  principal: number,
  tasaMensual: number,
  plazoMeses: number,
  fechaInicio: Date = new Date()
): ResumenAmortizacion {
  if (plazoMeses <= 0) {
    return { cuotas: [], totalCapital: principal, totalIntereses: 0, totalPagar: principal, primeraCuota: 0, ultimaCuota: 0 };
  }

  const capitalFijo = round(principal / plazoMeses);
  const cuotas: CuotaCalculada[] = [];
  let saldo = principal;
  let totalIntereses = 0;

  for (let i = 1; i <= plazoMeses; i++) {
    const interes = round(saldo * tasaMensual);
    const capital = i === plazoMeses ? round(saldo) : capitalFijo;
    saldo = round(saldo - capital);

    const fechaV = new Date(fechaInicio);
    fechaV.setMonth(fechaV.getMonth() + i);
    totalIntereses += interes;

    cuotas.push({
      numero: i,
      fechaVencimiento: fechaV,
      capital,
      interes,
      cuotaTotal: capital + interes,
      saldo: Math.max(0, saldo),
    });
  }

  return {
    cuotas,
    totalCapital: principal,
    totalIntereses: round(totalIntereses),
    totalPagar: round(principal + totalIntereses),
    primeraCuota: cuotas[0]?.cuotaTotal ?? 0,
    ultimaCuota: cuotas[cuotas.length - 1]?.cuotaTotal ?? 0,
  };
}

/**
 * Solo intereses mensuales + capital completo en la última cuota (préstamo globo).
 * Cuotas 1..N-1: capital=0, solo interés.
 * Cuota N: capital=principal + interés del último mes.
 */
export function calcularAmortizacionSoloInteres(
  principal: number,
  tasaMensual: number,
  plazoMeses: number,
  fechaInicio: Date = new Date()
): ResumenAmortizacion {
  if (plazoMeses <= 0) {
    return { cuotas: [], totalCapital: principal, totalIntereses: 0, totalPagar: principal, primeraCuota: 0, ultimaCuota: 0 };
  }

  const cuotas: CuotaCalculada[] = [];
  const interesMensual = round(principal * tasaMensual);
  let totalIntereses = 0;

  for (let i = 1; i <= plazoMeses; i++) {
    const esUltima = i === plazoMeses;
    const capital  = esUltima ? principal : 0;
    const interes  = interesMensual;
    const fechaV   = new Date(fechaInicio);
    fechaV.setMonth(fechaV.getMonth() + i);
    totalIntereses += interes;

    cuotas.push({
      numero: i,
      fechaVencimiento: fechaV,
      capital,
      interes,
      cuotaTotal: capital + interes,
      saldo: esUltima ? 0 : principal,
    });
  }

  return {
    cuotas,
    totalCapital: principal,
    totalIntereses: round(totalIntereses),
    totalPagar: round(principal + totalIntereses),
    primeraCuota: cuotas[0]?.cuotaTotal ?? 0,
    ultimaCuota: cuotas[cuotas.length - 1]?.cuotaTotal ?? 0,
  };
}

/**
 * Solo intereses adelantados + capital al final (préstamo globo con cobro anticipado).
 * La primera cuota de interés vence el mismo día del desembolso (cobro adelantado).
 * Las cuotas 2..N vencen en meses 1..N-1 (solo interés).
 * Cuota N+1 vence en mes N: capital completo, sin interés.
 * Total de cuotas = plazoMeses + 1.
 */
export function calcularAmortizacionSoloInteresAdelantado(
  principal: number,
  tasaMensual: number,
  plazoMeses: number,
  fechaInicio: Date = new Date()
): ResumenAmortizacion {
  if (plazoMeses <= 0) {
    return { cuotas: [], totalCapital: principal, totalIntereses: 0, totalPagar: principal, primeraCuota: 0, ultimaCuota: 0 };
  }

  const base = inicioDiaLocal(fechaInicio);
  const interesMensual = round(principal * tasaMensual);
  const cuotas: CuotaCalculada[] = [];
  let totalIntereses = 0;

  // N cuotas de interés: cuota 1 en día 0, cuotas 2..N en meses 1..N-1
  for (let i = 1; i <= plazoMeses; i++) {
    const fechaV = new Date(base);
    fechaV.setMonth(fechaV.getMonth() + (i - 1));
    totalIntereses += interesMensual;
    cuotas.push({
      numero: i,
      fechaVencimiento: fechaV,
      capital: 0,
      interes: interesMensual,
      cuotaTotal: interesMensual,
      saldo: principal,
    });
  }

  // Cuota N+1: capital completo, sin interés, en mes N
  const fechaCapital = new Date(base);
  fechaCapital.setMonth(fechaCapital.getMonth() + plazoMeses);
  cuotas.push({
    numero: plazoMeses + 1,
    fechaVencimiento: fechaCapital,
    capital: principal,
    interes: 0,
    cuotaTotal: principal,
    saldo: 0,
  });

  return {
    cuotas,
    totalCapital: principal,
    totalIntereses: round(totalIntereses),
    totalPagar: round(principal + totalIntereses),
    primeraCuota: cuotas[0].cuotaTotal,
    ultimaCuota: cuotas[cuotas.length - 1].cuotaTotal,
  };
}

/**
 * Interés anticipado + capital al final:
 * el interés total del período vence el mismo día del desembolso (entrega del crédito),
 * no al cierre del “primer mes” como una cuota francesa.
 * - Cuota 1: fecha = día de desembolso; interés = principal × tasa × plazo; capital = 0.
 * - Cuota 2: fecha = desembolso + plazo meses; capital = principal; interés = 0.
 */
export function calcularAmortizacionAnticipado(
  principal: number,
  tasaMensual: number,
  plazoMeses: number,
  fechaInicio: Date = new Date(),
  plazoDias?: number
): ResumenAmortizacion {
  const usarDias = plazoDias !== undefined && plazoDias > 0;

  if (usarDias ? plazoDias! <= 0 : plazoMeses <= 0) {
    return { cuotas: [], totalCapital: principal, totalIntereses: 0, totalPagar: principal, primeraCuota: 0, ultimaCuota: 0 };
  }

  const totalIntereses = usarDias
    ? round(principal * tasaMensual * plazoDias! / 30)
    : round(principal * tasaMensual * plazoMeses);

  const base = inicioDiaLocal(fechaInicio);
  const fechaInteres = new Date(base);
  const fechaCapital = new Date(base);
  if (usarDias) {
    fechaCapital.setDate(fechaCapital.getDate() + plazoDias!);
  } else {
    fechaCapital.setMonth(fechaCapital.getMonth() + plazoMeses);
  }

  const cuotas: CuotaCalculada[] = [
    {
      numero: 1,
      fechaVencimiento: fechaInteres,
      capital: 0,
      interes: totalIntereses,
      cuotaTotal: totalIntereses,
      saldo: principal,
    },
    {
      numero: 2,
      fechaVencimiento: fechaCapital,
      capital: principal,
      interes: 0,
      cuotaTotal: principal,
      saldo: 0,
    },
  ];

  return {
    cuotas,
    totalCapital: principal,
    totalIntereses,
    totalPagar: round(principal + totalIntereses),
    primeraCuota: cuotas[0].cuotaTotal,
    ultimaCuota: cuotas[1].cuotaTotal,
  };
}

export function calcularAmortizacion(
  tipo: 'francesa' | 'alemana' | 'solo_interes' | 'anticipado' | 'solo_interes_adelantado',
  principal: number,
  tasaMensual: number,
  plazoMeses: number,
  fechaInicio?: Date,
  plazoDias?: number
): ResumenAmortizacion {
  switch (tipo) {
    case 'francesa':                return calcularAmortizacionFrancesa(principal, tasaMensual, plazoMeses, fechaInicio);
    case 'alemana':                 return calcularAmortizacionAlemana(principal, tasaMensual, plazoMeses, fechaInicio);
    case 'solo_interes':            return calcularAmortizacionSoloInteres(principal, tasaMensual, plazoMeses, fechaInicio);
    case 'anticipado':              return calcularAmortizacionAnticipado(principal, tasaMensual, plazoMeses, fechaInicio, plazoDias);
    case 'solo_interes_adelantado': return calcularAmortizacionSoloInteresAdelantado(principal, tasaMensual, plazoMeses, fechaInicio);
  }
}

export function formatCurrency(value: number): string {
  const decimals = value % 1 !== 0 ? 2 : 0;
  return '$' + value.toLocaleString('es', { minimumFractionDigits: decimals, maximumFractionDigits: 2 });
}

/**
 * Parsea un string "YYYY-MM-DD" (fecha de BD) como fecha LOCAL al mediodía,
 * evitando el desfase UTC→local que produce new Date("YYYY-MM-DD") en iOS/JS
 * (ese constructor interpreta la fecha como medianoche UTC, lo que en zonas
 * UTC-N resulta en el día anterior).
 */
export function parseFechaLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Formatea una Date a "YYYY-MM-DD" usando la hora local (no UTC),
 * evitando que toISOString() convierta mediodía local a fecha UTC anterior.
 */
export function formatFechaISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface SaldoRestanteCuota {
  saldoInteres: number;
  saldoCapital: number;
  saldoTotal: number;
  pagadoTotal: number;
}

/** Simula pagos vigentes con asignación interés-primero (igual que el RPC). */
export function calcularSaldoRestanteCuota(
  capital: number,
  interes: number,
  pagos: { monto_pagado: number; mora_cobrada?: number }[],
): SaldoRestanteCuota {
  let saldoInt = interes;
  let saldoCap = capital;
  let pagadoTotal = 0;

  for (const pago of pagos) {
    pagadoTotal += pago.monto_pagado;
    const montoNeto = Math.max(pago.monto_pagado - (pago.mora_cobrada ?? 0), 0);
    const aInteres = Math.min(montoNeto, saldoInt);
    saldoInt = Math.max(saldoInt - aInteres, 0);
    const aCapital = Math.min(montoNeto - aInteres, saldoCap);
    saldoCap = Math.max(saldoCap - aCapital, 0);
  }

  return {
    saldoInteres: round(saldoInt),
    saldoCapital: round(saldoCap),
    saldoTotal: round(saldoInt + saldoCap),
    pagadoTotal: round(pagadoTotal),
  };
}

export type CuotaSaldoInput = {
  estado: string;
  capital: number;
  interes: number;
  pagos?: Array<{ monto_pagado: number; mora_cobrada?: number; anulado?: boolean }>;
};

/** Capital pendiente del préstamo (cuotas no pagadas; parcial con asignación interés-primero). */
export function calcularSaldoCapitalPendientePrestamo(cuotas: CuotaSaldoInput[]): number {
  return cuotas
    .filter(c => c.estado !== 'pagada')
    .reduce((s, c) => {
      if (c.estado === 'parcial') {
        const pagos = (c.pagos ?? [])
          .filter(p => !p.anulado)
          .map(p => ({
            monto_pagado: Number(p.monto_pagado),
            mora_cobrada: Number(p.mora_cobrada ?? 0),
          }));
        return s + calcularSaldoRestanteCuota(Number(c.capital), Number(c.interes), pagos).saldoCapital;
      }
      return s + Number(c.capital);
    }, 0);
}

/** Asignación interés-primero de un pago sobre saldos restantes. */
export function calcularAsignacionPago(
  capital: number,
  interes: number,
  pagosPrevios: { monto_pagado: number; mora_cobrada?: number }[],
  montoPago: number,
  moraCobrada = 0,
): { capitalPart: number; interesPart: number } {
  const saldo = calcularSaldoRestanteCuota(capital, interes, pagosPrevios);
  const montoNeto = Math.max(montoPago - moraCobrada, 0);
  const interesPart = Math.min(montoNeto, saldo.saldoInteres);
  const capitalPart = Math.min(montoNeto - interesPart, saldo.saldoCapital);
  return { capitalPart: round(capitalPart), interesPart: round(interesPart) };
}

/** Fecha calendario local (evita desfases por ISO UTC en strings YYYY-MM-DD). */
function inicioDiaLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
