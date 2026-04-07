import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { clientesService } from '@/services/clientes.service';
import { SearchBar } from '@/components/ui/SearchBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { Colors } from '@/constants/colors';
import { Cliente, ClienteEstado } from '@/types';

const ESTADO_VARIANT: Record<ClienteEstado, 'success' | 'danger' | 'warning'> = {
  activo: 'success',
  inactivo: 'default' as any,
  moroso: 'danger',
};

const ESTADO_LABEL: Record<ClienteEstado, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  moroso: 'Moroso',
};

function ClienteCard({ item }: { item: Cliente }) {
  const initials = `${item.nombre[0]}${item.apellido[0]}`.toUpperCase();
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(app)/clientes/${item.id}` as any)}
      activeOpacity={0.7}
    >
      <View style={[styles.avatar, { backgroundColor: scoringColor(item.scoring) + '22' }]}>
        <Text style={[styles.avatarText, { color: scoringColor(item.scoring) }]}>{initials}</Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardName}>{item.nombre} {item.apellido}</Text>
        <Text style={styles.cardSub}>{item.documento_tipo.toUpperCase()} {item.documento_numero}</Text>
        <Text style={styles.cardPhone}>📞 {item.telefono}</Text>
      </View>
      <View style={styles.cardRight}>
        <Badge label={ESTADO_LABEL[item.estado]} variant={ESTADO_VARIANT[item.estado]} />
        <View style={styles.scoring}>
          <Text style={[styles.scoringNum, { color: scoringColor(item.scoring) }]}>{item.scoring}</Text>
          <Text style={styles.scoringLbl}>score</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function scoringColor(s: number) {
  if (s >= 75) return Colors.success;
  if (s >= 50) return Colors.warning;
  return Colors.danger;
}

export default function ClientesListScreen() {
  const insets = useSafeAreaInsets();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtered, setFiltered] = useState<Cliente[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await clientesService.getAll();
      setClientes(data);
      setFiltered(data);
    } catch {
      if (!refreshing) Alert.alert('Error de conexión', 'No se pudieron cargar los clientes. Verifica tu conexión e intenta nuevamente.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  useFocusEffect(useCallback(() => { load(); }, []));

  const onSearch = async (text: string) => {
    setSearch(text);
    if (!text) { setFiltered(clientes); return; }
    const results = await clientesService.search(text);
    setFiltered(results);
  };

  if (loading) return <LoadingScreen label="Cargando clientes..." />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Clientes</Text>
            <Text style={styles.headerSub}>{clientes.length} registrados</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/(app)/clientes/nuevo')}
          >
            <Text style={styles.addBtnText}>+ Nuevo</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchWrap}>
          <SearchBar
            value={search}
            onChangeText={onSearch}
            placeholder="Buscar por nombre, CI, teléfono..."
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ClienteCard item={item} />}
        contentContainerStyle={[
          styles.list,
          filtered.length === 0 && styles.listEmpty,
          { paddingBottom: insets.bottom + 80 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        ListEmptyComponent={
          <EmptyState
            icon="👥"
            title={search ? 'Sin resultados' : 'No hay clientes'}
            description={search ? `No se encontró "${search}"` : 'Registra tu primer cliente para empezar'}
            actionLabel={!search ? '+ Registrar Cliente' : undefined}
            onAction={() => router.push('/(app)/clientes/nuevo')}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14, marginTop: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  addBtn: {
    backgroundColor: Colors.accent, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  searchWrap: {},
  list: { padding: 16, gap: 10 },
  listEmpty: { flex: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 16, fontWeight: '800' },
  cardContent: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  cardSub: { fontSize: 12, color: Colors.muted },
  cardPhone: { fontSize: 12, color: Colors.muted },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  scoring: { alignItems: 'center' },
  scoringNum: { fontSize: 15, fontWeight: '800' },
  scoringLbl: { fontSize: 9, color: Colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
});
