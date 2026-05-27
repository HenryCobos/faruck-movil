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
        `nombre.ilike.%${query}%,apellido.ilike.%${query}%,alias.ilike.%${query}%,documento_numero.ilike.%${query}%,telefono.ilike.%${query}%`
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

  async eliminar(id: string): Promise<void> {
    const { data: cliente, error: fetchError } = await supabase
      .from('clientes')
      .select('nombre, apellido, documento_numero')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    // 1. Obtener todas las garantías del cliente
    const { data: garantias, error: garError } = await supabase
      .from('garantias')
      .select('id, estado, descripcion')
      .eq('cliente_id', id);
    if (garError) throw garError;

    const listaGarantias = garantias ?? [];

    // 2. Bloquear si alguna garantía está respaldando un préstamo activo
    const enGarantia = listaGarantias.filter((g: any) => g.estado === 'en_garantia');
    if (enGarantia.length > 0) {
      throw new Error(
        `El cliente tiene ${enGarantia.length} garantía(s) actualmente en uso como respaldo de préstamos activos. ` +
        'Liquida los préstamos antes de eliminar el cliente.'
      );
    }

    // 3. Bloquear si alguna garantía está referenciada por préstamos históricos
    //    (cancelados, vencidos, etc.) — borrarla rompería el historial financiero
    const garantiaIds = listaGarantias.map((g: any) => g.id);
    if (garantiaIds.length > 0) {
      const { count: prestamosConGarantia } = await supabase
        .from('prestamos')
        .select('id', { count: 'exact', head: true })
        .in('garantia_id', garantiaIds);

      if ((prestamosConGarantia ?? 0) > 0) {
        throw new Error(
          'Este cliente tiene garantías vinculadas a préstamos históricos. ' +
          'No se puede eliminar para preservar el historial financiero.'
        );
      }

      // 4. Garantías libres sin préstamos → eliminar junto con el cliente
      const { error: delGarError } = await supabase
        .from('garantias')
        .delete()
        .in('id', garantiaIds);
      if (delGarError) throw delGarError;
    }

    // 5. Eliminar el cliente
    const { error, count } = await supabase
      .from('clientes')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) throw error;
    if ((count ?? 0) === 0) throw new Error('No se pudo eliminar el cliente. Verifica que tienes permisos de administrador.');

    auditoriaService.registrar({
      tabla: 'clientes',
      accion: 'eliminar',
      registroId: id,
      descripcion: `Cliente eliminado: ${cliente.nombre} ${cliente.apellido} · ${cliente.documento_numero}` +
        (listaGarantias.length > 0 ? ` (con ${listaGarantias.length} garantía(s) asociada(s))` : ''),
      datos: {
        nombre: `${cliente.nombre} ${cliente.apellido}`,
        documento: cliente.documento_numero,
        garantias_eliminadas: listaGarantias.length,
      },
    }).catch(() => {});
  },
};
