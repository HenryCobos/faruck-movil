export type UserRole = 'admin' | 'oficial' | 'cajero' | 'auditor';

export interface Profile {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRole;
  activo: boolean;
  telefono?: string;
  created_at: string;
  updated_at: string;
}

export type GarantiaType = 'inmueble' | 'vehiculo' | 'joya' | 'electrodomestico' | 'otro';
export type GarantiaEstado = 'disponible' | 'en_garantia' | 'devuelta' | 'ejecutada';

export interface Garantia {
  id: string;
  cliente_id: string;
  tipo: GarantiaType;
  descripcion: string;
  valor_avaluo: number;
  fotos: string[];
  documentos: Record<string, string>;
  estado: GarantiaEstado;
  observaciones?: string;
  created_at: string;
  updated_at: string;
}

export type ClienteEstado = 'activo' | 'inactivo' | 'moroso';

export interface Cliente {
  id: string;
  nombre: string;
  apellido: string;
  documento_tipo: 'ci' | 'pasaporte' | 'ruc';
  documento_numero: string;
  telefono: string;
  email?: string;
  direccion: string;
  foto_url?: string;
  estado: ClienteEstado;
  scoring: number;
  created_at: string;
  updated_at: string;
}

export type PrestamoEstado =
  | 'solicitado'
  | 'aprobado'
  | 'activo'
  | 'cancelado'
  | 'vencido'
  | 'ejecutado';

export type TipoAmortizacion = 'francesa' | 'alemana';

export interface Prestamo {
  id: string;
  cliente_id: string;
  garantia_id: string;
  oficial_id: string;
  monto_principal: number;
  tasa_mensual: number;
  plazo_meses: number;
  tipo_amortizacion: TipoAmortizacion;
  comision_apertura: number;
  estado: PrestamoEstado;
  fecha_desembolso?: string;
  fecha_vencimiento?: string;
  observaciones?: string;
  contrato_url?: string;
  created_at: string;
  updated_at: string;
  cliente?: Cliente;
  garantia?: Garantia;
}

export type CuotaEstado = 'pendiente' | 'pagada' | 'vencida' | 'parcial';

export interface Cuota {
  id: string;
  prestamo_id: string;
  numero_cuota: number;
  fecha_vencimiento: string;
  capital: number;
  interes: number;
  monto_total: number;
  mora_acumulada: number;
  estado: CuotaEstado;
  fecha_pago?: string;
}

export interface Pago {
  id: string;
  cuota_id: string;
  cajero_id: string;
  monto_pagado: number;
  mora_cobrada: number;
  fecha_pago: string;
  metodo_pago: 'efectivo' | 'transferencia' | 'cheque';
  numero_recibo: string;
  observaciones?: string;
}

export interface DashboardStats {
  cartera_total: number;
  prestamos_activos: number;
  cuotas_vencidas: number;
  ingresos_mes: number;
  clientes_activos: number;
  mora_total: number;
}
