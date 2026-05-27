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

export type GarantiaType = 'inmueble' | 'vehiculo' | 'joya' | 'electrodomestico' | 'cheque' | 'letra_de_cambio' | 'otro';
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
  alias?: string;
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
  | 'ejecutado'
  | 'renovado';

export type TipoAmortizacion = 'francesa' | 'alemana' | 'solo_interes' | 'anticipado' | 'solo_interes_adelantado';

export type TipoPrestamo = 'prestamo' | 'credito_producto';

export interface Prestamo {
  id: string;
  cliente_id: string;
  garantia_id?: string;
  oficial_id: string;
  monto_principal: number;
  tasa_mensual: number;
  plazo_meses: number;
  plazo_dias?: number;
  tipo_amortizacion: TipoAmortizacion;
  tipo_prestamo: TipoPrestamo;
  descripcion_producto?: string;
  comision_apertura: number;
  estado: PrestamoEstado;
  fecha_desembolso?: string;
  fecha_vencimiento?: string;
  observaciones?: string;
  contrato_url?: string;
  prestamo_padre_id?: string;
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
  estado: CuotaEstado;
  fecha_pago?: string;
}

export interface Pago {
  id: string;
  cuota_id: string;
  cajero_id: string;
  monto_pagado: number;
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
}

export interface AbonoCapital {
  id: string;
  prestamo_id: string;
  cajero_id: string;
  monto_abono: number;
  saldo_anterior: number;
  saldo_nuevo: number;
  metodo_pago: string;
  numero_recibo: string;
  observaciones?: string;
  n_cuotas_restantes: number;
  created_at: string;
  anulado: boolean;
  anulado_at?: string;
  anulado_por?: string;
  motivo_anulacion?: string;
}

export interface ResultadoAbonoCapital {
  abono_id: string;
  recibo_num: string;
  saldo_anterior: number;
  saldo_nuevo: number;
  n_cuotas: number;
  nueva_cuota_monto: number;
  prestamo_cancelado?: boolean;
  interes_ahorrado?: number;
}

export interface ResultadoAnulacionAbono {
  ok: boolean;
  abono_id: string;
  recibo: string;
  monto: number;
  saldo_restaurado: number;
}

// ─── Préstamos Personales ────────────────────────────────────
export type EstadoPrestamoPersonal   = 'activo' | 'pagado' | 'cancelado';
export type MetodoPagoPersonal       = 'efectivo' | 'transferencia' | 'otro';
export type TipoDeudaPersonal        = 'simple' | 'amortizable';
export type EstadoCuotaPersonal      = 'pendiente' | 'pagada' | 'vencida' | 'parcial';
export type TipoAmortizacionPersonal = 'francesa' | 'alemana' | 'solo_interes' | 'solo_interes_adelantado' | 'anticipado';

export interface CuotaPrestamoPersonal {
  id:                string;
  prestamo_id:       string;
  numero_cuota:      number;
  fecha_vencimiento: string;
  capital:           number;
  interes:           number;
  monto_total:       number;
  monto_pagado:      number;
  estado:            EstadoCuotaPersonal;
  fecha_pago?:       string;
  notas?:            string;
  created_at:        string;
}

export interface PagoPrestamoPersnoal {
  id:           string;
  prestamo_id:  string;
  cuota_id?:    string;
  monto_pagado: number;
  capital:      number;
  interes:      number;
  fecha_pago:   string;
  metodo?:      MetodoPagoPersonal;
  notas?:       string;
  created_at:   string;
}

export interface PrestamoPersonal {
  id:                string;
  user_id:           string;
  acreedor_nombre:   string;
  monto_original:    number;
  tasa_interes:      number;              // % fija para tipo 'simple'
  tipo_deuda:        TipoDeudaPersonal;
  tasa_mensual?:     number;             // % mensual para tipo 'amortizable'
  plazo_meses?:      number;
  plazo_dias?:       number;
  tipo_amortizacion?: TipoAmortizacionPersonal;
  fecha_inicio:      string;
  descripcion?:      string;
  estado:            EstadoPrestamoPersonal;
  notas?:            string;
  created_at:        string;
  updated_at:        string;
  pagos_prestamo_personal?:  PagoPrestamoPersnoal[];
  cuotas_prestamo_personal?: CuotaPrestamoPersonal[];
}

// ─── Cadenas de Ahorro ───────────────────────────────────────
export type FrecuenciaCadena = 'semanal' | 'quincenal' | 'mensual';
export type EstadoCadena     = 'activa' | 'completada' | 'cancelada';

export interface CadenaPuesto {
  id:           string;
  cadena_id:    string;
  numero_turno: number;
  notas?:       string;
  created_at:   string;
}

export interface CadenaRonda {
  id:                  string;
  cadena_id:           string;
  numero_ronda:        number;
  fecha_vencimiento:   string;
  beneficiario_nombre?: string;
  pagado:              boolean;
  fecha_pago?:         string;
  notas?:              string;
  created_at:          string;
}

export interface CadenaAhorro {
  id:                string;
  user_id:           string;
  nombre:            string;
  descripcion?:      string;
  num_participantes: number;
  monto_aporte:      number;
  frecuencia:        FrecuenciaCadena;
  fecha_inicio:      string;
  estado:            EstadoCadena;
  notas?:            string;
  created_at:        string;
  updated_at:        string;
  cadena_puestos?:   CadenaPuesto[];
  cadena_rondas?:    CadenaRonda[];
}
