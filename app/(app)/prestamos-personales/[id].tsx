import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Modal, TextInput, RefreshControl, Platform, KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  prestamosPersonalesService,
  calcularSaldo,
  calcularMontoTotal,
  calcularInteresTotal,
  calcularTotalPagado,
  calcularPorcentajeAvance,
  calcularSaldoCuotas,
  cuotasVencidas,
  formatFechaPrestamoPersonal,
} from '@/services/prestamosPersonales.service';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { Colors } from '@/constants/colors';
import { formatCurrency } from '@/utils/amortizacion';
import type {
  PrestamoPersonal,
  PagoPrestamoPersnoal,
  CuotaPrestamoPersonal,
  EstadoPrestamoPersonal,
  MetodoPagoPersonal,
  EstadoCuotaPersonal,
} from '@/types';

// ─── Helpers ──────────────────────────────────────────────────

const ESTADO_VARIANT: Record<EstadoPrestamoPersonal, 'default' | 'success' | 'danger' | 'warning'> = {
  activo: 'warning', pagado: 'success', cancelado: 'danger',
};
const ESTADO_LABEL: Record<EstadoPrestamoPersonal, string> = {
  activo: 'Activo', pagado: 'Pagado', cancelado: 'Cancelado',
};
const METODO_LABEL: Record<string, string> = {
  efectivo: '💵 Efectivo', transferencia: '🏦 Transferencia', otro: '📋 Otro',
};
const CUOTA_ESTADO_COLOR: Record<EstadoCuotaPersonal, string> = {
  pendiente: Colors.muted,
  pagada:    Colors.success,
  vencida:   Colors.danger,
  parcial:   Colors.warning,
};
const CUOTA_ESTADO_LABEL: Record<EstadoCuotaPersonal, string> = {
  pendiente: 'Pendiente', pagada: 'Pagada', vencida: 'Vencida', parcial: 'Parcial',
};
const TIPO_AMORT_LABEL: Record<string, string> = {
  francesa:                'Francesa (cuota fija)',
  alemana:                 'Alemana (capital fijo)',
  solo_interes:            'Solo intereses',
  solo_interes_adelantado: 'Interés adelantado',
  anticipado:              'Anticipado',
};
const TIPO_AMORT_ICON: Record<string, string> = {
  francesa:                '📐',
  alemana:                 '📏',
  solo_interes:            '💸',
  solo_interes_adelantado: '⚡',
  anticipado:              '⚡',
};

function capitalPendienteCuota(c: CuotaPrestamoPersonal): number {
  if (c.estado === 'pagada') return 0;
  const pagadoCapital = Math.min(c.monto_pagado, c.capital);
  return Math.max(0, c.capital - pagadoCapital);
}

function interesPendienteCuota(c: CuotaPrestamoPersonal): number {
  if (c.estado === 'pagada') return 0;
  const pagadoCapital = Math.min(c.monto_pagado, c.capital);
  const pagadoInteres = Math.max(0, c.monto_pagado - pagadoCapital);
  return Math.max(0, c.interes - pagadoInteres);
}

