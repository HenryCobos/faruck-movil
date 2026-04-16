import { supabase } from '../lib/supabase';
import { auditoriaService } from './auditoria.service';

export interface UsuarioProfile {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  telefono?: string;
  rol: 'admin' | 'oficial' | 'cajero' | 'auditor';
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export const usuariosService = {
  async getAll(): Promise<UsuarioProfile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as UsuarioProfile[];
  },

  async getById(id: string): Promise<UsuarioProfile> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as UsuarioProfile;
  },

  // Crear usuario nuevo con credenciales (usa la función de admin de Supabase)
  async crear(params: {
    email: string;
    password: string;
    nombre: string;
    apellido: string;
    telefono?: string;
    rol: 'admin' | 'oficial' | 'cajero' | 'auditor';
  }): Promise<void> {
    // Registramos con signUp, el trigger handle_new_user creará el perfil automáticamente
    const { data, error } = await supabase.auth.signUp({
      email: params.email.trim().toLowerCase(),
      password: params.password,
      options: {
        data: {
          nombre: params.nombre,
          apellido: params.apellido,
          rol: params.rol,
        },
      },
    });
    if (error) throw error;
    // Actualizamos teléfono y rol si es necesario (el trigger pone 'cajero' por defecto)
    if (data.user) {
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ rol: params.rol, telefono: params.telefono ?? null })
        .eq('id', data.user.id);
      if (upErr) throw upErr;

      auditoriaService.registrar({
        tabla: 'profiles',
        accion: 'crear',
        registroId: data.user.id,
        descripcion: `Nuevo usuario creado: ${params.nombre} ${params.apellido} · Rol: ${params.rol} · ${params.email}`,
        datos: { email: params.email, rol: params.rol },
      }).catch(() => {});
    }
  },

  async actualizar(id: string, params: {
    nombre?: string;
    apellido?: string;
    telefono?: string;
    rol?: 'admin' | 'oficial' | 'cajero' | 'auditor';
  }): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ ...params, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    auditoriaService.registrar({
      tabla: 'profiles',
      accion: 'actualizar',
      registroId: id,
      descripcion: `Perfil de usuario actualizado${params.rol ? ` · Nuevo rol: ${params.rol}` : ''}`,
      datos: params as Record<string, any>,
    }).catch(() => {});
  },

  async toggleActivo(id: string, activo: boolean): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ activo, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    auditoriaService.registrar({
      tabla: 'profiles',
      accion: activo ? 'activar' : 'cancelar',
      registroId: id,
      descripcion: `Usuario ${activo ? 'activado' : 'desactivado'}`,
    }).catch(() => {});
  },

  async actualizarPerfil(id: string, params: {
    nombre?: string;
    apellido?: string;
    telefono?: string;
  }): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ ...params, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async eliminarCuenta(password: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No hay sesión activa');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password,
    });
    if (authError) throw new Error('La contraseña es incorrecta');

    auditoriaService.registrar({
      tabla: 'profiles',
      accion: 'eliminar',
      registroId: user.id,
      descripcion: 'El usuario solicitó la eliminación de su propia cuenta',
    }).catch(() => {});

    // Llama a la función SQL que elimina el usuario de auth.users (y profiles en cascada)
    const { error: rpcError } = await supabase.rpc('delete_own_account');
    if (rpcError) throw rpcError;

    await supabase.auth.signOut();
  },
};
