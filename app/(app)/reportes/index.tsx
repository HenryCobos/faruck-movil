import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { reportesService, ResumenCartera } from '@/services/reportes.service';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { formatCurrency } from '@/utils/amortizacion';
import { Colors } from '@/constants/colors';

interface ReporteCardProps {
  title: string;
  description: string;
  icon: string;
  color: string;
  badge?: string;
  badgeColor?: string;
  onPress: () => void;
}

function ReporteCard({ title, description, icon, color, badge, badgeColor, onPress }: ReporteCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.cardIcon, { backgroundColor: `${color}18` }]}>
        <Text style={styles.cardIconEmoji}>{icon}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDesc}>{description}</Text>
      </View>
      <View style={styles.cardRight}>
        {badge && (
          <View style={[styles.badge, { backgroundColor: `${badgeColor ?? color}20` }]}>
            <Text style={[styles.badgeText, { color: badgeColor ?? color }]}>{badge}</Text>
          </View>
        )}
        <Text style={styles.cardArrow}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ReportesScreen() {
  const insets = useSafeAreaInsets();
  const [resumen, setResumen] = useState<ResumenCartera | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await reportesService.getResumenCartera();
      setResumen(r);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingScreen label="Cargando reportes..." />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Reportes</Text>
        <Text style={styles.headerSub}>Análisis y estadísticas del negocio</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
      >
        {/* Resumen general */}
        <View style={styles.overviewCard}>
          <Text style={styles.overviewTitle}>RESUMEN GENERAL DE CARTERA</Text>
          <View style={styles.overviewGrid}>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewValue}>{resumen?.total_prestamos ?? 0}</Text>
              <Text style={styles.overviewLabel}>Préstamos totales</Text>
            </View>
            <View style={styles.overviewItem}>
              <Text style={[styles.overviewValue, { color: Colors.success }]}>{resumen?.activos ?? 0}</Text>
              <Text style={styles.overviewLabel}>Activos</Text>
            </View>
            <View style={styles.overviewItem}>
              <Text style={[styles.overviewValue, { color: Colors.info }]}>{resumen?.cancelados ?? 0}</Text>
              <Text style={styles.overviewLabel}>Cancelados</Text>
            </View>
            <View style={styles.overviewItem}>
              <Text style={[styles.overviewValue, { color: Colors.danger }]}>{resumen?.vencidos ?? 0}</Text>
              <Text style={styles.overviewLabel}>Vencidos</Text>
            </View>
          </View>
          <View style={styles.overviewBottom}>
            <View style={styles.overviewBig}>
              <Text style={styles.overviewBigLabel}>Cartera vigente</Text>
              <Text style={styles.overviewBigValue}>{formatCurrency(resumen?.monto_total_cartera ?? 0)}</Text>
            </View>
            <View style={[styles.overviewBig, styles.overviewBigRight]}>
              <Text style={styles.overviewBigLabel}>Tasa de mora</Text>
              <Text style={[styles.overviewBigValue, { color: (resumen?.tasa_mora ?? 0) > 5 ? Colors.danger : Colors.success }]}>
                {resumen?.tasa_mora ?? 0}%
              </Text>
            </View>
          </View>
        </View>

        {/* Módulos de reporte */}
        <Text style={styles.sectionTitle}>Reportes disponibles</Text>
        <View style={styles.reportsList}>
          <ReporteCard
            title="Reporte de Cartera"
            description="Estado de todos los préstamos: activos, cancelados y vencidos con saldo pendiente"
            icon="📂"
            color={Colors.info}
            badge="PDF"
            badgeColor={Colors.info}
            onPress={() => router.push('/(app)/reportes/cartera' as any)}
          />
          <ReporteCard
            title="Clientes Morosos"
            description="Clientes con cuotas vencidas, mora acumulada y días de atraso"
            icon="⚠️"
            color={Colors.danger}
            badge={resumen?.vencidos !== undefined ? `${resumen.vencidos} venc.` : undefined}
            badgeColor={Colors.danger}
            onPress={() => router.push('/(app)/reportes/morosos' as any)}
          />
          <ReporteCard
            title="Estado de Resultados"
            description="Ingresos, egresos y utilidad neta mensual histórica"
            icon="📊"
            color={Colors.success}
            badge="Histórico"
            onPress={() => router.push('/(app)/contabilidad/estado-resultados' as any)}
          />
          <ReporteCard
            title="Libro Diario"
            description="Todos los movimientos contables registrados en el sistema"
            icon="📒"
            color="#9B74F5"
            onPress={() => router.push('/(app)/contabilidad/libro-diario' as any)}
          />
        </View>
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
  overviewCard: {
    backgroundColor: Colors.primary, borderRadius: 20, padding: 20, marginBottom: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4,
  },
  overviewTitle: { fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 },
  overviewGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  overviewItem: { alignItems: 'center', flex: 1 },
  overviewValue: { fontSize: 22, fontWeight: '900', color: Colors.white },
  overviewLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3, textAlign: 'center' },
  overviewBottom: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 14, gap: 8 },
  overviewBig: { flex: 1 },
  overviewBigRight: { alignItems: 'flex-end' },
  overviewBigLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 },
  overviewBigValue: { fontSize: 18, fontWeight: '900', color: Colors.accent },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8, marginBottom: 10 },
  reportsList: { gap: 10 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardIconEmoji: { fontSize: 24 },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  cardDesc: { fontSize: 12, color: Colors.muted, lineHeight: 17 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardArrow: { fontSize: 22, color: Colors.muted, fontWeight: '300' },
});
