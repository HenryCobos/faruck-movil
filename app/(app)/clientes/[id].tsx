import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clientesService } from '@/services/clientes.service';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/colors';
import { Cliente, Prestamo, ClienteEstado } from '@/types';

const ESTADO_VARIANT: Record<ClienteEstado, any> = {
  activo: 'success', inactivo: 'default', moroso: 'danger',
};

const PRESTAMO_ESTADO_VARIANT: Record<string, any> = {
  solicitado: 'warning', aprobado: 'info', activo: 'success',
  cancelado: 'default', vencido: 'danger', ejecutado: 'danger',
};

function scoringColor(s: number) {
  if (s >= 75) return Colors.success;
  if (s >= 50) return Colors.warning;
  return Colors.danger;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function ClienteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!id) { router.back(); return; }
    try {
      const [c, p] = await Promise.all([
        clientesService.getById(id),
        clientesService.getPrestamos(id),
      ]);
      setCliente(c);
      setPrestamos(p);
    } catch (e) {
      Alert.alert('Error', 'No se pudo cargar el cliente');
      router.back();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <LoadingScreen />;
  if (!cliente) return null;

  const initials = `${cliente.nombre[0]}${cliente.apellido[0]}`.toUpperCase();
  const sc = scoringColor(cliente.scoring);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ficha del Cliente</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push(`/(app)/clientes/editar?id=${id}` as any)} style={styles.editBtn}>
            <Text style={styles.editBtnText}>✏️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push(`/(app)/clientes/estado-cuenta?id=${id}` as any)} style={styles.estadoBtn}>
            <Text style={styles.estadoBtnText}>📄</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push(`/(app)/creditos/nuevo?clienteId=${id}` as any)}>
            <Text style={styles.newLoanBtn}>+ Préstamo</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
      >
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={[styles.bigAvatar, { backgroundColor: sc + '22' }]}>
            <Text style={[styles.bigAvatarText, { color: sc }]}>{initials}</Text>
          </View>
          <Text style={styles.fullName}>{cliente.nombre} {cliente.apellido}</Text>
          <Text style={styles.docLine}>{cliente.documento_tipo.toUpperCase()} {cliente.documento_numero}</Text>
          <View style={styles.profileBadges}>
            <Badge label={cliente.estado} variant={ESTADO_VARIANT[cliente.estado]} />
            <View style={[styles.scoreBadge, { backgroundColor: sc + '22' }]}>
              <Text style={[styles.scoreText, { color: sc }]}>Score: {cliente.scoring}/100</Text>
            </View>
          </View>
        </View>

        {/* Contact info */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>📞 Contacto</Text>
          <InfoRow label="Teléfono" value={cliente.telefono} />
          {cliente.email && <InfoRow label="Email" value={cliente.email} />}
          <InfoRow label="Dirección" value={cliente.direccion} />
          <InfoRow label="Registrado" value={new Date(cliente.created_at).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })} />
        </Card>

        {/* Loans */}
        <View style={styles.loansSection}>
          <Text style={styles.loansSectionTitle}>
            💰 Préstamos ({prestamos.length})
          </Text>
          {prestamos.length === 0 ? (
            <View style={styles.noLoans}>
              <Text style={styles.noLoansText}>Este cliente no tiene préstamos registrados</Text>
              <TouchableOpacity
                style={styles.newLoanCard}
                onPress={() => router.push(`/(app)/creditos/nuevo?clienteId=${id}` as any)}
              >
                <Text style={styles.newLoanCardText}>+ Crear primer préstamo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            prestamos.map((p: any) => (
              <TouchableOpacity
                key={p.id}
                style={styles.loanCard}
                onPress={() => router.push(`/(app)/creditos/${p.id}` as any)}
                activeOpacity={0.7}
              >
                <View style={styles.loanRow}>
                  <Text style={styles.loanAmount}>${p.monto_principal?.toLocaleString('es')}</Text>
                  <Badge label={p.estado} variant={PRESTAMO_ESTADO_VARIANT[p.estado] ?? 'default'} />
                </View>
                <Text style={styles.loanSub}>
                  {p.garantias?.tipo} · {p.plazo_meses} meses · {(p.tasa_mensual * 100).toFixed(1)}% mensual
                </Text>
                <Text style={styles.loanDate}>{new Date(p.created_at).toLocaleDateString('es')}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
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
  backIcon: { fontSize: 22, color: Colors.white },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  editBtnText: { fontSize: 16 },
  estadoBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  estadoBtnText: { fontSize: 16 },
  newLoanBtn: { color: Colors.accent, fontWeight: '700', fontSize: 14 },
  scroll: { padding: 16, gap: 14 },
  profileCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24,
    alignItems: 'center', gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  bigAvatar: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  bigAvatarText: { fontSize: 26, fontWeight: '900' },
  fullName: { fontSize: 20, fontWeight: '800', color: Colors.text },
  docLine: { fontSize: 13, color: Colors.muted },
  profileBadges: { flexDirection: 'row', gap: 8, marginTop: 4 },
  scoreBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  scoreText: { fontSize: 12, fontWeight: '700' },
  card: { marginBottom: 0 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  infoLabel: { fontSize: 13, color: Colors.muted, flex: 1 },
  infoValue: { fontSize: 13, color: Colors.text, fontWeight: '600', flex: 2, textAlign: 'right' },
  loansSection: { gap: 10 },
  loansSectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  noLoans: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 20,
    alignItems: 'center', gap: 12,
  },
  noLoansText: { fontSize: 14, color: Colors.muted, textAlign: 'center' },
  newLoanCard: {
    borderWidth: 1.5, borderColor: Colors.accent, borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24,
  },
  newLoanCardText: { color: Colors.accent, fontWeight: '700' },
  loanCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, gap: 4,
    borderLeftWidth: 3, borderLeftColor: Colors.accent,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  loanRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loanAmount: { fontSize: 18, fontWeight: '800', color: Colors.text },
  loanSub: { fontSize: 12, color: Colors.muted, textTransform: 'capitalize' },
  loanDate: { fontSize: 11, color: Colors.muted },
});
