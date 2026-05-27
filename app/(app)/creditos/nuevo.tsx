import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import { prestamosService } from '@/services/prestamos.service';
import { clientesService } from '@/services/clientes.service';
import { garantiasService } from '@/services/garantias.service';
import { useAuthStore } from '@/stores/auth.store';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';
import { Colors } from '@/constants/colors';
import { calcularAmortizacion, formatCurrency } from '@/utils/amortizacion';
import { exportarCronogramaPdf } from '@/utils/cronogramaPdf';

type DocAsset = { uri: string; name: string; mimeType: string };

const schema = z.object({
  cliente_id: z.string().min(1, 'Selecciona el cliente'),
  garantia_id: z.string().min(1, 'Selecciona la garantía'),
  monto_principal: z.coerce.number().min(100, 'Monto mínimo $100'),
  tasa_mensual: z.coerce.number().min(0.1, 'Tasa inválida').max(30, 'Tasa máxima 30%'),
  plazo_meses: z.coerce.number().min(1).max(120),
  tipo_amortizacion: z.enum(['francesa', 'alemana', 'solo_interes', 'anticipado', 'solo_interes_adelantado']),
  comision_apertura: z.coerce.number().min(0).optional(),
  observaciones: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const AMORT_OPTIONS: SelectOption[] = [
  { label: 'Francesa — cuota fija', value: 'francesa', icon: '📐' },
  { label: 'Alemana — capital fijo', value: 'alemana', icon: '📏' },
  { label: 'Solo intereses + capital al final', value: 'solo_interes', icon: '💸' },
  { label: 'Solo intereses adelantados + capital al final', value: 'solo_interes_adelantado', icon: '⚡💸' },
  { label: 'Interés anticipado + capital al final', value: 'anticipado', icon: '⚡' },
];

const AMORT_HINT: Record<string, string> = {
  francesa:                'Cuota mensual fija que mezcla capital e interés (más interés al inicio).',
  alemana:                 'Capital fijo mensual; las cuotas van bajando conforme baja el saldo.',
  solo_interes:            'Cada mes se paga solo el interés. El capital completo se cancela en la última cuota.',
  solo_interes_adelantado: 'La primera cuota de interés vence el mismo día del desembolso (cobro adelantado). Las siguientes cuotas de interés se pagan mensualmente y el capital íntegro al final del plazo.',
  anticipado:              'El interés total del período vence el mismo día del desembolso (al entregar el crédito). El capital íntegro vence al final del plazo.',
};

export default function NuevoPrestamoScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ clienteId?: string; garantiaId?: string }>();
  const { profile } = useAuthStore();
  const regresandoDeGarantia = useRef(false);
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState<SelectOption[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [garantias, setGarantias] = useState<SelectOption[]>([]);
  const [loadingGarantias, setLoadingGarantias] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [docAsset, setDocAsset] = useState<DocAsset | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  // Fecha mínima aceptable — rechaza el epoch (1970) y fechas inválidas que
  // el picker iOS suele emitir como "onChange fantasma" al inicializarse.
  const FECHA_MIN = useMemo(() => new Date(2020, 0, 1), []);

  const normalizarFecha = useCallback((value?: Date) => {
    const base = value instanceof Date ? new Date(value.getTime()) : new Date();
    if (Number.isNaN(base.getTime()) || base.getFullYear() < 2020) {
      const now = new Date();
      now.setHours(12, 0, 0, 0);
      return now;
    }
    // Evita saltos por zona horaria/UTC en iOS fijando la hora al mediodía local.
    base.setHours(12, 0, 0, 0);
    return base;
  }, []);

  const [fechaDesembolso, setFechaDesembolso] = useState<Date>(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    return now;
  });
  const [fechaDesembolsoDraft, setFechaDesembolsoDraft] = useState<Date>(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    return now;
  });
  const [showDateModal, setShowDateModal] = useState(false);

  // Fecha de vencimiento del capital (solo para tipo anticipado)
  const [fechaVencCapital, setFechaVencCapital] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [fechaVencCapitalDraft, setFechaVencCapitalDraft] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [showVencCapitalModal, setShowVencCapitalModal] = useState(false);

  const abrirVencCapitalPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: normalizarFecha(fechaVencCapital),
        mode: 'date',
        is24Hour: true,
        minimumDate: normalizarFecha(fechaDesembolso),
        onChange: (event, selected) => {
          if (event.type === 'set' && selected && selected.getFullYear() >= 2020) {
            setFechaVencCapital(normalizarFecha(selected));
          }
        },
      });
    } else {
      setFechaVencCapitalDraft(normalizarFecha(fechaVencCapital));
      setShowVencCapitalModal(true);
    }
  };

  // Calcula los días exactos entre desembolso y vencimiento del capital
  const calcularDiasAnticipado = useCallback((desembolso: Date, vencimiento: Date): number => {
    const d1 = new Date(desembolso.getFullYear(), desembolso.getMonth(), desembolso.getDate());
    const d2 = new Date(vencimiento.getFullYear(), vencimiento.getMonth(), vencimiento.getDate());
    return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  }, []);

  const fmtFecha = (d: Date) =>
    d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });

  const abrirFechaPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: normalizarFecha(fechaDesembolso),
        mode: 'date',
        is24Hour: true,
        minimumDate: FECHA_MIN,
        onChange: (event, selected) => {
          if (event.type === 'set' && selected && selected.getFullYear() >= 2020) {
            const safe = normalizarFecha(selected);
            setFechaDesembolso(safe);
            setFechaDesembolsoDraft(safe);
          }
        },
      });
    } else {
      setFechaDesembolsoDraft(normalizarFecha(fechaDesembolso));
      setShowDateModal(true);
    }
  };

  // Referencias estables para los pickers — evita que iOS reinterprete una nueva
  // instancia de Date como "valor cambió" y dispare onChange con epoch (1969).
  const pickerDesembolsoValue = useMemo(
    () => normalizarFecha(fechaDesembolsoDraft),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fechaDesembolsoDraft.getTime()],
  );
  const pickerVencCapitalValue = useMemo(
    () => normalizarFecha(fechaVencCapitalDraft),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fechaVencCapitalDraft.getTime()],
  );

  const onChangeFechaIOS = (_: DateTimePickerEvent, selected?: Date) => {
    // Rechaza el "onChange fantasma" que iOS emite con fecha epoch al inicializar.
    if (!selected || selected.getFullYear() < 2020) return;
    setFechaDesembolsoDraft(normalizarFecha(selected));
  };

  const getDefaultValues = useCallback(() => ({
    cliente_id: params.clienteId ?? '',
    garantia_id: params.garantiaId ?? '',
    monto_principal: 0,
    tasa_mensual: 3,
    plazo_meses: 12,
    tipo_amortizacion: 'francesa' as const,
    comision_apertura: 0,
    observaciones: '',
  }), [params.clienteId, params.garantiaId]);

  const { control, handleSubmit, formState: { errors }, watch, setValue, reset, getValues } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: getDefaultValues(),
  });

  useFocusEffect(useCallback(() => {
    // Caso especial: volvemos desde la pantalla de crear garantía.
    // En ese caso NO reseteamos el formulario (el cliente y demás datos
    // se conservan en memoria porque la pantalla sigue montada en el stack).
    // Solo recargamos la lista de garantías del cliente actual.
    if (regresandoDeGarantia.current) {
      regresandoDeGarantia.current = false;
      const clienteActual = getValues('cliente_id');
      if (clienteActual) {
        setLoadingGarantias(true);
        garantiasService.getByCliente(clienteActual)
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
      return;
    }

    // Flujo normal: reset completo del formulario al entrar a la pantalla.
    reset(getDefaultValues());
    setDocAsset(null);
    setPreview(null);
    setGarantias([]);
    const now = normalizarFecha(new Date());
    setFechaDesembolso(now);
    setFechaDesembolsoDraft(now);
    const venc = normalizarFecha(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
    setFechaVencCapital(venc);
    setFechaVencCapitalDraft(venc);
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

    // Si hay un cliente pre-seleccionado vía param, cargamos sus garantías.
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
  }, [reset, getDefaultValues, params.clienteId, normalizarFecha, getValues]));

  const watchedFields = watch(['monto_principal', 'tasa_mensual', 'plazo_meses', 'tipo_amortizacion']);
  const tipoSeleccionado = watchedFields[3] as string;
  const esAnticipado = tipoSeleccionado === 'anticipado';

  // Cuando cambia el cliente, cargamos sus garantías disponibles desde la API
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

  // Update amortization preview on field changes or date change
  useEffect(() => {
    const [monto, tasa, plazo, tipo] = watchedFields;
    if (!monto || !tasa) { setPreview(null); return; }
    try {
      if (tipo === 'anticipado') {
        const plazoDias = calcularDiasAnticipado(fechaDesembolso, fechaVencCapital);
        if (plazoDias <= 0) { setPreview(null); return; }
        const plazoMesesEfectivo = Math.ceil(plazoDias / 30) || 1;
        const res = calcularAmortizacion(tipo, Number(monto), Number(tasa) / 100, plazoMesesEfectivo, fechaDesembolso, plazoDias);
        setPreview(res);
      } else {
        if (!plazo) { setPreview(null); return; }
        const res = calcularAmortizacion(tipo, Number(monto), Number(tasa) / 100, Number(plazo), fechaDesembolso);
        setPreview(res);
      }
    } catch { setPreview(null); }
  }, [watchedFields.join(','), fechaDesembolso, fechaVencCapital, calcularDiasAnticipado]);

  const handleExportarPdf = async () => {
    if (!preview) return;
    const [monto, tasa, plazo, tipo] = watchedFields;
    const clienteSeleccionado = clientes.find(c => c.value === watch('cliente_id'));
    setExportingPdf(true);
    try {
      await exportarCronogramaPdf({
        resumen: preview,
        monto: Number(monto),
        tasaMensual: Number(tasa),
        plazoMeses: Number(plazo),
        tipoAmortizacion: String(tipo),
        comisionApertura: Number(watch('comision_apertura') ?? 0),
        clienteNombre: clienteSeleccionado?.label,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo generar el PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const pickDocumento = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setDocAsset({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/pdf',
      });
    }
  };

  const onSubmit = async (data: FormData) => {
    if (!profile?.id) return;
    setSaving(true);
    try {
      const esAnticipadoSubmit = data.tipo_amortizacion === 'anticipado';
      const plazoDias = esAnticipadoSubmit
        ? calcularDiasAnticipado(fechaDesembolso, fechaVencCapital)
        : undefined;
      const plazoMesesCalculado = esAnticipadoSubmit && plazoDias
        ? Math.ceil(plazoDias / 30) || 1
        : Number(data.plazo_meses);

      const p = await prestamosService.create({
        ...data,
        monto_principal: Number(data.monto_principal),
        tasa_mensual: Number(data.tasa_mensual) / 100,
        plazo_meses: plazoMesesCalculado,
        plazo_dias: plazoDias,
        comision_apertura: Number(data.comision_apertura ?? 0),
      }, profile.id);

      // La subida del contrato es opcional: si falla, el préstamo igual se crea
      if (docAsset) {
        try {
          const url = await prestamosService.uploadContrato(docAsset.uri, p.id, docAsset.mimeType);
          await prestamosService.actualizarContrato(p.id, url);
        } catch {
          Alert.alert(
            'Préstamo creado',
            'El préstamo fue registrado correctamente, pero el contrato no pudo subirse. Podrás adjuntarlo desde el detalle del préstamo.',
            [{ text: 'Entendido' }],
          );
        }
      }

      router.replace(`/(app)/creditos/${p.id}` as any);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo crear el préstamo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/creditos')} style={styles.backBtn}>
          <Text style={styles.backIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nuevo Préstamo</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Cliente y Garantía */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Partes del Crédito</Text>
            <Controller control={control} name="cliente_id" render={({ field: { onChange, value } }) => (
              <Select label="Cliente / Prestatario" options={clientes} value={value} onSelect={onChange}
                placeholder={loadingClientes ? 'Cargando clientes...' : 'Seleccionar cliente...'}
                error={errors.cliente_id?.message} />
            )} />
            <Controller control={control} name="garantia_id" render={({ field: { onChange, value } }) => (
              <Select label="Garantía a vincular" options={garantias} value={value} onSelect={onChange}
                placeholder={
                  !selectedCliente ? 'Primero selecciona un cliente...' :
                  loadingGarantias ? 'Cargando garantías...' :
                  garantias.length === 0 ? 'Sin garantías disponibles...' :
                  'Seleccionar garantía...'
                }
                error={errors.garantia_id?.message} />
            )} />
            {selectedCliente && !loadingGarantias && garantias.length === 0 && (
              <TouchableOpacity
                style={styles.noGarantiaBanner}
                onPress={() => {
                  regresandoDeGarantia.current = true;
                  router.push(`/(app)/garantias/nuevo?clienteId=${selectedCliente}` as any);
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.noGarantiaIcon}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.noGarantiaTitle}>Este cliente no tiene garantías disponibles</Text>
                  <Text style={styles.noGarantiaHint}>Debes registrar una antes de crear el préstamo</Text>
                </View>
                <Text style={styles.noGarantiaArrow}>→</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Condiciones */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Condiciones del Préstamo</Text>
            <Controller control={control} name="monto_principal" render={({ field: { onChange, value } }) => (
              <Input label="Monto a Prestar ($)" placeholder="5000" value={String(value || '')} onChangeText={onChange}
                keyboardType="numeric" error={errors.monto_principal?.message}
                leftIcon={<Text style={styles.fi}>💲</Text>} />
            )} />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Controller control={control} name="tasa_mensual" render={({ field: { onChange, value } }) => (
                  <Input label="Tasa Mensual (%)" placeholder="2.5" value={String(value || '')} onChangeText={onChange}
                    keyboardType="decimal-pad" error={errors.tasa_mensual?.message}
                    leftIcon={<Text style={styles.fi}>%</Text>} />
                )} />
              </View>
              {/* Plazo en meses — oculto para tipo anticipado (el plazo lo fija la fecha de vencimiento) */}
              {!esAnticipado && (
                <View style={styles.flex}>
                  <Controller control={control} name="plazo_meses" render={({ field: { onChange, value } }) => (
                    <Input label="Plazo (meses)" placeholder="12" value={String(value || '')} onChangeText={onChange}
                      keyboardType="numeric" error={errors.plazo_meses?.message}
                      leftIcon={<Text style={styles.fi}>📅</Text>} />
                  )} />
                </View>
              )}
            </View>
            <Controller control={control} name="tipo_amortizacion" render={({ field: { onChange, value } }) => (
              <Select label="Tipo de Amortización" options={AMORT_OPTIONS} value={value} onSelect={onChange} />
            )} />
            {tipoSeleccionado && AMORT_HINT[tipoSeleccionado] ? (
              <View style={styles.amortHint}>
                <Text style={styles.amortHintText}>ℹ️  {AMORT_HINT[tipoSeleccionado]}</Text>
              </View>
            ) : null}

            {/* Fecha de vencimiento del capital — solo para tipo anticipado */}
            {esAnticipado && (
              <View style={styles.fechaVencBlock}>
                <Text style={styles.fechaVencTitle}>📆  Fecha de vencimiento del capital</Text>
                <TouchableOpacity style={styles.fechaVencBtn} onPress={abrirVencCapitalPicker} activeOpacity={0.75}>
                  <Text style={styles.fechaVencBtnText}>{fmtFecha(fechaVencCapital)}</Text>
                  <Text style={styles.fechaBtnIcon}>›</Text>
                </TouchableOpacity>
                {(() => {
                  const dias = calcularDiasAnticipado(fechaDesembolso, fechaVencCapital);
                  const tasa = Number(watchedFields[1]);
                  return (
                    <View style={styles.diasInfoRow}>
                      <Text style={styles.diasInfoBadge}>📅 {dias} días</Text>
                      {tasa > 0 && (
                        <Text style={styles.diasInfoTasa}>
                          Interés total: {((tasa / 100) / 30 * dias * 100).toFixed(2)}%
                        </Text>
                      )}
                    </View>
                  );
                })()}
                {/* iOS spinner modal para fecha de vencimiento */}
                {Platform.OS === 'ios' && (
                  <Modal visible={showVencCapitalModal} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                      <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Fecha de vencimiento del capital</Text>
                        <DateTimePicker
                          value={pickerVencCapitalValue}
                          mode="date"
                          display="spinner"
                          onChange={(_: DateTimePickerEvent, selected?: Date) => {
                            if (!selected || selected.getFullYear() < 2020) return;
                            setFechaVencCapitalDraft(normalizarFecha(selected));
                          }}
                          minimumDate={pickerDesembolsoValue}
                          style={{ width: '100%' }}
                          locale="es"
                        />
                        <TouchableOpacity
                          style={styles.modalConfirmBtn}
                          onPress={() => {
                            setFechaVencCapital(normalizarFecha(fechaVencCapitalDraft));
                            setShowVencCapitalModal(false);
                          }}
                        >
                          <Text style={styles.modalConfirmText}>Confirmar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Modal>
                )}
              </View>
            )}

            {/* Fecha estimada de desembolso */}
            <View style={styles.fechaRow}>
              <Text style={styles.fechaLabel}>📅  Fecha estimada de desembolso</Text>
              <TouchableOpacity
                style={styles.fechaBtn}
                onPress={abrirFechaPicker}
                activeOpacity={0.75}
              >
                <Text style={styles.fechaBtnText}>{fmtFecha(fechaDesembolso)}</Text>
                <Text style={styles.fechaBtnIcon}>›</Text>
              </TouchableOpacity>
              <Text style={styles.fechaHint}>
                Solo para la vista previa del cronograma y el PDF. La fecha definitiva se confirma al activar el préstamo.
              </Text>
            </View>

            {/* iOS: modal con spinner */}
            {Platform.OS === 'ios' && (
              <Modal visible={showDateModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                  <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Fecha de desembolso</Text>
                    <DateTimePicker
                      value={pickerDesembolsoValue}
                      mode="date"
                      display="spinner"
                      onChange={onChangeFechaIOS}
                      minimumDate={FECHA_MIN}
                      style={{ width: '100%' }}
                      locale="es"
                    />
                    <TouchableOpacity
                      style={styles.modalConfirmBtn}
                      onPress={() => {
                        setFechaDesembolso(normalizarFecha(fechaDesembolsoDraft));
                        setShowDateModal(false);
                      }}
                    >
                      <Text style={styles.modalConfirmText}>Confirmar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            )}

            <Controller control={control} name="comision_apertura" render={({ field: { onChange, value } }) => (
              <Input label="Comisión de Apertura ($)" placeholder="0" value={String(value || '')} onChangeText={onChange}
                keyboardType="numeric" hint="Cobro único al desembolsar"
                leftIcon={<Text style={styles.fi}>🏷️</Text>} />
            )} />
          </View>

          {/* Preview cronograma */}
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
                  <Text style={styles.previewLbl}>
                    {(tipoSeleccionado === 'anticipado' || tipoSeleccionado === 'solo_interes_adelantado') ? 'Interés al desembolso' : '1ª Cuota'}
                  </Text>
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
                {preview.cuotas[0] && (
                  <View style={styles.previewStat}>
                    <Text style={[styles.previewVal, { fontSize: 12 }]}>
                      {new Date(preview.cuotas[0].fechaVencimiento).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </Text>
                    <Text style={styles.previewLbl}>
                      {(tipoSeleccionado === 'anticipado' || tipoSeleccionado === 'solo_interes_adelantado') ? 'Vence interés (desembolso)' : 'Primer Pago'}
                    </Text>
                  </View>
                )}
                {preview.cuotas.length > 1 && (
                  <View style={styles.previewStat}>
                    <Text style={[styles.previewVal, { fontSize: 12 }]}>
                      {new Date(preview.cuotas[preview.cuotas.length - 1].fechaVencimiento).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </Text>
                    <Text style={styles.previewLbl}>
                      {(tipoSeleccionado === 'anticipado' || tipoSeleccionado === 'solo_interes_adelantado') ? 'Vence capital' : 'Último Pago'}
                    </Text>
                  </View>
                )}
                {tipoSeleccionado === 'anticipado' && (
                  <View style={styles.previewStat}>
                    <Text style={[styles.previewVal, { color: Colors.muted, fontSize: 13 }]}>
                      {calcularDiasAnticipado(fechaDesembolso, fechaVencCapital)} días
                    </Text>
                    <Text style={styles.previewLbl}>Plazo exacto</Text>
                  </View>
                )}
                {tipoSeleccionado === 'anticipado' && (
                  <View style={[styles.previewStat, styles.previewStatNeto]}>
                    <Text style={[styles.previewVal, { color: '#fff', fontSize: 17 }]}>
                      {formatCurrency(
                        Number(watchedFields[0]) -
                        preview.totalIntereses -
                        Number(watch('comision_apertura') ?? 0)
                      )}
                    </Text>
                    <Text style={[styles.previewLbl, { color: 'rgba(255,255,255,0.9)', fontWeight: '700' }]}>
                      Neto al cliente
                    </Text>
                  </View>
                )}
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

          <Controller control={control} name="observaciones" render={({ field: { onChange, value } }) => (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Observaciones</Text>
              <Input placeholder="Notas adicionales sobre el préstamo..." value={value} onChangeText={onChange} multiline numberOfLines={3} />
            </View>
          )} />

          {/* Contrato */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📄 Contrato del Préstamo</Text>
            {docAsset ? (
              <View style={styles.docSelected}>
                <Text style={styles.docSelectedIcon}>📄</Text>
                <Text style={styles.docSelectedName} numberOfLines={2}>{docAsset.name}</Text>
                <TouchableOpacity style={styles.docRemoveBtn} onPress={() => setDocAsset(null)}>
                  <Text style={styles.docRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.docPickerBtn} onPress={pickDocumento} activeOpacity={0.7}>
                <Text style={styles.docPickerIcon}>📎</Text>
                <View>
                  <Text style={styles.docPickerLabel}>Adjuntar Contrato</Text>
                  <Text style={styles.docPickerHint}>PDF o imagen — opcional</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          <Button
            title={saving ? (docAsset ? 'Subiendo contrato...' : 'Creando...') : 'Crear Préstamo'}
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
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  header: {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 18, color: Colors.white },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white },
  scroll: { padding: 20, gap: 4 },
  section: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 18, gap: 14, marginBottom: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  row: { flexDirection: 'row', gap: 12 },
  fi: { fontSize: 15 },
  noGarantiaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: `${Colors.warning}12`,
    borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: `${Colors.warning}30`,
  },
  noGarantiaIcon: { fontSize: 20 },
  noGarantiaTitle: { fontSize: 13, fontWeight: '700', color: Colors.warning },
  noGarantiaHint: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  noGarantiaArrow: { fontSize: 18, fontWeight: '700', color: Colors.warning },

  amortHint: {
    backgroundColor: `${Colors.info}12`,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.info,
  },
  amortHintText: { fontSize: 12, color: Colors.info, lineHeight: 18 },
  previewCard: {
    backgroundColor: Colors.primary, borderRadius: 14, padding: 18, marginBottom: 16, gap: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewTitle: { fontSize: 14, fontWeight: '800', color: Colors.white, letterSpacing: 0.3, flex: 1 },
  pdfBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  pdfBtnDisabled: { opacity: 0.5 },
  pdfBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewStat: { flex: 1, minWidth: '45%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 12, alignItems: 'center', gap: 4 },
  previewStatNeto: { minWidth: '95%', backgroundColor: 'rgba(52,199,89,0.25)', borderWidth: 1.5, borderColor: 'rgba(52,199,89,0.6)' },
  previewVal: { fontSize: 16, fontWeight: '800', color: Colors.white },
  previewLbl: { fontSize: 10, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  previewTable: { gap: 0 },
  previewTableHeader: {
    flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  previewTableRow: {
    flexDirection: 'row', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  th: { flex: 1, fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' },
  td: { flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.8)', textAlign: 'right' },
  tdBold: { color: Colors.white, fontWeight: '700' },
  previewMore: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingTop: 8 },
  docPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: `${Colors.accent}08`,
  },
  docPickerIcon: { fontSize: 26 },
  docPickerLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  docPickerHint: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  docSelected: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: `${Colors.success}12`, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: `${Colors.success}30`,
  },
  docSelectedIcon: { fontSize: 24, flexShrink: 0 },
  docSelectedName: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text },
  docRemoveBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: `${Colors.danger}18`, alignItems: 'center', justifyContent: 'center',
  },
  docRemoveText: { fontSize: 12, color: Colors.danger, fontWeight: '700' },

  // Fecha de desembolso
  fechaRow: {
    gap: 6,
    paddingTop: 4,
  },
  fechaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  fechaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  fechaBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  fechaBtnIcon: {
    fontSize: 18,
    color: Colors.muted,
  },
  fechaHint: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
    paddingHorizontal: 2,
  },

  // Fecha vencimiento capital (anticipado)
  fechaVencBlock: {
    backgroundColor: `${Colors.accent}10`,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: `${Colors.accent}40`,
    gap: 8,
  },
  fechaVencTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  fechaVencBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  fechaVencBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.accent,
  },
  diasInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  diasInfoBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.info,
  },
  diasInfoTasa: {
    fontSize: 12,
    color: Colors.muted,
    fontWeight: '600',
  },

  // Modal iOS fecha
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
    paddingBottom: 34,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  modalConfirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
});
