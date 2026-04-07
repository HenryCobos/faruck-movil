import { supabase } from '../lib/supabase';
import { Garantia } from '../types';
import * as FileSystem from 'expo-file-system/legacy';

export type CreateGarantiaDTO = Omit<Garantia, 'id' | 'created_at' | 'updated_at'>;

export const garantiasService = {
  async getAll(): Promise<Garantia[]> {
    const { data, error } = await supabase
      .from('garantias')
      .select('*, clientes(nombre, apellido, documento_numero)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async getById(id: string): Promise<Garantia> {
    const { data, error } = await supabase
      .from('garantias')
      .select('*, clientes(nombre, apellido, telefono, documento_numero)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async getByCliente(clienteId: string): Promise<Garantia[]> {
    const { data, error } = await supabase
      .from('garantias')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async create(dto: CreateGarantiaDTO): Promise<Garantia> {
    const { data, error } = await supabase
      .from('garantias')
      .insert(dto)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, dto: Partial<CreateGarantiaDTO>): Promise<Garantia> {
    const { data, error } = await supabase
      .from('garantias')
      .update(dto)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async uploadFoto(uri: string, garantiaId: string): Promise<string> {
    const fileName = `garantias/${garantiaId}/${Date.now()}.jpg`;
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64' as any,
    });
    const { data, error } = await supabase.storage
      .from('pignora-fotos')
      .upload(fileName, decode(base64), { contentType: 'image/jpeg' });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('pignora-fotos').getPublicUrl(data.path);
    return urlData.publicUrl;
  },
};

function decode(base64: string): Uint8Array {
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
