import { supabase } from '../lib/supabase';

export interface AuditoriaEntry {
  id: string;
  tabla: string;
  accion: string;
  registro_id?: string;
  descripcion: string;
  datos?: Record<string, any>;
  created_at: string;
  usuario_nombre?: string;
  usuario_apellido?: string;
  usuario_email?: string;
  usuario_rol?: string;
}

const TABLA_ICON: Record<string, string> = {
  prestamos:  '💰',
  clientes:   '👤',
  garantias:  '🏠',
  pagos:      '💳',
  profiles:   '👥',
  cuotas:     '📅',
  default:    '📋',
};

const ACCION_COLOR: Record<string, string> = {
  crear:      '#2DD4A1',
  actualizar: '#3D9CF0',
  aprobar:    '#9B74F5',
  activar:    '#F5A623',
  pago:       '#2DD4A1',
  cancelar:   '#F05C5C',
  eliminar:   '#F05C5C',
};

export const auditoriaService = {
  TABLA_ICON,
  ACCION_COLOR,

  async getAll(limite = 60, offset = 0): Promise<AuditoriaEntry[]> {
    const { data, error } = await supabase
      .from('v_auditoria')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limite - 1);
    if (error) throw error;
    return (data ?? []) as AuditoriaEntry[];
  },

  async getByTabla(tabla: string, limite = 40): Promise<AuditoriaEntry[]> {
    const { data, error } = await supabase
      .from('v_auditoria')
      .select('*')
      .eq('tabla', tabla)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return (data ?? []) as AuditoriaEntry[];
  },

  async getByRegistro(registroId: string): Promise<AuditoriaEntry[]> {
    const { data, error } = await supabase
      .from('v_auditoria')
      .select('*')
      .eq('registro_id', registroId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AuditoriaEntry[];
  },

  async registrar(params: {
    tabla: string;
    accion: string;
    registroId?: string;
    descripcion: string;
    datos?: Record<string, any>;
  }): Promise<void> {
    const { error } = await supabase.rpc('registrar_auditoria', {
      p_tabla:       params.tabla,
      p_accion:      params.accion,
      p_registro_id: params.registroId ?? null,
      p_descripcion: params.descripcion,
      p_datos:       params.datos ? JSON.stringify(params.datos) : null,
    });
    if (error) console.warn('auditoria.registrar error:', error.message);
  },

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return 'ahora';
    if (mins < 60)  return `hace ${mins} min`;
    if (hours < 24) return `hace ${hours}h`;
    if (days === 1) return 'ayer';
    if (days < 7)   return `hace ${days} días`;
    return new Date(dateStr).toLocaleDateString('es', { day: '2-digit', month: 'short' });
  },
};
