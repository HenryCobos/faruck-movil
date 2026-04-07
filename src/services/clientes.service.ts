import { supabase, withTimeout } from '../lib/supabase';
import { Cliente } from '../types';
import { auditoriaService } from './auditoria.service';

export type CreateClienteDTO = Omit<Cliente, 'id' | 'created_at' | 'updated_at'>;

export const clientesService = {
  async getAll(): Promise<Cliente[]> {
    const { data, error } = await withTimeout(
      supabase.from('clientes').select('*').order('nombre', { ascending: true }),
    );
    if (error) throw error;
    return data ?? [];
  },

  async getById(id: string): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async search(query: string): Promise<Cliente[]> {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .or(
        `nombre.ilike.%${query}%,apellido.ilike.%${query}%,documento_numero.ilike.%${query}%,telefono.ilike.%${query}%`
      )
      .order('nombre');
    if (error) throw error;
    return data ?? [];
  },

  async create(dto: CreateClienteDTO): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .insert(dto)
      .select()
      .single();
    if (error) throw error;

    auditoriaService.registrar({
      tabla: 'clientes',
      accion: 'crear',
      registroId: data.id,
      descripcion: `Cliente registrado: ${dto.nombre} ${dto.apellido} · ${dto.documento_tipo.toUpperCase()} ${dto.documento_numero}`,
      datos: { nombre: `${dto.nombre} ${dto.apellido}`, documento: dto.documento_numero },
    }).catch(() => {});

    return data;
  },

  async update(id: string, dto: Partial<CreateClienteDTO>): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .update(dto)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    auditoriaService.registrar({
      tabla: 'clientes',
      accion: 'actualizar',
      registroId: id,
      descripcion: `Datos del cliente actualizados: ${data.nombre} ${data.apellido}`,
      datos: dto as Record<string, any>,
    }).catch(() => {});

    return data;
  },

  async getPrestamos(clienteId: string) {
    const { data, error } = await supabase
      .from('prestamos')
      .select('*, garantias(tipo, descripcion)')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};
