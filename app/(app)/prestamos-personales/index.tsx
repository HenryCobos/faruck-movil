import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  prestamosPersonalesService,
  calcularSaldo,
  calcularMontoTotal,
  calcularInteresTotal,
  calcularTotalPagado,
  calcularPorcentajeAvance,
  formatFechaPrestamoPersonal,
} from '@/services/prestamosPersonales.service';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { Colors } from '@/constants/colors';
import type { PrestamoPersonal, EstadoPrestamoPersonal } from '@/types';

const ESTADO_VARIANT: Record<EstadoPrestamoPersonal, 'default' | 'success' | 'danger' | 'warning'> = {
  activo:    'warning',
  pagado:    'success',
  cancelado: 'danger',
};
const ESTADO_LABEL: Record<EstadoPrestamoPersonal, string> = {
  activo: 'Activo', pagado: 'Pagado', cancelado: 'Cancelado',
};

function ProgressBar({ pct }: { pct: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.min(100, pct)}%` as any }]} />
    </View>
  );
}

function PrestamoCard({ item }: { item: PrestamoPersonal }) {
  const montoTotal = calcularMontoTotal(item);
  const interesTotal = calcularInteresTotal(item);
  const saldo      = calcularSaldo(item);
  const totalPagado = calcularTotalPagado(item);
  const pct        = calcularPorcentajeAvance(item);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(app)/prestamos-personales/${item.id}` as any)}
      activeOpacity={0.75}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardIconWrap}>
          <Text style={styles.cardIcon}>💸</Text>
        </View>
        <View style={styles.cardHeaderInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.acreedor_nombre}</Text>
          <Text style={styles.cardSub}>
            Desde {formatFechaPrestamoPersonal(item.fecha_inicio)}
            {item.tasa_interes > 0
              ? `  ·  Capital $${item.monto_original.toLocaleString('es')} + ${item.tasa_interes}%`
              : '  ·  Sin interés'}
          </Text>
        </View>
        <Badge label={ESTADO_LABEL[item.estado]} variant={ESTADO_VARIANT[item.estado]} />
      </View>

      {/* Montos */}
      <View style={styles.cardAmounts}>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Deuda total</Text>
          <Text style={styles.amountValue}>${montoTotal.toLocaleString('es')}</Text>
          {interesTotal > 0 && (
            <Text style={styles.amountSub}>incl. ${interesTotal.toLocaleString('es')} interés</Text>
          )}
        </View>
        <View style={[styles.amountItem, styles.amountCenter]}>
          <Text style={styles.amountLabel}>Pagado</Text>
          <Text style={[styles.amountValue, { color: Colors.success }]}>
            ${totalPagado.toLocaleString('es')}
          </Text>
        </View>
        <View style={[styles.amountItem, styles.amountRight]}>
          <Text style={styles.amountLabel}>Saldo</Text>
          <Text style={[styles.amountValue, saldo > 0 ? { color: Colors.danger } : { color: Colors.success }]}>
            ${saldo.toLocaleString('es')}
          </Text>
        </View>
      </View>

      {/* Barra de progreso */}
      <View style={styles.progressWrap}>
        <ProgressBar pct={pct} />
        <Text style={styles.progressPct}>{pct.toFixed(0)}% pagado de ${montoTotal.toLocaleString('es')}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PrestamosPersonalesScreen() {
  const insets = useSafeAreaInsets();
  const [prestamos, setPrestamos]   = useState<PrestamoPersonal[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await prestamosPersonalesService.getAll();
      setPrestamos(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) return <LoadingScreen label="Cargando préstamos…" />;

  const activos    = prestamos.filter((p) => p.estado === 'activo');
  const totalDeuda = activos.reduce((acc, p) => acc + calcularSaldo(p), 0);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>Préstamos Personales</Text>
            <Text style={styles.headerSub}>{prestamos.length} registrados</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/(app)/prestamos-personales/nuevo' as any)}
          >
            <Text style={styles.addBtnText}>+ Nuevo</Text>
          </TouchableOpacity>
        </View>

        {/* Resumen */}
        <View style={styles.chips}>
          <View style={styles.chip}>
            <Text style={styles.chipNum}>{activos.length}</Text>
            <Text style={styles.chipLbl}>Activos</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: `${Colors.danger}22` }]}>
            <Text style={[styles.chipNum, { color: Colors.danger }]}>
              ${totalDeuda.toLocaleString('es')}
            </Text>
            <Text style={styles.chipLbl}>Total adeudado</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={prestamos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PrestamoCard item={item} />}
        contentContainerStyle={[
          styles.list,
          prestamos.length === 0 && styles.listEmpty,
          { paddingBottom: insets.bottom + 90 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={Colors.accent}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="💸"
            title="Sin préstamos registrados"
            description="Registra tus deudas personales para llevar control de pagos y saldos"
            actionLabel="+ Nuevo Préstamo"
            onAction={() => router.push('/(app)/prestamos-personales/nuevo' as any)}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 12, marginTop: 4,
  },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 22, color: Colors.white },
  headerTitles: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  addBtn: {
    backgroundColor: Colors.accent, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },

  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  chipNum: { fontSize: 16, fontWeight: '800', color: Colors.accent },
  chipLbl: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },

  list: { padding: 16, gap: 12 },
  listEmpty: { flex: 1 },

  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3, gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: `${Colors.danger}12`,
    alignItems: 'center', justifyContent: 'center',
  },
  cardIcon: { fontSize: 22 },
  cardHeaderInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  cardSub: { fontSize: 12, color: Colors.muted, marginTop: 2 },

  cardAmounts: {
    flexDirection: 'row',
    backgroundColor: Colors.surface2,
    borderRadius: 10, padding: 10,
  },
  amountItem: { flex: 1 },
  amountCenter: { alignItems: 'center' },
  amountRight: { alignItems: 'flex-end' },
  amountLabel: { fontSize: 10, color: Colors.muted, fontWeight: '600', marginBottom: 2 },
  amountValue: { fontSize: 14, fontWeight: '800', color: Colors.text },
  amountSub: { fontSize: 10, color: Colors.warning, fontWeight: '600', marginTop: 1 },

  progressWrap: { gap: 6 },
  progressTrack: {
    height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden',
  },
  progressFill: {
    height: 6, backgroundColor: Colors.success, borderRadius: 3,
  },
  progressPct: { fontSize: 11, color: Colors.success, fontWeight: '700' },
});
