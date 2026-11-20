import { supabase, withTimeout } from '../lib/supabase';
import { auditoriaService } from './auditoria.service';
import type { CategoriaProducto, TipoPrestamo } from '../types';

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
  /** Enriquecido en getCuotaById desde prestamos (la vista puede no exponerlo). */
  tipo_prestamo?: TipoPrestamo;
  categoria_producto?: CategoriaProducto;
  categoria_producto_otro?: string;
}

export interface ResultadoPago {
  pago_id: string;
  recibo_num: string;
  capital: number;
  interes: number;
  total: number;
  prestamo_cancelado: boolean;
  saldo_pendiente: number;
  /** Capital pendiente tras el pago (cuotas no pagadas) */
  saldo_capital_pendiente?: number;
  solo_interes?: boolean;
  cuota_estado?: string;
  saldo_cuota_restante?: number;
}

export interface PagoRegistrado {
  id: string;
  cuota_id: string;
  monto_pagado: number;
  mora_cobrada?: number;
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

/**
 * Misma regla que el chip "Vencidas" en Cobros: cuotas de préstamos activos con
 * fecha_vencimiento estrictamente anterior a `hoy` y aún pendientes de cobro.
 */
async function countCuotasVencidasCalendario(hoy: string): Promise<number> {
  const { count, error } = await withTimeout(
    supabase
      .from('cuotas')
      .select('id, prestamos!inner(estado)', { count: 'exact', head: true })
      .eq('prestamos.estado', 'activo')
      .in('estado', ['pendiente', 'vencida', 'parcial'])
      .lt('fecha_vencimiento', hoy),
  );
  if (error) {
    console.warn('[cobros] countCuotasVencidasCalendario:', error.message);
    return 0;
  }
  return count ?? 0;
}

export const cobrosService = {
  countCuotasVencidasCalendario,

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
    const cuota = data as CuotaPendiente;
    const prestamoId = cuota.prestamo_id;
    if (!prestamoId) return cuota;
    const { data: prest, error: prestErr } = await supabase
      .from('prestamos')
      .select('tipo_prestamo, categoria_producto, categoria_producto_otro')
      .eq('id', prestamoId)
      .single();
    if (prestErr) {
      console.warn('[cobros] getCuotaById prestamo enrich:', prestErr.message);
      return cuota;
    }
    const row = prest as {
      tipo_prestamo?: string;
      categoria_producto?: string;
      categoria_producto_otro?: string;
    } | null;
    const tp = row?.tipo_prestamo;
    const extra: Pick<CuotaPendiente, 'tipo_prestamo' | 'categoria_producto' | 'categoria_producto_otro'> = {};
    if (tp === 'credito_producto' || tp === 'prestamo') {
      extra.tipo_prestamo = tp;
    }
    if (row?.categoria_producto) {
      extra.categoria_producto = row.categoria_producto as CategoriaProducto;
      extra.categoria_producto_otro = row.categoria_producto_otro ?? undefined;
    }
    return Object.keys(extra).length > 0 ? { ...cuota, ...extra } : cuota;
  },

  async getPagosByCuota(cuotaId: string): Promise<PagoRegistrado[]> {
    const { data, error } = await supabase
      .from('pagos')
      .select('*')
      .eq('cuota_id', cuotaId)
      .eq('anulado', false)
      .order('fecha_pago', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PagoRegistrado[];
  },

  async getPagosByCuotaIds(cuotaIds: string[]): Promise<PagoRegistrado[]> {
    if (cuotaIds.length === 0) return [];
    const BATCH = 80;
    const resultados: PagoRegistrado[] = [];
    for (let i = 0; i < cuotaIds.length; i += BATCH) {
      const lote = cuotaIds.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from('pagos')
        .select('*')
        .in('cuota_id', lote)
        .eq('anulado', false)
        .order('fecha_pago', { ascending: true });
      if (error) throw error;
      resultados.push(...((data ?? []) as PagoRegistrado[]));
    }
    return resultados;
  },

  async registrarPago(params: {
    cuotaId: string;
    cajeroId: string;
    montoPagado: number;
    metodoPago: 'efectivo' | 'transferencia' | 'cheque';
    observaciones?: string;
    /** Fecha a registrar en el recibo y en la base de datos. Por defecto: hoy. Formato YYYY-MM-DD */
    fechaPago?: string;
    soloInteres?: boolean;
  }): Promise<ResultadoPago> {
    const { data, error } = await supabase.rpc('registrar_pago', {
      p_cuota_id:      params.cuotaId,
      p_cajero_id:     params.cajeroId,
      p_monto_pagado:  params.montoPagado,
      p_mora_cobrada:  0,
      p_metodo_pago:   params.metodoPago,
      p_observaciones: params.observaciones ?? null,
      p_fecha_pago:    params.fechaPago ?? null,
      p_solo_interes:  params.soloInteres ?? false,
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