function normalizarFecha(value?: Date): Date {
  const base = value instanceof Date && !isNaN(value.getTime()) ? new Date(value) : new Date();
  base.setHours(12, 0, 0, 0);
  return base;
}
function fechaToIso(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.min(100, pct)}%` as any }]} />
    </View>
  );
}

// ─── Modal de pago libre (tipo SIMPLE) ───────────────────────

interface PagoModalProps {
  visible:   boolean;
  prestamo:  PrestamoPersonal;
  onClose:   () => void;
  onSuccess: () => void;
}

function PagoModal({ visible, prestamo, onClose, onSuccess }: PagoModalProps) {
  const [fechaPago, setFechaPago]         = useState<Date>(normalizarFecha());
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [montoStr, setMontoStr]           = useState('');
  const [metodo, setMetodo]               = useState<MetodoPagoPersonal>('efectivo');
  const [notas, setNotas]                 = useState('');
  const [saving, setSaving]               = useState(false);

  const monto      = parseFloat(montoStr) || 0;
  const saldo      = calcularSaldo(prestamo);
  const montoTotal = calcularMontoTotal(prestamo);
  const totalPag   = calcularTotalPagado(prestamo);

  const abrirFechaPicker = useCallback(() => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fechaPago, mode: 'date', display: 'calendar',
        onChange: (_: DateTimePickerEvent, s?: Date) => { if (s) setFechaPago(normalizarFecha(s)); },
      });
    } else { setShowIosPicker(true); }
  }, [fechaPago]);

  const guardar = async () => {
    setSaving(true);
    try {
      await prestamosPersonalesService.registrarPago({
        prestamo_id:  prestamo.id,
        monto_pagado: monto,
        fecha_pago:   fechaToIso(fechaPago),
        metodo, notas: notas.trim() || undefined,
      });
      if (monto >= saldo && prestamo.estado === 'activo') {
        await prestamosPersonalesService.actualizarEstado(prestamo.id, 'pagado');
      }
      onSuccess(); onClose();
      setMontoStr(''); setNotas(''); setFechaPago(normalizarFecha()); setMetodo('efectivo');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo registrar el pago.');
    } finally { setSaving(false); }
  };

  const handleGuardar = () => {
    if (!monto || monto <= 0) { Alert.alert('Monto inválido', 'Ingresa un monto mayor a 0.'); return; }
    if (monto > saldo) {
      Alert.alert('Monto excede el saldo',
        `Saldo: ${formatCurrency(saldo)}. ¿Registrar ${formatCurrency(monto)} igual?`,
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Registrar', onPress: guardar }]);
      return;
    }
    guardar();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Registrar Pago</Text>
              <Text style={styles.modalSub}>Saldo pendiente: {formatCurrency(saldo)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.modalProgressWrap}>
            <View style={styles.modalProgressTrack}>
              <View style={[styles.modalProgressFill, { width: `${Math.min(100, (totalPag / montoTotal) * 100)}%` as any }]} />
            </View>
            <Text style={styles.modalProgressLabel}>{formatCurrency(totalPag)} pagados de {formatCurrency(montoTotal)}</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
            {/* Fecha del recibo — campo prominente */}
            <TouchableOpacity style={styles.fechaReciboBanner} onPress={abrirFechaPicker} activeOpacity={0.75}>
              <View style={styles.fechaReciboLeft}>
                <Text style={styles.fechaReciboIcon}>📅</Text>
                <View>
                  <Text style={styles.fechaReciboLabel}>Fecha del recibo</Text>
                  <Text style={styles.fechaReciboVal}>{formatFechaPrestamoPersonal(fechaToIso(fechaPago))}</Text>
                </View>
              </View>
              <View style={styles.fechaReciboEditChip}>
                <Text style={styles.fechaReciboEditText}>Cambiar</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.mFieldWrap}>
              <View style={styles.mLabelRow}>
                <Text style={styles.mLabel}>¿Cuánto pagaste? *</Text>
                {saldo > 0 && (
                  <TouchableOpacity style={styles.mSugerBtn} onPress={() => setMontoStr(saldo.toFixed(2))}>
                    <Text style={styles.mSugerText}>Todo: {formatCurrency(saldo)} ↗</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.mInput} placeholder="0.00" placeholderTextColor={Colors.muted}
                keyboardType="decimal-pad" returnKeyType="done" value={montoStr} onChangeText={setMontoStr}
              />
            </View>
            {monto > 0 && (
              <View style={styles.mDesglose}>
                <View style={styles.mDesgloseRow}>
                  <Text style={styles.mDesgloseKey}>Saldo actual</Text>
                  <Text style={[styles.mDesgloseVal, { color: Colors.danger }]}>{formatCurrency(saldo)}</Text>
                </View>
                <View style={styles.mDesgloseRow}>
                  <Text style={styles.mDesgloseKey}>Este pago</Text>
                  <Text style={[styles.mDesgloseVal, { color: Colors.success }]}>−{formatCurrency(monto)}</Text>
                </View>
                <View style={[styles.mDesgloseRow, styles.mDesgloseTotal]}>
                  <Text style={[styles.mDesgloseKey, { fontWeight: '700' }]}>Nuevo saldo</Text>
                  <Text style={[styles.mDesgloseVal, { fontWeight: '900', color: Math.max(0, saldo - monto) === 0 ? Colors.success : Colors.danger }]}>
                    {formatCurrency(Math.max(0, saldo - monto))}{Math.max(0, saldo - monto) === 0 ? '  ✓' : ''}
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.mFieldWrap}>
              <Text style={styles.mLabel}>Método</Text>
              <View style={styles.mMetodos}>
                {(['efectivo', 'transferencia', 'otro'] as MetodoPagoPersonal[]).map(m => (
                  <TouchableOpacity key={m} style={[styles.mMetodoBtn, metodo === m && styles.mMetodoBtnActive]} onPress={() => setMetodo(m)}>
                    <Text style={[styles.mMetodoBtnText, metodo === m && styles.mMetodoBtnTextActive]}>{METODO_LABEL[m]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.mFieldWrap}>
              <Text style={styles.mLabel}>Notas (opcional)</Text>
              <TextInput
                style={[styles.mInput, { minHeight: 70, textAlignVertical: 'top', paddingTop: 10 }]}
                placeholder="Referencia, comprobante…" placeholderTextColor={Colors.muted}
                multiline value={notas} onChangeText={setNotas}
              />
            </View>
            <View style={styles.mBtns}>
              <TouchableOpacity style={styles.mCancelBtn} onPress={onClose}>
                <Text style={styles.mCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mConfirmBtn, saving && { opacity: 0.6 }]} onPress={handleGuardar} disabled={saving}>
                <Text style={styles.mConfirmText}>{saving ? 'Guardando…' : '✓ Registrar pago'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
        {Platform.OS === 'ios' && showIosPicker && (
          <View style={styles.iosPickerCard}>
            <View style={styles.iosPickerHeader}>
              <Text style={styles.iosPickerTitle}>Fecha de pago</Text>
              <TouchableOpacity onPress={() => setShowIosPicker(false)}>
                <Text style={styles.iosPickerDone}>Listo</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker value={fechaPago} mode="date" display="spinner" locale="es-ES"
              onChange={(_: DateTimePickerEvent, s?: Date) => { if (s) setFechaPago(normalizarFecha(s)); }} />
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Modal de pago de cuota (tipo AMORTIZABLE) ────────────────

interface CuotaModalProps {
  visible:   boolean;
  cuota:     CuotaPrestamoPersonal | null;
  onClose:   () => void;
  onSuccess: () => void;
}

function CuotaModal({ visible, cuota, onClose, onSuccess }: CuotaModalProps) {
  const [fechaPago, setFechaPago]         = useState<Date>(normalizarFecha());
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [montoStr, setMontoStr]           = useState('');
  const [metodo, setMetodo]               = useState<MetodoPagoPersonal>('efectivo');
  const [notas, setNotas]                 = useState('');
  const [saving, setSaving]               = useState(false);

  const pendiente = cuota ? cuota.monto_total - cuota.monto_pagado : 0;
  const monto     = parseFloat(montoStr) || 0;

  // Pre-fill con el monto pendiente al abrir
  React.useEffect(() => {
    if (visible && cuota) {
      setMontoStr((cuota.monto_total - cuota.monto_pagado).toFixed(2));
      setFechaPago(normalizarFecha());
      setMetodo('efectivo');
      setNotas('');
    }
  }, [visible, cuota]);

  const abrirFechaPicker = useCallback(() => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fechaPago, mode: 'date', display: 'calendar',
        onChange: (_: DateTimePickerEvent, s?: Date) => { if (s) setFechaPago(normalizarFecha(s)); },
      });
    } else { setShowIosPicker(true); }
  }, [fechaPago]);

  const guardar = async () => {
    if (!cuota) return;
    setSaving(true);
    try {
      await prestamosPersonalesService.pagarCuota({
        cuota, monto_pagado: monto, fecha_pago: fechaToIso(fechaPago), metodo,
        notas: notas.trim() || undefined,
      });
      onSuccess(); onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo registrar el pago.');
    } finally { setSaving(false); }
  };

  const handleGuardar = () => {
    if (!monto || monto <= 0) { Alert.alert('Monto inválido', 'Ingresa un monto mayor a 0.'); return; }
    guardar();
  };

  if (!cuota) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Cuota #{cuota.numero_cuota}</Text>
              <Text style={styles.modalSub}>
                Vence: {formatFechaPrestamoPersonal(cuota.fecha_vencimiento)} · Pendiente: {formatCurrency(pendiente)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Desglose de la cuota */}
          <View style={styles.cuotaDesglose}>
            <View style={styles.cuotaDesgloseItem}>
              <Text style={styles.cuotaDesgloseVal}>{formatCurrency(cuota.capital)}</Text>
              <Text style={styles.cuotaDesgloseKey}>Capital</Text>
            </View>
            <View style={styles.cuotaDesgloseSep} />
            <View style={styles.cuotaDesgloseItem}>
              <Text style={[styles.cuotaDesgloseVal, { color: Colors.warning }]}>{formatCurrency(cuota.interes)}</Text>
              <Text style={styles.cuotaDesgloseKey}>Interés</Text>
            </View>
            <View style={styles.cuotaDesgloseSep} />
            <View style={styles.cuotaDesgloseItem}>
              <Text style={[styles.cuotaDesgloseVal, { color: Colors.primary }]}>{formatCurrency(cuota.monto_total)}</Text>
              <Text style={styles.cuotaDesgloseKey}>Total cuota</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
            {/* Fecha del recibo — campo prominente */}
            <TouchableOpacity style={styles.fechaReciboBanner} onPress={abrirFechaPicker} activeOpacity={0.75}>
              <View style={styles.fechaReciboLeft}>
                <Text style={styles.fechaReciboIcon}>📅</Text>
                <View>
                  <Text style={styles.fechaReciboLabel}>Fecha del recibo</Text>
                  <Text style={styles.fechaReciboVal}>{formatFechaPrestamoPersonal(fechaToIso(fechaPago))}</Text>
                </View>
              </View>
              <View style={styles.fechaReciboEditChip}>
                <Text style={styles.fechaReciboEditText}>Cambiar</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.mFieldWrap}>
              <View style={styles.mLabelRow}>
                <Text style={styles.mLabel}>Monto a pagar *</Text>
                {pendiente > 0 && (
                  <TouchableOpacity style={styles.mSugerBtn} onPress={() => setMontoStr(pendiente.toFixed(2))}>
                    <Text style={styles.mSugerText}>Todo: {formatCurrency(pendiente)} ↗</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.mInput} placeholderTextColor={Colors.muted}
                keyboardType="decimal-pad" returnKeyType="done" value={montoStr} onChangeText={setMontoStr}
              />
            </View>
            <View style={styles.mFieldWrap}>
              <Text style={styles.mLabel}>Método</Text>
              <View style={styles.mMetodos}>
                {(['efectivo', 'transferencia', 'otro'] as MetodoPagoPersonal[]).map(m => (
                  <TouchableOpacity key={m} style={[styles.mMetodoBtn, metodo === m && styles.mMetodoBtnActive]} onPress={() => setMetodo(m)}>
                    <Text style={[styles.mMetodoBtnText, metodo === m && styles.mMetodoBtnTextActive]}>{METODO_LABEL[m]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.mFieldWrap}>
              <Text style={styles.mLabel}>Notas (opcional)</Text>
              <TextInput
                style={[styles.mInput, { minHeight: 60, textAlignVertical: 'top', paddingTop: 10 }]}
                placeholder="Referencia, comprobante…" placeholderTextColor={Colors.muted}
                multiline value={notas} onChangeText={setNotas}
              />
            </View>
            <View style={styles.mBtns}>
              <TouchableOpacity style={styles.mCancelBtn} onPress={onClose}>
                <Text style={styles.mCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mConfirmBtn, saving && { opacity: 0.6 }]} onPress={handleGuardar} disabled={saving}>
                <Text style={styles.mConfirmText}>{saving ? 'Guardando…' : '✓ Pagar cuota'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
        {Platform.OS === 'ios' && showIosPicker && (
          <View style={styles.iosPickerCard}>
            <View style={styles.iosPickerHeader}>
              <Text style={styles.iosPickerTitle}>Fecha de pago</Text>
              <TouchableOpacity onPress={() => setShowIosPicker(false)}>
                <Text style={styles.iosPickerDone}>Listo</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker value={fechaPago} mode="date" display="spinner" locale="es-ES"
              onChange={(_: DateTimePickerEvent, s?: Date) => { if (s) setFechaPago(normalizarFecha(s)); }} />
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Fila de pago (historial simple) ─────────────────────────

function PagoRow({ pago, onEliminar }: { pago: PagoPrestamoPersnoal; onEliminar: () => void }) {
  return (
    <TouchableOpacity style={styles.pagoRow} onLongPress={onEliminar} delayLongPress={600} activeOpacity={0.8}>
      <View style={styles.pagoIconWrap}>
        <Text style={styles.pagoIcon}>💵</Text>
      </View>
      <View style={styles.pagoInfo}>
        <Text style={styles.pagoFecha}>{formatFechaPrestamoPersonal(pago.fecha_pago)}</Text>
        <View style={styles.pagoDesglose}>
          <Text style={styles.pagoCapital}>Capital: {formatCurrency(pago.capital)}</Text>
          {pago.interes > 0 && <Text style={styles.pagoInteres}>  ·  Interés: {formatCurrency(pago.interes)}</Text>}
        </View>
        {pago.notas ? <Text style={styles.pagoNotas}>{pago.notas}</Text> : null}
      </View>
      <View style={styles.pagoRight}>
        <Text style={styles.pagoTotal}>{formatCurrency(pago.monto_pagado)}</Text>
        {pago.metodo && <Text style={styles.pagoMetodo}>{METODO_LABEL[pago.metodo] ?? pago.metodo}</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ─── Fila de cuota (amortizable) ─────────────────────────────

function CuotaRow({ cuota, onPagar }: { cuota: CuotaPrestamoPersonal; onPagar: () => void }) {
  const isPagada   = cuota.estado === 'pagada';
  const isVencida  = cuota.estado === 'vencida';
  const isParcial  = cuota.estado === 'parcial';
  const colorEstado = CUOTA_ESTADO_COLOR[cuota.estado];

  return (
    <TouchableOpacity
      style={[styles.cuotaRow, isPagada && styles.cuotaRowPagada]}
      onPress={isPagada ? undefined : onPagar}
      activeOpacity={isPagada ? 1 : 0.75}
    >
      <View style={[styles.cuotaNumWrap, { backgroundColor: `${colorEstado}20` }]}>
        <Text style={[styles.cuotaNum, { color: colorEstado }]}>
          {isPagada ? '✓' : `${cuota.numero_cuota}`}
        </Text>
      </View>
      <View style={styles.cuotaInfo}>
        <Text style={[styles.cuotaFecha, isVencida && { color: Colors.danger }]}>
          {formatFechaPrestamoPersonal(cuota.fecha_vencimiento)}
          {isVencida ? '  ⚠️' : ''}
        </Text>
        <View style={styles.cuotaSubRow}>
          <Text style={styles.cuotaSubText}>Capital: {formatCurrency(cuota.capital)}</Text>
          {cuota.interes > 0 && <Text style={styles.cuotaSubText}>  ·  Int: {formatCurrency(cuota.interes)}</Text>}
        </View>
        {isParcial && (
          <Text style={{ fontSize: 11, color: Colors.warning, fontWeight: '600' }}>
            Pagado parcial: {formatCurrency(cuota.monto_pagado)}
          </Text>
        )}
      </View>
      <View style={styles.cuotaRight}>
        <Text style={[styles.cuotaMonto, isPagada && { color: Colors.success }]}>
          {formatCurrency(cuota.monto_total)}
        </Text>
        <View style={[styles.cuotaEstadoBadge, { backgroundColor: `${colorEstado}15` }]}>
          <Text style={[styles.cuotaEstadoText, { color: colorEstado }]}>
            {CUOTA_ESTADO_LABEL[cuota.estado]}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Pantalla principal ───────────────────────────────────────

export default function DetallePrestamoPPersonalScreen() {
  const insets = useSafeAreaInsets();
  const { id }  = useLocalSearchParams<{ id: string }>();

  const [prestamo,   setPrestamo]   = useState<PrestamoPersonal | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPago,   setShowPago]   = useState(false);
  const [cuotaSeleccionada, setCuotaSeleccionada] = useState<CuotaPrestamoPersonal | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await prestamosPersonalesService.getById(id);
      if (data.pagos_prestamo_personal) {
        data.pagos_prestamo_personal.sort((a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime());
      }
      // Actualizar cuotas vencidas automáticamente
      if (data.tipo_deuda === 'amortizable' && data.estado === 'activo') {
        await prestamosPersonalesService.actualizarCuotasVencidas(id);
        // Recargar con estados actualizados
        const data2 = await prestamosPersonalesService.getById(id);
        if (data2.pagos_prestamo_personal) {
          data2.pagos_prestamo_personal.sort((a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime());
        }
        setPrestamo(data2);
        return;
      }
      setPrestamo(data);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la deuda.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleEliminarPago = useCallback((pago: PagoPrestamoPersnoal) => {
    Alert.alert('Eliminar pago', `¿Eliminar el pago de ${formatCurrency(pago.monto_pagado)}?`,
      [{ text: 'Cancelar', style: 'cancel' },
       { text: 'Eliminar', style: 'destructive', onPress: async () => {
          try {
            await prestamosPersonalesService.revertirPagoCuota(pago);
            load();
          } catch { Alert.alert('Error', 'No se pudo eliminar.'); }
       }},
      ]);
  }, [load]);

  const handleCambiarEstado = useCallback(() => {
    if (!prestamo) return;
    const opciones: Array<{ text: string; style?: any; onPress: () => void }> = [];
    if (prestamo.estado !== 'pagado') opciones.push({ text: '✅ Marcar como pagado', onPress: async () => {
      try { await prestamosPersonalesService.actualizarEstado(prestamo.id, 'pagado'); load(); }
      catch { Alert.alert('Error', 'No se pudo actualizar.'); }
    }});
    if (prestamo.estado !== 'activo') opciones.push({ text: '🔄 Reactivar', onPress: async () => {
      try { await prestamosPersonalesService.actualizarEstado(prestamo.id, 'activo'); load(); }
      catch { Alert.alert('Error', 'No se pudo actualizar.'); }
    }});
    if (prestamo.estado !== 'cancelado') opciones.push({ text: '❌ Cancelar préstamo', style: 'destructive', onPress: async () => {
      try { await prestamosPersonalesService.actualizarEstado(prestamo.id, 'cancelado'); load(); }
      catch { Alert.alert('Error', 'No se pudo actualizar.'); }
    }});
    opciones.push({ text: 'Cancelar', style: 'cancel', onPress: () => {} });
    Alert.alert('Estado del préstamo', '', opciones);
  }, [prestamo, load]);

  const handleEliminar = useCallback(() => {
    if (!prestamo) return;
    Alert.alert('Eliminar deuda', `¿Eliminar la deuda con ${prestamo.acreedor_nombre}? Se borrarán todos los pagos y cuotas.`,
      [{ text: 'Cancelar', style: 'cancel' },
       { text: 'Eliminar', style: 'destructive', onPress: async () => {
          try { await prestamosPersonalesService.eliminar(prestamo.id); router.replace('/(app)/prestamos-personales' as any); }
          catch { Alert.alert('Error', 'No se pudo eliminar.'); }
       }},
      ]);
  }, [prestamo]);

  if (loading) return <LoadingScreen label="Cargando deuda…" />;
  if (!prestamo) return null;

  const esAmortizable  = prestamo.tipo_deuda === 'amortizable';
  const montoTotal     = calcularMontoTotal(prestamo);
  const interesTotal   = calcularInteresTotal(prestamo);
  const totalPagado    = calcularTotalPagado(prestamo);
  const saldo          = esAmortizable ? calcularSaldoCuotas(prestamo) : calcularSaldo(prestamo);
  const pct            = calcularPorcentajeAvance(prestamo);
  const pagos          = prestamo.pagos_prestamo_personal ?? [];
  const cuotas         = prestamo.cuotas_prestamo_personal ?? [];
  const vencidas       = esAmortizable ? cuotasVencidas(prestamo) : [];
  const cuotasPagadas  = cuotas.filter(c => c.estado === 'pagada').length;

  const capitalPendiente = esAmortizable
    ? cuotas.reduce((s, c) => s + capitalPendienteCuota(c), 0)
    : Math.min(prestamo.monto_original, saldo);
  const interesPendiente = esAmortizable
    ? cuotas.reduce((s, c) => s + interesPendienteCuota(c), 0)
    : Math.max(0, saldo - capitalPendiente);
  const mostrarDesglose  = esAmortizable && interesTotal > 0;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {/* Barra superior */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Detalle Deuda</Text>
        <TouchableOpacity onPress={handleCambiarEstado} style={styles.menuBtn}>
          <Text style={styles.menuBtnText}>⋯</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
      >
        {/* Hero — estilo créditos con garantía */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroAmountLabel}>Deuda (capital)</Text>
              <Text style={styles.heroAmount}>{formatCurrency(prestamo.monto_original)}</Text>
              <Text style={styles.heroClient}>{prestamo.acreedor_nombre}</Text>
              {prestamo.descripcion ? (
                <Text style={styles.heroDesc} numberOfLines={1}>{prestamo.descripcion}</Text>
              ) : null}
            </View>
            <Badge label={ESTADO_LABEL[prestamo.estado]} variant={ESTADO_VARIANT[prestamo.estado]} />
          </View>

          <View style={styles.heroPills}>
            {esAmortizable ? (
              <>
                <View style={styles.heroPill}>
                  <Text style={styles.heroPillText}>
                    📅 {prestamo.plazo_meses ?? cuotas.length} meses
                  </Text>
                </View>
                <View style={styles.heroPill}>
                  <Text style={styles.heroPillText}>
                    % {(prestamo.tasa_mensual ?? 0).toFixed(2)}% mensual
                  </Text>
                </View>
                <View style={styles.heroPill}>
                  <Text style={styles.heroPillText}>
                    {TIPO_AMORT_ICON[prestamo.tipo_amortizacion ?? ''] ?? '📐'}{' '}
                    {TIPO_AMORT_LABEL[prestamo.tipo_amortizacion ?? ''] ?? prestamo.tipo_amortizacion}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.heroPill}>
                  <Text style={styles.heroPillText}>
                    📅 Desde {formatFechaPrestamoPersonal(prestamo.fecha_inicio)}
                  </Text>
                </View>
                {prestamo.tasa_interes > 0 ? (
                  <View style={styles.heroPill}>
                    <Text style={styles.heroPillText}>% {prestamo.tasa_interes}% fijo</Text>
                  </View>
                ) : (
                  <View style={styles.heroPill}>
                    <Text style={styles.heroPillText}>✅ Sin interés</Text>
                  </View>
                )}
                <View style={styles.heroPill}>
                  <Text style={styles.heroPillText}>💰 Deuda simple</Text>
                </View>
              </>
            )}
          </View>

          {vencidas.length > 0 && (
            <View style={styles.vencidaBannerHero}>
              <Text style={styles.vencidaBannerText}>
                ⚠️  {vencidas.length} cuota{vencidas.length > 1 ? 's' : ''} vencida{vencidas.length > 1 ? 's' : ''}
              </Text>
            </View>
          )}

          {/* Desglose capital / intereses (amortizable con interés) */}
          {mostrarDesglose ? (
            <View style={styles.desgloseRow}>
              <View style={styles.desgloseCell}>
                <Text style={styles.desgloseCellLabel}>Capital pendiente</Text>
                <Text style={styles.desgloseCellValue}>{formatCurrency(capitalPendiente)}</Text>
              </View>
              <View style={styles.desgloseDivider} />
              <View style={styles.desgloseCell}>
                <Text style={styles.desgloseCellLabel}>Intereses pendientes</Text>
                <Text style={[styles.desgloseCellValue, { color: Colors.accent }]}>
                  {formatCurrency(interesPendiente)}
                </Text>
              </View>
            </View>
          ) : !esAmortizable && interesTotal > 0 && saldo > 0 ? (
            <View style={styles.desgloseRow}>
              <View style={styles.desgloseCell}>
                <Text style={styles.desgloseCellLabel}>Interés incluido</Text>
                <Text style={[styles.desgloseCellValue, { color: Colors.accent }]}>
                  {formatCurrency(interesTotal)}
                </Text>
              </View>
              <View style={styles.desgloseDivider} />
              <View style={styles.desgloseCell}>
                <Text style={styles.desgloseCellLabel}>Deuda original</Text>
                <Text style={styles.desgloseCellValue}>{formatCurrency(prestamo.monto_original)}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.totalPagarRow}>
            <Text style={styles.totalPagarLabel}>Total por pagar</Text>
            <Text style={[styles.totalPagarValue, saldo === 0 && { color: Colors.success }]}>
              {formatCurrency(saldo)}
            </Text>
          </View>

          {/* Progreso */}
          <View style={styles.progressSection}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Progreso de pago</Text>
              <Text style={styles.progressPct}>
                {esAmortizable && cuotas.length > 0
                  ? `${cuotasPagadas}/${cuotas.length} cuotas`
                  : `${pct.toFixed(0)}% pagado`}
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
            </View>
          </View>
        </View>
        {/* ── Estadísticas ── */}
        <View style={[styles.card, styles.cardRow]}>
          {esAmortizable ? (
            <>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: Colors.success }]}>{cuotasPagadas}</Text>
                <Text style={styles.statLabel}>Cuotas pagadas</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: vencidas.length > 0 ? Colors.danger : Colors.muted }]}>
                  {vencidas.length}
                </Text>
                <Text style={styles.statLabel}>Vencidas</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{cuotas.length - cuotasPagadas}</Text>
                <Text style={styles.statLabel}>Pendientes</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: Colors.success }]}>{formatCurrency(totalPagado)}</Text>
                <Text style={styles.statLabel}>Total pagado</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: interesTotal > 0 ? Colors.warning : Colors.muted }]}>
                  {interesTotal > 0 ? formatCurrency(interesTotal) : 'Sin interés'}
                </Text>
                <Text style={styles.statLabel}>Interés total</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{pagos.length}</Text>
                <Text style={styles.statLabel}>Pagos hechos</Text>
              </View>
            </>
          )}
        </View>

        {/* Descripción */}
        {prestamo.descripcion ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>DESCRIPCIÓN</Text>
            <Text style={styles.descText}>{prestamo.descripcion}</Text>
          </View>
        ) : null}

        {/* ── AMORTIZABLE: Cronograma de cuotas ── */}
        {esAmortizable && cuotas.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardLabelRow}>
              <Text style={styles.cardLabel}>CRONOGRAMA DE CUOTAS</Text>
              <Text style={styles.cardLabelHint}>{cuotasPagadas}/{cuotas.length} pagadas</Text>
            </View>
            {cuotas.map((c) => (
              <CuotaRow
                key={c.id}
                cuota={c}
                onPagar={() => setCuotaSeleccionada(c)}
              />
            ))}
          </View>
        )}

        {/* ── SIMPLE / historial de pagos ── */}
        {!esAmortizable && (
          <View style={styles.card}>
            <View style={styles.cardLabelRow}>
              <Text style={styles.cardLabel}>HISTORIAL DE PAGOS</Text>
              <Text style={styles.cardLabelHint}>Mantén presionado para eliminar</Text>
            </View>
            {pagos.length === 0 ? (
              <View style={styles.emptyPagos}>
                <Text style={styles.emptyPagosIcon}>📋</Text>
                <Text style={styles.emptyPagosText}>Sin pagos registrados aún</Text>
                <Text style={styles.emptyPagosSub}>Toca "+ Registrar pago" para agregar</Text>
              </View>
            ) : (
              pagos.map((p) => (
                <PagoRow key={p.id} pago={p} onEliminar={() => handleEliminarPago(p)} />
              ))
            )}
          </View>
        )}

        {/* Historial de pagos vinculados a cuotas (amortizable) */}
        {esAmortizable && pagos.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardLabelRow}>
              <Text style={styles.cardLabel}>HISTORIAL DE PAGOS</Text>
              <Text style={styles.cardLabelHint}>Mantén presionado para revertir</Text>
            </View>
            {pagos.map((p) => (
              <PagoRow key={p.id} pago={p} onEliminar={() => handleEliminarPago(p)} />
            ))}
          </View>
        )}

        {/* ── Acciones ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>ACCIONES</Text>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCambiarEstado}>
            <Text style={styles.actionIcon}>🔄</Text>
            <Text style={styles.actionText}>Cambiar estado</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={handleEliminar}>
            <Text style={styles.actionIcon}>🗑️</Text>
            <Text style={[styles.actionText, { color: Colors.danger }]}>Eliminar deuda</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── FAB ── */}
      {prestamo.estado === 'activo' && !esAmortizable && (
        <View style={[styles.fab, { bottom: insets.bottom + 20 }]}>
          <TouchableOpacity style={styles.fabBtn} onPress={() => setShowPago(true)} activeOpacity={0.85}>
            <Text style={styles.fabText}>+ Registrar pago</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modales */}
      <PagoModal
        visible={showPago}
        prestamo={prestamo}
        onClose={() => setShowPago(false)}
        onSuccess={() => load()}
      />
      <CuotaModal
        visible={!!cuotaSeleccionada}
        cuota={cuotaSeleccionada}
        onClose={() => setCuotaSeleccionada(null)}
        onSuccess={() => { setCuotaSeleccionada(null); load(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 22, color: Colors.white },
  topBarTitle: { fontSize: 17, fontWeight: '800', color: Colors.white },
  menuBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  menuBtnText: { fontSize: 20, color: Colors.white, lineHeight: 24 },

  scroll: { padding: 16, gap: 12 },

  hero: {
    backgroundColor: Colors.primary, borderRadius: 16, padding: 20, gap: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  heroAmountLabel: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2,
  },
  heroAmount: { fontSize: 28, fontWeight: '900', color: Colors.white, letterSpacing: -0.5 },
  heroClient: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4, fontWeight: '600' },
  heroDesc: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2, fontStyle: 'italic' },
  heroPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  heroPill: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  heroPillText: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },

  vencidaBannerHero: {
    backgroundColor: `${Colors.danger}30`, borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: `${Colors.danger}50`,
  },
  vencidaBannerText: { fontSize: 13, fontWeight: '700', color: '#fecaca', textAlign: 'center' },

  desgloseRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 14,
  },
  desgloseCell: { flex: 1, alignItems: 'center', gap: 4 },
  desgloseCellLabel: { fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: '600', textAlign: 'center' },
  desgloseCellValue: { fontSize: 16, fontWeight: '800', color: Colors.white },
  desgloseDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.15)' },

  totalPagarRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)',
  },
  totalPagarLabel: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  totalPagarValue: { fontSize: 18, fontWeight: '900', color: Colors.accent },

  progressSection: { gap: 8 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 12, color: 'rgba(255,255,255,0.55)' },
  progressPct: { fontSize: 12, color: Colors.accent, fontWeight: '700' },
  progressBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 3 },

  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2, gap: 10,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  cardLabel: { fontSize: 10, fontWeight: '700', color: Colors.muted, letterSpacing: 1.2 },
  cardLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabelHint: { fontSize: 10, color: Colors.muted },

  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statNum: { fontSize: 15, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 10, color: Colors.muted, fontWeight: '600', textAlign: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: Colors.border },

  descText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  // Cuotas
  cuotaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cuotaRowPagada: { opacity: 0.6 },
  cuotaNumWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cuotaNum: { fontSize: 13, fontWeight: '800' },
  cuotaInfo: { flex: 1, gap: 2 },
  cuotaFecha: { fontSize: 13, fontWeight: '600', color: Colors.text },
  cuotaSubRow: { flexDirection: 'row' },
  cuotaSubText: { fontSize: 11, color: Colors.muted },
  cuotaRight: { alignItems: 'flex-end', gap: 4 },
  cuotaMonto: { fontSize: 15, fontWeight: '800', color: Colors.text },
  cuotaEstadoBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  cuotaEstadoText: { fontSize: 10, fontWeight: '700' },

  // Pagos
  emptyPagos: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  emptyPagosIcon: { fontSize: 32 },
  emptyPagosText: { fontSize: 14, fontWeight: '600', color: Colors.text },
  emptyPagosSub: { fontSize: 12, color: Colors.muted },

  pagoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  pagoIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: `${Colors.success}12`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pagoIcon: { fontSize: 18 },
  pagoInfo: { flex: 1, gap: 2 },
  pagoFecha: { fontSize: 13, fontWeight: '600', color: Colors.text },
  pagoDesglose: { flexDirection: 'row' },
  pagoCapital: { fontSize: 12, color: Colors.success },
  pagoInteres: { fontSize: 12, color: Colors.warning },
  pagoNotas: { fontSize: 11, color: Colors.muted, marginTop: 1 },
  pagoRight: { alignItems: 'flex-end', gap: 3 },
  pagoTotal: { fontSize: 15, fontWeight: '800', color: Colors.text },
  pagoMetodo: { fontSize: 10, color: Colors.muted },

  // Acciones
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  actionBtnDanger: { borderBottomWidth: 0 },
  actionIcon: { fontSize: 18 },
  actionText: { fontSize: 14, fontWeight: '600', color: Colors.text },

  // FAB
  fab: { position: 'absolute', left: 20, right: 20 },
  fabBtn: {
    backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  fabText: { color: Colors.white, fontSize: 16, fontWeight: '800' },

  // Modal compartido
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingTop: 12 },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { fontSize: 14, color: Colors.muted, fontWeight: '700' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  modalSub: { fontSize: 13, color: Colors.muted, marginTop: 2 },
  modalProgressWrap: { paddingHorizontal: 20, paddingVertical: 10, gap: 4 },
  modalProgressTrack: { height: 5, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  modalProgressFill: { height: 5, backgroundColor: Colors.success, borderRadius: 3 },
  modalProgressLabel: { fontSize: 11, color: Colors.muted, fontWeight: '600' },
  modalScroll: { padding: 20, gap: 14, paddingBottom: 32 },

  // Desglose cuota en modal
  cuotaDesglose: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cuotaDesgloseItem: { flex: 1, alignItems: 'center', gap: 2 },
  cuotaDesgloseVal: { fontSize: 15, fontWeight: '800', color: Colors.text },
  cuotaDesgloseKey: { fontSize: 10, color: Colors.muted, fontWeight: '600' },
  cuotaDesgloseSep: { width: 1, height: 32, backgroundColor: Colors.border },

  // Campos modal
  mFieldWrap: { gap: 6 },
  mLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  mLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mSugerBtn: { backgroundColor: `${Colors.warning}15`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  mSugerText: { fontSize: 11, color: Colors.warning, fontWeight: '700' },
  mInput: { backgroundColor: Colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: Colors.text },
  mDateBtn: { backgroundColor: Colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12 },
  mDateBtnText: { fontSize: 14, color: Colors.text, fontWeight: '500' },

  // Fecha del recibo — banner prominente en el modal de pago
  fechaReciboBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: `${Colors.primary}10`,
    borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: `${Colors.primary}30`,
  },
  fechaReciboLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fechaReciboIcon: { fontSize: 28 },
  fechaReciboLabel: { fontSize: 11, fontWeight: '600', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  fechaReciboVal: { fontSize: 17, fontWeight: '800', color: Colors.primary, marginTop: 2 },
  fechaReciboEditChip: {
    backgroundColor: Colors.primary, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  fechaReciboEditText: { fontSize: 12, fontWeight: '700', color: Colors.white },

  mDesglose: { backgroundColor: Colors.surface2, borderRadius: 10, padding: 12, gap: 4 },
  mDesgloseRow: { flexDirection: 'row', justifyContent: 'space-between' },
  mDesgloseTotal: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 6, marginTop: 2 },
  mDesgloseKey: { fontSize: 12, color: Colors.textSecondary },
  mDesgloseVal: { fontSize: 13, fontWeight: '700', color: Colors.text },

  mMetodos: { flexDirection: 'row', gap: 8 },
  mMetodoBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  mMetodoBtnActive: { backgroundColor: `${Colors.accent}15`, borderColor: Colors.accent },
  mMetodoBtnText: { fontSize: 12, color: Colors.muted, fontWeight: '600' },
  mMetodoBtnTextActive: { color: Colors.accent },

  mBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  mCancelBtn: { flex: 1, backgroundColor: Colors.surface2, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  mCancelText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  mConfirmBtn: { flex: 2, backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  mConfirmText: { fontSize: 14, fontWeight: '800', color: Colors.white },

  progressTrack: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },

  iosPickerCard: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  iosPickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  iosPickerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  iosPickerDone: { fontSize: 16, fontWeight: '700', color: Colors.accent },
});
