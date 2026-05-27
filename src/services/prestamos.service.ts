import { supabase, withTimeout } from '../lib/supabase';
import { Prestamo, Cuota, AbonoCapital, ResultadoAbonoCapital, ResultadoAnulacionAbono } from '../types';
import { auditoriaService } from './auditoria.service';
import { parseFechaLocal, formatFechaISO } from '../utils/amortizacion';
import * as FileSystem from 'expo-file-system/legacy';

export type RenovarPrestamoDTO = {
  prestamoAnteriorId: string;
  nuevoMonto: number;
  nuevaTasa: number;       // fracción decimal (ej. 0.035)
  nuevoPlayzo: number;
  nuevoTipo: 'francesa' | 'alemana' | 'solo_interes' | 'anticipado' | 'solo_interes_adelantado';
  nuevaComision?: number;
  nuevoPlazosDias?: number;
  observaciones?: string;
};

export type CreatePrestamoDTO = {
  cliente_id: string;
  garantia_id: string;
  monto_principal: number;
  tasa_mensual: number;
  plazo_meses: number;
  plazo_dias?: number;
  tipo_amortizacion: 'francesa' | 'alemana' | 'solo_interes' | 'anticipado' | 'solo_interes_adelantado';
  comision_apertura?: number;
  observaciones?: string;
};

export type CreateCreditoProductoDTO = {
  cliente_id: string;
  descripcion_producto: string;
  monto_principal: number;
  plazo_meses: number;
  garantia_id?: string;
  observaciones?: string;
};

