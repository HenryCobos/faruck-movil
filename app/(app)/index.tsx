import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { StatCard } from '@/components/ui/Card';
import { Colors, RoleColors } from '@/constants/colors';
import { UserRole } from '@/types';
import { dashboardService, DashboardStatsReal, ActividadReciente } from '@/services/dashboard.service';
import { formatCurrency } from '@/utils/amortizacion';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  oficial: 'Oficial de Crédito',
  cajero: 'Cajero',
  auditor: 'Auditor',
};

const ROLE_GREETINGS: Record<UserRole, string> = {
  admin: 'Vista general del negocio',
  oficial: 'Tu cartera de créditos',
  cajero: 'Cobros del día',
  auditor: 'Resumen financiero',
};

interface QuickAction { label: string; icon: string; route: string; color: string }

const QUICK_ACTIONS: Record<UserRole, QuickAction[]> = {
  admin: [
    { label: 'Nuevo Préstamo', icon: '💰', route: '/(app)/creditos/nuevo', color: Colors.accent },
    { label: 'Nuevo Cliente', icon: '👤', route: '/(app)/clientes/nuevo', color: Colors.info },
    { label: 'Nueva Garantía', icon: '🏠', route: '/(app)/garantias/nuevo', color: Colors.success },
    { label: 'Cobros', icon: '💳', route: '/(app)/cobros', color: Colors.primaryLight },
    { label: 'Reportes', icon: '📋', route: '/(app)/reportes', color: Colors.warning },
    { label: 'Contabilidad', icon: '📒', route: '/(app)/contabilidad', color: '#9B74F5' },
  ],
  oficial: [
    { label: 'Nuevo Préstamo', icon: '💰', route: '/(app)/creditos/nuevo', color: Colors.accent },
    { label: 'Nuevo Cliente', icon: '👤', route: '/(app)/clientes/nuevo', color: Colors.info },
    { label: 'Nueva Garantía', icon: '🏠', route: '/(app)/garantias/nuevo', color: Colors.success },
    { label: 'Mi Cartera', icon: '📊', route: '/(app)/creditos', color: Colors.primaryLight },
  ],
  cajero: [
    { label: 'Registrar Pago', icon: '💳', route: '/(app)/cobros', color: Colors.accent },
    { label: 'Buscar Cliente', icon: '🔍', route: '/(app)/clientes', color: Colors.info },
    { label: 'Cronogramas', icon: '📅', route: '/(app)/creditos', color: Colors.success },
  ],
  auditor: [
    { label: 'Resultados', icon: '📊', route: '/(app)/contabilidad/estado-resultados', color: Colors.accent },
    { label: 'Libro Diario', icon: '📒', route: '/(app)/contabilidad/libro-diario', color: Colors.info },
    { label: 'Reportes', icon: '📋', route: '/(app)/reportes', color: Colors.warning },
    { label: 'Cartera Vencida', icon: '⚠️', route: '/(app)/reportes', color: Colors.danger },
  ],
};

