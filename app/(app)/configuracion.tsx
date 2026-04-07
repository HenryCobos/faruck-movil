import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, Image, ActivityIndicator,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { configuracionService, Configuracion } from '@/services/configuracion.service';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Colors } from '@/constants/colors';

const schema = z.object({
  nombre_empresa:   z.string().min(2, 'Mínimo 2 caracteres'),
  slogan:           z.string().optional(),
  direccion:        z.string().optional(),
  telefono:         z.string().optional(),
  email:            z.string().email('Email inválido').optional().or(z.literal('')),
  ruc_nit:          z.string().optional(),
  moneda:           z.string().min(1, 'Requerido'),
  simbolo_moneda:   z.string().min(1, 'Requerido'),
  tasa_mora_label:  z.string().min(1, 'Requerido'),
  tasa_mora_diaria: z.coerce.number().min(0).max(1),
  dias_gracia:      z.coerce.number().min(0).max(30),
});
type FormData = z.infer<typeof schema>;

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export default function ConfiguracionScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const { control, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  useEffect(() => {
    configuracionService.get()
      .then(c => {
        setConfig(c);
        if (c.logo_url) setLogoPreview(c.logo_url);
        reset({
          nombre_empresa:   c.nombre_empresa,
          slogan:           c.slogan ?? '',
          direccion:        c.direccion ?? '',
          telefono:         c.telefono ?? '',
          email:            c.email ?? '',
          ruc_nit:          c.ruc_nit ?? '',
          moneda:           c.moneda,
          simbolo_moneda:   c.simbolo_moneda,
          tasa_mora_label:  c.tasa_mora_label,
          tasa_mora_diaria: c.tasa_mora_diaria,
          dias_gracia:      c.dias_gracia,
        });
      })
      .catch(e => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, []);

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso necesario', 'Necesitamos acceso a tu galería para subir el logo'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setLogoPreview(uri);
    setUploadingLogo(true);
    try {
      await configuracionService.uploadLogo(uri);
      Alert.alert('✅ Logo actualizado', 'El logo se guardó correctamente.');
    } catch (e: any) {
      Alert.alert('Error al subir el logo', e.message ?? 'Asegúrate de que el bucket "logos" esté creado en Supabase Storage.');
      setLogoPreview(config?.logo_url ?? null);
    } finally {
      setUploadingLogo(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      await configuracionService.update({
        ...data,
        email:  data.email  || undefined,
        slogan: data.slogan || undefined,
      });
      Alert.alert('✅ Configuración guardada', 'Los cambios se aplicarán en toda la app.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando configuración..." />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Configuración</Text>
        <Text style={styles.headerSub}>Datos de la empresa y parámetros del sistema</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info última actualización */}
          {config?.updated_at && (
            <View style={styles.lastUpdated}>
              <Text style={styles.lastUpdatedText}>
                Última actualización: {new Date(config.updated_at).toLocaleDateString('es', {
                  day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
          )}

          {/* Logo */}
          <View style={styles.section}>
            <SectionTitle>🖼️ Logo de la empresa</SectionTitle>
            <View style={styles.logoRow}>
              <TouchableOpacity style={styles.logoBox} onPress={pickLogo} activeOpacity={0.7} disabled={uploadingLogo}>
                {uploadingLogo ? (
                  <ActivityIndicator color={Colors.accent} />
                ) : logoPreview ? (
                  <Image source={{ uri: logoPreview }} style={styles.logoImg} resizeMode="contain" />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Text style={styles.logoPlaceholderIcon}>🏢</Text>
                    <Text style={styles.logoPlaceholderText}>Sin logo</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.logoInfo}>
                <Text style={styles.logoInfoTitle}>
                  {logoPreview ? 'Logo cargado ✅' : 'Sin logo configurado'}
                </Text>
                <Text style={styles.logoInfoSub}>
                  Se mostrará en recibos de pago y reportes PDF. Recomendado: imagen cuadrada, fondo blanco o transparente.
                </Text>
                <TouchableOpacity style={styles.logoCambiarBtn} onPress={pickLogo} disabled={uploadingLogo}>
                  <Text style={styles.logoCambiarText}>{logoPreview ? '🔄 Cambiar logo' : '📷 Subir logo'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Identidad de la empresa */}
          <View style={styles.section}>
            <SectionTitle>🏢 Identidad de la empresa</SectionTitle>
            <Controller control={control} name="nombre_empresa"
              render={({ field: { onChange, value } }) => (
                <Input label="Nombre de la empresa *" value={value} onChangeText={onChange}
                  error={errors.nombre_empresa?.message}
                  placeholder="PRÉSTAMOS AB" />
              )} />
            <Controller control={control} name="slogan"
              render={({ field: { onChange, value } }) => (
                <Input label="Slogan (opcional)" value={value ?? ''} onChangeText={onChange}
                  placeholder="Sistema de Créditos con Garantía" />
              )} />
            <Controller control={control} name="ruc_nit"
              render={({ field: { onChange, value } }) => (
                <Input label="RUC / NIT (opcional)" value={value ?? ''} onChangeText={onChange}
                  placeholder="1234567890001" keyboardType="numeric" />
              )} />
          </View>

          {/* Contacto */}
          <View style={styles.section}>
            <SectionTitle>📞 Contacto</SectionTitle>
            <Controller control={control} name="telefono"
              render={({ field: { onChange, value } }) => (
                <Input label="Teléfono" value={value ?? ''} onChangeText={onChange}
                  placeholder="+591 2 1234567" keyboardType="phone-pad"
                  leftIcon={<Text style={styles.fi}>📞</Text>} />
              )} />
            <Controller control={control} name="email"
              render={({ field: { onChange, value } }) => (
                <Input label="Email" value={value ?? ''} onChangeText={onChange}
                  placeholder="info@prestamosab.com" keyboardType="email-address" autoCapitalize="none"
                  error={errors.email?.message} leftIcon={<Text style={styles.fi}>✉️</Text>} />
              )} />
            <Controller control={control} name="direccion"
              render={({ field: { onChange, value } }) => (
                <Input label="Dirección" value={value ?? ''} onChangeText={onChange}
                  placeholder="Av. Principal 100, Ciudad" multiline numberOfLines={2}
                  leftIcon={<Text style={styles.fi}>📍</Text>} />
              )} />
          </View>

          {/* Parámetros financieros */}
          <View style={styles.section}>
            <SectionTitle>💰 Parámetros Financieros</SectionTitle>

            <View style={styles.row}>
              <View style={styles.flex}>
                <Controller control={control} name="moneda"
                  render={({ field: { onChange, value } }) => (
                    <Input label="Moneda" value={value} onChangeText={onChange}
                      placeholder="Bs" error={errors.moneda?.message} />
                  )} />
              </View>
              <View style={styles.flex}>
                <Controller control={control} name="simbolo_moneda"
                  render={({ field: { onChange, value } }) => (
                    <Input label="Símbolo" value={value} onChangeText={onChange}
                      placeholder="$" error={errors.simbolo_moneda?.message} />
                  )} />
              </View>
            </View>

            <View style={styles.moraBox}>
              <Text style={styles.moraBoxTitle}>⚠️ Mora por incumplimiento</Text>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Controller control={control} name="tasa_mora_diaria"
                    render={({ field: { onChange, value } }) => (
                      <Input label="Tasa diaria (decimal)" value={String(value)}
                        onChangeText={onChange} keyboardType="decimal-pad"
                        placeholder="0.001" error={errors.tasa_mora_diaria?.message}
                        hint="0.001 = 0.1% diario" />
                    )} />
                </View>
                <View style={styles.flex}>
                  <Controller control={control} name="dias_gracia"
                    render={({ field: { onChange, value } }) => (
                      <Input label="Días de gracia" value={String(value)}
                        onChangeText={onChange} keyboardType="numeric"
                        placeholder="0" hint="Días antes de cobrar mora" />
                    )} />
                </View>
              </View>
              <Controller control={control} name="tasa_mora_label"
                render={({ field: { onChange, value } }) => (
                  <Input label="Etiqueta descriptiva" value={value} onChangeText={onChange}
                    placeholder="0.1% diario" hint="Texto que aparece en recibos y reportes" />
                )} />
            </View>
          </View>

          <View style={styles.warningBox}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText}>
              Los cambios en la tasa de mora afectan los nuevos cálculos pero NO modifican cuotas ya generadas.
            </Text>
          </View>

          <Button
            title={isDirty ? 'Guardar Cambios' : 'Sin cambios pendientes'}
            onPress={handleSubmit(onSubmit) as any}
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
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.white, marginTop: 8 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  scroll: { padding: 16, gap: 14 },
  lastUpdated: {
    backgroundColor: `${Colors.info}10`, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: `${Colors.info}20`,
  },
  lastUpdatedText: { fontSize: 12, color: Colors.info, textAlign: 'center' },
  section: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 18, gap: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 12 },
  fi: { fontSize: 16 },
  moraBox: {
    backgroundColor: `${Colors.warning}08`, borderRadius: 10, padding: 14, gap: 10,
    borderWidth: 1, borderColor: `${Colors.warning}20`,
  },
  moraBoxTitle: { fontSize: 13, fontWeight: '700', color: Colors.warning },
  logoRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  logoBox: {
    width: 100, height: 100, borderRadius: 16, borderWidth: 2,
    borderColor: Colors.border, borderStyle: 'dashed',
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%', borderRadius: 14 },
  logoPlaceholder: { alignItems: 'center', gap: 4 },
  logoPlaceholderIcon: { fontSize: 28 },
  logoPlaceholderText: { fontSize: 10, color: Colors.muted },
  logoInfo: { flex: 1, gap: 8 },
  logoInfoTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  logoInfoSub: { fontSize: 11, color: Colors.muted, lineHeight: 16 },
  logoCambiarBtn: {
    alignSelf: 'flex-start', backgroundColor: `${Colors.accent}15`,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: `${Colors.accent}30`,
  },
  logoCambiarText: { fontSize: 12, fontWeight: '700', color: Colors.accent },
  warningBox: {
    flexDirection: 'row', gap: 10, backgroundColor: `${Colors.danger}08`,
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: `${Colors.danger}20`,
  },
  warningIcon: { fontSize: 18 },
  warningText: { flex: 1, fontSize: 12, color: Colors.danger, lineHeight: 18 },
});
