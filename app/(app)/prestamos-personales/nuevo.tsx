import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Alert, TouchableOpacity, Modal,
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
import {
  prestamosPersonalesService,
  formatFechaPrestamoPersonal,
} from '@/services/prestamosPersonales.service';
import { calcularAmortizacion, formatCurrency } from '@/utils/amortizacion';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Colors } from '@/constants/colors';
import type { TipoAmortizacionPersonal } from '@/types';

// ─── Opciones ─────────────────────────────────────────────────

const AMORT_OPTIONS: SelectOption[] = [
  { label: 'Francesa — cuota fija',                            value: 'francesa',                icon: '📐' },
  { label: 'Alemana — capital fijo',                           value: 'alemana',                 icon: '📏' },
  { label: 'Solo intereses + capital al final',                value: 'solo_interes',            icon: '💸' },
  { label: 'Solo intereses adelantados + capital al final',    value: 'solo_interes_adelantado', icon: '⚡💸' },
  { label: 'Interés anticipado + capital al final',            value: 'anticipado',              icon: '⚡' },
];

const AMORT_HINT: Record<string, string> = {
  francesa:                'Cuota mensual fija que mezcla capital e interés.',
  alemana:                 'Capital fijo mensual; las cuotas bajan conforme baja el saldo.',
  solo_interes:            'Cada mes solo se paga el interés. El capital completo al final.',
  solo_interes_adelantado: 'El primer interés vence el mismo día del inicio. Luego mensual y capital al final.',
  anticipado:              'El interés total vence el día de inicio. El capital íntegro al final del plazo.',
};

// ─── Schemas ──────────────────────────────────────────────────

const schemaSimple = z.object({
  acreedor_nombre: z.string().min(1, 'Nombre del acreedor requerido').max(100),
  monto_original:  z.coerce.number().min(0.01, 'Monto inválido'),
  tasa_interes:    z.coerce.number().min(0).max(100).optional(),
  descripcion:     z.string().max(300).optional(),
  notas:           z.string().max(500).optional(),
});

const schemaAmortizable = z.object({
  acreedor_nombre:   z.string().min(1, 'Nombre del acreedor requerido').max(100),
  monto_original:    z.coerce.number().min(0.01, 'Monto inválido'),
  tasa_mensual:      z.coerce.number().min(0, 'La tasa no puede ser negativa').max(30, 'Máximo 30%'),
  plazo_meses:       z.coerce.number().min(1).max(360).optional(),
  tipo_amortizacion: z.enum(['francesa', 'alemana', 'solo_interes', 'solo_interes_adelantado', 'anticipado']),
  descripcion:       z.string().max(300).optional(),
  notas:             z.string().max(500).optional(),
});

type FormSimple      = z.infer<typeof schemaSimple>;
type FormAmortizable = z.infer<typeof schemaAmortizable>;
type FormData        = FormSimple & Partial<FormAmortizable>;

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

function calcularDiasAnticipado(d1: Date, d2: Date): number {
  const a = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const b = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000));
}

// ─── Componente ───────────────────────────────────────────────

