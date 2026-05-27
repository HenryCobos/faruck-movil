import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Alert, TouchableOpacity, Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { prestamosService } from '@/services/prestamos.service';
import { useAuthStore } from '@/stores/auth.store';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Colors } from '@/constants/colors';
import { calcularAmortizacion, formatCurrency } from '@/utils/amortizacion';
import { exportarCronogramaPdf } from '@/utils/cronogramaPdf';
import { Cuota } from '@/types';

const AMORT_OPTIONS: SelectOption[] = [
  { label: 'Francesa — cuota fija',                          value: 'francesa',                icon: '📐' },
  { label: 'Alemana — capital fijo',                         value: 'alemana',                 icon: '📏' },
  { label: 'Solo intereses + capital al final',              value: 'solo_interes',             icon: '💸' },
  { label: 'Solo intereses adelantados + capital al final',  value: 'solo_interes_adelantado',  icon: '⚡💸' },
  { label: 'Interés anticipado + capital al final',          value: 'anticipado',               icon: '⚡' },
];

const schema = z.object({
  monto_principal:   z.coerce.number().min(1, 'El monto debe ser mayor a 0'),
  tasa_mensual:      z.coerce.number().min(0.1, 'Tasa inválida').max(30, 'Tasa máxima 30%'),
  plazo_meses:       z.coerce.number().min(1).max(120),
  tipo_amortizacion: z.enum(['francesa', 'alemana', 'solo_interes', 'anticipado', 'solo_interes_adelantado']),
  comision_apertura: z.coerce.number().min(0).optional(),
  observaciones:     z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function RenovarPrestamoScreen() {
  const { prestamoId } = useLocalSearchParams<{ prestamoId: string }>();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();

  const [prestamo, setPrestamo]           = useState<any>(null);
  const [cuotas, setCuotas]               = useState<Cuota[]>([]);
  const [saldoPendiente, setSaldoPendiente] = useState(0);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [exportingPdf, setExportingPdf]   = useState(false);
  const [preview, setPreview]             = useState<any>(null);

  // Fecha de vencimiento del capital (solo para tipo anticipado)
  const [fechaVencCapital, setFechaVencCapital] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); d.setHours(12, 0, 0, 0); return d;
  });
  const [fechaVencCapitalDraft, setFechaVencCapitalDraft] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); d.setHours(12, 0, 0, 0); return d;
  });
  const [showVencCapitalModal, setShowVencCapitalModal] = useState(false);

  const calcularDiasAnticipado = useCallback((vencimiento: Date): number => {
    const hoy = new Date();
    const d1 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const d2 = new Date(vencimiento.getFullYear(), vencimiento.getMonth(), vencimiento.getDate());
    return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  }, []);

  const abrirVencCapitalPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fechaVencCapital,
        mode: 'date',
        is24Hour: true,
        minimumDate: new Date(),
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) {
            const d = new Date(selected); d.setHours(12, 0, 0, 0);
            setFechaVencCapital(d);
          }
        },
      });
    } else {
      setFechaVencCapitalDraft(fechaVencCapital);
      setShowVencCapitalModal(true);
    }
  };

  const fmtFecha = (d: Date) => d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });

  const { control, handleSubmit, formState: { errors }, watch, reset } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      monto_principal:   0,
      tasa_mensual:      3,
      plazo_meses:       12,
      tipo_amortizacion: 'francesa',
      comision_apertura: 0,
      observaciones:     '',
    },
  });

  // ── Cargar préstamo origen ───────────────────────────────────────────────
  useEffect(() => {
    if (!prestamoId) return;
    Promise.all([
      prestamosService.getById(prestamoId),
      prestamosService.getCuotas(prestamoId),
      prestamosService.getSaldoPendiente(prestamoId),
    ])
      .then(([p, cs, saldo]) => {
        setPrestamo(p);
        setCuotas(cs);
        setSaldoPendiente(saldo);
        // Pre-llenar formulario con datos del préstamo anterior
        reset({
          monto_principal:   saldo > 0 ? saldo : p.monto_principal,
          tasa_mensual:      parseFloat((p.tasa_mensual * 100).toFixed(4)),
          plazo_meses:       p.plazo_meses,
          tipo_amortizacion: p.tipo_amortizacion,
          comision_apertura: 0,
          observaciones:     '',
        });
      })
      .catch(() => {
        Alert.alert('Error', 'No se pudo cargar el préstamo');
        router.canGoBack() ? router.back() : router.replace('/(app)/creditos');
      })
      .finally(() => setLoading(false));
  }, [prestamoId]);

  // ── Preview de amortización en tiempo real ───────────────────────────────
  const watchedFields = watch(['monto_principal', 'tasa_mensual', 'plazo_meses', 'tipo_amortizacion']);
  const tipoSeleccionado = watchedFields[3] as string;
  const esAnticipado = tipoSeleccionado === 'anticipado';

  /** Fecha base del cronograma: hoy. */
  const fechaBasePreview = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  useEffect(() => {
    const [monto, tasa, plazo, tipo] = watchedFields;
    if (!monto || !tasa) { setPreview(null); return; }
    try {
      if (tipo === 'anticipado') {
        const plazoDias = calcularDiasAnticipado(fechaVencCapital);
        if (plazoDias <= 0) { setPreview(null); return; }
        const plazoMesesEfectivo = Math.ceil(plazoDias / 30) || 1;
        setPreview(calcularAmortizacion(tipo as any, Number(monto), Number(tasa) / 100, plazoMesesEfectivo, fechaBasePreview, plazoDias));
      } else {
        if (!plazo) { setPreview(null); return; }
        setPreview(calcularAmortizacion(tipo as any, Number(monto), Number(tasa) / 100, Number(plazo), fechaBasePreview));
      }
    } catch { setPreview(null); }
  }, [watchedFields.join(','), fechaBasePreview, fechaVencCapital, calcularDiasAnticipado]);

  // ── Exportar PDF ─────────────────────────────────────────────────────────
  const handleExportarPdf = async () => {
    if (!preview) return;
    const [monto, tasa, plazo, tipo] = watchedFields;
    setExportingPdf(true);
    try {
      await exportarCronogramaPdf({
        resumen: preview,
        monto:            Number(monto),
        tasaMensual:      Number(tasa),
        plazoMeses:       Number(plazo),
        tipoAmortizacion: String(tipo),
        comisionApertura: Number(watch('comision_apertura') ?? 0),
        clienteNombre:    prestamo?.clientes
          ? `${prestamo.clientes.nombre} ${prestamo.clientes.apellido}`
          : undefined,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo generar el PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const onSubmit = async (data: FormData) => {
    if (!profile?.id || !prestamoId) return;
    const esPrestamActivo = prestamo?.estado === 'activo';

    const esAnticipadoTipo = data.tipo_amortizacion === 'anticipado';
    const plazoDiasSubmit = esAnticipadoTipo ? calcularDiasAnticipado(fechaVencCapital) : undefined;
    const plazoMesesSubmit = esAnticipadoTipo && plazoDiasSubmit
      ? Math.ceil(plazoDiasSubmit / 30) || 1
      : Number(data.plazo_meses);
    const plazoDescripcion = esAnticipadoTipo && plazoDiasSubmit
      ? `${plazoDiasSubmit} días (vence ${fmtFecha(fechaVencCapital)})`
      : `${data.plazo_meses} meses`;

    Alert.alert(
      esPrestamActivo ? 'Confirmar Renovación Anticipada' : 'Confirmar Renovación',
      esPrestamActivo
        ? `El préstamo actual se cerrará con un saldo pendiente de ${formatCurrency(saldoPendiente)}.\n\nSe creará un nuevo préstamo por ${formatCurrency(Number(data.monto_principal))} a ${plazoDescripcion}.\n\n¿Confirmas?`
        : `Se creará un nuevo préstamo por ${formatCurrency(Number(data.monto_principal))} a ${plazoDescripcion} vinculado al préstamo anterior.\n\n¿Confirmas?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Renovar',
          onPress: async () => {
            setSaving(true);
            try {
              const nuevo = await prestamosService.renovar({
                prestamoAnteriorId: prestamoId,
                nuevoMonto:         Number(data.monto_principal),
                nuevaTasa:          Number(data.tasa_mensual) / 100,
                nuevoPlayzo:        plazoMesesSubmit,
                nuevoTipo:          data.tipo_amortizacion,
                nuevaComision:      Number(data.comision_apertura ?? 0),
                nuevoPlazosDias:    plazoDiasSubmit,
                observaciones:      data.observaciones,
              }, profile.id);
              router.replace(`/(app)/creditos/${nuevo.id}` as any);
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'No se pudo renovar el préstamo');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  if (loading) return <LoadingScreen />;
  if (!prestamo) return null;

  const cliente  = prestamo.clientes;
  const garantia = prestamo.garantias;
  const esActivo = prestamo.estado === 'activo';
  const cuotasPagadas = cuotas.filter(c => c.estado === 'pagada').length;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/creditos')} style={styles.backBtn}>
          <Text style={styles.backIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Renovar Préstamo</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Préstamo origen */}
          <View style={styles.origenCard}>
            <Text style={styles.origenLabel}>PRÉSTAMO ORIGEN</Text>
            <View style={styles.origenRow}>
              <Text style={styles.origenAmount}>{formatCurrency(prestamo.monto_principal)}</Text>
              <View style={[styles.estadoBadge, esActivo ? styles.estadoActivo : styles.estadoLiquidado]}>
                <Text style={styles.estadoBadgeText}>{esActivo ? '● Activo' : '✓ Liquidado'}</Text>
              </View>
            </View>
            <Text style={styles.origenClient}>
              {cliente?.nombre} {cliente?.apellido}
            </Text>
            {garantia && (
              <Text style={styles.origenGarantia}>
                🔒 {garantia.tipo} — {garantia.descripcion?.substring(0, 45)}
              </Text>
            )}
            <View style={styles.origenStats}>
              <View style={styles.origenStat}>
                <Text style={styles.origenStatVal}>{prestamo.plazo_meses} meses</Text>
                <Text style={styles.origenStatLbl}>Plazo original</Text>
              </View>
              <View style={styles.origenStat}>
                <Text style={styles.origenStatVal}>{(prestamo.tasa_mensual * 100).toFixed(2)}%</Text>
                <Text style={styles.origenStatLbl}>Tasa mensual</Text>
              </View>
              <View style={styles.origenStat}>
                <Text style={styles.origenStatVal}>{cuotasPagadas}/{cuotas.length}</Text>
                <Text style={styles.origenStatLbl}>Cuotas pagas</Text>
              </View>
            </View>

            {/* Banner de saldo pendiente (solo para renovación anticipada) */}
            {esActivo && saldoPendiente > 0 && (
              <View style={styles.saldoBanner}>
                <Text style={styles.saldoBannerIcon}>⚠️</Text>
                <View style={styles.saldoBannerBody}>
                  <Text style={styles.saldoBannerTitle}>Saldo de capital pendiente</Text>
                  <Text style={styles.saldoBannerAmount}>{formatCurrency(saldoPendiente)}</Text>
                  <Text style={styles.saldoBannerHint}>
                    El nuevo préstamo fue pre-cargado con este monto. Puedes ajustarlo.
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Formulario nuevo préstamo */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Condiciones del Nuevo Préstamo</Text>

            <Controller control={control} name="monto_principal" render={({ field: { onChange, value } }) => (
              <Input
                label="Nuevo Monto ($)"
                placeholder="5000"
                value={String(value || '')}
                onChangeText={onChange}
                keyboardType="decimal-pad"
                error={errors.monto_principal?.message}
                leftIcon={<Text style={styles.fi}>💲</Text>}
              />
            )} />

            <View style={styles.row}>
              <View style={styles.flex}>
                <Controller control={control} name="tasa_mensual" render={({ field: { onChange, value } }) => (
                  <Input
                    label="Tasa Mensual (%)"
                    placeholder="3"
                    value={String(value || '')}
                    onChangeText={onChange}
                    keyboardType="decimal-pad"
                    error={errors.tasa_mensual?.message}
                    leftIcon={<Text style={styles.fi}>%</Text>}
                  />
                )} />
              </View>
              {/* Plazo en meses — oculto para tipo anticipado (el plazo lo fija la fecha de vencimiento) */}
              {!esAnticipado && (
                <View style={styles.flex}>
                  <Controller control={control} name="plazo_meses" render={({ field: { onChange, value } }) => (
                    <Input
                      label="Plazo (meses)"
                      placeholder="12"
                      value={String(value || '')}
                      onChangeText={onChange}
                      keyboardType="numeric"
                      error={errors.plazo_meses?.message}
                      leftIcon={<Text style={styles.fi}>📅</Text>}
                    />
                  )} />
                </View>
              )}
            </View>

            <Controller control={control} name="tipo_amortizacion" render={({ field: { onChange, value } }) => (
              <Select label="Tipo de Amortización" options={AMORT_OPTIONS} value={value} onSelect={onChange} />
            )} />

            {/* Fecha vencimiento capital — solo tipo anticipado */}
            {esAnticipado && (
              <View style={styles.fechaVencBlock}>
                <Text style={styles.fechaVencTitle}>📆  Fecha de vencimiento del capital</Text>
                <TouchableOpacity style={styles.fechaVencBtn} onPress={abrirVencCapitalPicker} activeOpacity={0.75}>
                  <Text style={styles.fechaVencBtnText}>{fmtFecha(fechaVencCapital)}</Text>
                  <Text style={{ fontSize: 18, color: Colors.muted }}>›</Text>
                </TouchableOpacity>
                {(() => {
                  const dias = calcularDiasAnticipado(fechaVencCapital);
                  const tasa = Number(watchedFields[1]);
                  return (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.info }}>📅 {dias} días</Text>
                      {tasa > 0 && (
                        <Text style={{ fontSize: 12, color: Colors.muted, fontWeight: '600' }}>
                          Interés total: {((tasa / 100) / 30 * dias * 100).toFixed(2)}%
                        </Text>
                      )}
                    </View>
                  );
                })()}
                {Platform.OS === 'ios' && (
                  <Modal visible={showVencCapitalModal} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                      <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Fecha de vencimiento del capital</Text>
                        <DateTimePicker
                          value={fechaVencCapitalDraft}
                          mode="date"
                          display="spinner"
                          onChange={(_: DateTimePickerEvent, selected?: Date) => {
                            if (selected) { const d = new Date(selected); d.setHours(12,0,0,0); setFechaVencCapitalDraft(d); }
                          }}
                          minimumDate={new Date()}
                          style={{ width: '100%' }}
                          locale="es"
                        />
                        <TouchableOpacity
                          style={styles.modalConfirmBtn}
                          onPress={() => { setFechaVencCapital(fechaVencCapitalDraft); setShowVencCapitalModal(false); }}
                        >
                          <Text style={styles.modalConfirmText}>Confirmar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Modal>
                )}
              </View>
            )}

            <Controller control={control} name="comision_apertura" render={({ field: { onChange, value } }) => (
              <Input
                label="Comisión de Apertura ($)"
                placeholder="0"
                value={String(value || '')}
                onChangeText={onChange}
                keyboardType="decimal-pad"
                hint="Cobro único al desembolsar"
                leftIcon={<Text style={styles.fi}>🏷️</Text>}
              />
            )} />

            <Controller control={control} name="observaciones" render={({ field: { onChange, value } }) => (
              <Input
                label="Observaciones (opcional)"
                placeholder="Motivo de la renovación..."
                value={value}
                onChangeText={onChange}
                multiline
                numberOfLines={2}
              />
            )} />
          </View>

          {/* Preview amortización */}
          {preview && (
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>📊 Vista Previa del Cronograma</Text>
                <TouchableOpacity
                  style={[styles.pdfBtn, exportingPdf && styles.pdfBtnDisabled]}
                  onPress={handleExportarPdf}
                  disabled={exportingPdf}
                  activeOpacity={0.75}
                >
                  <Text style={styles.pdfBtnText}>{exportingPdf ? '⏳' : '📄'} {exportingPdf ? 'Generando...' : 'PDF'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.previewGrid}>
                <View style={styles.previewStat}>
                  <Text style={styles.previewVal}>{formatCurrency(preview.primeraCuota)}</Text>
                  <Text style={styles.previewLbl}>1ª Cuota</Text>
                </View>
                <View style={styles.previewStat}>
                  <Text style={[styles.previewVal, { color: Colors.accent }]}>{formatCurrency(preview.totalIntereses)}</Text>
                  <Text style={styles.previewLbl}>Total Intereses</Text>
                </View>
                <View style={styles.previewStat}>
                  <Text style={[styles.previewVal, { color: Colors.success }]}>{formatCurrency(preview.totalPagar)}</Text>
                  <Text style={styles.previewLbl}>Total a Pagar</Text>
                </View>
                <View style={styles.previewStat}>
                  <Text style={[styles.previewVal, { color: Colors.info }]}>
                    {((preview.totalIntereses / preview.totalCapital) * 100).toFixed(1)}%
                  </Text>
                  <Text style={styles.previewLbl}>Costo Total</Text>
                </View>
              </View>

              <View style={styles.previewTable}>
                <View style={styles.previewTableHeader}>
                  <Text style={styles.th}>N°</Text>
                  <Text style={styles.th}>Cuota</Text>
                  <Text style={styles.th}>Capital</Text>
                  <Text style={styles.th}>Interés</Text>
                  <Text style={styles.th}>Saldo</Text>
                </View>
                {preview.cuotas.slice(0, 6).map((c: any) => (
                  <View key={c.numero} style={styles.previewTableRow}>
                    <Text style={styles.td}>{c.numero}</Text>
                    <Text style={[styles.td, styles.tdBold]}>{formatCurrency(c.cuotaTotal)}</Text>
                    <Text style={[styles.td, { color: Colors.info }]}>{formatCurrency(c.capital)}</Text>
                    <Text style={[styles.td, { color: Colors.accent }]}>{formatCurrency(c.interes)}</Text>
                    <Text style={[styles.td, { color: Colors.success }]}>{formatCurrency(c.saldo)}</Text>
                  </View>
                ))}
                {preview.cuotas.length > 6 && (
                  <Text style={styles.previewMore}>... {preview.cuotas.length - 6} cuotas más</Text>
                )}
              </View>
            </View>
          )}

          <Button
            title={saving ? 'Procesando...' : '🔄 Confirmar Renovación'}
            onPress={handleSubmit(onSubmit as any)}
            loading={saving}
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: Colors.background },
  flex:    { flex: 1 },
  header:  {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon:    { fontSize: 18, color: Colors.white },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white },
  scroll:      { padding: 20, gap: 4 },

  // ── Origen card ──────────────────────────────────────────────────────────
  origenCard: {
    backgroundColor: Colors.primary, borderRadius: 16, padding: 20, marginBottom: 16, gap: 10,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  origenLabel:   { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, textTransform: 'uppercase' },
  origenRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  origenAmount:  { fontSize: 26, fontWeight: '900', color: Colors.white },
  estadoBadge:   { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  estadoActivo:  { backgroundColor: `${Colors.warning}30` },
  estadoLiquidado: { backgroundColor: `${Colors.success}30` },
  estadoBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  origenClient:  { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  origenGarantia: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: -2 },
  origenStats:   { flexDirection: 'row', gap: 0, marginTop: 4 },
  origenStat:    { flex: 1, alignItems: 'center', gap: 2 },
  origenStatVal: { fontSize: 14, fontWeight: '800', color: Colors.white },
  origenStatLbl: { fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' },

  // ── Saldo banner ─────────────────────────────────────────────────────────
  saldoBanner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: `${Colors.warning}20`,
    borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: `${Colors.warning}40`,
    marginTop: 4,
  },
  saldoBannerIcon:   { fontSize: 18, marginTop: 1 },
  saldoBannerBody:   { flex: 1, gap: 2 },
  saldoBannerTitle:  { fontSize: 11, fontWeight: '700', color: Colors.warning },
  saldoBannerAmount: { fontSize: 17, fontWeight: '900', color: Colors.white },
  saldoBannerHint:   { fontSize: 10, color: 'rgba(255,255,255,0.6)', lineHeight: 15 },

  // ── Form section ─────────────────────────────────────────────────────────
  section: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 18, gap: 14, marginBottom: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  row:  { flexDirection: 'row', gap: 12 },
  fi:   { fontSize: 15 },

  // Fecha vencimiento capital (anticipado)
  fechaVencBlock: {
    backgroundColor: `${Colors.accent}10`, borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: `${Colors.accent}40`, gap: 8,
  },
  fechaVencTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.accent,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  fechaVencBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1.5, borderColor: Colors.accent,
  },
  fechaVencBtnText: { fontSize: 15, fontWeight: '700', color: Colors.accent },
  // iOS modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  modalConfirmBtn: {
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  modalConfirmText: { color: Colors.white, fontSize: 16, fontWeight: '700' },

  // ── Preview ──────────────────────────────────────────────────────────────
  previewCard: {
    backgroundColor: Colors.primary, borderRadius: 14, padding: 18, marginBottom: 16, gap: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewTitle:  { fontSize: 14, fontWeight: '800', color: Colors.white, letterSpacing: 0.3, flex: 1 },
  pdfBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  pdfBtnDisabled: { opacity: 0.5 },
  pdfBtnText:    { fontSize: 12, fontWeight: '700', color: Colors.white },
  previewGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewStat:   {
    flex: 1, minWidth: '45%', backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10, padding: 12, alignItems: 'center', gap: 4,
  },
  previewVal:  { fontSize: 16, fontWeight: '800', color: Colors.white },
  previewLbl:  { fontSize: 10, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  previewTable: { gap: 0 },
  previewTableHeader: {
    flexDirection: 'row', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  previewTableRow: {
    flexDirection: 'row', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  th:     { flex: 1, fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' },
  td:     { flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.8)', textAlign: 'right' },
  tdBold: { color: Colors.white, fontWeight: '700' },
  previewMore: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingTop: 8 },
});
