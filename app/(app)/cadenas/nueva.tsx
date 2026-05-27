import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Alert, TouchableOpacity, Modal, TextInput,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { cadenasAhorroService, formatFechaCadena, generarRondas } from '@/services/cadenasAhorro.service';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Colors } from '@/constants/colors';
import type { FrecuenciaCadena } from '@/types';

// ─── Schema ───────────────────────────────────────────────────

const schema = z.object({
  nombre:            z.string().min(1, 'Nombre requerido').max(100),
  descripcion:       z.string().max(300).optional(),
  num_participantes: z.coerce.number().int('Debe ser entero').min(2, 'Mínimo 2 participantes').max(100, 'Máximo 100'),
  monto_aporte:      z.coerce.number().min(0.01, 'Monto inválido'),
  frecuencia:        z.enum(['semanal', 'quincenal', 'mensual']),
  notas:             z.string().max(500).optional(),
});

type FormData = z.infer<typeof schema>;

// ─── Opciones select ──────────────────────────────────────────

const FRECUENCIA_OPTIONS: SelectOption[] = [
  { label: 'Semanal — cada 7 días',   value: 'semanal',   icon: '📅' },
  { label: 'Quincenal — cada 15 días', value: 'quincenal', icon: '📆' },
  { label: 'Mensual — cada mes',       value: 'mensual',   icon: '🗓️' },
];

// ─── Helpers ──────────────────────────────────────────────────

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

// ─── Componente ───────────────────────────────────────────────

