import { supabase, withTimeout } from '../lib/supabase';
import { auditoriaService } from './auditoria.service';

export interface CuotaPendiente {
  id: string;
  prestamo_id: string;
  numero_cuota: number;
  fecha_vencimiento: string;
  capital: number;
  interes: number;
  monto_total: number;
  mora_acumulada: number;
  mora_calculada: number;
  dias_mora: number;
  estado: string;
  monto_principal: number;
  cliente_nombre: string;
  cliente_apellido: string;
  cliente_telefono: string;
  cliente_documento: string;
  garantia_tipo: string;
  garantia_descripcion: string;
}

export interface ResultadoPago {
  pago_id: string;
  recibo_num: string;
  capital: number;
  interes: number;
  mora: number;
  total: number;
  prestamo_cancelado: boolean;
}

export interface PagoRegistrado {
  id: string;
  cuota_id: string;
  monto_pagado: number;
  mora_cobrada: number;
  fecha_pago: string;
  metodo_pago: string;
  numero_recibo: string;
  observaciones?: string;
  cajero_id: string;
}

export const cobrosService = {
  async getCuotasPendientes(): Promise<CuotaPendiente[]> {
    const { data, error } = await withTimeout(
      supabase
        .from('v_cuotas_pendientes')
        .select('*')
        .order('dias_mora', { ascending: false })
        .order('fecha_vencimiento', { ascending: true }),
    );
    if (error) throw error;
    return (data ?? []) as CuotaPendiente[];
  },

  async getCuotaById(id: string): Promise<CuotaPendiente> {
    const { data, error } = await supabase
      .from('v_cuotas_pendientes')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as CuotaPendiente;
  },

  async registrarPago(params: {
    cuotaId: string;
    cajeroId: string;
    montoPagado: number;
    moraCobrada: number;
    metodoPago: 'efectivo' | 'transferencia' | 'cheque';
    observaciones?: string;
  }): Promise<ResultadoPago> {
    const { data, error } = await supabase.rpc('registrar_pago', {
      p_cuota_id:      params.cuotaId,
      p_cajero_id:     params.cajeroId,
      p_monto_pagado:  params.montoPagado,
      p_mora_cobrada:  params.moraCobrada,
      p_metodo_pago:   params.metodoPago,
      p_observaciones: params.observaciones ?? null,
    });
    if (error) throw error;
    const resultado = data as ResultadoPago;

    auditoriaService.registrar({
      tabla: 'pagos',
      accion: 'pago',
      registroId: resultado.pago_id,
      descripcion: `Pago registrado · Recibo ${resultado.recibo_num} · $${resultado.total.toLocaleString('es')} (${params.metodoPago})${resultado.prestamo_cancelado ? ' — préstamo cancelado ✅' : ''}`,
      datos: {
        recibo: resultado.recibo_num,
        capital: resultado.capital,
        interes: resultado.interes,
        mora: resultado.mora,
        total: resultado.total,
        metodo: params.metodoPago,
      },
    }).catch(() => {});

    return resultado;
  },

  async getPagosByPrestamo(prestamoId: string): Promise<PagoRegistrado[]> {
    const { data, error } = await supabase
      .from('pagos')
      .select(`*, cuotas!inner(prestamo_id, numero_cuota)`)
      .eq('cuotas.prestamo_id', prestamoId)
      .order('fecha_pago', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PagoRegistrado[];
  },

  async getPagoById(id: string): Promise<PagoRegistrado> {
    const { data, error } = await supabase
      .from('pagos')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as PagoRegistrado;
  },

  calcularMora(monto_total: number, fecha_vencimiento: string): number {
    const hoy = new Date();
    const venc = new Date(fecha_vencimiento);
    if (hoy <= venc) return 0;
    const dias = Math.floor((hoy.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
    return Math.round(monto_total * 0.001 * dias * 100) / 100;
  },
};
