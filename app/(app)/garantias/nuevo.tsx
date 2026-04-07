import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Alert, TouchableOpacity, Image,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garantiasService } from '@/services/garantias.service';
import { clientesService } from '@/services/clientes.service';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';
import { Colors } from '@/constants/colors';
import { Cliente } from '@/types';

const schema = z.object({
  cliente_id: z.string().min(1, 'Selecciona un cliente'),
  tipo: z.enum(['inmueble', 'vehiculo', 'joya', 'electrodomestico', 'otro']),
  descripcion: z.string().min(10, 'Describe el bien con más detalle'),
  valor_avaluo: z.coerce.number().min(1, 'El valor debe ser mayor a 0'),
  observaciones: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const TIPO_OPTIONS: SelectOption[] = [
  { label: 'Inmueble / Casa / Terreno', value: 'inmueble', icon: '🏠' },
  { label: 'Vehículo / Moto', value: 'vehiculo', icon: '🚗' },
  { label: 'Joya / Oro / Plata', value: 'joya', icon: '💍' },
  { label: 'Electrodoméstico', value: 'electrodomestico', icon: '📺' },
  { label: 'Otro bien de valor', value: 'otro', icon: '📦' },
];

export default function NuevaGarantiaScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ clienteId?: string }>();
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [fotos, setFotos] = useState<string[]>([]);

  const getDefaultValues = useCallback(() => ({
    cliente_id: params.clienteId ?? '',
    tipo: 'vehiculo' as const,
    descripcion: '',
    valor_avaluo: 0,
    observaciones: '',
  }), [params.clienteId]);

  const { control, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: getDefaultValues(),
  });

  useFocusEffect(useCallback(() => {
    reset(getDefaultValues());
    setFotos([]);
    setLoadingClientes(true);
    clientesService.getAll()
      .then(setClientes)
      .catch(console.error)
      .finally(() => setLoadingClientes(false));
  }, [reset, getDefaultValues]));

  const clienteOptions: SelectOption[] = clientes.map(c => ({
    label: `${c.nombre} ${c.apellido} — ${c.documento_numero}`,
    value: c.id,
    icon: '👤',
  }));

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso necesario', 'Necesitamos acceso a tu galería'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true,
      quality: 0.7, selectionLimit: 4,
    });
    if (!result.canceled) {
      setFotos(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 4));
    }
  };

  const removePhoto = (uri: string) => setFotos(prev => prev.filter(f => f !== uri));

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      const garantia = await garantiasService.create({
        ...data,
        valor_avaluo: Number(data.valor_avaluo),
        fotos: [],
        documentos: {},
        estado: 'disponible',
      } as any);

      // Upload selected photos and update garantia with their URLs
      if (fotos.length > 0) {
        const urls: string[] = [];
        for (const uri of fotos) {
          try {
            const url = await garantiasService.uploadFoto(uri, garantia.id);
            urls.push(url);
          } catch {
            // Skip failed uploads silently; don't block saving
          }
        }
        if (urls.length > 0) {
          await garantiasService.update(garantia.id, { fotos: urls });
        }
      }

      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo guardar la garantía');
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
        <Text style={styles.headerTitle}>Nueva Garantía</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Propietario del Bien</Text>
            <Controller control={control} name="cliente_id" render={({ field: { onChange, value } }) => (
              <Select label="Cliente" options={clienteOptions} value={value} onSelect={onChange}
                placeholder={loadingClientes ? 'Cargando clientes...' : 'Seleccionar cliente...'}
                error={errors.cliente_id?.message} />
            )} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Descripción del Bien</Text>
            <Controller control={control} name="tipo" render={({ field: { onChange, value } }) => (
              <Select label="Tipo de Bien" options={TIPO_OPTIONS} value={value} onSelect={onChange} error={errors.tipo?.message} />
            )} />
            <Controller control={control} name="descripcion" render={({ field: { onChange, value } }) => (
              <Input label="Descripción detallada" placeholder="Toyota Corolla 2020, color blanco, placa ABC-1234, 45,000 km..." value={value} onChangeText={onChange} multiline numberOfLines={3} error={errors.descripcion?.message} />
            )} />
            <Controller control={control} name="valor_avaluo" render={({ field: { onChange, value } }) => (
              <Input label="Valor de Avalúo ($)" placeholder="10000" value={String(value || '')} onChangeText={onChange}
                keyboardType="numeric" error={errors.valor_avaluo?.message}
                hint="Valor estimado del bien en el mercado actual"
                leftIcon={<Text style={styles.fi}>💲</Text>} />
            )} />
            <Controller control={control} name="observaciones" render={({ field: { onChange, value } }) => (
              <Input label="Observaciones (opcional)" placeholder="Estado del bien, detalles adicionales..." value={value} onChangeText={onChange} multiline numberOfLines={2} />
            )} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fotos del Bien (máx. 4)</Text>
            <View style={styles.fotosGrid}>
              {fotos.map((uri) => (
                <View key={uri} style={styles.fotoWrap}>
                  <Image source={{ uri }} style={styles.fotoImg} />
                  <TouchableOpacity style={styles.fotoRemove} onPress={() => removePhoto(uri)}>
                    <Text style={styles.fotoRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {fotos.length < 4 && (
                <TouchableOpacity style={styles.fotoAdd} onPress={pickImage}>
                  <Text style={styles.fotoAddIcon}>📷</Text>
                  <Text style={styles.fotoAddText}>Agregar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Button title="Registrar Garantía" onPress={handleSubmit(onSubmit as any)} loading={saving} size="lg" />
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
  fi: { fontSize: 16 },
  fotosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fotoWrap: { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  fotoImg: { width: '100%', height: '100%' },
  fotoRemove: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  fotoRemoveText: { color: Colors.white, fontSize: 10, fontWeight: '800' },
  fotoAdd: {
    width: 80, height: 80, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: Colors.surface2,
  },
  fotoAddIcon: { fontSize: 22 },
  fotoAddText: { fontSize: 10, color: Colors.muted },
});
