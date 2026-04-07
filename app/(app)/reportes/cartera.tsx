import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { reportesService, PrestamoCartera, ResumenCartera } from '@/services/reportes.service';
import { SearchBar } from '@/components/ui/SearchBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { formatCurrency } from '@/utils/amortizacion';
import { Colors } from '@/constants/colors';

const ESTADOS = ['todos', 'activo', 'cancelado', 'vencido'] as const;
type EstadoFiltro = typeof ESTADOS[number];

const ESTADO_COLOR: Record<string, string> = {
  activo: Colors.success, cancelado: Colors.info, vencido: Colors.danger, solicitado: Colors.warning,
};

function PrestamoCard({ item }: { item: PrestamoCartera }) {
  const color = ESTADO_COLOR[item.estado] ?? Colors.muted;
  const progreso = item.cuotas_total > 0 ? item.cuotas_pagadas / item.cuotas_total : 0;

  return (
    <View style={[styles.card, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      {/* Header: nombre + estado */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.clienteNombre}>{item.cliente_nombre} {item.cliente_apellido}</Text>
          <Text style={styles.clienteDoc}>{item.cliente_documento}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.rentBadge}>
            <Text style={styles.rentBadgeText}>+{item.rentabilidad}%</Text>
          </View>
          <View style={[styles.estadoBadge, { backgroundColor: `${color}20` }]}>
            <Text style={[styles.estadoText, { color }]}>{item.estado.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      {/* Fila principal: monto → total a cobrar */}
      <View style={styles.cardAmounts}>
        <View>
          <Text style={styles.amountLabel}>Monto prestado</Text>
          <Text style={styles.amountValue}>{formatCurrency(item.monto_principal)}</Text>
        </View>
        <Text style={styles.arrowSep}>→</Text>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.amountLabel}>Total a cobrar</Text>
          <Text style={[styles.amountValue, { color: Colors.primary }]}>{formatCurrency(item.total_a_cobrar)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.amountLabel}>Saldo capital</Text>
          <Text style={[styles.amountValue, { color: item.saldo_pendiente > 0 ? Colors.danger : Colors.success }]}>
            {formatCurrency(item.saldo_pendiente)}
          </Text>
        </View>
      </View>

      {/* Fila de métricas secundarias */}
      <View style={styles.metricRow}>
        <Text style={styles.metricItem}>
          <Text style={styles.metricLabel}>Interés: </Text>
          <Text style={[styles.metricValue, { color: Colors.success }]}>{formatCurrency(item.interes_proyectado)}</Text>
        </Text>
        <Text style={styles.metricSep}>·</Text>
        <Text style={styles.metricItem}>
          <Text style={styles.metricLabel}>Cobrado: </Text>
          <Text style={styles.metricValue}>{formatCurrency(item.total_cobrado)}</Text>
        </Text>
        {item.mora_cobrada > 0 && (
          <>
            <Text style={styles.metricSep}>·</Text>
            <Text style={styles.metricItem}>
              <Text style={styles.metricLabel}>Mora: </Text>
              <Text style={[styles.metricValue, { color: Colors.warning }]}>{formatCurrency(item.mora_cobrada)}</Text>
            </Text>
          </>
        )}
      </View>

      {/* Barra de progreso */}
      <View style={styles.cardProgress}>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${Math.min(progreso * 100, 100)}%`, backgroundColor: color }]} />
        </View>
        <Text style={styles.progressText}>{item.cuotas_pagadas}/{item.cuotas_total} cuotas · {item.tasa_mensual}% mensual</Text>
      </View>

      {item.garantia_tipo ? (
        <Text style={styles.garantia}>📦 {item.garantia_tipo}{item.garantia_descripcion ? ` — ${item.garantia_descripcion.substring(0, 35)}` : ''}</Text>
      ) : null}
    </View>
  );
}

function BannerRentabilidad({ resumen }: { resumen: ResumenCartera }) {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerItem}>
        <Text style={styles.bannerValue}>{formatCurrency(resumen.monto_total_cartera)}</Text>
        <Text style={styles.bannerLabel}>Capital en cartera</Text>
      </View>
      <View style={styles.bannerDivider} />
      <View style={styles.bannerItem}>
        <Text style={[styles.bannerValue, { color: Colors.success }]}>{formatCurrency(resumen.total_interes_proyectado)}</Text>
        <Text style={styles.bannerLabel}>Intereses proyectados</Text>
      </View>
      <View style={styles.bannerDivider} />
      <View style={styles.bannerItem}>
        <Text style={[styles.bannerValue, { color: '#7c3aed' }]}>+{resumen.rentabilidad_global}%</Text>
        <Text style={styles.bannerLabel}>Rendimiento global</Text>
      </View>
    </View>
  );
}

export default function CarteraScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<PrestamoCartera[]>([]);
  const [filtered, setFiltered] = useState<PrestamoCartera[]>([]);
  const [resumen, setResumen] = useState<ResumenCartera | null>(null);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<EstadoFiltro>('todos');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Sólo carga datos desde la red; no toca el filtro activo
  const load = useCallback(async () => {
    try {
      const [cartera, res] = await Promise.all([
        reportesService.getCartera(),
        reportesService.getResumenCartera(),
      ]);
      setData(cartera);
      setResumen(res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  // El filtrado se recalcula siempre que cambien los datos O el filtro/búsqueda
  useEffect(() => {
    let r = data;
    if (estado !== 'todos') r = r.filter(p => p.estado === estado);
    if (search) {
      const ql = search.toLowerCase();
      r = r.filter(p =>
        p.cliente_nombre?.toLowerCase().includes(ql) ||
        p.cliente_apellido?.toLowerCase().includes(ql) ||
        p.cliente_documento?.includes(search)
      );
    }
    setFiltered(r);
  }, [data, estado, search]);

  const onSearch = (q: string) => setSearch(q);
  const onEstado = (e: EstadoFiltro) => setEstado(e);

  const exportarPDF = async () => {
    setExporting(true);
    try {
      const html = await reportesService.generarHtmlReporte('cartera', filtered, resumen ?? undefined);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Exportar Reporte de Cartera' });
      } else {
        Alert.alert('PDF generado', `Guardado en: ${uri}`);
      }
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando cartera..." />;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Cartera</Text>
          <TouchableOpacity style={styles.pdfBtn} onPress={exportarPDF} disabled={exporting}>
            <Text style={styles.pdfBtnText}>{exporting ? '...' : '📄 PDF'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filtros}>
          {ESTADOS.map(e => (
            <TouchableOpacity
              key={e}
              style={[styles.filtro, estado === e && styles.filtroActive]}
              onPress={() => onEstado(e)}
            >
              <Text style={[styles.filtroText, estado === e && styles.filtroTextActive]}>
                {e.charAt(0).toUpperCase() + e.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <SearchBar value={search} onChangeText={onSearch} placeholder="Buscar cliente..." />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PrestamoCard item={item} />}
        contentContainerStyle={[styles.list, filtered.length === 0 && styles.listEmpty, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        ListHeaderComponent={resumen ? <BannerRentabilidad resumen={resumen} /> : null}
        ListEmptyComponent={<EmptyState icon="📂" title="Sin préstamos" description="No hay préstamos para el filtro seleccionado." />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 20, color: Colors.white },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white },
  pdfBtn: { backgroundColor: Colors.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  pdfBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  filtros: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  filtro: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  filtroActive: { backgroundColor: Colors.accent },
  filtroText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  filtroTextActive: { color: Colors.primary },
  list: { padding: 14, gap: 10 },
  listEmpty: { flex: 1 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, gap: 10,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  clienteNombre: { fontSize: 15, fontWeight: '700', color: Colors.text },
  clienteDoc: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  estadoBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  estadoText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  cardAmounts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  arrowSep: { fontSize: 16, color: Colors.muted, marginBottom: 2 },
  amountLabel: { fontSize: 11, color: Colors.muted },
  amountValue: { fontSize: 14, fontWeight: '800', color: Colors.text, marginTop: 2 },
  rentBadge: { backgroundColor: '#ede9fe', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  rentBadgeText: { fontSize: 11, fontWeight: '800', color: '#7c3aed' },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2 },
  metricItem: { flexDirection: 'row' },
  metricLabel: { fontSize: 11, color: Colors.muted },
  metricValue: { fontSize: 11, fontWeight: '700', color: Colors.text },
  metricSep: { fontSize: 11, color: Colors.muted, marginHorizontal: 4 },
  cardProgress: { gap: 4 },
  progressBg: { height: 5, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 11, color: Colors.muted },
  garantia: { fontSize: 11, color: Colors.muted },
  // Banner de rentabilidad
  banner: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    flexDirection: 'row',
    paddingVertical: 14,
    marginBottom: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  bannerItem: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  bannerValue: { fontSize: 16, fontWeight: '900', color: Colors.primary },
  bannerLabel: { fontSize: 10, color: Colors.muted, marginTop: 3, textAlign: 'center' },
  bannerDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
});
