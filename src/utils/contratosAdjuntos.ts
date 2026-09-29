import type { ContratoAdjunto, Prestamo } from '../types';

export const MAX_CONTRATOS_ADJUNTOS = 5;

export type { ContratoAdjunto };

export function displayNombre(adjunto: ContratoAdjunto): string {
  if (adjunto.nombre?.trim()) return adjunto.nombre.trim();
  try {
    const raw = adjunto.url.split('/').pop()?.split('?')[0] ?? 'Documento';
    return decodeURIComponent(raw).replace(/^\d+\./, '');
  } catch {
    return 'Documento';
  }
}

/** Extrae path relativo en bucket pignora-fotos desde URL pública de Supabase. */
export function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = '/storage/v1/object/public/pignora-fotos/';
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length).split('?')[0]);
}

function normalizeItem(raw: unknown): ContratoAdjunto | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const url = typeof o.url === 'string' ? o.url : '';
  if (!url) return null;
  return {
    url,
    nombre: typeof o.nombre === 'string' ? o.nombre : undefined,
    mime_type: typeof o.mime_type === 'string' ? o.mime_type : undefined,
    created_at: typeof o.created_at === 'string' ? o.created_at : undefined,
  };
}

export function parseContratosAdjuntos(
  prestamo: Pick<Prestamo, 'contratos_adjuntos' | 'contrato_url'>,
): ContratoAdjunto[] {
  const raw = prestamo.contratos_adjuntos;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map(normalizeItem).filter((x): x is ContratoAdjunto => x !== null);
  }
  if (prestamo.contrato_url?.trim()) {
    return [{ url: prestamo.contrato_url.trim(), nombre: 'Contrato' }];
  }
  return [];
}

export function contratoUrlPrincipal(adjuntos: ContratoAdjunto[]): string | null {
  return adjuntos[0]?.url ?? null;
}
