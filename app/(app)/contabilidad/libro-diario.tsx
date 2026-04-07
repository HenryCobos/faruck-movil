import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { contabilidadService, AsientoContable } from '@/services/contabilidad.service';
import { SearchBar } from '@/components/ui/SearchBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { formatCurrency } from '@/utils/amortizacion';
import { Colors } from '@/constants/colors';

const TIPO_COLOR: Record<string, string> = {
  ingreso: Colors.success,
  egreso:  Colors.danger,
  activo:  Colors.info,
  pasivo:  Colors.warning,
};

function AsientoRow({ item }: { item: AsientoContable }) {
  const cuenta = (item as any).plan_cuentas;
  const color = TIPO_COLOR[cuenta?.tipo] ?? Colors.muted;
  return (
    <View style={styles.row}>
      <View style={[styles.rowDot, { backgroundColor: color }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowConcepto} numberOfLines={2}>{item.concepto}</Text>
        <Text style={styles.rowCuenta}>{cuenta?.codigo} — {cuenta?.nombre}</Text>
        <Text style={styles.rowFecha}>{new Date(item.fecha).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
      </View>
      <View style={styles.rowAmounts}>
        {item.debe > 0 && (
          <View style={[styles.amountBadge, { backgroundColor: `${Colors.danger}15` }]}>
            <Text style={[styles.amountLabel, { color: Colors.danger }]}>DEBE</Text>
            <Text style={[styles.amountValue, { color: Colors.danger }]}>{formatCurrency(item.debe)}</Text>
          </View>
        )}
        {item.haber > 0 && (
          <View style={[styles.amountBadge, { backgroundColor: `${Colors.success}15` }]}>
            <Text style={[styles.amountLabel, { color: Colors.success }]}>HABER</Text>
            <Text style={[styles.amountValue, { color: Colors.success }]}>{formatCurrency(item.haber)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function LibroDiarioScreen() {
  const insets = useSafeAreaInsets();
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [filtered, setFiltered] = useState<AsientoContable[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const load = useCallback(async (reset = false) => {
    const offset = reset ? 0 : page * PAGE_SIZE;
    try {
      const data = await contabilidadService.getLibroDiario(PAGE_SIZE, offset);
      if (reset) {
        setAsientos(data);
        setFiltered(data);
        setPage(1);
      } else {
        setAsientos(prev => [...prev, ...data]);
        setFiltered(prev => [...prev, ...data]);
        setPage(prev => prev + 1);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [page]);

  useEffect(() => { load(true); }, []);

  const onSearch = (q: string) => {
    setSearch(q);
    if (!q) { setFiltered(asientos); return; }
    const ql = q.toLowerCase();
    setFiltered(asientos.filter(a =>
      a.concepto?.toLowerCase().includes(ql) ||
      (a as any).plan_cuentas?.nombre?.toLowerCase().includes(ql) ||
      (a as any).plan_cuentas?.codigo?.includes(q)
    ));
  };

  const totalDebe  = filtered.reduce((s, a) => s + Number(a.debe), 0);
  const totalHaber = filtered.reduce((s, a) => s + Number(a.haber), 0);

  if (loading) return <LoadingScreen label="Cargando libro diario..." />;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Libro Diario</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.searchArea}>
        <SearchBar value={search} onChangeText={onSearch} placeholder="Buscar concepto o cuenta..." />

        <View style={styles.totalesRow}>
          <View style={styles.totalBox}>
            <Text style={styles.totalBoxLabel}>DEBE</Text>
            <Text style={[styles.totalBoxValue, { color: Colors.danger }]}>{formatCurrency(totalDebe)}</Text>
          </View>
          <View style={[styles.totalBox, { borderLeftWidth: 1, borderLeftColor: Colors.border }]}>
            <Text style={styles.totalBoxLabel}>HABER</Text>
            <Text style={[styles.totalBoxValue, { color: Colors.success }]}>{formatCurrency(totalHaber)}</Text>
          </View>
          <View style={[styles.totalBox, { borderLeftWidth: 1, borderLeftColor: Colors.border }]}>
            <Text style={styles.totalBoxLabel}>SALDO</Text>
            <Text style={[styles.totalBoxValue, { color: Math.abs(totalHaber - totalDebe) < 0.01 ? Colors.success : Colors.warning }]}>
              {formatCurrency(Math.abs(totalHaber - totalDebe))}
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AsientoRow item={item} />}
        contentContainerStyle={[styles.list, filtered.length === 0 && styles.listEmpty, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.accent} />}
        onEndReached={() => load()}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={<EmptyState icon="📒" title="Sin movimientos" description="No hay asientos contables aún." />}
        showsVerticalScrollIndicator={false}
      />
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
  backIcon: { fontSize: 20, color: Colors.white },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white },
  searchArea: { backgroundColor: Colors.surface, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 },
  totalesRow: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border,
    marginTop: 8,
  },
  totalBox: { flex: 1, padding: 10, alignItems: 'center', gap: 2 },
  totalBoxLabel: { fontSize: 9, color: Colors.muted, letterSpacing: 1.5, textTransform: 'uppercase' },
  totalBoxValue: { fontSize: 14, fontWeight: '800' },
  list: { padding: 14, gap: 8 },
  listEmpty: { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  rowDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  rowBody: { flex: 1, gap: 2 },
  rowConcepto: { fontSize: 13, fontWeight: '600', color: Colors.text },
  rowCuenta: { fontSize: 11, color: Colors.muted },
  rowFecha: { fontSize: 10, color: Colors.muted, marginTop: 2 },
  rowAmounts: { gap: 4, alignItems: 'flex-end' },
  amountBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center' },
  amountLabel: { fontSize: 8, letterSpacing: 1, fontWeight: '700' },
  amountValue: { fontSize: 13, fontWeight: '800' },
});
