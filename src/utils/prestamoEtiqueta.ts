import type { CategoriaProducto, TipoPrestamo } from '@/types';
import { etiquetaCategoriaProducto, isCategoriaProducto } from '@/constants/categoriasProducto';

const DEFAULT_TIPO: TipoPrestamo = 'prestamo';

export function normalizeTipoPrestamo(raw?: string | null): TipoPrestamo {
  if (raw === 'credito_producto' || raw === 'prestamo') return raw;
  return DEFAULT_TIPO;
}

/** Texto para recibos y PDF: operación comercial (sin categoría). */
export function etiquetaOperacionCredito(tipo: TipoPrestamo): string {
  return tipo === 'credito_producto' ? 'Venta a crédito' : 'Préstamo';
}

export function normalizeCategoriaProducto(raw?: string | null): CategoriaProducto | undefined {
  if (raw && isCategoriaProducto(raw)) return raw;
  return undefined;
}

/**
 * Operación en recibo: «Préstamo · Celular» / «Venta a crédito · Celular» cuando hay categoría;
 * sin categoría mantiene solo el tipo de operación.
 */
export function etiquetaOperacionRecibo(
  tipo: TipoPrestamo,
  categoria?: CategoriaProducto | string | null,
  categoriaOtro?: string | null,
): string {
  const base = etiquetaOperacionCredito(tipo);
  const cat = etiquetaCategoriaProducto(categoria, categoriaOtro);
  return cat ? `${base} · ${cat}` : base;
}

/** Etiqueta de saldo pendiente según tipo (evita "préstamo" en venta producto). */
export function etiquetaSaldoPendienteRecibo(tipo: TipoPrestamo, esPagoSoloInteres: boolean): string {
  if (tipo === 'credito_producto') {
    if (esPagoSoloInteres) return 'Saldo de capital pendiente de la venta';
    return 'Saldo pendiente de la venta';
  }
  return esPagoSoloInteres
    ? 'Saldo de capital pendiente de la deuda'
    : 'Saldo pendiente del préstamo';
}

/** Título caja de operación totalmente cancelada. */
export function etiquetaTituloCancelacionTotal(tipo: TipoPrestamo): string {
  return tipo === 'credito_producto' ? '¡VENTA SALDADA!' : '¡PRÉSTAMO SALDADO!';
}

/** Subtítulo bajo el título de cancelación. */
export function etiquetaSubCancelacionTotal(tipo: TipoPrestamo): string {
  if (tipo === 'credito_producto') {
    return 'Ha cancelado el total de su compra a crédito.';
  }
  return 'Ha cancelado su préstamo en su totalidad.\nSu garantía quedará liberada a la brevedad.';
}
