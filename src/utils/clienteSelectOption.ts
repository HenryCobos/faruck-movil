import type { Cliente } from '@/types';
import type { SelectOption } from '@/components/ui/Select';

/** Normaliza texto para búsqueda insensible a mayúsculas y acentos. */
export function normalizeForSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function clienteToSelectOption(c: Cliente): SelectOption {
  const label = `${c.nombre} ${c.apellido}${c.alias ? ` (${c.alias})` : ''} — ${c.documento_numero}`;
  const searchText = [c.nombre, c.apellido, c.alias, c.email, c.documento_numero, c.telefono]
    .filter(Boolean)
    .join(' ');
  return { label, value: c.id, icon: '👤', searchText };
}

export function optionMatchesSearch(option: SelectOption, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const haystack = normalizeForSearch(option.searchText ?? option.label);
  return haystack.includes(q);
}