export default function NuevoPrestamoPersonalScreen() {
  const insets = useSafeAreaInsets();
  const [saving, setSaving]           = useState(false);
  const [tipoDeuda, setTipoDeuda]     = useState<'simple' | 'amortizable'>('simple');
  const [fechaInicio, setFechaInicio] = useState<Date>(normalizarFecha());
  const [showFechaPicker, setShowFechaPicker] = useState(false);

  // Fecha de vencimiento del capital (solo para anticipado)
  const [fechaVencCapital, setFechaVencCapital] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); d.setHours(12, 0, 0, 0); return d;
  });
  const [fechaVencDraft, setFechaVencDraft] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); d.setHours(12, 0, 0, 0); return d;
  });
  const [showVencPicker, setShowVencPicker] = useState(false);

  const [preview, setPreview] = useState<ReturnType<typeof calcularAmortizacion> | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(tipoDeuda === 'simple' ? schemaSimple : schemaAmortizable) as any,
    defaultValues: {
      acreedor_nombre:   '',
      monto_original:    undefined,
      tasa_interes:      0,
      tasa_mensual:      undefined,
      plazo_meses:       12,
      tipo_amortizacion: 'francesa',
      descripcion:       '',
      notas:             '',
    },
  });

  const monto    = watch('monto_original');
  const tasa     = watch('tasa_interes') ?? 0;
  const tasaMens = watch('tasa_mensual');
  const plazo    = watch('plazo_meses');
  const tipoAmort = watch('tipo_amortizacion') as TipoAmortizacionPersonal | undefined;

  const esAnticipado = tipoAmort === 'anticipado';

  // Cálculo simple: capital + interés fijo
  const montoTotalSimple = useMemo(() => {
    const m = Number(monto); const t = Number(tasa);
    return m > 0 ? m * (1 + t / 100) : 0;
  }, [monto, tasa]);
  const interesTotalSimple = useMemo(() => {
    const m = Number(monto); const t = Number(tasa);
    return m > 0 && t > 0 ? m * (t / 100) : 0;
  }, [monto, tasa]);

  // Preview amortizable
  useEffect(() => {
    if (tipoDeuda !== 'amortizable') { setPreview(null); return; }
    const m = Number(monto);
    const p = Number(plazo);
    // tasaMens puede ser 0 (sin interés), así que solo se invalida si es undefined/null/NaN
    const tasaValida = tasaMens !== undefined && tasaMens !== null && !isNaN(Number(tasaMens));
    const tm = Number(tasaMens);
    if (!m || !tasaValida) { setPreview(null); return; }
    try {
      if (esAnticipado) {
        const dias = calcularDiasAnticipado(fechaInicio, fechaVencCapital);
        const plazoEfectivo = Math.ceil(dias / 30) || 1;
        setPreview(calcularAmortizacion('anticipado', m, tm / 100, plazoEfectivo, fechaInicio, dias));
      } else {
        if (!p) { setPreview(null); return; }
        setPreview(calcularAmortizacion(tipoAmort!, m, tm / 100, p, fechaInicio));
      }
    } catch { setPreview(null); }
  }, [tipoDeuda, monto, tasaMens, plazo, tipoAmort, fechaInicio, fechaVencCapital, esAnticipado]);

  const abrirFechaPicker = useCallback(() => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fechaInicio, mode: 'date', display: 'calendar',
        onChange: (_: DateTimePickerEvent, s?: Date) => { if (s) setFechaInicio(normalizarFecha(s)); },
      });
    } else { setShowFechaPicker(true); }
  }, [fechaInicio]);

  const abrirVencPicker = useCallback(() => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fechaVencCapital, mode: 'date', display: 'calendar',
        minimumDate: fechaInicio,
        onChange: (_: DateTimePickerEvent, s?: Date) => {
          if (s && s.getFullYear() >= 2020) setFechaVencCapital(normalizarFecha(s));
        },
      });
    } else { setFechaVencDraft(normalizarFecha(fechaVencCapital)); setShowVencPicker(true); }
  }, [fechaVencCapital, fechaInicio]);

  const pickerFechaValue = useMemo(() => normalizarFecha(fechaInicio), [fechaInicio.getTime()]);
  const pickerVencValue  = useMemo(() => normalizarFecha(fechaVencDraft), [fechaVencDraft.getTime()]);

  const cambiarTipo = (tipo: 'simple' | 'amortizable') => {
    setTipoDeuda(tipo);
    reset({
      acreedor_nombre:   watch('acreedor_nombre'),
      descripcion:       watch('descripcion'),
      notas:             watch('notas'),
      monto_original:    watch('monto_original'),
      tasa_interes:      0,
      tasa_mensual:      undefined,
      plazo_meses:       12,
      tipo_amortizacion: 'francesa',
    });
    setPreview(null);
  };

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      if (tipoDeuda === 'simple') {
        await prestamosPersonalesService.crear({
          tipo_deuda:      'simple',
          acreedor_nombre: data.acreedor_nombre,
          monto_original:  data.monto_original,
          tasa_interes:    data.tasa_interes ?? 0,
          fecha_inicio:    fechaToIso(fechaInicio),
          descripcion:     data.descripcion,
          notas:           data.notas,
        });
      } else {
        const esAnticipado = data.tipo_amortizacion === 'anticipado';
        const plazoDias = esAnticipado
          ? calcularDiasAnticipado(fechaInicio, fechaVencCapital)
          : undefined;
        const plazoMeses = esAnticipado
          ? (Math.ceil((plazoDias ?? 30) / 30) || 1)
          : Number(data.plazo_meses);

        await prestamosPersonalesService.crear({
          tipo_deuda:        'amortizable',
          acreedor_nombre:   data.acreedor_nombre,
          monto_original:    data.monto_original,
          tasa_interes:      0,
          tasa_mensual:      Number(data.tasa_mensual),
          plazo_meses:       plazoMeses,
          plazo_dias:        plazoDias,
          tipo_amortizacion: data.tipo_amortizacion as TipoAmortizacionPersonal,
          fecha_inicio:      fechaToIso(fechaInicio),
          descripcion:       data.descripcion,
          notas:             data.notas,
        });
      }
      router.replace('/(app)/prestamos-personales' as any);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo registrar la deuda.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Nueva Deuda</Text>
          <Text style={styles.headerSub}>Registra lo que le debes a alguien</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Toggle tipo de deuda ── */}
        <View style={styles.tipoToggle}>
          <TouchableOpacity
            style={[styles.tipoBtn, tipoDeuda === 'simple' && styles.tipoBtnActive]}
            onPress={() => cambiarTipo('simple')}
          >
            <Text style={[styles.tipoBtnLabel, tipoDeuda === 'simple' && styles.tipoBtnLabelActive]}>
              💰 Deuda simple
            </Text>
            <Text style={[styles.tipoBtnSub, tipoDeuda === 'simple' && styles.tipoBtnSubActive]}>
              Monto fijo + interés
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tipoBtn, tipoDeuda === 'amortizable' && styles.tipoBtnActive]}
            onPress={() => cambiarTipo('amortizable')}
          >
            <Text style={[styles.tipoBtnLabel, tipoDeuda === 'amortizable' && styles.tipoBtnLabelActive]}>
              📊 Con cronograma
            </Text>
            <Text style={[styles.tipoBtnSub, tipoDeuda === 'amortizable' && styles.tipoBtnSubActive]}>
              Cuotas y amortización
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Acreedor ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>¿A QUIÉN LE DEBO?</Text>

          <Controller control={control} name="acreedor_nombre"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Nombre del acreedor *"
                placeholder="Ej: Banco Popular, José González, Cooperativa…"
                value={value} onChangeText={onChange}
                error={errors.acreedor_nombre?.message}
              />
            )}
          />

          <Controller control={control} name="descripcion"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Descripción (opcional)"
                placeholder="Para qué fue el préstamo…"
                value={value} onChangeText={onChange}
                multiline numberOfLines={2}
              />
            )}
          />
        </View>

        {/* ── Condiciones ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CONDICIONES DE LA DEUDA</Text>

          <Controller control={control} name="monto_original"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Monto prestado *"
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={value?.toString() ?? ''}
                onChangeText={onChange}
                error={errors.monto_original?.message}
              />
            )}
          />

          {/* ── SIMPLE: tasa fija ── */}
          {tipoDeuda === 'simple' && (
            <>
              <Controller control={control} name="tasa_interes"
                render={({ field: { onChange, value } }) => (
                  <Input
                    label="Interés sobre el capital % (0 = sin interés)"
                    placeholder="Ej: 10  — deja en 0 si no tiene interés"
                    keyboardType="decimal-pad"
                    value={value?.toString() ?? '0'}
                    onChangeText={onChange}
                    error={errors.tasa_interes?.message}
                  />
                )}
              />

              {/* Resumen simple */}
              {Number(monto) > 0 && (
                <View style={[
                  styles.resumenCard,
                  Number(tasa) > 0 ? styles.resumenConInteres : styles.resumenSinInteres,
                ]}>
                  {Number(tasa) > 0 ? (
                    <>
                      <Text style={styles.resumenLabel}>DESGLOSE DE LA DEUDA</Text>
                      <View style={styles.resumenRow}>
                        <Text style={styles.resumenKey}>Capital prestado</Text>
                        <Text style={styles.resumenVal}>${Number(monto).toLocaleString('es')}</Text>
                      </View>
                      <View style={styles.resumenRow}>
                        <Text style={styles.resumenKey}>Interés ({tasa}%)</Text>
                        <Text style={[styles.resumenVal, { color: Colors.warning }]}>
                          +${interesTotalSimple.toLocaleString('es')}
                        </Text>
                      </View>
                      <View style={[styles.resumenRow, styles.resumenRowTotal]}>
                        <Text style={styles.resumenKeyTotal}>Deuda total</Text>
                        <Text style={styles.resumenValTotal}>
                          ${montoTotalSimple.toLocaleString('es')}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.resumenLabel}>SIN INTERESES</Text>
                      <Text style={styles.resumenSubLabel}>
                        Deuda = ${Number(monto).toLocaleString('es')} · solo capital
                      </Text>
                    </>
                  )}
                </View>
              )}
            </>
          )}

          {/* ── AMORTIZABLE: tasa mensual + plazo + tipo ── */}
          {tipoDeuda === 'amortizable' && (
            <>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Controller control={control} name="tasa_mensual"
                    render={({ field: { onChange, value } }) => (
                      <Input
                        label="Tasa mensual (%, 0 = sin interés)"
                        placeholder="Ej: 2.5  ó  0"
                        keyboardType="decimal-pad"
                        value={value?.toString() ?? ''}
                        onChangeText={onChange}
                        error={(errors as any).tasa_mensual?.message}
                      />
                    )}
                  />
                </View>
                {!esAnticipado && (
                  <View style={styles.flex}>
                    <Controller control={control} name="plazo_meses"
                      render={({ field: { onChange, value } }) => (
                        <Input
                          label="Plazo (meses)"
                          placeholder="12"
                          keyboardType="numeric"
                          value={value?.toString() ?? ''}
                          onChangeText={onChange}
                          error={(errors as any).plazo_meses?.message}
                        />
                      )}
                    />
                  </View>
                )}
              </View>

              <Controller control={control} name="tipo_amortizacion"
                render={({ field: { onChange, value } }) => (
                  <Select
                    label="Tipo de amortización"
                    options={AMORT_OPTIONS}
                    value={value ?? 'francesa'}
                    onSelect={onChange}
                  />
                )}
              />

              {Number(tasaMens) === 0 && tasaMens !== undefined && tasaMens !== null ? (
                <View style={[styles.amortHint, styles.amortHintSinInteres]}>
                  <Text style={[styles.amortHintText, styles.amortHintTextSinInteres]}>
                    ✅  Sin interés — el cronograma dividirá el capital en cuotas iguales.
                  </Text>
                </View>
              ) : tipoAmort && AMORT_HINT[tipoAmort] ? (
                <View style={styles.amortHint}>
                  <Text style={styles.amortHintText}>ℹ️  {AMORT_HINT[tipoAmort]}</Text>
                </View>
              ) : null}

              {/* Fecha vencimiento capital — solo anticipado */}
              {esAnticipado && (
                <View style={styles.vencBlock}>
                  <Text style={styles.vencTitle}>📆  Fecha de vencimiento del capital</Text>
                  <TouchableOpacity style={styles.vencBtn} onPress={abrirVencPicker}>
                    <Text style={styles.vencBtnText}>
                      {formatFechaPrestamoPersonal(fechaToIso(fechaVencCapital))}
                    </Text>
                    <Text style={styles.vencBtnArrow}>›</Text>
                  </TouchableOpacity>
                  {(() => {
                    const dias = calcularDiasAnticipado(fechaInicio, fechaVencCapital);
                    return (
                      <View style={styles.diasRow}>
                        <Text style={styles.diasBadge}>📅 {dias} días</Text>
                        {Number(tasaMens) > 0 && (
                          <Text style={styles.diasTasa}>
                            Interés total: {((Number(tasaMens) / 100) / 30 * dias * 100).toFixed(2)}%
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                </View>
              )}
            </>
          )}

          {/* ── Fecha de inicio (ambos tipos) ── */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>
              {tipoDeuda === 'amortizable' ? '📅  Fecha de inicio (desembolso)' : '📅  Fecha de inicio'}
            </Text>
            <TouchableOpacity style={styles.dateBtn} onPress={abrirFechaPicker}>
              <Text style={styles.dateBtnText}>{formatFechaPrestamoPersonal(fechaToIso(fechaInicio))}</Text>
              <Text style={styles.dateBtnArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Preview cronograma (amortizable) ── */}
        {tipoDeuda === 'amortizable' && preview && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>📊 Vista previa del cronograma</Text>
            <View style={styles.previewGrid}>
              <View style={styles.previewStat}>
                <Text style={styles.previewVal}>{formatCurrency(preview.primeraCuota)}</Text>
                <Text style={styles.previewLbl}>
                  {(tipoAmort === 'anticipado' || tipoAmort === 'solo_interes_adelantado')
                    ? 'Interés al inicio' : '1ª Cuota'}
                </Text>
              </View>
              <View style={styles.previewStat}>
                <Text style={[styles.previewVal, { color: Colors.accent }]}>
                  {formatCurrency(preview.totalIntereses)}
                </Text>
                <Text style={styles.previewLbl}>Total intereses</Text>
              </View>
              <View style={styles.previewStat}>
                <Text style={[styles.previewVal, { color: Colors.danger }]}>
                  {formatCurrency(preview.totalPagar)}
                </Text>
                <Text style={styles.previewLbl}>Total a pagar</Text>
              </View>
              <View style={styles.previewStat}>
                <Text style={[styles.previewVal, { color: Colors.info }]}>
                  {preview.cuotas.length} cuotas
                </Text>
                <Text style={styles.previewLbl}>Plazo</Text>
              </View>
            </View>

            <View style={styles.previewTable}>
              <View style={styles.previewTableHeader}>
                <Text style={styles.th}>N°</Text>
                <Text style={styles.th}>Vence</Text>
                <Text style={styles.th}>Capital</Text>
                <Text style={styles.th}>Interés</Text>
                <Text style={styles.th}>Cuota</Text>
              </View>
              {preview.cuotas.slice(0, 5).map((c) => (
                <View key={c.numero} style={styles.previewTableRow}>
                  <Text style={styles.td}>{c.numero}</Text>
                  <Text style={[styles.td, { fontSize: 10 }]}>
                    {c.fechaVencimiento.toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </Text>
                  <Text style={[styles.td, { color: Colors.info }]}>{formatCurrency(c.capital)}</Text>
                  <Text style={[styles.td, { color: Colors.accent }]}>{formatCurrency(c.interes)}</Text>
                  <Text style={[styles.td, styles.tdBold]}>{formatCurrency(c.cuotaTotal)}</Text>
                </View>
              ))}
              {preview.cuotas.length > 5 && (
                <Text style={styles.previewMore}>
                  … {preview.cuotas.length - 5} cuotas más
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── Notas ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTAS ADICIONALES</Text>
          <Controller control={control} name="notas"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Notas (opcional)"
                placeholder="Condiciones especiales, acuerdos, recordatorios…"
                value={value} onChangeText={onChange}
                multiline numberOfLines={3}
              />
            )}
          />
        </View>

        <Button
          title={saving ? 'Registrando…' : 'Registrar Deuda'}
          onPress={handleSubmit(onSubmit)}
          disabled={saving}
          style={styles.submitBtn}
        />
      </ScrollView>

      {/* ── iOS Pickers ── */}
      {Platform.OS === 'ios' && (
        <>
          <Modal visible={showFechaPicker} transparent animationType="slide">
            <View style={styles.iosPickerOverlay}>
              <View style={styles.iosPickerCard}>
                <View style={styles.iosPickerHeader}>
                  <Text style={styles.iosPickerTitle}>Fecha de inicio</Text>
                  <TouchableOpacity onPress={() => setShowFechaPicker(false)}>
                    <Text style={styles.iosPickerDone}>Listo</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={pickerFechaValue} mode="date" display="spinner" locale="es-ES"
                  onChange={(_: DateTimePickerEvent, s?: Date) => {
                    if (s && s.getFullYear() >= 2020) setFechaInicio(normalizarFecha(s));
                  }}
                />
              </View>
            </View>
          </Modal>

          <Modal visible={showVencPicker} transparent animationType="slide">
            <View style={styles.iosPickerOverlay}>
              <View style={styles.iosPickerCard}>
                <View style={styles.iosPickerHeader}>
                  <Text style={styles.iosPickerTitle}>Fecha de vencimiento</Text>
                  <TouchableOpacity onPress={() => {
                    setFechaVencCapital(normalizarFecha(fechaVencDraft));
                    setShowVencPicker(false);
                  }}>
                    <Text style={styles.iosPickerDone}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={pickerVencValue} mode="date" display="spinner" locale="es-ES"
                  minimumDate={pickerFechaValue}
                  onChange={(_: DateTimePickerEvent, s?: Date) => {
                    if (s && s.getFullYear() >= 2020) setFechaVencDraft(normalizarFecha(s));
                  }}
                />
              </View>
            </View>
          </Modal>
        </>
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

  // Toggle tipo de deuda
  tipoToggle: {
    flexDirection: 'row', gap: 10, marginBottom: 12,
  },
  tipoBtn: {
    flex: 1, borderRadius: 14, padding: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', gap: 4,
  },
  tipoBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}10`,
  },
  tipoBtnLabel: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  tipoBtnLabelActive: { color: Colors.primary },
  tipoBtnSub: { fontSize: 10, color: Colors.muted },
  tipoBtnSubActive: { color: `${Colors.primary}80` },

  section: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    marginBottom: 12, gap: 12,
  },
  sectionTitle: {
    fontSize: 10, fontWeight: '700', color: Colors.muted,
    letterSpacing: 1.2, marginBottom: 2,
  },

  row: { flexDirection: 'row', gap: 12 },

  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12,
  },
  dateBtnText: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  dateBtnArrow: { fontSize: 18, color: Colors.muted },

  amortHint: {
    backgroundColor: `${Colors.info}12`, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderLeftWidth: 3, borderLeftColor: Colors.info,
  },
  amortHintText: { fontSize: 12, color: Colors.info, lineHeight: 18 },
  amortHintSinInteres: {
    backgroundColor: `${Colors.success}12`,
    borderLeftColor: Colors.success,
  },
  amortHintTextSinInteres: { color: Colors.success },

  vencBlock: {
    backgroundColor: `${Colors.accent}10`, borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: `${Colors.accent}40`, gap: 8,
  },
  vencTitle: { fontSize: 12, fontWeight: '700', color: Colors.accent, textTransform: 'uppercase', letterSpacing: 0.6 },
  vencBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: 10, padding: 12,
    borderWidth: 1.5, borderColor: Colors.accent,
  },
  vencBtnText: { fontSize: 15, fontWeight: '700', color: Colors.accent },
  vencBtnArrow: { fontSize: 18, color: Colors.accent },
  diasRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  diasBadge: { fontSize: 13, fontWeight: '700', color: Colors.info },
  diasTasa: { fontSize: 12, color: Colors.muted, fontWeight: '600' },

  // Resumen simple
  resumenCard: { borderRadius: 12, padding: 14, gap: 6, borderWidth: 1 },
  resumenConInteres: { backgroundColor: `${Colors.warning}08`, borderColor: `${Colors.warning}30` },
  resumenSinInteres: { backgroundColor: `${Colors.success}08`, borderColor: `${Colors.success}30` },
  resumenLabel: { fontSize: 10, fontWeight: '700', color: Colors.muted, letterSpacing: 1, marginBottom: 4 },
  resumenSubLabel: { fontSize: 14, color: Colors.success, fontWeight: '600' },
  resumenRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resumenRowTotal: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, marginTop: 4 },
  resumenKey: { fontSize: 13, color: Colors.textSecondary },
  resumenVal: { fontSize: 13, fontWeight: '700', color: Colors.text },
  resumenKeyTotal: { fontSize: 14, fontWeight: '800', color: Colors.text },
  resumenValTotal: { fontSize: 18, fontWeight: '900', color: Colors.danger },

  // Preview amortizable
  previewCard: {
    backgroundColor: Colors.primary, borderRadius: 14, padding: 18, marginBottom: 12, gap: 14,
  },
  previewTitle: { fontSize: 14, fontWeight: '800', color: Colors.white, letterSpacing: 0.3 },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewStat: {
    flex: 1, minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10,
    padding: 12, alignItems: 'center', gap: 4,
  },
  previewVal: { fontSize: 15, fontWeight: '800', color: Colors.white },
  previewLbl: { fontSize: 10, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  previewTable: { gap: 0 },
  previewTableHeader: {
    flexDirection: 'row', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  previewTableRow: {
    flexDirection: 'row', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  th: { flex: 1, fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' },
  td: { flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.8)', textAlign: 'right' },
  tdBold: { color: Colors.white, fontWeight: '700' },
  previewMore: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingTop: 8 },

  submitBtn: { marginTop: 8 },

  // iOS Pickers
  iosPickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  iosPickerCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32,
  },
  iosPickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  iosPickerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  iosPickerDone: { fontSize: 16, fontWeight: '700', color: Colors.accent },
});