export default function NuevaCadenaScreen() {
  const insets = useSafeAreaInsets();
  const [saving, setSaving]   = useState(false);
  const [turnos, setTurnos]   = useState<number[]>([]);
  const [turnoInput, setTurnoInput] = useState('');
  const [fechaInicio, setFechaInicio] = useState<Date>(normalizarFecha());
  const [showIosPicker, setShowIosPicker] = useState(false);

  const { control, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      nombre:            '',
      descripcion:       '',
      num_participantes: undefined,
      monto_aporte:      undefined,
      frecuencia:        'mensual',
      notas:             '',
    },
  });

  const numParticipantes = watch('num_participantes');
  const montoAporte      = watch('monto_aporte');
  const frecuencia       = watch('frecuencia') as FrecuenciaCadena;

  // Vista previa del cronograma (primeras 3 + las del usuario)
  const previewRondas = useMemo(() => {
    const n = Number(numParticipantes);
    if (!n || n < 2 || !frecuencia || !fechaInicio) return [];
    const fechaIso = fechaToIso(fechaInicio);
    return generarRondas('preview', n, fechaIso, frecuencia);
  }, [numParticipantes, frecuencia, fechaInicio]);

  const misTurnosSet = useMemo(() => new Set(turnos), [turnos]);

  // ─── Fecha picker ──────────────────────────────────────────

  const abrirFechaPicker = useCallback(() => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value:   fechaInicio,
        mode:    'date',
        display: 'calendar',
        onChange: (_: DateTimePickerEvent, selected?: Date) => {
          if (selected) setFechaInicio(normalizarFecha(selected));
        },
      });
    } else {
      setShowIosPicker(true);
    }
  }, [fechaInicio]);

  // ─── Turnos ────────────────────────────────────────────────

  const agregarTurno = useCallback(() => {
    const n  = parseInt(turnoInput, 10);
    const max = Number(numParticipantes) || 0;
    if (isNaN(n) || n < 1) {
      Alert.alert('Turno inválido', 'Ingresa un número de turno válido (mayor a 0).');
      return;
    }
    if (max > 0 && n > max) {
      Alert.alert('Turno inválido', `El turno máximo para ${max} participantes es ${max}.`);
      return;
    }
    if (turnos.includes(n)) {
      Alert.alert('Turno duplicado', `El turno #${n} ya fue agregado.`);
      return;
    }
    setTurnos((prev) => [...prev, n].sort((a, b) => a - b));
    setTurnoInput('');
  }, [turnoInput, turnos, numParticipantes]);

  const quitarTurno = useCallback((turno: number) => {
    setTurnos((prev) => prev.filter((t) => t !== turno));
  }, []);

  // ─── Envío ─────────────────────────────────────────────────

  const onSubmit = async (data: FormData) => {
    if (turnos.length === 0) {
      Alert.alert('Sin turnos', 'Agrega al menos un turno (el número de ronda en que cobrarás).');
      return;
    }
    setSaving(true);
    try {
      await cadenasAhorroService.crear({
        nombre:            data.nombre,
        descripcion:       data.descripcion,
        num_participantes: data.num_participantes,
        monto_aporte:      data.monto_aporte,
        frecuencia:        data.frecuencia as FrecuenciaCadena,
        fecha_inicio:      fechaToIso(fechaInicio),
        notas:             data.notas,
        turnos,
      });
      router.replace('/(app)/cadenas' as any);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo crear la cadena.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Nueva Cadena</Text>
          <Text style={styles.headerSub}>Registra tu cadena de ahorro</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Información básica ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INFORMACIÓN BÁSICA</Text>

          <Controller
            control={control} name="nombre"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Nombre de la cadena *"
                placeholder="Ej: Cadena del trabajo, Pandero familiar…"
                value={value} onChangeText={onChange}
                error={errors.nombre?.message}
              />
            )}
          />

          <Controller
            control={control} name="descripcion"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Descripción (opcional)"
                placeholder="Notas sobre esta cadena…"
                value={value} onChangeText={onChange}
                multiline numberOfLines={2}
              />
            )}
          />
        </View>

        {/* ── Parámetros ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PARÁMETROS DE LA CADENA</Text>

          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <Controller
                control={control} name="num_participantes"
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Participantes *"
                    placeholder="Ej: 10"
                    keyboardType="numeric"
                    value={value?.toString() ?? ''}
                    onChangeText={onChange}
                    error={errors.num_participantes?.message}
                  />
                )}
              />
            </View>
            <View style={styles.rowHalf}>
              <Controller
                control={control} name="monto_aporte"
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Aporte por ronda *"
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    value={value?.toString() ?? ''}
                    onChangeText={onChange}
                    error={errors.monto_aporte?.message}
                  />
                )}
              />
            </View>
          </View>

          <Controller
            control={control} name="frecuencia"
            render={({ field: { onChange, value } }) => (
              <Select
                label="Frecuencia de pago *"
                options={FRECUENCIA_OPTIONS}
                value={value}
                onSelect={onChange}
                error={errors.frecuencia?.message}
              />
            )}
          />

          {/* Fecha de inicio */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Fecha de inicio *</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={abrirFechaPicker}>
              <Text style={styles.dateBtnIcon}>📅</Text>
              <Text style={styles.dateBtnText}>{formatFechaCadena(fechaToIso(fechaInicio))}</Text>
              <Text style={styles.dateBtnArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Pool resumen */}
          {numParticipantes >= 2 && montoAporte > 0 && (
            <View style={styles.poolCard}>
              <Text style={styles.poolLabel}>Pozo total que cobrarás</Text>
              <Text style={styles.poolValue}>
                ${(Number(numParticipantes) * Number(montoAporte)).toLocaleString('es')}
              </Text>
              <Text style={styles.poolSub}>
                {numParticipantes} personas × ${Number(montoAporte).toLocaleString('es')} cada una
              </Text>
            </View>
          )}
        </View>

        {/* ── Mis turnos ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MIS TURNOS (CUÁNDO COBRO)</Text>
          <Text style={styles.sectionHint}>
            Agrega el número de ronda en que cobrarás el pozo. Si tienes varios puestos, agrégalos todos.
          </Text>

          <View style={styles.turnoInputRow}>
            <TextInput
              style={styles.turnoInput}
              placeholder={`Turno (1–${numParticipantes || '?'})`}
              placeholderTextColor={Colors.muted}
              keyboardType="numeric"
              value={turnoInput}
              onChangeText={setTurnoInput}
              onSubmitEditing={agregarTurno}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.turnoAddBtn} onPress={agregarTurno}>
              <Text style={styles.turnoAddBtnText}>Agregar</Text>
            </TouchableOpacity>
          </View>

          {turnos.length > 0 ? (
            <View style={styles.turnosChips}>
              {turnos.map((t) => (
                <View key={t} style={styles.turnoChip}>
                  <Text style={styles.turnoChipText}>⭐ Turno #{t}</Text>
                  <TouchableOpacity onPress={() => quitarTurno(t)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.turnoChipX}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.turnosEmpty}>
              <Text style={styles.turnosEmptyText}>Sin turnos agregados</Text>
            </View>
          )}
        </View>

        {/* ── Vista previa del cronograma ── */}
        {previewRondas.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>VISTA PREVIA DEL CRONOGRAMA</Text>
            <View style={styles.previewList}>
              {previewRondas.slice(0, 6).map((r) => {
                const esCobro = misTurnosSet.has(r.numero_ronda);
                return (
                  <View key={r.numero_ronda} style={styles.previewRow}>
                    <View style={[styles.previewNum, esCobro && styles.previewNumCobro]}>
                      <Text style={[styles.previewNumText, esCobro && styles.previewNumTextCobro]}>
                        {r.numero_ronda}
                      </Text>
                    </View>
                    <Text style={styles.previewFecha}>{formatFechaCadena(r.fecha_vencimiento)}</Text>
                    <View style={[styles.previewBadge, esCobro ? styles.previewBadgeCobro : styles.previewBadgePago]}>
                      <Text style={[styles.previewBadgeText, esCobro ? styles.previewBadgeTextCobro : styles.previewBadgeTextPago]}>
                        {esCobro ? '⭐ COBRO' : 'APORTE'}
                      </Text>
                    </View>
                    <Text style={[styles.previewMonto, esCobro && { color: Colors.success }]}>
                      {esCobro
                        ? `+$${(Number(numParticipantes) * Number(montoAporte)).toLocaleString('es')}`
                        : `-$${(Number(montoAporte) * (turnos.length || 1)).toLocaleString('es')}`}
                    </Text>
                  </View>
                );
              })}
              {previewRondas.length > 6 && (
                <Text style={styles.previewMore}>… y {previewRondas.length - 6} rondas más</Text>
              )}
            </View>
          </View>
        )}

        {/* ── Notas ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTAS ADICIONALES</Text>
          <Controller
            control={control} name="notas"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Notas (opcional)"
                placeholder="Observaciones sobre la cadena…"
                value={value} onChangeText={onChange}
                multiline numberOfLines={3}
              />
            )}
          />
        </View>

        <Button
          title={saving ? 'Creando…' : 'Crear Cadena de Ahorro'}
          onPress={handleSubmit(onSubmit)}
          disabled={saving}
          style={styles.submitBtn}
        />
      </ScrollView>

      {/* iOS Date Picker Modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={showIosPicker} transparent animationType="slide">
          <View style={styles.iosPickerOverlay}>
            <View style={styles.iosPickerCard}>
              <View style={styles.iosPickerHeader}>
                <Text style={styles.iosPickerTitle}>Fecha de inicio</Text>
                <TouchableOpacity onPress={() => setShowIosPicker(false)}>
                  <Text style={styles.iosPickerDone}>Listo</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={fechaInicio}
                mode="date"
                display="spinner"
                locale="es-ES"
                onChange={(_: DateTimePickerEvent, selected?: Date) => {
                  if (selected) setFechaInicio(normalizarFecha(selected));
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20, paddingBottom: 20,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 22, color: Colors.white },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.white },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

  scroll: { padding: 16, gap: 4 },

  section: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    marginBottom: 12, gap: 12,
  },
  sectionTitle: {
    fontSize: 10, fontWeight: '700', color: Colors.muted,
    letterSpacing: 1.2, marginBottom: 2,
  },
  sectionHint: { fontSize: 12, color: Colors.muted, lineHeight: 17, marginTop: -4 },

  row: { flexDirection: 'row', gap: 12 },
  rowHalf: { flex: 1 },

  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface2, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12,
  },
  dateBtnIcon: { fontSize: 18 },
  dateBtnText: { flex: 1, fontSize: 15, color: Colors.text, fontWeight: '500' },
  dateBtnArrow: { fontSize: 18, color: Colors.muted },

  poolCard: {
    backgroundColor: `${Colors.success}10`, borderRadius: 12,
    padding: 14, alignItems: 'center', borderWidth: 1,
    borderColor: `${Colors.success}30`,
  },
  poolLabel: { fontSize: 11, color: Colors.success, fontWeight: '700', marginBottom: 4 },
  poolValue: { fontSize: 28, fontWeight: '900', color: Colors.success },
  poolSub: { fontSize: 12, color: Colors.muted, marginTop: 4 },

  turnoInputRow: { flexDirection: 'row', gap: 10 },
  turnoInput: {
    flex: 1, backgroundColor: Colors.surface2, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: Colors.text,
  },
  turnoAddBtn: {
    backgroundColor: Colors.accent, borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 11,
    justifyContent: 'center',
  },
  turnoAddBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  turnosChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  turnoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${Colors.accent}15`, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: `${Colors.accent}40`,
  },
  turnoChipText: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  turnoChipX: { fontSize: 18, color: Colors.accent, lineHeight: 20 },

  turnosEmpty: {
    backgroundColor: Colors.surface2, borderRadius: 10, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  turnosEmptyText: { fontSize: 13, color: Colors.muted },

  previewList: { gap: 4 },
  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  previewNum: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: `${Colors.info}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  previewNumCobro: { backgroundColor: `${Colors.success}20` },
  previewNumText: { fontSize: 12, fontWeight: '800', color: Colors.info },
  previewNumTextCobro: { color: Colors.success },
  previewFecha: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  previewBadge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: `${Colors.info}15`,
  },
  previewBadgeCobro: { backgroundColor: `${Colors.success}15` },
  previewBadgePago: { backgroundColor: `${Colors.info}15` },
  previewBadgeText: { fontSize: 10, fontWeight: '700' },
  previewBadgeTextCobro: { color: Colors.success },
  previewBadgeTextPago: { color: Colors.info },
  previewMonto: { fontSize: 13, fontWeight: '700', color: Colors.text, minWidth: 70, textAlign: 'right' },
  previewMore: { fontSize: 12, color: Colors.muted, textAlign: 'center', paddingTop: 6 },

  submitBtn: { marginTop: 8 },

  iosPickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  iosPickerCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  iosPickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  iosPickerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  iosPickerDone: { fontSize: 16, fontWeight: '700', color: Colors.accent },
});
