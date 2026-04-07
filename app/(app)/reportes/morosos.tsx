import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { reportesService, ClienteMoroso } from '@/services/reportes.service';
import { configuracionService } from '@/services/configuracion.service';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { formatCurrency } from '@/utils/amortizacion';
import { Colors } from '@/constants/colors';

function MorosoCard({ item, nombreEmpresa }: { item: ClienteMoroso; nombreEmpresa: string }) {
  const riesgo = item.dias_mayor_mora >= 30 ? 'alto' : item.dias_mayor_mora >= 15 ? 'medio' : 'bajo';
  const riesgoColor = { alto: Colors.danger, medio: Colors.warning, bajo: Colors.info }[riesgo];

  const llamar = () => {
    if (item.telefono) Linking.openURL(`tel:${item.telefono}`).catch(() => {});
  };
  const whatsapp = () => {
    const msg = encodeURIComponent(`Hola ${item.nombre}, le contactamos de ${nombreEmpresa} para recordarle que tiene ${item.cuotas_vencidas} cuota(s) vencida(s) por un monto de ${formatCurrency(item.monto_vencido)}. Por favor comuníquese con nosotros para regularizar su situación.`);
    Linking.openURL(`https://wa.me/${item.telefono?.replace(/\D/g, '')}?text=${msg}`).catch(() => {});
  };

  return (
    <View style={[styles.card, { borderLeftColor: riesgoColor, borderLeftWidth: 3 }]}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: `${riesgoColor}20` }]}>
            <Text style={[styles.avatarText, { color: riesgoColor }]}>
              {item.nombre[0]}{item.apellido[0]}
            </Text>
          </View>
          <View style={[styles.riesgoBadge, { backgroundColor: `${riesgoColor}20` }]}>
            <Text style={[styles.riesgoText, { color: riesgoColor }]}>RIESGO {riesgo.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={llamar}>
            <Text style={styles.actionBtnIcon}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnWa]} onPress={whatsapp}>
            <Text style={styles.actionBtnIcon}>💬</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.nombre}>{item.nombre} {item.apellido}</Text>
      <Text style={styles.doc}>{item.documento} · {item.telefono}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.danger }]}>{item.cuotas_vencidas}</Text>
          <Text style={styles.statLabel}>Cuotas vencidas</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.danger }]}>{formatCurrency(item.monto_vencido)}</Text>
          <Text style={styles.statLabel}>Monto vencido</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.warning }]}>{formatCurrency(item.mora_total)}</Text>
          <Text style={styles.statLabel}>Mora calculada</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: riesgoColor }]}>{item.dias_mayor_mora}</Text>
          <Text style={styles.statLabel}>Días mayor mora</Text>
        </View>
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL A REGULARIZAR</Text>
        <Text style={styles.totalValue}>{formatCurrency(item.monto_vencido + item.mora_total)}</Text>
      </View>
    </View>
  );
}

export default function MorososScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ClienteMoroso[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [nombreEmpresa, setNombreEmpresa] = useState('Préstamos AB');

  const load = useCallback(async () => {
    try {
      const [d, cfg] = await Promise.all([
        reportesService.getMorosos(),
        configuracionService.get(),
      ]);
      setData(d);
      setNombreEmpresa(cfg.nombre_empresa ?? 'Préstamos AB');
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const exportarPDF = async () => {
    setExporting(true);
    try {
      const html = await reportesService.generarHtmlReporte('morosos', data);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Reporte Clientes Morosos' });
      } else {
        Alert.alert('PDF generado', uri);
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando clientes morosos..." />;

  const totalMora = data.reduce((s, c) => s + c.mora_total, 0);
  const totalVencido = data.reduce((s, c) => s + c.monto_vencido, 0);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Clientes Morosos</Text>
          <TouchableOpacity style={styles.pdfBtn} onPress={exportarPDF} disabled={exporting}>
            <Text style={styles.pdfBtnText}>{exporting ? '...' : '📄 PDF'}</Text>
          </TouchableOpacity>
        </View>

        {data.length > 0 && (
          <View style={styles.alertCard}>
            <View style={styles.alertRow}>
              <Text style={styles.alertLabel}>{data.length} clientes en mora</Text>
              <Text style={styles.alertAmount}>{formatCurrency(totalVencido + totalMora)}</Text>
            </View>
            <Text style={styles.alertSub}>
              {formatCurrency(totalVencido)} vencido + {formatCurrency(totalMora)} mora
            </Text>
          </View>
        )}
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.cliente_id}
        renderItem={({ item }) => <MorosoCard item={item} nombreEmpresa={nombreEmpresa} />}
        contentContainerStyle={[styles.list, data.length === 0 && styles.listEmpty, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        ListEmptyComponent={<EmptyState icon="✅" title="Sin morosos" description="¡Todos los clientes están al día con sus pagos!" />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 20, color: Colors.white },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white },
  pdfBtn: { backgroundColor: Colors.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  pdfBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  alertCard: {
    backgroundColor: `${Colors.danger}25`, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: `${Colors.danger}40`,
  },
  alertRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alertLabel: { fontSize: 13, fontWeight: '700', color: Colors.white },
  alertAmount: { fontSize: 16, fontWeight: '900', color: Colors.accent },
  alertSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 3 },
  list: { padding: 14, gap: 12 },
  listEmpty: { flex: 1 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16, gap: 10,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avatarWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800' },
  riesgoBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  riesgoText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: `${Colors.info}20`, alignItems: 'center', justifyContent: 'center' },
  actionBtnWa: { backgroundColor: `${Colors.success}20` },
  actionBtnIcon: { fontSize: 18 },
  nombre: { fontSize: 16, fontWeight: '700', color: Colors.text },
  doc: { fontSize: 12, color: Colors.muted },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statItem: { flex: 1, minWidth: '44%', backgroundColor: `${Colors.danger}08`, borderRadius: 8, padding: 10 },
  statValue: { fontSize: 15, fontWeight: '800' },
  statLabel: { fontSize: 10, color: Colors.muted, marginTop: 2 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10,
  },
  totalLabel: { fontSize: 11, fontWeight: '700', color: Colors.muted, letterSpacing: 0.5 },
  totalValue: { fontSize: 17, fontWeight: '900', color: Colors.danger },
});
