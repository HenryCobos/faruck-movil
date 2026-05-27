import { supabase, withTimeout } from '../lib/supabase';
import type { CadenaAhorro, CadenaRonda, FrecuenciaCadena } from '@/types';

// ─── Helpers de fechas ────────────────────────────────────────

/** Avanza una fecha ISO (YYYY-MM-DD) según la frecuencia, sin efectos de zona horaria */
function avanzarFecha(dateStr: string, frecuencia: FrecuenciaCadena): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  if (frecuencia === 'semanal') {
    date.setDate(date.getDate() + 7);
  } else if (frecuencia === 'quincenal') {
    date.setDate(date.getDate() + 15);
  } else {
    date.setMonth(date.getMonth() + 1);
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Genera el arreglo de rondas (cronograma) a insertar en Supabase */
function generarRondas(
  cadenaId: string,
  numParticipantes: number,
  fechaInicio: string,
  frecuencia: FrecuenciaCadena,
) {
  const rondas: { cadena_id: string; numero_ronda: number; fecha_vencimiento: string }[] = [];
  let fechaActual = fechaInicio;

  for (let i = 1; i <= numParticipantes; i++) {
    rondas.push({ cadena_id: cadenaId, numero_ronda: i, fecha_vencimiento: fechaActual });
    fechaActual = avanzarFecha(fechaActual, frecuencia);
  }

  return rondas;
}

// ─── Servicio ─────────────────────────────────────────────────

export const cadenasAhorroService = {
  async getAll(): Promise<CadenaAhorro[]> {
    const { data, error } = await withTimeout(
      supabase
        .from('cadenas_ahorro')
        .select('*, cadena_puestos(*), cadena_rondas(*)')
        .order('created_at', { ascending: false }),
    );
    if (error) throw error;
    return (data ?? []) as CadenaAhorro[];
  },

  async getById(id: string): Promise<CadenaAhorro> {
    const { data, error } = await supabase
      .from('cadenas_ahorro')
      .select('*, cadena_puestos(*), cadena_rondas(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as CadenaAhorro;
  },

  async crear(params: {
    nombre: string;
    descripcion?: string;
    num_participantes: number;
    monto_aporte: number;
    frecuencia: FrecuenciaCadena;
    fecha_inicio: string;
    notas?: string;
    turnos: number[];
  }): Promise<CadenaAhorro> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    // 1. Crear la cadena
    const { data: cadena, error: cadenaError } = await supabase
      .from('cadenas_ahorro')
      .insert({
        user_id:           user.id,
        nombre:            params.nombre,
        descripcion:       params.descripcion ?? null,
        num_participantes: params.num_participantes,
        monto_aporte:      params.monto_aporte,
        frecuencia:        params.frecuencia,
        fecha_inicio:      params.fecha_inicio,
        notas:             params.notas ?? null,
      })
      .select()
      .single();
    if (cadenaError) throw cadenaError;

    // 2. Registrar los puestos del usuario
    if (params.turnos.length > 0) {
      const { error: puestosError } = await supabase
        .from('cadena_puestos')
        .insert(params.turnos.map((t) => ({ cadena_id: cadena.id, numero_turno: t })));
      if (puestosError) throw puestosError;
    }

    // 3. Generar el cronograma completo de rondas
    const rondas = generarRondas(
      cadena.id,
      params.num_participantes,
      params.fecha_inicio,
      params.frecuencia,
    );
    const { error: rondasError } = await supabase.from('cadena_rondas').insert(rondas);
    if (rondasError) throw rondasError;

    return cadena as CadenaAhorro;
  },

  async actualizarInfo(id: string, params: {
    nombre?: string;
    descripcion?: string;
    notas?: string;
    estado?: 'activa' | 'completada' | 'cancelada';
  }): Promise<void> {
    const { error } = await supabase
      .from('cadenas_ahorro')
      .update(params)
      .eq('id', id);
    if (error) throw error;
  },

  async eliminar(id: string): Promise<void> {
    const { error } = await supabase.from('cadenas_ahorro').delete().eq('id', id);
    if (error) throw error;
  },

  async marcarRondaPagada(rondaId: string, fechaPago: string): Promise<void> {
    const { error } = await supabase
      .from('cadena_rondas')
      .update({ pagado: true, fecha_pago: fechaPago })
      .eq('id', rondaId);
    if (error) throw error;
  },

  async desmarcarRondaPagada(rondaId: string): Promise<void> {
    const { error } = await supabase
      .from('cadena_rondas')
      .update({ pagado: false, fecha_pago: null })
      .eq('id', rondaId);
    if (error) throw error;
  },

  async actualizarBeneficiario(rondaId: string, nombre: string | null): Promise<void> {
    const { error } = await supabase
      .from('cadena_rondas')
      .update({ beneficiario_nombre: nombre })
      .eq('id', rondaId);
    if (error) throw error;
  },

  async actualizarNotasRonda(rondaId: string, notas: string | null): Promise<void> {
    const { error } = await supabase
      .from('cadena_rondas')
      .update({ notas })
      .eq('id', rondaId);
    if (error) throw error;
  },
};

// ─── Utilidades exportadas (usadas también en las pantallas) ──

export { avanzarFecha, generarRondas };

/** Formatea una fecha ISO (YYYY-MM-DD) para mostrar, sin efectos de TZ */
export function formatFechaCadena(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Retorna la primera ronda pendiente de pago, incluyendo la ronda de cobro
 *  (en panderos siempre se aporta en todas las rondas, incluso la propia) */
export function proximaRondaPago(
  rondas: CadenaRonda[],
  _misTurnos: Set<number>,
): CadenaRonda | undefined {
  return rondas
    .filter((r) => !r.pagado)
    .sort((a, b) => a.numero_ronda - b.numero_ronda)[0];
}