export const prestamosService = {
  async getAll(): Promise<Prestamo[]> {
    const { data, error } = await withTimeout(
      supabase
        .from('prestamos')
        .select('*, clientes(nombre, apellido, alias, telefono, documento_numero), garantias(tipo, descripcion, valor_avaluo)')
        .order('created_at', { ascending: false }),
    );
    if (error) throw error;
    return data ?? [];
  },

  async getById(id: string): Promise<Prestamo> {
    const { data, error } = await supabase
      .from('prestamos')
      .select(`
        *,
        clientes(nombre, apellido, alias, telefono, documento_numero, direccion),
        garantias(tipo, descripcion, valor_avaluo, estado, fotos)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async getCuotas(prestamoId: string): Promise<Cuota[]> {
    const { data, error } = await supabase
      .from('cuotas')
      .select('*')
      .eq('prestamo_id', prestamoId)
      .order('numero_cuota');
    if (error) throw error;
    return data ?? [];
  },

  async create(dto: CreatePrestamoDTO, oficialId: string): Promise<Prestamo> {
    const { data, error } = await supabase
      .from('prestamos')
      .insert({ ...dto, oficial_id: oficialId, comision_apertura: dto.comision_apertura ?? 0 })
      .select()
      .single();
    if (error) throw error;

    // Bloquear la garantía en cuanto se registra el préstamo
    await supabase
      .from('garantias')
      .update({ estado: 'en_garantia' })
      .eq('id', dto.garantia_id);

    auditoriaService.registrar({
      tabla: 'prestamos',
      accion: 'crear',
      registroId: data.id,
      descripcion: `Préstamo creado por $${dto.monto_principal.toLocaleString('es')} a ${dto.plazo_meses} meses`,
      datos: { monto: dto.monto_principal, tasa: dto.tasa_mensual, plazo: dto.plazo_meses },
    }).catch(() => {});

    return data;
  },

  async aprobar(id: string, aprobadoPorId: string): Promise<void> {
    const { error } = await supabase
      .from('prestamos')
      .update({ estado: 'aprobado', aprobado_por: aprobadoPorId })
      .eq('id', id);
    if (error) throw error;

    auditoriaService.registrar({
      tabla: 'prestamos',
      accion: 'aprobar',
      registroId: id,
      descripcion: 'Préstamo aprobado — pendiente de desembolso',
    }).catch(() => {});
  },

  async activar(id: string, fechaDesembolso: string): Promise<void> {
    // parseFechaLocal evita el salto UTC→local: new Date("YYYY-MM-DD") en JS
    // interpreta la fecha como medianoche UTC, lo que en zonas UTC-N da el día anterior.
    const fechaObj = parseFechaLocal(fechaDesembolso);
    const plazoRes = await supabase
      .from('prestamos')
      .select('plazo_meses, plazo_dias, tipo_amortizacion, monto_principal')
      .eq('id', id)
      .single();
    if (plazoRes.error) throw plazoRes.error;

    const { plazo_meses, plazo_dias, tipo_amortizacion, monto_principal } = plazoRes.data;

    // Para tipo anticipado con plazo_dias, la fecha de vencimiento usa días exactos
    const fechaVencimiento = new Date(fechaObj);
    if (tipo_amortizacion === 'anticipado' && plazo_dias) {
      fechaVencimiento.setDate(fechaVencimiento.getDate() + plazo_dias);
    } else {
      fechaVencimiento.setMonth(fechaVencimiento.getMonth() + plazo_meses);
    }

    const { error } = await supabase
      .from('prestamos')
      .update({
        estado: 'activo',
        fecha_desembolso: fechaDesembolso,
        // formatFechaISO usa fecha LOCAL (no toISOString que convierte a UTC)
        fecha_vencimiento: formatFechaISO(fechaVencimiento),
      })
      .eq('id', id);
    if (error) throw error;

    // Generar cronograma via función SQL
    const { error: cronError } = await supabase.rpc('generar_cronograma', { prestamo_id: id });
    if (cronError) throw cronError;

    auditoriaService.registrar({
      tabla: 'prestamos',
      accion: 'activar',
      registroId: id,
      descripcion: `Préstamo activado y desembolsado el ${fechaDesembolso} — cronograma generado`,
      datos: { fecha_desembolso: fechaDesembolso, monto: monto_principal },
    }).catch(() => {});
  },

  async actualizarContrato(id: string, contratoUrl: string | null): Promise<void> {
    const { error } = await supabase
      .from('prestamos')
      .update({ contrato_url: contratoUrl })
      .eq('id', id);
    if (error) throw error;
  },

  async uploadContrato(uri: string, prestamoId: string, mimeType: string): Promise<string> {
    const ext = mimeType.includes('pdf') ? 'pdf' : mimeType.split('/')[1] ?? 'pdf';
    const storagePath = `contratos/${prestamoId}/${Date.now()}.${ext}`;
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
    const { data, error } = await supabase.storage
      .from('pignora-fotos')
      .upload(storagePath, decodeBase64(base64), { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('pignora-fotos').getPublicUrl(data.path);
    return urlData.publicUrl;
  },

  async eliminar(id: string): Promise<void> {
    const { data: prestamo, error: fetchError } = await supabase
      .from('prestamos')
      .select('garantia_id, monto_principal, estado')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    // 1. Obtener IDs de todas las cuotas del préstamo
    const { data: cuotasData, error: cuotasError } = await supabase
      .from('cuotas')
      .select('id')
      .eq('prestamo_id', id);
    if (cuotasError) throw cuotasError;

    const cuotaIds = (cuotasData ?? []).map((c: any) => c.id);

    if (cuotaIds.length > 0) {
      // 2. Borrar asientos contables que referencian pagos de estas cuotas
      //    (referencia_id sin FK, pero limpiamos para no dejar huérfanos)
      const { data: pagosData } = await supabase
        .from('pagos')
        .select('id')
        .in('cuota_id', cuotaIds);
      const pagoIds = (pagosData ?? []).map((p: any) => p.id);

      if (pagoIds.length > 0) {
        await supabase
          .from('asientos_contables')
          .delete()
          .in('referencia_id', pagoIds);

        // 3. Borrar todos los pagos (vigentes y anulados) de estas cuotas
        const { error: pagosDelError } = await supabase
          .from('pagos')
          .delete()
          .in('cuota_id', cuotaIds);
        if (pagosDelError) throw pagosDelError;
      }
    }

    // 4. Liberar garantía si estaba bloqueada por este préstamo
    if (prestamo.garantia_id && prestamo.estado !== 'cancelado') {
      await supabase
        .from('garantias')
        .update({ estado: 'disponible' })
        .eq('id', prestamo.garantia_id);
    }

    // 5. Eliminar el préstamo (cuotas se eliminan en cascada por ON DELETE CASCADE)
    const { error, count } = await supabase
      .from('prestamos')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) throw error;
    if ((count ?? 0) === 0) throw new Error('No se pudo eliminar el préstamo. Verifica que tienes permisos de administrador.');

    auditoriaService.registrar({
      tabla: 'prestamos',
      accion: 'eliminar',
      registroId: id,
      descripcion: `Préstamo eliminado por administrador — Monto: $${prestamo.monto_principal?.toLocaleString('es')} (estado: ${prestamo.estado})`,
      datos: { monto: prestamo.monto_principal, estado: prestamo.estado },
    }).catch(() => {});
  },

  async getSaldoPendiente(id: string): Promise<number> {
    const { data, error } = await supabase.rpc('calcular_saldo_pendiente', { p_prestamo_id: id });
    if (error) throw error;
    return data ?? 0;
  },

  async renovar(dto: RenovarPrestamoDTO, oficialId: string): Promise<Prestamo> {
    const { data, error } = await supabase.rpc('renovar_prestamo', {
      p_prestamo_anterior_id: dto.prestamoAnteriorId,
      p_nuevo_monto:          dto.nuevoMonto,
      p_nueva_tasa:           dto.nuevaTasa,
      p_nuevo_plazo:          dto.nuevoPlayzo,
      p_nuevo_tipo:           dto.nuevoTipo,
      p_oficial_id:           oficialId,
      p_nueva_comision:       dto.nuevaComision ?? 0,
      p_observaciones:        dto.observaciones ?? null,
      p_nuevo_plazo_dias:     dto.nuevoPlazosDias ?? null,
    });
    if (error) throw error;

    const nuevoId: string = data;
    const prestamo = await this.getById(nuevoId);

    auditoriaService.registrar({
      tabla: 'prestamos',
      accion: 'crear',
      registroId: nuevoId,
      descripcion: `Préstamo renovado desde #${dto.prestamoAnteriorId.slice(-6).toUpperCase()} por $${dto.nuevoMonto.toLocaleString('es')} a ${dto.nuevoPlayzo} meses`,
      datos: { monto: dto.nuevoMonto, tasa: dto.nuevaTasa, plazo: dto.nuevoPlayzo, prestamo_anterior: dto.prestamoAnteriorId },
    }).catch(() => {});

    return prestamo;
  },

  async createCreditoProducto(dto: CreateCreditoProductoDTO, oficialId: string): Promise<Prestamo> {
    const payload: Record<string, any> = {
      cliente_id: dto.cliente_id,
      oficial_id: oficialId,
      monto_principal: dto.monto_principal,
      tasa_mensual: 0,
      plazo_meses: dto.plazo_meses,
      tipo_amortizacion: 'francesa',
      tipo_prestamo: 'credito_producto',
      descripcion_producto: dto.descripcion_producto,
      comision_apertura: 0,
      observaciones: dto.observaciones ?? null,
    };
    if (dto.garantia_id) {
      payload.garantia_id = dto.garantia_id;
    }

    const { data, error } = await supabase
      .from('prestamos')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    if (dto.garantia_id) {
      await supabase
        .from('garantias')
        .update({ estado: 'en_garantia' })
        .eq('id', dto.garantia_id);
    }

    auditoriaService.registrar({
      tabla: 'prestamos',
      accion: 'crear',
      registroId: data.id,
      descripcion: `Crédito de producto creado: "${dto.descripcion_producto}" — $${dto.monto_principal.toLocaleString('es')} en ${dto.plazo_meses} cuota(s)`,
      datos: { monto: dto.monto_principal, cuotas: dto.plazo_meses, producto: dto.descripcion_producto },
    }).catch(() => {});

    return data;
  },

  async abonarCapital(
    dto: {
      prestamoId: string;
      monto: number;
      metodoPago: 'efectivo' | 'transferencia' | 'cheque';
      observaciones?: string;
    },
    cajeroId: string,
  ): Promise<ResultadoAbonoCapital> {
    const { data, error } = await supabase.rpc('aplicar_abono_capital', {
      p_prestamo_id:   dto.prestamoId,
      p_cajero_id:     cajeroId,
      p_monto:         dto.monto,
      p_metodo_pago:   dto.metodoPago,
      p_observaciones: dto.observaciones ?? null,
    });
    if (error) throw error;
    return data as ResultadoAbonoCapital;
  },

  async getAbonosByPrestamo(prestamoId: string): Promise<AbonoCapital[]> {
    const { data, error } = await supabase
      .from('abonos_capital')
      .select('*')
      .eq('prestamo_id', prestamoId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AbonoCapital[];
  },

  async anularAbono(params: {
    abonoId: string;
    adminId: string;
    motivo: string;
  }): Promise<ResultadoAnulacionAbono> {
    const { data, error } = await supabase.rpc('revertir_abono_capital', {
      p_abono_id: params.abonoId,
      p_admin_id: params.adminId,
      p_motivo:   params.motivo,
    });
    if (error) throw error;
    return data as ResultadoAnulacionAbono;
  },

  async cancelar(id: string): Promise<void> {
    // Obtener garantia_id antes de cancelar para liberar la garantía
    const { data: prestamo, error: fetchError } = await supabase
      .from('prestamos')
      .select('garantia_id')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    const { error } = await supabase
      .from('prestamos')
      .update({ estado: 'cancelado' })
      .eq('id', id);
    if (error) throw error;

    // Liberar la garantía al cancelar el préstamo
    await supabase
      .from('garantias')
      .update({ estado: 'disponible' })
      .eq('id', prestamo.garantia_id);

    auditoriaService.registrar({
      tabla: 'prestamos',
      accion: 'cancelar',
      registroId: id,
      descripcion: 'Préstamo cancelado manualmente',
    }).catch(() => {});
  },
};

function decodeBase64(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    if (i + 2 < len) bytes[p++] = ((b & 0xf) << 4) | (c >> 2);
    if (i + 3 < len) bytes[p++] = ((c & 0x3) << 6) | d;
  }
  return bytes.subarray(0, p);
}
