import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garantiasService } from '@/services/garantias.service';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { Colors } from '@/constants/colors';
import { GarantiaType, GarantiaEstado } from '@/types';

const TIPO_ICON: Record<GarantiaType, string> = {
  inmueble: '🏠', vehiculo: '🚗', joya: '💍', electrodomestico: '📺', otro: '📦',
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [garantia, setGarantia] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { router.back(); return; }
    garantiasService.getById(id)
      .then(setGarantia)
      .catch(() => { Alert.alert('Error', 'No se pudo cargar la garantía'); router.back(); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingScreen />;
  if (!garantia) return null;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalle Garantía</Text>
        <TouchableOpacity
          onPress={() => router.push(`/(app)/garantias/editar?id=${id}` as any)}
          style={styles.editBtn}
        >
          <Text style={styles.editBtnText}>✏️ Editar</Text>
        </TouchableOpacity>
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
            <Text style={styles.sectionTitle}>📷 Fotos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fotosScroll}>
              {garantia.fotos.map((url: string, i: number) => (
                <Image key={i} source={{ uri: url }} style={styles.foto} />
              ))}
            </ScrollView>
          </View>
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
  editBtn: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { color: Colors.accent, fontWeight: '700', fontSize: 13 },
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
  linkBtn: { backgroundColor: `${Colors.accent}15`, borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 12, padding: 16, alignItems: 'center' },
  linkBtnText: { color: Colors.accent, fontWeight: '700', fontSize: 15 },
});
