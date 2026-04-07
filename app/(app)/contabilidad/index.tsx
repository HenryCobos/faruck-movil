import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { contabilidadService, ResumenContable, AsientoContable } from '@/services/contabilidad.service';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { formatCurrency } from '@/utils/amortizacion';
import { Colors } from '@/constants/colors';

interface KPICardProps {
  label: string;
  value: string;
  icon: string;
  color: string;
  sub?: string;
}
function KPICard({ label, value, icon, color, sub }: KPICardProps) {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: color }]}>
      <Text style={styles.kpiIcon}>{icon}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub && <Text style={styles.kpiSub}>{sub}</Text>}
    </View>
  );
}

function NavBtn({ title, subtitle, icon, onPress }: { title: string; subtitle: string; icon: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.navBtn} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.navBtnIcon}>{icon}</Text>
      <View style={styles.navBtnText}>
        <Text style={styles.navBtnTitle}>{title}</Text>
        <Text style={styles.navBtnSub}>{subtitle}</Text>
      </View>
      <Text style={styles.navBtnArrow}>›</Text>
    </TouchableOpacity>
  );
}

export default function ContabilidadScreen() {
  const insets = useSafeAreaInsets();
  const [resumen, setResumen] = useState<ResumenContable | null>(null);
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mes = new Date().toLocaleString('es', { month: 'long', year: 'numeric' });

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([
        contabilidadService.getResumenMes(),
        contabilidadService.getLibroDiario(8),
      ]);
      setResumen(r);
      setAsientos(a);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingScreen label="Cargando contabilidad..." />;

  const porcentajeUtilidad = resumen && resumen.ingresos_mes > 0
    ? Math.round((resumen.utilidad_mes / resumen.ingresos_mes) * 100)
    : 0;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Contabilidad</Text>
        <Text style={styles.headerSub}>Resumen — {mes.charAt(0).toUpperCase() + mes.slice(1)}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
      >
        {/* Utilidad destacada */}
        <View style={styles.utilidadCard}>
          <Text style={styles.utilidadLabel}>UTILIDAD NETA DEL MES</Text>
          <Text style={[styles.utilidadValue, { color: (resumen?.utilidad_mes ?? 0) >= 0 ? Colors.success : Colors.danger }]}>
            {formatCurrency(resumen?.utilidad_mes ?? 0)}
          </Text>
          <View style={styles.utilidadBar}>
            <View style={[styles.utilidadFill, {
              width: `${Math.min(Math.abs(porcentajeUtilidad), 100)}%`,
              backgroundColor: porcentajeUtilidad >= 0 ? Colors.success : Colors.danger,
            }]} />
          </View>
          <Text style={styles.utilidadPct}>
            {porcentajeUtilidad}% margen sobre ingresos
          </Text>
        </View>

        {/* KPIs */}
        <Text style={styles.sectionTitle}>Indicadores del Mes</Text>
        <View style={styles.kpiGrid}>
          <KPICard label="Ingresos Totales" value={formatCurrency(resumen?.ingresos_mes ?? 0)} icon="📈" color={Colors.success} />
          <KPICard label="Mora Cobrada" value={formatCurrency(resumen?.mora_mes ?? 0)} icon="⚠️" color={Colors.warning} />
          <KPICard label="Total Cobrado" value={formatCurrency(resumen?.total_cobrado_mes ?? 0)} icon="💳" color={Colors.info} />
          <KPICard label="Cartera Vigente" value={formatCurrency(resumen?.cartera_vigente ?? 0)} icon="📂" color={Colors.accent} sub="Préstamos activos" />
        </View>

        {/* Módulos */}
        <Text style={styles.sectionTitle}>Módulos</Text>
        <View style={styles.navSection}>
          <NavBtn title="Libro Diario" subtitle="Todos los movimientos contables" icon="📒" onPress={() => router.push('/(app)/contabilidad/libro-diario' as any)} />
          <NavBtn title="Estado de Resultados" subtitle="P&G histórico mensual" icon="📊" onPress={() => router.push('/(app)/contabilidad/estado-resultados' as any)} />
        </View>

        {/* Últimos movimientos */}
        {asientos.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Últimos Movimientos</Text>
            <View style={styles.asientosList}>
              {asientos.slice(0, 6).map((a) => (
                <View key={a.id} style={styles.asientoRow}>
                  <View style={styles.asientoLeft}>
                    <Text style={styles.asientoConcepto} numberOfLines={1}>{a.concepto}</Text>
                    <Text style={styles.asientoCuenta}>
                      {(a as any).plan_cuentas?.codigo} — {(a as any).plan_cuentas?.nombre}
                    </Text>
                    <Text style={styles.asientoFecha}>{new Date(a.fecha).toLocaleDateString('es')}</Text>
                  </View>
                  <View style={styles.asientoRight}>
                    {a.debe > 0 && <Text style={styles.debe}>D {formatCurrency(a.debe)}</Text>}
                    {a.haber > 0 && <Text style={styles.haber}>H {formatCurrency(a.haber)}</Text>}
                  </View>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.verTodosBtn} onPress={() => router.push('/(app)/contabilidad/libro-diario' as any)}>
              <Text style={styles.verTodosText}>Ver todos los asientos →</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.white, marginTop: 8 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  scroll: { padding: 16, gap: 6 },
  utilidadCard: {
    backgroundColor: Colors.primary, borderRadius: 20, padding: 22, marginBottom: 8,
    alignItems: 'center', gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  utilidadLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase' },
  utilidadValue: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  utilidadBar: { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
  utilidadFill: { height: '100%', borderRadius: 3 },
  utilidadPct: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 12, marginBottom: 6 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiCard: {
    flex: 1, minWidth: '46%', backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    borderLeftWidth: 3, gap: 4,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  kpiIcon: { fontSize: 20 },
  kpiValue: { fontSize: 18, fontWeight: '800' },
  kpiLabel: { fontSize: 11, color: Colors.muted, fontWeight: '600' },
  kpiSub: { fontSize: 10, color: Colors.muted },
  navSection: {
    backgroundColor: Colors.surface, borderRadius: 14, overflow: 'hidden',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  navBtnIcon: { fontSize: 24 },
  navBtnText: { flex: 1 },
  navBtnTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  navBtnSub: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  navBtnArrow: { fontSize: 22, color: Colors.muted, fontWeight: '300' },
  asientosList: {
    backgroundColor: Colors.surface, borderRadius: 14, overflow: 'hidden',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  asientoRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  asientoLeft: { flex: 1, gap: 2 },
  asientoConcepto: { fontSize: 13, fontWeight: '600', color: Colors.text },
  asientoCuenta: { fontSize: 11, color: Colors.muted },
  asientoFecha: { fontSize: 10, color: Colors.muted },
  asientoRight: { alignItems: 'flex-end', gap: 2 },
  debe: { fontSize: 12, fontWeight: '700', color: Colors.danger },
  haber: { fontSize: 12, fontWeight: '700', color: Colors.success },
  verTodosBtn: { alignItems: 'center', paddingVertical: 12 },
  verTodosText: { fontSize: 13, fontWeight: '700', color: Colors.accent },
});
