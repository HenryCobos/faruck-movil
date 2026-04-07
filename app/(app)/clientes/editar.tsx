import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Alert, TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clientesService } from '@/services/clientes.service';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Colors } from '@/constants/colors';

const schema = z.object({
  nombre:           z.string().min(2, 'Mínimo 2 caracteres'),
  apellido:         z.string().min(2, 'Mínimo 2 caracteres'),
  documento_tipo:   z.enum(['ci', 'pasaporte', 'ruc']),
  documento_numero: z.string().min(5, 'Número de documento inválido'),
  telefono:         z.string().min(7, 'Teléfono inválido'),
  email:            z.string().email('Email inválido').optional().or(z.literal('')),
  direccion:        z.string().min(5, 'Ingresa la dirección completa'),
  scoring:          z.coerce.number().min(0).max(100),
});

type FormData = z.infer<typeof schema>;

const DOC_OPTIONS = [
  { label: 'Cédula de Identidad', value: 'ci',        icon: '🪪' },
  { label: 'Pasaporte',           value: 'pasaporte', icon: '📘' },
  { label: 'RUC / NIT',           value: 'ruc',       icon: '🏢' },
];

export default function EditarClienteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  useEffect(() => {
    if (!id) { setLoadingData(false); return; }
    clientesService.getById(id)
      .then(c => reset({
        nombre:           c.nombre,
        apellido:         c.apellido,
        documento_tipo:   c.documento_tipo as any,
        documento_numero: c.documento_numero,
        telefono:         c.telefono,
        email:            c.email ?? '',
        direccion:        c.direccion,
        scoring:          c.scoring,
      }))
      .catch(() => { Alert.alert('Error', 'No se pudo cargar el cliente'); router.back(); })
      .finally(() => setLoadingData(false));
  }, [id]);

  const onSubmit = async (data: FormData) => {
    if (!id) return;
    setSaving(true);
    try {
      await clientesService.update(id, {
        ...data,
        email: data.email || undefined,
        scoring: Number(data.scoring),
      } as any);
      Alert.alert('✅ Guardado', 'Los datos del cliente fueron actualizados.', [
        { text: 'Aceptar', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loadingData) return <LoadingScreen label="Cargando cliente..." />;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar Cliente</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos Personales</Text>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Controller control={control} name="nombre" render={({ field: { onChange, value } }) => (
                  <Input label="Nombre" value={value} onChangeText={onChange} error={errors.nombre?.message} />
                )} />
              </View>
              <View style={styles.flex}>
                <Controller control={control} name="apellido" render={({ field: { onChange, value } }) => (
                  <Input label="Apellido" value={value} onChangeText={onChange} error={errors.apellido?.message} />
                )} />
              </View>
            </View>
            <Controller control={control} name="documento_tipo" render={({ field: { onChange, value } }) => (
              <Select label="Tipo de Documento" options={DOC_OPTIONS} value={value} onSelect={onChange} />
            )} />
            <Controller control={control} name="documento_numero" render={({ field: { onChange, value } }) => (
              <Input label="Número de Documento" value={value} onChangeText={onChange} keyboardType="numeric"
                error={errors.documento_numero?.message} leftIcon={<Text style={styles.fi}>🪪</Text>} />
            )} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contacto</Text>
            <Controller control={control} name="telefono" render={({ field: { onChange, value } }) => (
              <Input label="Teléfono" value={value} onChangeText={onChange} keyboardType="phone-pad"
                error={errors.telefono?.message} leftIcon={<Text style={styles.fi}>📞</Text>} />
            )} />
            <Controller control={control} name="email" render={({ field: { onChange, value } }) => (
              <Input label="Email (opcional)" value={value} onChangeText={onChange} keyboardType="email-address"
                autoCapitalize="none" error={errors.email?.message} leftIcon={<Text style={styles.fi}>✉️</Text>} />
            )} />
            <Controller control={control} name="direccion" render={({ field: { onChange, value } }) => (
              <Input label="Dirección" value={value} onChangeText={onChange} multiline numberOfLines={2}
                error={errors.direccion?.message} leftIcon={<Text style={styles.fi}>📍</Text>} />
            )} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Evaluación Crediticia</Text>
            <Controller control={control} name="scoring" render={({ field: { onChange, value } }) => (
              <Input label="Score (0–100)" value={String(value)} onChangeText={onChange} keyboardType="numeric"
                error={errors.scoring?.message} hint="50 = neutro · 75+ = bueno · 90+ = excelente"
                leftIcon={<Text style={styles.fi}>⭐</Text>} />
            )} />
          </View>

          <Button title="Guardar Cambios" onPress={handleSubmit(onSubmit as any)} loading={saving} size="lg" />
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
    backgroundColor: Colors.surface, borderRadius: 14, padding: 18,
    gap: 14, marginBottom: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  row: { flexDirection: 'row', gap: 12 },
  fi: { fontSize: 16 },
});
