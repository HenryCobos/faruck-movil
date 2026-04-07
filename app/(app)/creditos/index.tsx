import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { prestamosService } from '@/services/prestamos.service';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { Colors } from '@/constants/colors';

const ESTADO_VARIANT: Record<string, any> = {
  solicitado: 'warning', aprobado: 'info', activo: 'success',
  cancelado: 'default', vencido: 'danger', ejecutado: 'danger',
};

const ESTADO_LABEL: Record<string, string> = {
  solicitado: 'Solicitado', aprobado: 'Aprobado', activo: 'Activo',
  cancelado: 'Cancelado', vencido: 'Vencido', ejecutado: 'Ejecutado',
};

const TIPO_ICON: Record<string, string> = {
  inmueble: '🏠', vehiculo: '🚗', joya: '💍', electrodomestico: '📺', otro: '📦',
};

function PrestamoCard({ item }: { item: any }) {
  const cliente = item.clientes;
  const garantia = item.garantias;
  return (
    <TouchableOpacity
      style={[styles.card, item.estado === 'vencido' && styles.cardVencido]}
      onPress={() => router.push(`/(app)/creditos/${item.id}` as any)}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.cardAmount}>${item.monto_principal?.toLocaleString('es')}</Text>
          <Text style={styles.cardClient}>{cliente?.nombre} {cliente?.apellido}</Text>
        </View>
        <Badge label={ESTADO_LABEL[item.estado] ?? item.estado} variant={ESTADO_VARIANT[item.estado] ?? 'default'} />
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.cardDetail}>
          {garantia && `${TIPO_ICON[garantia.tipo] ?? '📦'} ${garantia.tipo}`} · {item.plazo_meses} meses · {(item.tasa_mensual * 100).toFixed(1)}% mes
        </Text>
        <Text style={styles.cardDate}>
          {item.fecha_desembolso
            ? new Date(item.fecha_desembolso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
            : new Date(item.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function CreditosListScreen() {
  const insets = useSafeAreaInsets();
  const [prestamos, setPrestamos] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');

  // Sólo carga datos desde la red; no toca el filtro activo
  const load = useCallback(async () => {
    try {
      const data = await prestamosService.getAll();
      setPrestamos(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, []));

  // El filtrado se recalcula siempre que cambien los datos O el filtro/búsqueda
  React.useEffect(() => {
    let r = prestamos;
    if (filtroEstado !== 'todos') r = r.filter(p => p.estado === filtroEstado);
    if (search) r = r.filter(p =>
      p.clientes?.nombre?.toLowerCase().includes(search.toLowerCase()) ||
      p.clientes?.apellido?.toLowerCase().includes(search.toLowerCase()) ||
      p.clientes?.documento_numero?.includes(search)
    );
    setFiltered(r);
  }, [prestamos, filtroEstado, search]);

  const onSearch = (text: string) => setSearch(text);
  const onFiltro = (estado: string) => setFiltroEstado(estado);

  const stats = {
    total: prestamos.filter(p => p.estado === 'activo').reduce((s, p) => s + p.monto_principal, 0),
    activos: prestamos.filter(p => p.estado === 'activo').length,
    vencidos: prestamos.filter(p => p.estado === 'vencido').length,
  };

  if (loading) return <LoadingScreen label="Cargando créditos..." />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Créditos</Text>
            <Text style={styles.headerSub}>{prestamos.length} registrados</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(app)/creditos/nuevo')}>
            <Text style={styles.addBtnText}>+ Nuevo</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Text style={styles.statVal}>${(stats.total / 1000).toFixed(1)}k</Text>
            <Text style={styles.statLbl}>Cartera</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={[styles.statVal, { color: Colors.success }]}>{stats.activos}</Text>
            <Text style={styles.statLbl}>Activos</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={[styles.statVal, { color: stats.vencidos > 0 ? Colors.danger : Colors.muted }]}>{stats.vencidos}</Text>
            <Text style={styles.statLbl}>Vencidos</Text>
          </View>
        </View>
        <SearchBar value={search} onChangeText={onSearch} placeholder="Buscar por cliente, CI..." />
        <View style={styles.filtros}>
          {['todos', 'activo', 'solicitado', 'aprobado', 'vencido'].map(e => (
            <TouchableOpacity key={e} style={[styles.filtroBtn, filtroEstado === e && styles.filtroBtnActive]} onPress={() => onFiltro(e)}>
              <Text style={[styles.filtroBtnText, filtroEstado === e && styles.filtroBtnTextActive]}>
                {e === 'todos' ? 'Todos' : ESTADO_LABEL[e]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PrestamoCard item={item} />}
        contentContainerStyle={[styles.list, filtered.length === 0 && styles.listEmpty, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        ListEmptyComponent={
          <EmptyState icon="💰" title="No hay créditos" description="Crea el primer préstamo para comenzar"
            actionLabel="+ Nuevo Préstamo" onAction={() => router.push('/(app)/creditos/nuevo')} />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.white },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  addBtn: { backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '800', color: Colors.accent },
  statLbl: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  filtros: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  filtroBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  filtroBtnActive: { backgroundColor: Colors.accent },
  filtroBtnText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  filtroBtnTextActive: { color: Colors.white },
  list: { padding: 16, gap: 10 },
  listEmpty: { flex: 1 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, gap: 10,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardVencido: { borderLeftWidth: 3, borderLeftColor: Colors.danger },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardAmount: { fontSize: 20, fontWeight: '800', color: Colors.text },
  cardClient: { fontSize: 13, color: Colors.muted, marginTop: 2 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDetail: { fontSize: 12, color: Colors.muted, textTransform: 'capitalize' },
  cardDate: { fontSize: 11, color: Colors.muted },
});
