import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { garantiasService } from '@/services/garantias.service';
import { SearchBar } from '@/components/ui/SearchBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { Colors } from '@/constants/colors';
import { Garantia, GarantiaType, GarantiaEstado } from '@/types';

const TIPO_ICON: Record<GarantiaType, string> = {
  inmueble: '🏠', vehiculo: '🚗', joya: '💍',
  electrodomestico: '📺', otro: '📦',
};

const ESTADO_VARIANT: Record<GarantiaEstado, any> = {
  disponible: 'default', en_garantia: 'warning',
  devuelta: 'success', ejecutada: 'danger',
};

const ESTADO_LABEL: Record<GarantiaEstado, string> = {
  disponible: 'Disponible', en_garantia: 'En Garantía',
  devuelta: 'Devuelta', ejecutada: 'Ejecutada',
};

function GarantiaCard({ item }: { item: any }) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(app)/garantias/${item.id}` as any)}
      activeOpacity={0.7}
    >
      <View style={styles.cardIcon}>
        <Text style={styles.cardIconText}>{TIPO_ICON[item.tipo as GarantiaType]}</Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardDesc} numberOfLines={2}>{item.descripcion}</Text>
        <Text style={styles.cardOwner}>
          👤 {item.clientes?.nombre} {item.clientes?.apellido}
        </Text>
        <Text style={styles.cardValue}>Avalúo: ${item.valor_avaluo?.toLocaleString('es')}</Text>
      </View>
      <View style={styles.cardRight}>
        <Badge label={ESTADO_LABEL[item.estado as GarantiaEstado] ?? item.estado} variant={ESTADO_VARIANT[item.estado as GarantiaEstado] ?? 'default'} />
        <Text style={styles.cardType}>{item.tipo}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function GarantiasListScreen() {
  const insets = useSafeAreaInsets();
  const [garantias, setGarantias] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await garantiasService.getAll();
      setGarantias(data);
      setFiltered(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, []));

  const onSearch = (text: string) => {
    setSearch(text);
    if (!text) { setFiltered(garantias); return; }
    const q = text.toLowerCase();
    setFiltered(garantias.filter(g =>
      g.descripcion?.toLowerCase().includes(q) ||
      g.tipo?.toLowerCase().includes(q) ||
      g.clientes?.nombre?.toLowerCase().includes(q) ||
      g.clientes?.apellido?.toLowerCase().includes(q)
    ));
  };

  if (loading) return <LoadingScreen label="Cargando garantías..." />;

  const byEstado = {
    en_garantia: garantias.filter(g => g.estado === 'en_garantia').length,
    disponible: garantias.filter(g => g.estado === 'disponible').length,
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Garantías</Text>
            <Text style={styles.headerSub}>{garantias.length} registradas</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(app)/garantias/nuevo')}>
            <Text style={styles.addBtnText}>+ Nueva</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.chips}>
          <View style={styles.chip}>
            <Text style={styles.chipNum}>{byEstado.en_garantia}</Text>
            <Text style={styles.chipLbl}>En Garantía</Text>
          </View>
          <View style={[styles.chip, styles.chipAvail]}>
            <Text style={[styles.chipNum, { color: Colors.success }]}>{byEstado.disponible}</Text>
            <Text style={styles.chipLbl}>Disponibles</Text>
          </View>
        </View>
        <SearchBar value={search} onChangeText={onSearch} placeholder="Buscar por tipo, descripción..." />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <GarantiaCard item={item} />}
        contentContainerStyle={[styles.list, filtered.length === 0 && styles.listEmpty, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        ListEmptyComponent={
          <EmptyState icon="🏠" title={search ? 'Sin resultados' : 'No hay garantías'} description="Registra el primer bien en garantía"
            actionLabel={!search ? '+ Registrar Garantía' : undefined} onAction={() => router.push('/(app)/garantias/nuevo')} />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 8 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  addBtn: { backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', flexDirection: 'row', gap: 6 },
  chipAvail: { backgroundColor: `${Colors.success}22` },
  chipNum: { fontSize: 16, fontWeight: '800', color: Colors.accent },
  chipLbl: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  list: { padding: 16, gap: 10 },
  listEmpty: { flex: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: `${Colors.accent}15`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardIconText: { fontSize: 24 },
  cardContent: { flex: 1, gap: 3 },
  cardDesc: { fontSize: 14, fontWeight: '600', color: Colors.text, lineHeight: 20 },
  cardOwner: { fontSize: 12, color: Colors.muted },
  cardValue: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  cardType: { fontSize: 10, color: Colors.muted, textTransform: 'capitalize', letterSpacing: 0.5 },
});
