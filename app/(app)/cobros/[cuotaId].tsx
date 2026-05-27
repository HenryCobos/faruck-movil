import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cobrosService, CuotaPendiente } from '@/services/cobros.service';
import { useAuthStore } from '@/stores/auth.store';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { formatCurrency, parseFechaLocal } from '@/utils/amortizacion';
import { Colors } from '@/constants/colors';

const METODOS = [
  { label: 'Efectivo',      value: 'efectivo',      icon: '💵' },
  { label: 'Transferencia', value: 'transferencia', icon: '🏦' },
  { label: 'Cheque',        value: 'cheque',        icon: '📄' },
];

// ─── Helpers de fecha ─────────────────────────────────────────

function normalizarFecha(value?: Date): Date {
  const base = value instanceof Date && !isNaN(value.getTime()) ? new Date(value) : new Date();
  base.setHours(12, 0, 0, 0);
  return base;
}

function fechaToIso(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatFechaLarga(date: Date): string {
  return date.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ─── Componente ───────────────────────────────────────────────

function LineItem({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <View style={styles.lineItem}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, bold && styles.lineBold, color ? { color } : undefined]}>{value}</Text>
    </View>
  );
}

export default function RegistrarPagoScreen() {
  const { cuotaId } = useLocalSearchParams<{ cuotaId: string }>();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();

  const [cuota, setCuota]               = useState<CuotaPendiente | null>(null);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [metodoPago, setMetodoPago]     = useState('efectivo');
  const [observaciones, setObservaciones] = useState('');

  // ── Fecha del recibo ───────────────────────────────────────
  const [fechaPago, setFechaPago]             = useState<Date>(normalizarFecha());
  const [showFechaPicker, setShowFechaPicker] = useState(false);
  // Ref para el draft del picker en iOS: evita re-renders durante el scroll
  // que causarían que el picker "salte" de vuelta a la posición anterior.
  const fechaPagoDraftRef = useRef<Date>(normalizarFecha());

  const abrirFechaPicker = useCallback(() => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value:   normalizarFecha(fechaPago),
        mode:    'date',
        display: 'calendar',
        maximumDate: normalizarFecha(),
        onChange: (_: DateTimePickerEvent, selected?: Date) => {
          if (selected) setFechaPago(normalizarFecha(selected));
        },
      });
    } else {
      fechaPagoDraftRef.current = normalizarFecha(fechaPago);
      setShowFechaPicker(true);
    }
  }, [fechaPago]);

  // ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!cuotaId) { router.canGoBack() ? router.back() : router.replace('/(app)/cobros'); return; }
    cobrosService.getCuotaById(cuotaId)
      .then(setCuota)
      .catch(() => { Alert.alert('Error', 'No se pudo cargar la cuota'); router.canGoBack() ? router.back() : router.replace('/(app)/cobros'); })
      .finally(() => setLoading(false));
  }, [cuotaId]);

  if (loading) return <LoadingScreen />;
  if (!cuota) return null;

  const totalPagar = cuota.monto_total;
  const esHoy = fechaToIso(fechaPago) === fechaToIso(new Date());

  const hoyRef = new Date();
  const esMesDistinto =
    fechaPago.getFullYear() !== hoyRef.getFullYear() ||
    fechaPago.getMonth()    !== hoyRef.getMonth();
  const nombreMesPago = fechaPago.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  const handleConfirmar = () => {
    const fechaIso = fechaToIso(fechaPago);
    const fechaLabel = formatFechaLarga(fechaPago);

    Alert.alert(
      'Confirmar Pago',
      `¿Registrar pago de ${formatCurrency(totalPagar)} para ${cuota.cliente_nombre} ${cuota.cliente_apellido}?\n\nFecha del recibo: ${fechaLabel}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            if (!profile?.id) return;
            setSaving(true);
            try {
              const resultado = await cobrosService.registrarPago({
                cuotaId:      cuota.id,
                cajeroId:     profile.id,
                montoPagado:  totalPagar,
                metodoPago:   metodoPago as any,
                observaciones: observaciones || undefined,
                fechaPago:    fechaIso,
              });
              router.replace({
                pathname: '/(app)/cobros/recibo',
                params: {
                  reciboNum:      resultado.recibo_num,
                  clienteNombre:  `${cuota.cliente_nombre} ${cuota.cliente_apellido}`,
                  numeroCuota:    String(cuota.numero_cuota),
                  capital:        String(resultado.capital),
                  interes:        String(resultado.interes),
                  total:          String(resultado.total),
                  metodo:         metodoPago,
                  cancelado:      resultado.prestamo_cancelado ? '1' : '0',
                  fechaPago:      fechaIso,
                  saldoPendiente: String(resultado.saldo_pendiente ?? 0),
                },
              } as any);
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'No se pudo registrar el pago');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/cobros')}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Registrar Pago</Text>
          <Text style={styles.headerSub}>Cuota #{cuota.numero_cuota}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Cliente */}
          <View style={styles.clienteCard}>
            <View style={styles.clienteAvatar}>
              <Text style={styles.clienteInitials}>
                {cuota.cliente_nombre[0]}{cuota.cliente_apellido[0]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.clienteNombre}>{cuota.cliente_nombre} {cuota.cliente_apellido}</Text>
              <Text style={styles.clienteDoc}>{cuota.cliente_documento} · {cuota.cliente_telefono}</Text>
              {cuota.garantia_descripcion && (
                <Text style={styles.garantiaInfo}>📦 {cuota.garantia_tipo} — {cuota.garantia_descripcion?.substring(0, 35)}...</Text>
              )}
            </View>
          </View>

          {/* Detalle cuota */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cuota #{cuota.numero_cuota}</Text>
            <LineItem
              label="Fecha de vencimiento"
              value={parseFechaLocal(cuota.fecha_vencimiento).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })}
            />
            <LineItem label="Capital"     value={formatCurrency(cuota.capital)}     color={Colors.info} />
            <LineItem label="Interés"     value={formatCurrency(cuota.interes)}     color={Colors.accent} />
            <LineItem label="Total cuota" value={formatCurrency(cuota.monto_total)} bold />
          </View>

          {/* ── Fecha del recibo ── */}
          <TouchableOpacity
            style={styles.fechaReciboCard}
            onPress={abrirFechaPicker}
            activeOpacity={0.75}
          >
            <View style={styles.fechaReciboLeft}>
              <Text style={styles.fechaReciboIcon}>📅</Text>
              <View>
                <Text style={styles.fechaReciboLabel}>FECHA DEL RECIBO</Text>
                <Text style={styles.fechaReciboVal}>{formatFechaLarga(fechaPago)}</Text>
                {!esHoy && (
                  <Text style={styles.fechaReciboHint}>Fecha personalizada</Text>
                )}
              </View>
            </View>
            <View style={[styles.fechaReciboChip, !esHoy && styles.fechaReciboChipCustom]}>
              <Text style={[styles.fechaReciboChipText, !esHoy && styles.fechaReciboChipTextCustom]}>
                {esHoy ? 'Hoy · Cambiar' : 'Cambiar'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Advertencia fecha de otro mes */}
          {esMesDistinto && (
            <View style={styles.mesBanner}>
              <Text style={styles.mesBannerIcon}>⚠️</Text>
              <Text style={styles.mesBannerText}>
                Esta fecha pertenece a <Text style={styles.mesBannerMes}>{nombreMesPago}</Text>. El pago no sumará al resumen del mes actual en el dashboard.
              </Text>
            </View>
          )}

          {/* Total a pagar */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>TOTAL A PAGAR</Text>
            <Text style={styles.totalAmount}>{formatCurrency(totalPagar)}</Text>
          </View>

          {/* Método y observaciones */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Método de Pago</Text>
            <Select options={METODOS} value={metodoPago} onSelect={setMetodoPago} />
            <Input
              label="Referencia / Observación (opcional)"
              placeholder="N° de transferencia, comprobante..."
              value={observaciones}
              onChangeText={setObservaciones}
            />
          </View>

          <Button
            title={`Confirmar Pago · ${formatCurrency(totalPagar)}`}
            onPress={handleConfirmar}
            loading={saving}
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* iOS Date Picker Modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={showFechaPicker} transparent animationType="slide">
          <View style={styles.iosOverlay}>
            <View style={styles.iosCard}>
              <View style={styles.iosHeader}>
                <TouchableOpacity onPress={() => setShowFechaPicker(false)}>
                  <Text style={styles.iosCancelar}>Cancelar</Text>
                </TouchableOpacity>
                <Text style={styles.iosTitle}>Fecha del recibo</Text>
                <TouchableOpacity onPress={() => {
                  setFechaPago(fechaPagoDraftRef.current);
                  setShowFechaPicker(false);
                }}>
                  <Text style={styles.iosConfirmar}>Confirmar</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={fechaPagoDraftRef.current}
                mode="date"
                display="spinner"
                locale="es-ES"
                maximumDate={normalizarFecha()}
                onChange={(_: DateTimePickerEvent, selected?: Date) => {
                  // Solo actualizar el ref, sin setState: evita re-renders
                  // que harían que el picker salte de posición durante el scroll.
                  if (selected) {
                    fechaPagoDraftRef.current = normalizarFecha(selected);
                  }
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  header: {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 28, color: Colors.white, lineHeight: 32, marginTop: -2 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.white },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },

  scroll: { padding: 16, gap: 14 },

  clienteCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  clienteAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: `${Colors.accent}22`, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  clienteInitials: { fontSize: 18, fontWeight: '800', color: Colors.accent },
  clienteNombre: { fontSize: 16, fontWeight: '700', color: Colors.text },
  clienteDoc: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  garantiaInfo: { fontSize: 11, color: Colors.muted, marginTop: 3 },

  section: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 18, gap: 2,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border },
  lineLabel: { fontSize: 13, color: Colors.muted, flex: 1 },
  lineValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
  lineBold: { fontSize: 15, fontWeight: '800' },

  // Fecha del recibo
  fechaReciboCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: `${Colors.primary}35`,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  fechaReciboLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fechaReciboIcon: { fontSize: 32 },
  fechaReciboLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.muted,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  fechaReciboVal: { fontSize: 17, fontWeight: '800', color: Colors.primary, marginTop: 3 },
  fechaReciboHint: { fontSize: 11, color: Colors.warning, fontWeight: '600', marginTop: 2 },
  fechaReciboChip: {
    backgroundColor: `${Colors.primary}15`,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: `${Colors.primary}30`,
  },
  fechaReciboChipCustom: {
    backgroundColor: `${Colors.warning}15`,
    borderColor: `${Colors.warning}40`,
  },
  fechaReciboChipText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  fechaReciboChipTextCustom: { color: Colors.warning },

  mesBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14,
    borderLeftWidth: 3, borderLeftColor: Colors.warning,
  },
  mesBannerIcon: { fontSize: 16, lineHeight: 20 },
  mesBannerText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 19 },
  mesBannerMes: { fontWeight: '800', textTransform: 'capitalize' },

  totalCard: {
    backgroundColor: Colors.primary, borderRadius: 16, padding: 24,
    alignItems: 'center', gap: 6,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  totalLabel: { fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' },
  totalAmount: { fontSize: 36, fontWeight: '900', color: Colors.accent, letterSpacing: -1 },

  // iOS picker modal
  iosOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  iosCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34,
  },
  iosHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  iosTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  iosCancelar: { fontSize: 15, color: Colors.muted, fontWeight: '600' },
  iosConfirmar: { fontSize: 15, color: Colors.primary, fontWeight: '800' },
});
