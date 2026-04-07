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

export function calcularAmortizacion(
  tipo: 'francesa' | 'alemana',
  principal: number,
  tasaMensual: number,
  plazoMeses: number,
  fechaInicio?: Date
): ResumenAmortizacion {
  return tipo === 'francesa'
    ? calcularAmortizacionFrancesa(principal, tasaMensual, plazoMeses, fechaInicio)
    : calcularAmortizacionAlemana(principal, tasaMensual, plazoMeses, fechaInicio);
}

export function formatCurrency(value: number): string {
  return '$' + value.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
