import { formatCurrency } from './amortizacion';

export type PrestamoRenovacionHijo = {
  id: string;
  estado: string;
  monto_principal: number;
  created_at?: string;
};

export const PRESTAMO_RENOVADO_HIJO_PREFIX = 'PRESTAMO_RENOVADO_HIJO:';

const ESTADO_LABEL: Record<string, string> = {
  solicitado: 'Solicitado',
  aprobado: 'Aprobado',
  activo: 'Activo',
  cancelado: 'Cancelado',
  vencido: 'Vencido',
  ejecutado: 'Ejecutado',
  renovado: 'Renovado',
};

function refCorta(id: string): string {
  return `#${id.slice(-8).toUpperCase()}`;
}

export function mensajePrestamoRenovadoConHijos(hijo: PrestamoRenovacionHijo, totalHijos: number): string {
  const estado = ESTADO_LABEL[hijo.estado] ?? hijo.estado;
  const monto = formatCurrency(Number(hijo.monto_principal ?? 0));
  const ref = refCorta(hijo.id);
  const extra = totalHijos > 1 ? ` (y ${totalHijos - 1} renovación(es) más)` : '';
  return (
    `Este préstamo quedó en estado Renovado y está vinculado al préstamo actual del cliente (${ref}, ${estado}, ${monto})${extra}.\n\n` +
    'Para conservar el historial, no se puede eliminar desde aquí. Abre el préstamo de renovación y, si corresponde, gestiónalo desde allí.'
  );
}

export class PrestamoRenovadoConHijosError extends Error {
  readonly hijoId: string;
  readonly hijosCount: number;

  constructor(hijo: PrestamoRenovacionHijo, hijosCount: number) {
    const userMessage = mensajePrestamoRenovadoConHijos(hijo, hijosCount);
    super(`${PRESTAMO_RENOVADO_HIJO_PREFIX}${hijo.id}:${userMessage}`);
    this.name = 'PrestamoRenovadoConHijosError';
    this.hijoId = hijo.id;
    this.hijosCount = hijosCount;
  }
}

/** Extrae el id del préstamo hijo desde el mensaje de error del servicio. */
export function parsePrestamoRenovadoHijoId(message?: string): string | null {
  if (!message?.startsWith(PRESTAMO_RENOVADO_HIJO_PREFIX)) return null;
  const rest = message.slice(PRESTAMO_RENOVADO_HIJO_PREFIX.length);
  const colon = rest.indexOf(':');
  if (colon <= 0) return null;
  return rest.slice(0, colon);
}

export function mensajeUsuarioDesdeErrorEliminar(message?: string): string | null {
  if (!message?.startsWith(PRESTAMO_RENOVADO_HIJO_PREFIX)) return null;
  const rest = message.slice(PRESTAMO_RENOVADO_HIJO_PREFIX.length);
  const colon = rest.indexOf(':');
  if (colon < 0) return null;
  return rest.slice(colon + 1);
}
