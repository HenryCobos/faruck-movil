import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Alert, TouchableOpacity, Image, Modal, Dimensions, StatusBar,
} from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garantiasService } from '@/services/garantias.service';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Colors } from '@/constants/colors';

const schema = z.object({
  tipo:          z.enum(['inmueble', 'vehiculo', 'joya', 'electrodomestico', 'cheque', 'letra_de_cambio', 'otro']),
  descripcion:   z.string().min(10, 'Describe el bien con más detalle'),
  valor_avaluo:  z.coerce.number().min(1, 'El valor debe ser mayor a 0'),
  observaciones: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const TIPO_OPTIONS: SelectOption[] = [
  { label: 'Inmueble / Casa / Terreno', value: 'inmueble',         icon: '🏠' },
  { label: 'Vehículo / Moto',           value: 'vehiculo',         icon: '🚗' },
  { label: 'Joya / Oro / Plata',        value: 'joya',             icon: '💍' },
  { label: 'Electrodoméstico',          value: 'electrodomestico', icon: '📺' },
  { label: 'Cheque',                    value: 'cheque',           icon: '🏦' },
  { label: 'Letra de Cambio',           value: 'letra_de_cambio',  icon: '📋' },
  { label: 'Otro bien de valor',        value: 'otro',             icon: '📦' },
];

export default function EditarGarantiaScreen() {
  const { id, fromClienteId } = useLocalSearchParams<{ id: string; fromClienteId?: string }>();
  const insets = useSafeAreaInsets();
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fotosExistentes, setFotosExistentes] = useState<string[]>([]);
  const [fotasNuevas, setFotosNuevas] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  useEffect(() => {
    if (!id) { setLoadingData(false); return; }
    garantiasService.getById(id)
      .then(g => {
        reset({
          tipo:          g.tipo as any,
          descripcion:   g.descripcion,
          valor_avaluo:  g.valor_avaluo,
          observaciones: g.observaciones ?? '',
        });
        setFotosExistentes(Array.isArray(g.fotos) ? (g.fotos as string[]) : []);
      })
      .catch(() => { Alert.alert('Error', 'No se pudo cargar la garantía'); fromClienteId ? router.replace(`/(app)/clientes/${fromClienteId}` as any) : router.canGoBack() ? router.back() : router.replace('/(app)/garantias'); })
      .finally(() => setLoadingData(false));
  }, [id]);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso necesario', 'Necesitamos acceso a tu galería'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.7, selectionLimit: 4,
    });
    if (!result.canceled) {
      const total = fotosExistentes.length + fotasNuevas.length;
      const disponibles = 4 - total;
      if (disponibles <= 0) { Alert.alert('Máximo 4 fotos'); return; }
      setFotosNuevas(prev => [...prev, ...result.assets.slice(0, disponibles).map(a => a.uri)]);
    }
  };

  const removeExistente = (url: string) => setFotosExistentes(prev => prev.filter(f => f !== url));
  const removeNueva    = (uri: string) => setFotosNuevas(prev => prev.filter(f => f !== uri));

  const onSubmit = async (data: FormData) => {
    if (!id) return;
    setSaving(true);
    try {
      // Subir fotos nuevas
      const urlsNuevas = await Promise.all(
        fotasNuevas.map(uri => garantiasService.uploadFoto(uri, id))
      );
      await garantiasService.update(id, {
        ...data,
        valor_avaluo: Number(data.valor_avaluo),
        fotos: [...fotosExistentes, ...urlsNuevas],
      } as any);
      Alert.alert('✅ Guardado', 'La garantía fue actualizada.', [
        { text: 'Aceptar', onPress: () => fromClienteId ? router.replace(`/(app)/clientes/${fromClienteId}` as any) : router.canGoBack() ? router.back() : router.replace('/(app)/garantias') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loadingData) return <LoadingScreen label="Cargando garantía..." />;

  const totalFotos = fotosExistentes.length + fotasNuevas.length;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => fromClienteId ? router.replace(`/(app)/clientes/${fromClienteId}` as any) : router.canGoBack() ? router.back() : router.replace('/(app)/garantias')} style={styles.backBtn}>
          <Text style={styles.backIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar Garantía</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Visor de fotos a pantalla completa */}
      {viewerIndex !== null && (() => {
        const allUris = [...fotosExistentes, ...fotasNuevas];
        return (
          <Modal
            visible={viewerIndex !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setViewerIndex(null)}
            statusBarTranslucent
          >
            <StatusBar backgroundColor="#000" barStyle="light-content" />
            <View style={styles.viewerBg}>
              <View style={styles.viewerHeader}>
                <Text style={styles.viewerCounter}>{viewerIndex + 1} / {allUris.length}</Text>
                <TouchableOpacity onPress={() => setViewerIndex(null)} style={styles.viewerClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={styles.viewerCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <Image source={{ uri: allUris[viewerIndex] }} style={styles.viewerImage} resizeMode="contain" />
              {allUris.length > 1 && (
                <View style={styles.viewerNav}>
                  <TouchableOpacity
                    style={[styles.viewerNavBtn, viewerIndex === 0 && styles.viewerNavBtnDisabled]}
                    onPress={() => setViewerIndex(prev => (prev !== null ? Math.max(0, prev - 1) : 0))}
                    disabled={viewerIndex === 0}
                  >
                    <Text style={styles.viewerNavText}>‹</Text>
                  </TouchableOpacity>
                  <View style={styles.viewerDots}>
                    {allUris.map((_u, di) => (
                      <TouchableOpacity key={di} onPress={() => setViewerIndex(di)}>
                        <View style={[styles.viewerDot, di === viewerIndex && styles.viewerDotActive]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[styles.viewerNavBtn, viewerIndex === allUris.length - 1 && styles.viewerNavBtnDisabled]}
                    onPress={() => setViewerIndex(prev => (prev !== null ? Math.min(allUris.length - 1, prev + 1) : 0))}
                    disabled={viewerIndex === allUris.length - 1}
                  >
                    <Text style={styles.viewerNavText}>›</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Modal>
        );
      })()}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Descripción del Bien</Text>
            <Controller control={control} name="tipo" render={({ field: { onChange, value } }) => (
              <Select label="Tipo de Bien" options={TIPO_OPTIONS} value={value} onSelect={onChange} error={errors.tipo?.message} />
            )} />
            <Controller control={control} name="descripcion" render={({ field: { onChange, value } }) => (
              <Input label="Descripción detallada" value={value} onChangeText={onChange}
                multiline numberOfLines={3} error={errors.descripcion?.message} />
            )} />
            <Controller control={control} name="valor_avaluo" render={({ field: { onChange, value } }) => (
              <Input label="Valor de Avalúo ($)" value={String(value || '')} onChangeText={onChange}
                keyboardType="numeric" error={errors.valor_avaluo?.message}
                hint="Valor estimado del bien en el mercado actual"
                leftIcon={<Text style={styles.fi}>💲</Text>} />
            )} />
            <Controller control={control} name="observaciones" render={({ field: { onChange, value } }) => (
              <Input label="Observaciones (opcional)" value={value} onChangeText={onChange} multiline numberOfLines={2} />
            )} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fotos del Bien ({totalFotos}/4)</Text>
            <View style={styles.fotosGrid}>
              {fotosExistentes.map((url, i) => (
                <View key={url} style={styles.fotoWrap}>
                  <TouchableOpacity onPress={() => setViewerIndex(i)} activeOpacity={0.85} style={StyleSheet.absoluteFill}>
                    <Image source={{ uri: url }} style={styles.fotoImg} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.fotoRemove} onPress={() => removeExistente(url)}>
                    <Text style={styles.fotoRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {fotasNuevas.map((uri, j) => (
                <View key={uri} style={styles.fotoWrap}>
                  <TouchableOpacity onPress={() => setViewerIndex(fotosExistentes.length + j)} activeOpacity={0.85} style={StyleSheet.absoluteFill}>
                    <Image source={{ uri }} style={styles.fotoImg} />
                  </TouchableOpacity>
                  <View style={styles.fotaNuevaBadge}><Text style={styles.fotaNuevaText}>Nueva</Text></View>
                  <TouchableOpacity style={styles.fotoRemove} onPress={() => removeNueva(uri)}>
                    <Text style={styles.fotoRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {totalFotos < 4 && (
                <TouchableOpacity style={styles.fotoAdd} onPress={pickImage}>
                  <Text style={styles.fotoAddIcon}>📷</Text>
                  <Text style={styles.fotoAddText}>Agregar</Text>
                </TouchableOpacity>
              )}
            </View>
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
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  fotoRemoveText: { color: Colors.white, fontSize: 10, fontWeight: '800' },
  fotaNuevaBadge: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: `${Colors.accent}CC`, paddingVertical: 2, alignItems: 'center',
  },
  fotaNuevaText: { fontSize: 9, color: Colors.primary, fontWeight: '800' },
  fotoAdd: {
    width: 80, height: 80, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: Colors.surface2,
  },
  fotoAddIcon: { fontSize: 22 },
  fotoAddText: { fontSize: 10, color: Colors.muted },
  // Viewer modal
  viewerBg: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  viewerHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  viewerCounter: { color: '#fff', fontSize: 15, fontWeight: '600' },
  viewerClose: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  viewerCloseText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  viewerImage: { width: SCREEN_W, height: SCREEN_H * 0.72, alignSelf: 'center' },
  viewerNav: {
    position: 'absolute', bottom: 48, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  viewerNavBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  viewerNavBtnDisabled: { opacity: 0.25 },
  viewerNavText: { color: '#fff', fontSize: 32, fontWeight: '300', lineHeight: 40 },
  viewerDots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  viewerDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  viewerDotActive: { backgroundColor: '#fff', width: 9, height: 9, borderRadius: 5 },
});
