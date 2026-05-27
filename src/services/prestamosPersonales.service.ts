import { supabase, withTimeout } from '../lib/supabase';
import { calcularAmortizacion } from '@/utils/amortizacion';
import type {
  PrestamoPersonal,
  PagoPrestamoPersnoal,
  CuotaPrestamoPersonal,
  EstadoPrestamoPersonal,
  MetodoPagoPersonal,
  TipoDeudaPersonal,
  TipoAmortizacionPersonal,
} from '@/types';

// ─── Helpers de fecha ─────────────────────────────────────────

function fechaToIso(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

// ─── Helpers de cálculo — tipo SIMPLE ────────────────────────

/**
 * Monto total a pagar = capital + interés fijo.
 * Aplica solo para tipo_deuda = 'simple'.
 */
export function calcularMontoTotal(prestamo: PrestamoPersonal): number {
  if (prestamo.tipo_deuda === 'amortizable') {
    return calcularMontoTotalAmortizable(prestamo);
  }
  return prestamo.monto_original * (1 + prestamo.tasa_interes / 100);
}

export function calcularInteresTotal(prestamo: PrestamoPersonal): number {
  if (prestamo.tipo_deuda === 'amortizable') {
    return calcularInteresTotalAmortizable(prestamo);
  }
  return prestamo.monto_original * (prestamo.tasa_interes / 100);
}

export function calcularTotalPagado(prestamo: PrestamoPersonal): number {
  return (prestamo.pagos_prestamo_personal ?? [])
    .reduce((acc, p) => acc + p.monto_pagado, 0);
}

export function calcularSaldo(prestamo: PrestamoPersonal): number {
  const totalAPagar = calcularMontoTotal(prestamo);
  const totalPagado = calcularTotalPagado(prestamo);
  return Math.max(0, totalAPagar - totalPagado);
}

export function calcularPorcentajeAvance(prestamo: PrestamoPersonal): number {
  const total = calcularMontoTotal(prestamo);
  if (total === 0) return 0;
  return Math.min(100, (calcularTotalPagado(prestamo) / total) * 100);
}

// ─── Helpers de cálculo — tipo AMORTIZABLE ───────────────────

function calcularMontoTotalAmortizable(prestamo: PrestamoPersonal): number {
  const cuotas = prestamo.cuotas_prestamo_personal ?? [];
  if (cuotas.length > 0) {
    return cuotas.reduce((s, c) => s + c.monto_total, 0);
  }
  // Fallback: solo capital
  return prestamo.monto_original;
}

function calcularInteresTotalAmortizable(prestamo: PrestamoPersonal): number {
  const cuotas = prestamo.cuotas_prestamo_personal ?? [];
  return cuotas.reduce((s, c) => s + c.interes, 0);
}

/** Saldo pendiente de cuotas (solo amortizable) */
export function calcularSaldoCuotas(prestamo: PrestamoPersonal): number {
  return (prestamo.cuotas_prestamo_personal ?? [])
    .filter(c => c.estado !== 'pagada')
    .reduce((s, c) => s + (c.monto_total - c.monto_pagado), 0);
}

/** Cuotas vencidas sin pagar */
export function cuotasVencidas(prestamo: PrestamoPersonal): CuotaPrestamoPersonal[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return (prestamo.cuotas_prestamo_personal ?? []).filter(c => {
    if (c.estado === 'pagada') return false;
    const venc = new Date(c.fecha_vencimiento + 'T12:00:00');
    return venc < hoy;
  });
}

/** Formatea una fecha ISO sin efectos de zona horaria */
export function formatFechaPrestamoPersonal(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ─── Servicio ─────────────────────────────────────────────────

export const prestamosPersonalesService = {

  async getAll(): Promise<PrestamoPersonal[]> {
    const { data, error } = await withTimeout(
      supabase
        .from('prestamos_personales')
        .select('*, pagos_prestamo_personal(*), cuotas_prestamo_personal(*)')
        .order('created_at', { ascending: false }),
    );
    if (error) throw error;
    return (data ?? []) as PrestamoPersonal[];
  },

  async getById(id: string): Promise<PrestamoPersonal> {
    const { data, error } = await supabase
      .from('prestamos_personales')
      .select('*, pagos_prestamo_personal(*), cuotas_prestamo_personal(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    const p = data as PrestamoPersonal;
    // Ordenar cuotas por número
    if (p.cuotas_prestamo_personal) {
      p.cuotas_prestamo_personal.sort((a, b) => a.numero_cuota - b.numero_cuota);
    }
    return p;
  },

  // ─── Crear — SIMPLE ────────────────────────────────────────

  async crear(params: {
    tipo_deuda:      TipoDeudaPersonal;
    acreedor_nombre: string;
    monto_original:  number;
    fecha_inicio:    string;
    descripcion?:    string;
    notas?:          string;
    // Simple
    tasa_interes?:   number;
    // Amortizable
    tasa_mensual?:         number;
    plazo_meses?:          number;
    plazo_dias?:           number;
    tipo_amortizacion?:    TipoAmortizacionPersonal;
  }): Promise<PrestamoPersonal> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    const { data, error } = await supabase
      .from('prestamos_personales')
      .insert({
        user_id:           user.id,
        acreedor_nombre:   params.acreedor_nombre,
        monto_original:    params.monto_original,
        tasa_interes:      params.tasa_interes ?? 0,
        tipo_deuda:        params.tipo_deuda,
        tasa_mensual:      params.tasa_mensual ?? null,
        plazo_meses:       params.plazo_meses ?? null,
        plazo_dias:        params.plazo_dias ?? null,
        tipo_amortizacion: params.tipo_amortizacion ?? null,
        fecha_inicio:      params.fecha_inicio,
        descripcion:       params.descripcion ?? null,
        notas:             params.notas ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    const prestamo = data as PrestamoPersonal;

    // Si es amortizable, generar y guardar las cuotas
    if (params.tipo_deuda === 'amortizable' && params.tipo_amortizacion && params.tasa_mensual !== undefined && params.plazo_meses) {
      await this._generarCuotas(prestamo.id, {
        monto:             params.monto_original,
        tasaMensual:       params.tasa_mensual / 100,
        plazoMeses:        params.plazo_meses,
        plazoDias:         params.plazo_dias,
        tipoAmortizacion:  params.tipo_amortizacion,
        fechaInicio:       new Date(params.fecha_inicio + 'T12:00:00'),
      });
    }

    return prestamo;
  },

  // ─── Generar cuotas (interno) ──────────────────────────────

  async _generarCuotas(prestamoId: string, opts: {
    monto:            number;
    tasaMensual:      number;
    plazoMeses:       number;
    plazoDias?:       number;
    tipoAmortizacion: TipoAmortizacionPersonal;
    fechaInicio:      Date;
  }) {
    const resumen = calcularAmortizacion(
      opts.tipoAmortizacion,
      opts.monto,
      opts.tasaMensual,
      opts.plazoMeses,
      opts.fechaInicio,
      opts.plazoDias,
    );

    const rows = resumen.cuotas.map(c => ({
      prestamo_id:       prestamoId,
      numero_cuota:      c.numero,
      fecha_vencimiento: fechaToIso(c.fechaVencimiento),
      capital:           c.capital,
      interes:           c.interes,
      monto_total:       c.cuotaTotal,
      monto_pagado:      0,
      estado:            'pendiente',
    }));

    const { error } = await supabase
      .from('cuotas_prestamo_personal')
      .insert(rows);
    if (error) throw error;
  },

  // ─── Estado ────────────────────────────────────────────────

  async actualizarEstado(id: string, estado: EstadoPrestamoPersonal): Promise<void> {
    const { error } = await supabase
      .from('prestamos_personales')
      .update({ estado })
      .eq('id', id);
    if (error) throw error;
  },

  // ─── Eliminar ──────────────────────────────────────────────

  async eliminar(id: string): Promise<void> {
    const { error } = await supabase
      .from('prestamos_personales')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ─── Pago libre (tipo SIMPLE) ──────────────────────────────

  async registrarPago(params: {
    prestamo_id:  string;
    monto_pagado: number;
    fecha_pago:   string;
    metodo?:      MetodoPagoPersonal;
    notas?:       string;
  }): Promise<PagoPrestamoPersnoal> {
    const { data, error } = await supabase
      .from('pagos_prestamo_personal')
      .insert({
        prestamo_id:  params.prestamo_id,
        monto_pagado: params.monto_pagado,
        capital:      params.monto_pagado,
        interes:      0,
        fecha_pago:   params.fecha_pago,
        metodo:       params.metodo ?? null,
        notas:        params.notas ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as PagoPrestamoPersnoal;
  },

  // ─── Pago de cuota (tipo AMORTIZABLE) ─────────────────────

  async pagarCuota(params: {
    cuota:        CuotaPrestamoPersonal;
    monto_pagado: number;
    fecha_pago:   string;
    metodo?:      MetodoPagoPersonal;
    notas?:       string;
  }): Promise<void> {
    const { cuota, monto_pagado, fecha_pago, metodo, notas } = params;
    const nuevoMontoPagado = cuota.monto_pagado + monto_pagado;
    const esCompleto = nuevoMontoPagado >= cuota.monto_total - 0.01;
    const nuevoEstado = esCompleto ? 'pagada' : 'parcial';

    // 1. Registrar pago vinculado a la cuota
    const { error: errPago } = await supabase
      .from('pagos_prestamo_personal')
      .insert({
        prestamo_id:  cuota.prestamo_id,
        cuota_id:     cuota.id,
        monto_pagado,
        capital:      cuota.capital > 0 ? Math.min(monto_pagado, cuota.capital) : monto_pagado,
        interes:      cuota.interes > 0 ? Math.max(0, monto_pagado - cuota.capital) : 0,
        fecha_pago,
        metodo:       metodo ?? null,
        notas:        notas ?? null,
      });
    if (errPago) throw errPago;

    // 2. Actualizar estado de la cuota
    const { error: errCuota } = await supabase
      .from('cuotas_prestamo_personal')
      .update({
        monto_pagado: nuevoMontoPagado,
        estado:       nuevoEstado,
        fecha_pago:   esCompleto ? fecha_pago : null,
      })
      .eq('id', cuota.id);
    if (errCuota) throw errCuota;
  },

  // ─── Revertir pago de cuota ────────────────────────────────

  async revertirPagoCuota(pago: PagoPrestamoPersnoal): Promise<void> {
    if (!pago.cuota_id) {
      await this.eliminarPago(pago.id);
      return;
    }

    // Obtener la cuota actual
    const { data: cuotaData, error: errGet } = await supabase
      .from('cuotas_prestamo_personal')
      .select('*')
      .eq('id', pago.cuota_id)
      .single();
    if (errGet) throw errGet;

    const cuota = cuotaData as CuotaPrestamoPersonal;
    const nuevoMonto = Math.max(0, cuota.monto_pagado - pago.monto_pagado);
    const nuevoEstado = nuevoMonto <= 0 ? 'pendiente' : 'parcial';

    // 1. Eliminar el pago
    const { error: errPago } = await supabase
      .from('pagos_prestamo_personal')
      .delete()
      .eq('id', pago.id);
    if (errPago) throw errPago;

    // 2. Revertir monto en cuota
    const { error: errCuota } = await supabase
      .from('cuotas_prestamo_personal')
      .update({
        monto_pagado: nuevoMonto,
        estado:       nuevoEstado,
        fecha_pago:   nuevoEstado === 'pendiente' ? null : cuota.fecha_pago,
      })
      .eq('id', cuota.id);
    if (errCuota) throw errCuota;
  },

  // ─── Actualizar estado de cuotas vencidas ─────────────────

  async actualizarCuotasVencidas(prestamoId: string): Promise<void> {
    const hoy = new Date().toISOString().split('T')[0];
    const { error } = await supabase
      .from('cuotas_prestamo_personal')
      .update({ estado: 'vencida' })
      .eq('prestamo_id', prestamoId)
      .eq('estado', 'pendiente')
      .lt('fecha_vencimiento', hoy);
    if (error) throw error;
  },

  async eliminarPago(pagoId: string): Promise<void> {
    const { error } = await supabase
      .from('pagos_prestamo_personal')
      .delete()
      .eq('id', pagoId);
    if (error) throw error;
  },
};
