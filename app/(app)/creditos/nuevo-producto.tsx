import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Alert, TouchableOpacity, Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { prestamosService } from '@/services/prestamos.service';
import { clientesService } from '@/services/clientes.service';
import { garantiasService } from '@/services/garantias.service';
import { useAuthStore } from '@/stores/auth.store';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';
import { Colors } from '@/constants/colors';
import { calcularAmortizacionFrancesa, formatCurrency } from '@/utils/amortizacion';

const schema = z.object({
  cliente_id: z.string().min(1, 'Selecciona el cliente'),
  descripcion_producto: z.string().min(3, 'Describe el producto (mínimo 3 caracteres)'),
  monto_principal: z.coerce.number().min(1, 'Monto mínimo $1'),
  plazo_meses: z.coerce.number().int().min(1, 'Mínimo 1 cuota').max(360, 'Máximo 360 cuotas'),
  garantia_id: z.string().optional(),
  observaciones: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const CUOTAS_RAPIDAS = [1, 2, 3, 6, 12, 24];

export default function NuevoCreditoProductoScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ clienteId?: string }>();
  const { profile } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState<SelectOption[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [garantias, setGarantias] = useState<SelectOption[]>([]);
  const [loadingGarantias, setLoadingGarantias] = useState(false);
  const FECHA_MIN = useMemo(() => new Date(2020, 0, 1), []);

  const normalizarFecha = useCallback((value?: Date) => {
    const base = value instanceof Date ? new Date(value.getTime()) : new Date();
    if (Number.isNaN(base.getTime()) || base.getFullYear() < 2020) {
      const now = new Date();
      now.setHours(12, 0, 0, 0);
      return now;
    }
    base.setHours(12, 0, 0, 0);
    return base;
  }, []);

  const [fechaInicio, setFechaInicio] = useState<Date>(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    return now;
  });
  const [fechaInicioDraft, setFechaInicioDraft] = useState<Date>(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    return now;
  });
  const [showDateModal, setShowDateModal] = useState(false);

  const pickerFechaValue = useMemo(
    () => normalizarFecha(fechaInicioDraft),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fechaInicioDraft.getTime()],
  );

  const fmtFecha = (d: Date) =>
    d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });

  const abrirFechaPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: normalizarFecha(fechaInicio),
        mode: 'date',
        is24Hour: true,
        minimumDate: FECHA_MIN,
        onChange: (event, selected) => {
          if (event.type === 'set' && selected && selected.getFullYear() >= 2020) {
            const safe = normalizarFecha(selected);
            setFechaInicio(safe);
            setFechaInicioDraft(safe);
          }
        },
      });
    } else {
      setFechaInicioDraft(normalizarFecha(fechaInicio));
      setShowDateModal(true);
    }
  };

  const onChangeFechaIOS = (_: DateTimePickerEvent, selected?: Date) => {
    if (!selected || selected.getFullYear() < 2020) return;
    setFechaInicioDraft(normalizarFecha(selected));
  };

  const { control, handleSubmit, formState: { errors }, watch, setValue, reset } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      cliente_id: params.clienteId ?? '',
      descripcion_producto: '',
      monto_principal: 0,
      plazo_meses: 1,
      garantia_id: '',
      observaciones: '',
    },
  });

  useFocusEffect(useCallback(() => {
    reset({
      cliente_id: params.clienteId ?? '',
      descripcion_producto: '',
      monto_principal: 0,
      plazo_meses: 1,
      garantia_id: '',
      observaciones: '',
    });
    setGarantias([]);
    const now = normalizarFecha(new Date());
    setFechaInicio(now);
    setFechaInicioDraft(now);
    setLoadingClientes(true);
    clientesService.getAll()
      .then(cs => {
        setClientes(cs.map(c => ({
          label: `${c.nombre} ${c.apellido}${c.alias ? ` (${c.alias})` : ''} — ${c.documento_numero}`,
          value: c.id,
          icon: '👤',
        })));
      })
      .catch(console.error)
      .finally(() => setLoadingClientes(false));

    if (params.clienteId) {
      setLoadingGarantias(true);
      garantiasService.getByCliente(params.clienteId)
        .then(gs => {
          const disponibles = gs.filter(g => g.estado === 'disponible');
          setGarantias(disponibles.map(g => ({
            label: `${g.tipo} — ${g.descripcion.substring(0, 40)}`,
            value: g.id, icon: '🏠',
          })));
        })
        .catch(console.error)
        .finally(() => setLoadingGarantias(false));
    }
  }, [reset, params.clienteId, normalizarFecha]));

  const selectedCliente = watch('cliente_id');
  useEffect(() => {
    if (!selectedCliente) {
      setGarantias([]);
      return;
    }
    setLoadingGarantias(true);
    setValue('garantia_id', '');
    garantiasService.getByCliente(selectedCliente)
      .then(gs => {
        const disponibles = gs.filter(g => g.estado === 'disponible');
        setGarantias(disponibles.map(g => ({
          label: `${g.tipo} — ${g.descripcion.substring(0, 40)}`,
          value: g.id, icon: '🏠',
        })));
      })
      .catch(console.error)
      .finally(() => setLoadingGarantias(false));
  }, [selectedCliente]);

  const [monto, plazo] = watch(['monto_principal', 'plazo_meses']);

  const preview = useMemo(() => {
    const m = Number(monto);
    const p = Number(plazo);
    if (!m || m <= 0 || !p || p <= 0) return null;
    return calcularAmortizacionFrancesa(m, 0, p, fechaInicio);
  }, [monto, plazo, fechaInicio]);

  const onSubmit = async (values: FormData) => {
    setSaving(true);
    try {
      await prestamosService.createCreditoProducto(
        {
          cliente_id: values.cliente_id,
          descripcion_producto: values.descripcion_producto,
          monto_principal: values.monto_principal,
          plazo_meses: values.plazo_meses,
          garantia_id: values.garantia_id || undefined,
          observaciones: values.observaciones,
        },
        profile!.id,
      );
      Alert.alert('Listo', 'Crédito de producto registrado correctamente.', [
        { text: 'Ver créditos', onPress: () => router.replace('/(app)/creditos') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo registrar el crédito.');
    } finally {
      setSaving(false);
    }
  };

  const cuotaMonto = preview ? preview.cuotas[0]?.cuotaTotal ?? 0 : 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Volver</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Venta a Crédito</Text>
            <Text style={styles.headerSub}>Sin intereses · Cuotas fijas</Text>
          </View>
          <View style={{ width: 70 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Badge informativo */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerIcon}>🏷️</Text>
            <Text style={styles.infoBannerText}>
              Se divide el monto acordado en cuotas iguales sin interés. El cliente paga el mismo importe en cada cuota.
            </Text>
          </View>

          {/* Sección: Datos del cliente */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cliente</Text>
            <Controller
              control={control}
              name="cliente_id"
              render={({ field }) => (
                <Select
                  label="Cliente *"
                  options={clientes}
                  value={field.value}
                  onSelect={field.onChange}
                  placeholder={loadingClientes ? 'Cargando...' : 'Selecciona el cliente'}
                  error={errors.cliente_id?.message}
                />
              )}
            />
          </View>

          {/* Sección: Producto */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Producto vendido</Text>
            <Controller
              control={control}
              name="descripcion_producto"
              render={({ field }) => (
                <Input
                  label="Descripción del producto *"
                  placeholder="Ej: Televisor 55 pulgadas, Nevera marca X..."
                  value={field.value}
                  onChangeText={field.onChange}
                  error={errors.descripcion_producto?.message}
                  multiline
                />
              )}
            />
          </View>

          {/* Sección: Monto y cuotas */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Monto y cuotas</Text>
            <Controller
              control={control}
              name="monto_principal"
              render={({ field }) => (
                <Input
                  label="Monto total acordado *"
                  placeholder="0"
                  keyboardType="numeric"
                  value={field.value ? String(field.value) : ''}
                  onChangeText={field.onChange}
                  error={errors.monto_principal?.message}
                />
              )}
            />

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Número de cuotas *</Text>
              <View style={styles.cuotasRapidasRow}>
                {CUOTAS_RAPIDAS.map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.cuotaChip, Number(plazo) === n && styles.cuotaChipActive]}
                    onPress={() => setValue('plazo_meses', n)}
                  >
                    <Text style={[styles.cuotaChipText, Number(plazo) === n && styles.cuotaChipTextActive]}>
                      {n === 1 ? '1 cuota' : `${n}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Controller
                control={control}
                name="plazo_meses"
                render={({ field }) => (
                  <Input
                    label=""
                    placeholder="Otro número de cuotas"
                    keyboardType="numeric"
                    value={field.value ? String(field.value) : ''}
                    onChangeText={field.onChange}
                    error={errors.plazo_meses?.message}
                  />
                )}
              />
            </View>

            {/* Fecha de inicio */}
            <View style={styles.fechaContainer}>
              <Text style={styles.fieldLabel}>Fecha primera cuota</Text>
              <TouchableOpacity style={styles.fechaBtn} onPress={abrirFechaPicker}>
                <Text style={styles.fechaBtnIcon}>📅</Text>
                <Text style={styles.fechaBtnText}>
                  {fmtFecha(fechaInicio)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Preview de cuotas */}
          {preview && preview.cuotas.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resumen del plan de pagos</Text>
              <View style={styles.previewSummary}>
                <View style={styles.previewStat}>
                  <Text style={styles.previewStatVal}>{formatCurrency(Number(monto))}</Text>
                  <Text style={styles.previewStatLbl}>Total a pagar</Text>
                </View>
                <View style={styles.previewDivider} />
                <View style={styles.previewStat}>
                  <Text style={styles.previewStatVal}>{formatCurrency(cuotaMonto)}</Text>
                  <Text style={styles.previewStatLbl}>Valor por cuota</Text>
                </View>
                <View style={styles.previewDivider} />
                <View style={styles.previewStat}>
                  <Text style={[styles.previewStatVal, { color: Colors.success }]}>$0</Text>
                  <Text style={styles.previewStatLbl}>Intereses</Text>
                </View>
              </View>

              <View style={styles.cuotasTable}>
                {preview.cuotas.slice(0, 6).map(c => (
                  <View key={c.numero} style={styles.cuotaRow}>
                    <View style={styles.cuotaNumBadge}>
                      <Text style={styles.cuotaNumText}>{c.numero}</Text>
                    </View>
                    <Text style={styles.cuotaFecha}>
                      {c.fechaVencimiento.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Text>
                    <Text style={styles.cuotaMonto}>{formatCurrency(c.cuotaTotal)}</Text>
                  </View>
                ))}
                {preview.cuotas.length > 6 && (
                  <Text style={styles.cuotasMore}>
                    + {preview.cuotas.length - 6} cuotas más de {formatCurrency(cuotaMonto)} c/u
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Sección: Garantía (opcional) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Garantía (opcional)</Text>
            <Text style={styles.sectionHint}>
              Puedes asociar una garantía del cliente si se acordó como respaldo del crédito.
            </Text>
            <Controller
              control={control}
              name="garantia_id"
              render={({ field }) => (
                <Select
                  label="Garantía"
                  options={[{ label: 'Sin garantía', value: '', icon: '—' }, ...garantias]}
                  value={field.value ?? ''}
                  onSelect={field.onChange}
                  placeholder={
                    !selectedCliente
                      ? 'Primero selecciona el cliente'
                      : loadingGarantias
                      ? 'Cargando garantías...'
                      : garantias.length === 0
                      ? 'Sin garantías disponibles'
                      : 'Selecciona una garantía'
                  }
                />
              )}
            />
          </View>

          {/* Sección: Observaciones */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notas adicionales</Text>
            <Controller
              control={control}
              name="observaciones"
              render={({ field }) => (
                <Input
                  label="Observaciones"
                  placeholder="Condiciones adicionales, detalles del acuerdo..."
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  multiline
                />
              )}
            />
          </View>

          <Button
            title={saving ? 'Registrando...' : 'Registrar crédito de producto'}
            onPress={handleSubmit(onSubmit)}
            loading={saving}
            variant="primary"
            size="lg"
          />
        </ScrollView>

        {/* Modal fecha iOS */}
        {Platform.OS === 'ios' && (
          <Modal visible={showDateModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Fecha primera cuota</Text>
                <DateTimePicker
                  value={pickerFechaValue}
                  mode="date"
                  display="spinner"
                  minimumDate={FECHA_MIN}
                  onChange={onChangeFechaIOS}
                  locale="es-ES"
                />
                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={styles.modalBtnCancel}
                    onPress={() => setShowDateModal(false)}
                  >
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalBtnOk}
                    onPress={() => {
                      setFechaInicio(normalizarFecha(fechaInicioDraft));
                      setShowDateModal(false);
                    }}
                  >
                    <Text style={styles.modalBtnOkText}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 70 },
  backText: { color: Colors.white, fontSize: 14, fontWeight: '600' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: Colors.white, fontSize: 17, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.accent + '18',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  infoBannerIcon: { fontSize: 18 },
  infoBannerText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 19 },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionHint: { fontSize: 12, color: Colors.muted, lineHeight: 17, marginTop: -4 },
  fieldRow: { gap: 8 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  cuotasRapidasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cuotaChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.primaryLight + '30', borderWidth: 1.5, borderColor: Colors.primaryLight,
  },
  cuotaChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  cuotaChipText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  cuotaChipTextActive: { color: Colors.white },
  fechaContainer: { gap: 6 },
  fechaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primaryLight + '20', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: Colors.primaryLight,
  },
  fechaBtnIcon: { fontSize: 18 },
  fechaBtnText: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  previewSummary: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primary + '08', borderRadius: 10, padding: 12,
  },
  previewStat: { flex: 1, alignItems: 'center' },
  previewStatVal: { fontSize: 16, fontWeight: '800', color: Colors.text },
  previewStatLbl: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  previewDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  cuotasTable: { gap: 6 },
  cuotaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border + '60',
  },
  cuotaNumBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.accent + '20', justifyContent: 'center', alignItems: 'center',
  },
  cuotaNumText: { fontSize: 12, fontWeight: '700', color: Colors.accent },
  cuotaFecha: { flex: 1, fontSize: 13, color: Colors.muted },
  cuotaMonto: { fontSize: 14, fontWeight: '700', color: Colors.text },
  cuotasMore: { fontSize: 12, color: Colors.muted, textAlign: 'center', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalBtnCancel: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  modalBtnCancelText: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  modalBtnOk: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center' },
  modalBtnOkText: { fontSize: 15, color: Colors.white, fontWeight: '700' },
});