const ACTIVIDAD_ICON: Record<string, string> = {
  pago: '💳', prestamo: '💰', cliente: '👤', mora: '⚠️',
};
const ACTIVIDAD_COLOR: Record<string, string> = {
  pago: Colors.success, prestamo: Colors.info, cliente: Colors.accent, mora: Colors.danger,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  if (hours < 24) return `hace ${hours}h`;
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

export default function DashboardScreen() {
  const { profile, signOut } = useAuthStore();
  const insets = useSafeAreaInsets();
  const role = (profile?.rol ?? 'cajero') as UserRole;
  const roleColor = RoleColors[role];

  const [stats, setStats] = useState<DashboardStatsReal | null>(null);
  const [actividad, setActividad] = useState<ActividadReciente[]>([]);
  const [alertas, setAlertas] = useState<{ tipo: 'danger' | 'warning' | 'info'; icon: string; mensaje: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);

  const load = useCallback(async () => {
    setErrorCarga(false);
    try {
      const [s, a, al] = await Promise.all([
        dashboardService.getStats(),
        dashboardService.getActividadReciente(),
        dashboardService.getAlerts(),
      ]);
      setStats(s);
      setActividad(a);
      setAlertas(al);
    } catch {
      setErrorCarga(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const onRefresh = () => { setRefreshing(true); load(); };

  const alertColors = {
    warning: { bg: Colors.warningLight, border: Colors.warning, text: '#B45309' },
    danger:  { bg: Colors.dangerLight,  border: Colors.danger,  text: '#C53030' },
    info:    { bg: Colors.infoLight,    border: Colors.info,    text: '#1D4ED8' },
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Hola, {profile?.nombre ?? 'Usuario'} 👋</Text>
            <Text style={styles.roleLabel}>{ROLE_GREETINGS[role]}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.roleBadge, { backgroundColor: `${roleColor}22`, borderColor: `${roleColor}44` }]}>
              <Text style={[styles.roleBadgeText, { color: roleColor }]}>{ROLE_LABELS[role]}</Text>
            </View>
            <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
              <Text style={styles.signOutIcon}>⎋</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.dateLine}>
          <Text style={styles.dateText}>
            {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
      >
        {/* Alertas dinámicas */}
        {(role === 'admin' || role === 'oficial') && alertas.length > 0 && (
          <View style={styles.section}>
            {alertas.map((a, i) => {
              const c = alertColors[a.tipo];
              return (
                <View key={i} style={[styles.alertBanner, { backgroundColor: c.bg, borderLeftColor: c.border }]}>
                  <Text style={styles.alertIcon}>{a.icon}</Text>
                  <Text style={[styles.alertText, { color: c.text }]}>{a.mensaje}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* KPI Stats — reales */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumen</Text>
          {loading ? (
            <View style={styles.loadingStats}>
              <Text style={styles.loadingText}>Cargando datos...</Text>
            </View>
          ) : errorCarga ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorText}>No se pudieron cargar los datos.</Text>
              <TouchableOpacity onPress={load} style={styles.errorBtn}>
                <Text style={styles.errorBtnText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : role === 'admin' || role === 'oficial' ? (
            <View style={styles.statsGrid}>
              <View style={styles.statsRow}>
                <StatCard label="Cartera Total" value={formatCurrency(stats?.cartera_total ?? 0)} color={Colors.accent} icon="💰" trend="préstamos activos" trendUp />
                <StatCard label="Préstamos Activos" value={String(stats?.prestamos_activos ?? 0)} color={Colors.info} icon="📋" />
              </View>
              <View style={styles.statsRow}>
                <StatCard label="Cuotas Vencidas" value={String(stats?.cuotas_vencidas ?? 0)} color={Colors.danger} icon="⚠️" />
                <StatCard label="Total Cobrado" value={formatCurrency(stats?.ingresos_mes ?? 0)} color={Colors.success} icon="📈" trend="cobros acumulados" trendUp />
              </View>
            </View>
          ) : role === 'cajero' ? (
            <View style={styles.statsGrid}>
              <View style={styles.statsRow}>
                <StatCard label="Cobros Hoy" value={formatCurrency(stats?.cobros_hoy ?? 0)} color={Colors.success} icon="💳" />
                <StatCard label="Vencen Hoy" value={String(stats?.cuotas_pendientes_hoy ?? 0)} color={Colors.warning} icon="📅" />
              </View>
              <View style={styles.statsRow}>
                <StatCard label="En Mora" value={String(stats?.en_mora ?? 0)} color={Colors.danger} icon="🚨" />
              </View>
            </View>
            ) : (
            <View style={styles.statsGrid}>
              <View style={styles.statsRow}>
                <StatCard label="Ingresos del Mes" value={formatCurrency(stats?.ingresos_contables_mes ?? 0)} color={Colors.success} icon="📈" trend="intereses + mora + comisiones" trendUp />
                <StatCard label="Clientes Activos" value={String(stats?.clientes_activos ?? 0)} color={Colors.info} icon="👥" />
              </View>
              <View style={styles.statsRow}>
                <StatCard label="Utilidad Neta" value={formatCurrency(stats?.utilidad_mes ?? 0)} color={Colors.accent} icon="💹" trend="ingresos − egresos" trendUp={stats ? stats.utilidad_mes >= 0 : true} />
                <StatCard label="Garantías" value={String(stats?.garantias_en_custodia ?? 0)} color={Colors.warning} icon="🏠" />
              </View>
            </View>
          )}
        </View>

        {/* Acciones rápidas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
          <View style={styles.actionsGrid}>
            {QUICK_ACTIONS[role].map((action) => (
              <TouchableOpacity
                key={action.label}
                style={styles.actionCard}
                onPress={() => router.push(action.route as any)}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIcon, { backgroundColor: `${action.color}18` }]}>
                  <Text style={styles.actionEmoji}>{action.icon}</Text>
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Actividad reciente — real */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Actividad Reciente</Text>
            <TouchableOpacity onPress={() => router.push('/(app)/cobros' as any)}>
              <Text style={styles.seeAll}>Ver cobros →</Text>
            </TouchableOpacity>
          </View>

          {actividad.length === 0 && !loading ? (
            <View style={styles.emptyActivity}>
              <Text style={styles.emptyActivityText}>Sin actividad reciente</Text>
            </View>
          ) : (
            <View style={styles.activityList}>
              {actividad.map((item) => {
                const color = ACTIVIDAD_COLOR[item.tipo] ?? Colors.muted;
                return (
                  <View key={item.id} style={styles.activityItem}>
                    <View style={[styles.activityIconWrap, { backgroundColor: `${color}15` }]}>
                      <Text style={styles.activityIcon}>{ACTIVIDAD_ICON[item.tipo]}</Text>
                    </View>
                    <View style={styles.activityContent}>
                      <Text style={styles.activityLabel} numberOfLines={1}>{item.descripcion}</Text>
                      <Text style={styles.activityTime}>{timeAgo(item.fecha)}</Text>
                    </View>
                    {item.monto !== undefined && (
                      <Text style={[styles.activityAmount, { color }]}>
                        {item.tipo === 'pago' ? '+' : ''}{formatCurrency(item.monto)}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  greeting: { fontSize: 20, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
  roleLabel: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  roleBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  signOutBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  signOutIcon: { fontSize: 18, color: Colors.white },
  dateLine: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  dateText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'capitalize', letterSpacing: 0.3 },
  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 4 },
  section: { marginBottom: 20 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, letterSpacing: -0.2, marginBottom: 12 },
  seeAll: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 12, borderLeftWidth: 3, marginBottom: 8 },
  alertIcon: { fontSize: 16 },
  alertText: { flex: 1, fontSize: 13, fontWeight: '600' },
  statsGrid: { gap: 10 },
  statsRow: { flexDirection: 'row', gap: 10 },
  loadingStats: { padding: 20, alignItems: 'center' },
  loadingText: { color: Colors.muted, fontSize: 13 },
  errorCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 20, alignItems: 'center', gap: 8 },
  errorIcon: { fontSize: 28 },
  errorText: { fontSize: 13, color: Colors.muted, textAlign: 'center' },
  errorBtn: { marginTop: 4, backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  errorBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    width: '30%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: 12,
    padding: 14, alignItems: 'center', gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionEmoji: { fontSize: 22 },
  actionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center', letterSpacing: 0.2 },
  activityList: { backgroundColor: Colors.surface, borderRadius: 12, overflow: 'hidden', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  activityItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  activityIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityIcon: { fontSize: 18 },
  activityContent: { flex: 1 },
  activityLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  activityTime: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  activityAmount: { fontSize: 14, fontWeight: '800' },
  emptyActivity: { backgroundColor: Colors.surface, borderRadius: 12, padding: 24, alignItems: 'center' },
  emptyActivityText: { color: Colors.muted, fontSize: 13 },
});
