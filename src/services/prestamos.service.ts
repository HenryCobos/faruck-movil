import { supabase, withTimeout } from '../lib/supabase';
import { Prestamo, Cuota } from '../types';
import { auditoriaService } from './auditoria.service';
import * as FileSystem from 'expo-file-system/legacy';

export type CreatePrestamoDTO = {
  cliente_id: string;
  garantia_id: string;
  monto_principal: number;
  tasa_mensual: number;
  plazo_meses: number;
  tipo_amortizacion: 'francesa' | 'alemana';
  comision_apertura?: number;
  observaciones?: string;
};

export const prestamosService = {
  async getAll(): Promise<Prestamo[]> {
    const { data, error } = await withTimeout(
      supabase
        .from('prestamos')
        .select('*, clientes(nombre, apellido, telefono, documento_numero), garantias(tipo, descripcion, valor_avaluo)')
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
        clientes(nombre, apellido, telefono, documento_numero, direccion),
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
    const fechaObj = new Date(fechaDesembolso);
    const plazoRes = await supabase.from('prestamos').select('plazo_meses, monto_principal').eq('id', id).single();
    if (plazoRes.error) throw plazoRes.error;
    const fechaVencimiento = new Date(fechaObj);
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + plazoRes.data.plazo_meses);

    const { error } = await supabase
      .from('prestamos')
      .update({
        estado: 'activo',
        fecha_desembolso: fechaDesembolso,
        fecha_vencimiento: fechaVencimiento.toISOString().split('T')[0],
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
      datos: { fecha_desembolso: fechaDesembolso, monto: plazoRes.data.monto_principal },
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
