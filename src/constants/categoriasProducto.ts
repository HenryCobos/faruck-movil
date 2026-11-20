import type { CategoriaProducto } from '@/types';

export const CATEGORIAS_PRODUCTO_SLUGS = [
  'celular',
  'vehiculo',
  'inmueble',
  'joya',
  'electrodomestico',
  'motocicleta',
  'otro',
] as const satisfies readonly CategoriaProducto[];

const LABELS: Record<CategoriaProducto, string> = {
  celular: 'Celular',
  vehiculo: 'Vehículo',
  inmueble: 'Inmueble',
  joya: 'Joya',
  electrodomestico: 'Electrodoméstico',
  motocicleta: 'Motocicleta',
  otro: 'Personalizada',
};

/** Opciones para chips/select en formulario. */
export const CATEGORIAS_PRODUCTO_OPTIONS = CATEGORIAS_PRODUCTO_SLUGS.map((value) => ({
  value,
  label: LABELS[value],
}));

export function isCategoriaProducto(raw: string): raw is CategoriaProducto {
  return (CATEGORIAS_PRODUCTO_SLUGS as readonly string[]).includes(raw);
}

/** Etiqueta visible (recibo, detalle, listas). */
export function etiquetaCategoriaProducto(
  slug?: CategoriaProducto | string | null,
  otro?: string | null,
): string | null {
  if (!slug || !isCategoriaProducto(slug)) return null;
  if (slug === 'otro') {
    const t = otro?.trim();
    return t && t.length >= 2 ? t : null;
  }
  return LABELS[slug];
}
