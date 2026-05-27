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
  estado: string;
  monto_principal: number;
  cliente_nombre: string;
  cliente_apellido: string;
  cliente_alias?: string;
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
  total: number;
  prestamo_cancelado: boolean;
  saldo_pendiente: number;
}

export interface PagoRegistrado {
  id: string;
  cuota_id: string;
  monto_pagado: number;
  fecha_pago: string;
  metodo_pago: string;
  numero_recibo: string;
  observaciones?: string;
  cajero_id: string;
  anulado: boolean;
  anulado_at?: string;
  anulado_por?: string;
  motivo_anulacion?: string;
}

export interface ResultadoAnulacion {
  ok: boolean;
  pago_id: string;
  recibo: string;
  cuota_nuevo_estado: string;
  prestamo_revertido: boolean;
  garantia_revertida: boolean;
}

export const cobrosService = {
  async getCuotasPendientes(): Promise<CuotaPendiente[]> {
    const { data, error } = await withTimeout(
      supabase
        .from('v_cuotas_pendientes')
        .select('*')
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
    metodoPago: 'efectivo' | 'transferencia' | 'cheque';
    observaciones?: string;
    /** Fecha a registrar en el recibo y en la base de datos. Por defecto: hoy. Formato YYYY-MM-DD */
    fechaPago?: string;
  }): Promise<ResultadoPago> {
    const { data, error } = await supabase.rpc('registrar_pago', {
      p_cuota_id:      params.cuotaId,
      p_cajero_id:     params.cajeroId,
      p_monto_pagado:  params.montoPagado,
      p_mora_cobrada:  0,
      p_metodo_pago:   params.metodoPago,
      p_observaciones: params.observaciones ?? null,
      p_fecha_pago:    params.fechaPago ?? null,
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

  async anularPago(params: {
    pagoId: string;
    adminId: string;
    motivo: string;
  }): Promise<ResultadoAnulacion> {
    const { data, error } = await supabase.rpc('revertir_pago', {
      p_pago_id:  params.pagoId,
      p_admin_id: params.adminId,
      p_motivo:   params.motivo,
    });
    if (error) throw error;
    return data as ResultadoAnulacion;
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

};
