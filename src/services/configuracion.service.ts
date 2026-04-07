import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';

export interface Configuracion {
  id: string;
  nombre_empresa: string;
  slogan?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  ruc_nit?: string;
  moneda: string;
  simbolo_moneda: string;
  tasa_mora_diaria: number;
  tasa_mora_label: string;
  dias_gracia: number;
  logo_url?: string;
  color_primario: string;
  updated_at: string;
}

// Valores por defecto cuando la DB aún no tiene la tabla o está vacía
const DEFAULTS: Configuracion = {
  id: '',
  nombre_empresa: 'PRÉSTAMOS AB',
  slogan: 'Sistema de Créditos con Garantía',
  moneda: 'Bs',
  simbolo_moneda: '$',
  tasa_mora_diaria: 0.001,
  tasa_mora_label: '0.1% diario',
  dias_gracia: 0,
  color_primario: '#0D1B2A',
  updated_at: '',
};

// Caché en memoria para evitar múltiples llamadas
let _cache: Configuracion | null = null;

export const configuracionService = {
  async get(): Promise<Configuracion> {
    if (_cache) return _cache;

    try {
      const { data, error } = await supabase
        .from('configuracion')
        .select('*')
        .limit(1)
        .maybeSingle();

      // Si la tabla no existe aún, devolver defaults silenciosamente
      if (error) {
        console.warn('[configuracion] tabla no disponible, usando defaults:', error.message);
        return DEFAULTS;
      }

      // Si existe la tabla pero está vacía, insertar fila inicial
      if (!data) {
        const { data: inserted, error: insErr } = await supabase
          .from('configuracion')
          .insert({
            nombre_empresa: DEFAULTS.nombre_empresa,
            slogan:         DEFAULTS.slogan,
            moneda:         DEFAULTS.moneda,
            simbolo_moneda: DEFAULTS.simbolo_moneda,
            tasa_mora_diaria: DEFAULTS.tasa_mora_diaria,
            tasa_mora_label:  DEFAULTS.tasa_mora_label,
            dias_gracia:    DEFAULTS.dias_gracia,
            color_primario: DEFAULTS.color_primario,
          })
          .select()
          .single();
        if (insErr) {
          console.warn('[configuracion] no se pudo insertar fila inicial:', insErr.message);
          return DEFAULTS;
        }
        _cache = inserted as Configuracion;
        return _cache;
      }

      _cache = data as Configuracion;
      return _cache;
    } catch (e: any) {
      console.warn('[configuracion] error inesperado en get():', e?.message);
      return DEFAULTS;
    }
  },

  async update(params: Partial<Omit<Configuracion, 'id' | 'updated_at'>>): Promise<Configuracion> {
    const current = await this.get();

    // Si no hay ID real (tabla no existe en DB), no intentar UPDATE
    if (!current.id) {
      throw new Error('La tabla de configuración no existe en la base de datos. Ejecuta el archivo supabase/setup_completo.sql en Supabase SQL Editor.');
    }

    const { data, error } = await supabase
      .from('configuracion')
      .update({ ...params, updated_at: new Date().toISOString() })
      .eq('id', current.id)
      .select()
      .single();
    if (error) throw error;
    _cache = data as Configuracion;
    return _cache;
  },

  clearCache() {
    _cache = null;
  },

  async uploadLogo(uri: string): Promise<string> {
    // Leer el archivo como base64
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });

    // Detectar extensión
    const ext  = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const path = `logo-empresa.${ext}`;

    // Subir a Supabase Storage (bucket "logos")
    const { error } = await supabase.storage
      .from('logos')
      .upload(path, decode(base64), {
        contentType: mime,
        upsert: true,   // sobreescribir si ya existe
      });
    if (error) throw error;

    // Obtener URL pública
    const { data } = supabase.storage.from('logos').getPublicUrl(path);
    // Agregar timestamp para evitar caché del navegador
    const urlConCache = `${data.publicUrl}?t=${Date.now()}`;

    // Guardar en configuracion y limpiar caché local
    await this.update({ logo_url: urlConCache });
    return urlConCache;
  },

  // Helper para formatear moneda usando la configuración
  formatMonto(monto: number, config?: Configuracion): string {
    const simbolo = config?.simbolo_moneda ?? '$';
    return `${simbolo}${monto.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
};

// Convierte base64 a Uint8Array (necesario para Supabase Storage)
function decode(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const len    = base64.length;
  let bufLen   = Math.floor(len * 3 / 4);
  if (base64[len - 1] === '=') bufLen--;
  if (base64[len - 2] === '=') bufLen--;

  const arr = new Uint8Array(bufLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[base64.charCodeAt(i)];
    const b = lookup[base64.charCodeAt(i + 1)];
    const c = lookup[base64.charCodeAt(i + 2)];
    const d = lookup[base64.charCodeAt(i + 3)];
    arr[p++] = (a << 2) | (b >> 4);
    if (p < bufLen) arr[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < bufLen) arr[p++] = ((c & 3) << 6) | (d & 63);
  }
  return arr;
}
