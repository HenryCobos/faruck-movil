import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { cobrosService, CuotaPendiente } from '@/services/cobros.service';
import { SearchBar } from '@/components/ui/SearchBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/utils/amortizacion';
import { Colors } from '@/constants/colors';

function diasLabel(dias: number) {
  if (dias === 0) return null;
  if (dias === 1) return '1 día de mora';
  return `${dias} días de mora`;
}

function CuotaCard({ item }: { item: CuotaPendiente }) {
  const isVencida = item.dias_mora > 0;
  const mora = item.mora_calculada ?? cobrosService.calcularMora(item.monto_total, item.fecha_vencimiento);
  const totalConMora = item.monto_total + mora;

  return (
    <TouchableOpacity
      style={[styles.card, isVencida && styles.cardVencida]}
      onPress={() => router.push(`/(app)/cobros/${item.id}` as any)}
      activeOpacity={0.7}
    >
      <View style={styles.cardLeft}>
        <View style={[styles.cuotaBadge, { backgroundColor: isVencida ? Colors.danger + '20' : Colors.accent + '20' }]}>
          <Text style={[styles.cuotaNum, { color: isVencida ? Colors.danger : Colors.accent }]}>
            #{item.numero_cuota}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.clienteName}>{item.cliente_nombre} {item.cliente_apellido}</Text>
        <Text style={styles.clienteDoc}>{item.cliente_documento}</Text>
        <Text style={styles.vencimiento}>
          Vence: {new Date(item.fecha_vencimiento).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Text>
        {isVencida && (
          <Text style={styles.moraLabel}>⚠️ {diasLabel(item.dias_mora)}</Text>
        )}
      </View>

      <View style={styles.cardRight}>
        <Text style={[styles.total, isVencida && styles.totalVencida]}>
          {formatCurrency(totalConMora)}
        </Text>
        {mora > 0 && (
          <Text style={styles.moraAmount}>+{formatCurrency(mora)} mora</Text>
        )}
        <Badge label={isVencida ? 'Vencida' : 'Pendiente'} variant={isVencida ? 'danger' : 'default'} />
      </View>
    </TouchableOpacity>
  );
}

export default function CobrosScreen() {
  const insets = useSafeAreaInsets();
  const [cuotas, setCuotas] = useState<CuotaPendiente[]>([]);
  const [filtered, setFiltered] = useState<CuotaPendiente[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState<'todas' | 'vencidas' | 'hoy'>('todas');

  // Sólo carga datos desde la red; no toca el filtro activo
  const load = useCallback(async () => {
    try {
      const data = await cobrosService.getCuotasPendientes();
      setCuotas(data);
    } catch {
      if (!refreshing) Alert.alert('Error de conexión', 'No se pudieron cargar las cuotas. Verifica tu conexión e intenta nuevamente.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  useFocusEffect(useCallback(() => { load(); }, []));

  // El filtrado se recalcula siempre que cambien los datos O el filtro/búsqueda
  React.useEffect(() => {
    let r = cuotas;
    if (filtro === 'vencidas') r = r.filter(c => c.dias_mora > 0);
    if (filtro === 'hoy') {
      const hoy = new Date().toISOString().split('T')[0];
      r = r.filter(c => c.fecha_vencimiento === hoy);
    }
    if (search) {
      const ql = search.toLowerCase();
      r = r.filter(c =>
        c.cliente_nombre?.toLowerCase().includes(ql) ||
        c.cliente_apellido?.toLowerCase().includes(ql) ||
        c.cliente_documento?.includes(search)
      );
    }
    setFiltered(r);
  }, [cuotas, filtro, search]);

  const onSearch = (text: string) => setSearch(text);
  const onFiltro = (f: 'todas' | 'vencidas' | 'hoy') => setFiltro(f);

  const stats = {
    total: cuotas.length,
    vencidas: cuotas.filter(c => c.dias_mora > 0).length,
    hoy: cuotas.filter(c => c.fecha_vencimiento === new Date().toISOString().split('T')[0]).length,
    montoPendiente: cuotas.reduce((s, c) => s + c.monto_total + (c.mora_calculada ?? 0), 0),
  };

  if (loading) return <LoadingScreen label="Cargando cobros..." />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Cobros</Text>

        <View style={styles.statsRow}>
          <TouchableOpacity style={[styles.stat, filtro === 'todas' && styles.statActive]} onPress={() => onFiltro('todas')}>
            <Text style={[styles.statNum, filtro === 'todas' && styles.statNumActive]}>{stats.total}</Text>
            <Text style={styles.statLbl}>Todas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.stat, filtro === 'vencidas' && styles.statActive, stats.vencidas > 0 && styles.statDanger]} onPress={() => onFiltro('vencidas')}>
            <Text style={[styles.statNum, { color: stats.vencidas > 0 ? Colors.danger : Colors.muted }]}>{stats.vencidas}</Text>
            <Text style={styles.statLbl}>Vencidas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.stat, filtro === 'hoy' && styles.statActive]} onPress={() => onFiltro('hoy')}>
            <Text style={[styles.statNum, { color: Colors.warning }]}>{stats.hoy}</Text>
            <Text style={styles.statLbl}>Vencen hoy</Text>
          </TouchableOpacity>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: Colors.accent, fontSize: 13 }]}>
              {formatCurrency(stats.montoPendiente)}
            </Text>
            <Text style={styles.statLbl}>Por cobrar</Text>
          </View>
        </View>

        <SearchBar value={search} onChangeText={onSearch} placeholder="Buscar cliente o documento..." />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CuotaCard item={item} />}
        contentContainerStyle={[
          styles.list,
          filtered.length === 0 && styles.listEmpty,
          { paddingBottom: insets.bottom + 80 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        ListEmptyComponent={
          <EmptyState icon="💳" title="Sin cuotas pendientes" description="Todas las cuotas están al día. ¡Excelente!" />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.white, marginTop: 8, marginBottom: 14 },
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 10, alignItems: 'center' },
  statActive: { backgroundColor: 'rgba(245,166,35,0.2)', borderWidth: 1, borderColor: Colors.accent },
  statDanger: { backgroundColor: 'rgba(240,92,92,0.15)' },
  statNum: { fontSize: 16, fontWeight: '800', color: Colors.white },
  statNumActive: { color: Colors.accent },
  statLbl: { fontSize: 9, color: 'rgba(255,255,255,0.6)', marginTop: 2, textAlign: 'center' },
  list: { padding: 14, gap: 10 },
  listEmpty: { flex: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardVencida: { borderLeftWidth: 3, borderLeftColor: Colors.danger },
  cardLeft: { flexShrink: 0 },
  cuotaBadge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cuotaNum: { fontSize: 13, fontWeight: '800' },
  cardBody: { flex: 1, gap: 2 },
  clienteName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  clienteDoc: { fontSize: 11, color: Colors.muted },
  vencimiento: { fontSize: 11, color: Colors.muted },
  moraLabel: { fontSize: 11, color: Colors.danger, fontWeight: '600' },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  total: { fontSize: 16, fontWeight: '800', color: Colors.text },
  totalVencida: { color: Colors.danger },
  moraAmount: { fontSize: 10, color: Colors.danger, fontWeight: '600' },
});
