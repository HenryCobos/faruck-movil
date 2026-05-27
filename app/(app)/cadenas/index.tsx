import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  cadenasAhorroService,
  formatFechaCadena,
  proximaRondaPago,
} from '@/services/cadenasAhorro.service';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { Colors } from '@/constants/colors';
import type { CadenaAhorro, EstadoCadena } from '@/types';

const ESTADO_VARIANT: Record<EstadoCadena, 'default' | 'success' | 'danger' | 'warning'> = {
  activa:     'success',
  completada: 'default',
  cancelada:  'danger',
};

const ESTADO_LABEL: Record<EstadoCadena, string> = {
  activa:     'Activa',
  completada: 'Completada',
  cancelada:  'Cancelada',
};

const FRECUENCIA_LABEL: Record<string, string> = {
  semanal:   'Semanal',
  quincenal: 'Quincenal',
  mensual:   'Mensual',
};

function CadenaCard({ item }: { item: CadenaAhorro }) {
  const misTurnos = new Set((item.cadena_puestos ?? []).map((p) => p.numero_turno));
  const rondas    = item.cadena_rondas ?? [];
  const total     = rondas.length;
  const pagadas   = rondas.filter((r) => r.pagado).length;
  const proxPago  = proximaRondaPago(rondas, misTurnos);
  const poolTotal = item.monto_aporte * item.num_participantes;
  const numPuestos = item.cadena_puestos?.length ?? 0;

  const turnosStr = numPuestos === 0
    ? 'Sin turno asignado'
    : `Turno${numPuestos > 1 ? 's' : ''}: ${(item.cadena_puestos ?? []).map((p) => `#${p.numero_turno}`).join(', ')}`;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(app)/cadenas/${item.id}` as any)}
      activeOpacity={0.75}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardIconWrap}>
          <Text style={styles.cardIcon}>🔗</Text>
        </View>
        <View style={styles.cardHeaderInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.nombre}</Text>
          <Text style={styles.cardSub}>
            {item.num_participantes} participantes · {FRECUENCIA_LABEL[item.frecuencia]}
          </Text>
        </View>
        <Badge label={ESTADO_LABEL[item.estado]} variant={ESTADO_VARIANT[item.estado]} />
      </View>

      <View style={styles.cardAmounts}>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Mi aporte</Text>
          <Text style={styles.amountValue}>
            ${(item.monto_aporte * (numPuestos || 1)).toLocaleString('es')}
          </Text>
        </View>
        <View style={[styles.amountItem, styles.amountCenter]}>
          <Text style={styles.amountLabel}>Pozo total</Text>
          <Text style={[styles.amountValue, { color: Colors.success }]}>
            ${poolTotal.toLocaleString('es')}
          </Text>
        </View>
        <View style={[styles.amountItem, styles.amountRight]}>
          <Text style={styles.amountLabel}>Avance</Text>
          <Text style={styles.amountValue}>{pagadas}/{total}</Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.footerTurno}>{turnosStr}</Text>
        {proxPago ? (
          <View style={styles.footerDate}>
            <Text style={styles.footerDateLabel}>Próx. aporte</Text>
            <Text style={styles.footerDateValue}>
              {formatFechaCadena(proxPago.fecha_vencimiento)}
            </Text>
          </View>
        ) : item.estado === 'activa' ? (
          <View style={[styles.footerDate, { backgroundColor: `${Colors.success}15` }]}>
            <Text style={[styles.footerDateLabel, { color: Colors.success }]}>✓ Aportes completos</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function CadenasScreen() {
  const insets    = useSafeAreaInsets();
  const [cadenas, setCadenas]     = useState<CadenaAhorro[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await cadenasAhorroService.getAll();
      setCadenas(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) return <LoadingScreen label="Cargando cadenas..." />;

  const activas    = cadenas.filter((c) => c.estado === 'activa').length;
  const completadas = cadenas.filter((c) => c.estado === 'completada').length;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>Cadenas de Ahorro</Text>
            <Text style={styles.headerSub}>{cadenas.length} registradas</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/(app)/cadenas/nueva' as any)}
          >
            <Text style={styles.addBtnText}>+ Nueva</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chips}>
          <View style={styles.chip}>
            <Text style={styles.chipNum}>{activas}</Text>
            <Text style={styles.chipLbl}>Activas</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: `${Colors.success}22` }]}>
            <Text style={[styles.chipNum, { color: Colors.success }]}>{completadas}</Text>
            <Text style={styles.chipLbl}>Completadas</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={cadenas}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CadenaCard item={item} />}
        contentContainerStyle={[
          styles.list,
          cadenas.length === 0 && styles.listEmpty,
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
            icon="🔗"
            title="Sin cadenas de ahorro"
            description="Crea tu primera cadena de ahorro para empezar a registrar tus aportes y cobros"
            actionLabel="+ Nueva Cadena"
            onAction={() => router.push('/(app)/cadenas/nueva' as any)}
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
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: `${Colors.accent}15`,
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
  amountItem: { flex: 1, alignItems: 'flex-start' },
  amountCenter: { alignItems: 'center' },
  amountRight: { alignItems: 'flex-end' },
  amountLabel: { fontSize: 10, color: Colors.muted, fontWeight: '600', marginBottom: 2 },
  amountValue: { fontSize: 14, fontWeight: '800', color: Colors.text },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerTurno: { fontSize: 12, color: Colors.accent, fontWeight: '700', flex: 1 },
  footerDate: {
    backgroundColor: `${Colors.warning}15`,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    alignItems: 'flex-end',
  },
  footerDateLabel: { fontSize: 9, color: Colors.muted, fontWeight: '600' },
  footerDateValue: { fontSize: 12, color: Colors.warning, fontWeight: '700' },
});
