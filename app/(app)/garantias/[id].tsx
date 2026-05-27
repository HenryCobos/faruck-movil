import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Modal, Dimensions, StatusBar } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garantiasService } from '@/services/garantias.service';
import { useAuthStore } from '@/stores/auth.store';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { Colors } from '@/constants/colors';
import { GarantiaType, GarantiaEstado } from '@/types';

const TIPO_ICON: Record<GarantiaType, string> = {
  inmueble: '🏠', vehiculo: '🚗', joya: '💍',
  electrodomestico: '📺', cheque: '🏦', letra_de_cambio: '📋', otro: '📦',
};
const ESTADO_VARIANT: Record<GarantiaEstado, any> = {
  disponible: 'default', en_garantia: 'warning', devuelta: 'success', ejecutada: 'danger',
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function GarantiaDetailScreen() {
  const { id, fromClienteId } = useLocalSearchParams<{ id: string; fromClienteId?: string }>();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const [garantia, setGarantia] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const goBack = useCallback(() => {
    if (fromClienteId) {
      router.replace(`/(app)/clientes/${fromClienteId}` as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/garantias');
    }
  }, [fromClienteId]);

  const load = useCallback(() => {
    if (!id) { goBack(); return; }
    garantiasService.getById(id)
      .then(setGarantia)
      .catch(() => { Alert.alert('Error', 'No se pudo cargar la garantía'); goBack(); })
      .finally(() => setLoading(false));
  }, [id, goBack]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleEliminar = () => {
    if (!id || !garantia) return;
    Alert.alert(
      '⚠️ Eliminar Garantía',
      `¿Estás seguro de eliminar la garantía "${garantia.descripcion?.substring(0, 50)}"?\n\nEsta acción es permanente e irreversible.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive', onPress: async () => {
            try {
              await garantiasService.eliminar(id);
              goBack();
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'No se pudo eliminar la garantía');
            }
          },
        },
      ],
    );
  };

  if (loading) return <LoadingScreen />;
  if (!garantia) return null;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalle Garantía</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => router.push(`/(app)/garantias/editar?id=${id}${fromClienteId ? `&fromClienteId=${fromClienteId}` : ''}` as any)}
            style={styles.editBtn}
          >
            <Text style={styles.editBtnText}>✏️ Editar</Text>
          </TouchableOpacity>
          {profile?.rol === 'admin' && (
            <TouchableOpacity onPress={handleEliminar} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>{TIPO_ICON[garantia.tipo as GarantiaType]}</Text>
          <Text style={styles.heroDesc}>{garantia.descripcion}</Text>
          <View style={styles.heroBadges}>
            <Badge label={garantia.estado?.replace('_', ' ')} variant={ESTADO_VARIANT[garantia.estado as GarantiaEstado]} />
            <View style={styles.avaluoBadge}>
              <Text style={styles.avaluoText}>Avalúo: ${garantia.valor_avaluo?.toLocaleString('es')}</Text>
            </View>
          </View>
        </View>

        {/* Fotos */}
        {garantia.fotos?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📷 Fotos ({garantia.fotos.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fotosScroll}>
              {garantia.fotos.map((url: string, i: number) => (
                <TouchableOpacity key={i} onPress={() => setViewerIndex(i)} activeOpacity={0.85}>
                  <Image source={{ uri: url }} style={styles.foto} />
                  <View style={styles.fotoOverlay}>
                    <Text style={styles.fotoOverlayIcon}>🔍</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Visor de fotos */}
        {garantia.fotos?.length > 0 && viewerIndex !== null && (
          <Modal
            visible={viewerIndex !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setViewerIndex(null)}
            statusBarTranslucent
          >
            <StatusBar backgroundColor="#000" barStyle="light-content" />
            <View style={styles.viewerBg}>
              {/* Header del visor */}
              <View style={styles.viewerHeader}>
                <Text style={styles.viewerCounter}>{viewerIndex + 1} / {garantia.fotos.length}</Text>
                <TouchableOpacity onPress={() => setViewerIndex(null)} style={styles.viewerClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={styles.viewerCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Imagen principal */}
              <Image
                source={{ uri: garantia.fotos[viewerIndex] }}
                style={styles.viewerImage}
                resizeMode="contain"
              />

              {/* Navegación prev / next */}
              {garantia.fotos.length > 1 && (
                <View style={styles.viewerNav}>
                  <TouchableOpacity
                    style={[styles.viewerNavBtn, viewerIndex === 0 && styles.viewerNavBtnDisabled]}
                    onPress={() => setViewerIndex(prev => (prev !== null ? Math.max(0, prev - 1) : 0))}
                    disabled={viewerIndex === 0}
                  >
                    <Text style={styles.viewerNavText}>‹</Text>
                  </TouchableOpacity>
                  <View style={styles.viewerDots}>
                    {garantia.fotos.map((_: any, di: number) => (
                      <TouchableOpacity key={di} onPress={() => setViewerIndex(di)}>
                        <View style={[styles.viewerDot, di === viewerIndex && styles.viewerDotActive]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[styles.viewerNavBtn, viewerIndex === garantia.fotos.length - 1 && styles.viewerNavBtnDisabled]}
                    onPress={() => setViewerIndex(prev => (prev !== null ? Math.min(garantia.fotos.length - 1, prev + 1) : 0))}
                    disabled={viewerIndex === garantia.fotos.length - 1}
                  >
                    <Text style={styles.viewerNavText}>›</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Modal>
        )}

        {/* Propietario */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👤 Propietario</Text>
          {garantia.clientes && (
            <>
              <InfoRow label="Nombre" value={`${garantia.clientes.nombre} ${garantia.clientes.apellido}`} />
              <InfoRow label="Documento" value={garantia.clientes.documento_numero} />
              {garantia.clientes.telefono && <InfoRow label="Teléfono" value={garantia.clientes.telefono} />}
            </>
          )}
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Detalles</Text>
          <InfoRow label="Tipo de Bien" value={garantia.tipo} />
          <InfoRow label="Valor de Avalúo" value={`$${garantia.valor_avaluo?.toLocaleString('es')}`} />
          <InfoRow label="Estado" value={garantia.estado?.replace('_', ' ')} />
          <InfoRow label="Registrado" value={new Date(garantia.created_at).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })} />
          {garantia.observaciones && <InfoRow label="Observaciones" value={garantia.observaciones} />}
        </View>

        {garantia.estado === 'disponible' && (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => router.push(`/(app)/creditos/nuevo?garantiaId=${id}`)}
          >
            <Text style={styles.linkBtnText}>💰 Crear préstamo con esta garantía</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 22, color: Colors.white },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { color: Colors.accent, fontWeight: '700', fontSize: 13 },
  deleteBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: `${Colors.danger}35`, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 16 },
  scroll: { padding: 16, gap: 14 },
  hero: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24, alignItems: 'center', gap: 10,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  heroIcon: { fontSize: 52 },
  heroDesc: { fontSize: 15, fontWeight: '600', color: Colors.text, textAlign: 'center', lineHeight: 22 },
  heroBadges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  avaluoBadge: { backgroundColor: `${Colors.accent}18`, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  avaluoText: { color: Colors.accent, fontWeight: '700', fontSize: 13 },
  section: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, gap: 0,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel: { fontSize: 13, color: Colors.muted, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.text, flex: 2, textAlign: 'right', textTransform: 'capitalize' },
  fotosScroll: { marginTop: 8 },
  foto: { width: 120, height: 100, borderRadius: 10, marginRight: 10 },
  fotoOverlay: {
    position: 'absolute', bottom: 6, right: 16,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  fotoOverlayIcon: { fontSize: 11 },
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
  linkBtn: { backgroundColor: `${Colors.accent}15`, borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 12, padding: 16, alignItems: 'center' },
  linkBtnText: { color: Colors.accent, fontWeight: '700', fontSize: 15 },
});
