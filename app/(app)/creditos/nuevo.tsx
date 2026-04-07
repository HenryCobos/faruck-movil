import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Alert, TouchableOpacity,
} from 'react-native';
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

type DocAsset = { uri: string; name: string; mimeType: string };

const schema = z.object({
  cliente_id: z.string().min(1, 'Selecciona el cliente'),
  garantia_id: z.string().min(1, 'Selecciona la garantía'),
  monto_principal: z.coerce.number().min(100, 'Monto mínimo $100'),
  tasa_mensual: z.coerce.number().min(0.1, 'Tasa inválida').max(30, 'Tasa máxima 30%'),
  plazo_meses: z.coerce.number().min(1).max(120),
  tipo_amortizacion: z.enum(['francesa', 'alemana']),
  comision_apertura: z.coerce.number().min(0).optional(),
  observaciones: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const AMORT_OPTIONS: SelectOption[] = [
  { label: 'Francesa — cuota fija', value: 'francesa', icon: '📐' },
  { label: 'Alemana — capital fijo', value: 'alemana', icon: '📏' },
];

export default function NuevoPrestamoScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ clienteId?: string; garantiaId?: string }>();
  const { profile } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState<SelectOption[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [garantias, setGarantias] = useState<SelectOption[]>([]);
  const [loadingGarantias, setLoadingGarantias] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [docAsset, setDocAsset] = useState<DocAsset | null>(null);

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

  const { control, handleSubmit, formState: { errors }, watch, setValue, reset } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: getDefaultValues(),
  });

  useFocusEffect(useCallback(() => {
    reset(getDefaultValues());
    setDocAsset(null);
    setPreview(null);
    setGarantias([]);
    setLoadingClientes(true);
    clientesService.getAll()
      .then(cs => {
        setClientes(cs.map(c => ({
          label: `${c.nombre} ${c.apellido} — ${c.documento_numero}`,
          value: c.id,
          icon: '👤',
        })));
      })
      .catch(console.error)
      .finally(() => setLoadingClientes(false));
  }, [reset, getDefaultValues]));

  const watchedFields = watch(['monto_principal', 'tasa_mensual', 'plazo_meses', 'tipo_amortizacion']);

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

  // Update amortization preview on field changes
  useEffect(() => {
    const [monto, tasa, plazo, tipo] = watchedFields;
    if (!monto || !tasa || !plazo) { setPreview(null); return; }
    try {
      const res = calcularAmortizacion(tipo, Number(monto), Number(tasa) / 100, Number(plazo));
      setPreview(res);
    } catch { setPreview(null); }
  }, [watchedFields.join(',')]);

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
      const p = await prestamosService.create({
        ...data,
        monto_principal: Number(data.monto_principal),
        tasa_mensual: Number(data.tasa_mensual) / 100,
        plazo_meses: Number(data.plazo_meses),
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
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
                  garantias.length === 0 ? 'Este cliente no tiene garantías disponibles' :
                  'Seleccionar garantía...'
                }
                error={errors.garantia_id?.message} />
            )} />
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
                  <Input label="Tasa Mensual (%)" placeholder="3" value={String(value || '')} onChangeText={onChange}
                    keyboardType="numeric" error={errors.tasa_mensual?.message}
                    leftIcon={<Text style={styles.fi}>%</Text>} />
                )} />
              </View>
              <View style={styles.flex}>
                <Controller control={control} name="plazo_meses" render={({ field: { onChange, value } }) => (
                  <Input label="Plazo (meses)" placeholder="12" value={String(value || '')} onChangeText={onChange}
                    keyboardType="numeric" error={errors.plazo_meses?.message}
                    leftIcon={<Text style={styles.fi}>📅</Text>} />
                )} />
              </View>
            </View>
            <Controller control={control} name="tipo_amortizacion" render={({ field: { onChange, value } }) => (
              <Select label="Tipo de Amortización" options={AMORT_OPTIONS} value={value} onSelect={onChange} />
            )} />
            <Controller control={control} name="comision_apertura" render={({ field: { onChange, value } }) => (
              <Input label="Comisión de Apertura ($)" placeholder="0" value={String(value || '')} onChangeText={onChange}
                keyboardType="numeric" hint="Cobro único al desembolsar"
                leftIcon={<Text style={styles.fi}>🏷️</Text>} />
            )} />
          </View>

          {/* Preview cronograma */}
          {preview && (
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>📊 Vista Previa del Cronograma</Text>
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
  previewCard: {
    backgroundColor: Colors.primary, borderRadius: 14, padding: 18, marginBottom: 16, gap: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  previewTitle: { fontSize: 14, fontWeight: '800', color: Colors.white, letterSpacing: 0.3 },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewStat: { flex: 1, minWidth: '45%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 12, alignItems: 'center', gap: 4 },
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
});
