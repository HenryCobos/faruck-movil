import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { clientesService } from '@/services/clientes.service';
import { garantiasService } from '@/services/garantias.service';
import { useAuthStore } from '@/stores/auth.store';
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

const GARANTIA_TIPO_ICON: Record<string, string> = {
  inmueble: '🏠', vehiculo: '🚗', joya: '💍',
  electrodomestico: '📺', cheque: '🏦', letra_de_cambio: '📋', otro: '📦',
};

const GARANTIA_ESTADO_VARIANT: Record<string, any> = {
  disponible: 'success', en_garantia: 'warning', devuelta: 'default', ejecutada: 'danger',
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
  const { profile } = useAuthStore();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [garantias, setGarantias] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!id) { router.canGoBack() ? router.back() : router.replace('/(app)/clientes'); return; }
    try {
      const [c, p, g] = await Promise.all([
        clientesService.getById(id),
        clientesService.getPrestamos(id),
        supabase.from('garantias').select('id, estado, tipo, descripcion, valor_avaluo').eq('cliente_id', id)
          .then(r => r.data ?? []),
      ]);
      setCliente(c);
      setPrestamos(p);
      setGarantias(g);
    } catch (e) {
      Alert.alert('Error', 'No se pudo cargar el cliente');
      router.canGoBack() ? router.back() : router.replace('/(app)/clientes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  const handleEliminar = () => {
    if (!id || !cliente) return;

    // Bloquear si hay préstamos activos/en proceso
    const prestamosActivos = prestamos.filter(
      p => p.estado === 'activo' || p.estado === 'aprobado' || p.estado === 'solicitado'
    );
    if (prestamosActivos.length > 0) {
      Alert.alert(
        'No se puede eliminar',
        `Este cliente tiene ${prestamosActivos.length} préstamo(s) activo(s) o en proceso. Resuelve todos los préstamos antes de eliminar el cliente.`,
      );
      return;
    }

    // Bloquear si alguna garantía está en uso
    const garantiasEnUso = garantias.filter((g: any) => g.estado === 'en_garantia');
    if (garantiasEnUso.length > 0) {
      Alert.alert(
        'No se puede eliminar',
        `El cliente tiene ${garantiasEnUso.length} garantía(s) actualmente como respaldo de préstamos. Liquida los préstamos primero.`,
      );
      return;
    }

    // Construir mensaje descriptivo según garantías libres
    const garantiasLibres = garantias.filter((g: any) => g.estado !== 'en_garantia');
    const notaGarantias = garantiasLibres.length > 0
      ? `\n\nTambién se eliminarán ${garantiasLibres.length} garantía(s) asociada(s) (${garantiasLibres.map((g: any) => g.tipo).join(', ')}) que no están vinculadas a ningún préstamo.`
      : '';

    Alert.alert(
      '⚠️ Eliminar Cliente',
      `¿Estás seguro de eliminar a ${cliente.nombre} ${cliente.apellido}?${notaGarantias}\n\nEsta acción es permanente e irreversible.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive', onPress: async () => {
            setDeleting(true);
            try {
              await clientesService.eliminar(id);
              router.replace('/(app)/clientes' as any);
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'No se pudo eliminar el cliente');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const handleEliminarGarantia = (g: any) => {
    if (g.estado === 'en_garantia') {
      Alert.alert('No se puede eliminar', 'Esta garantía está siendo usada como respaldo de un préstamo activo.');
      return;
    }
    Alert.alert(
      '🗑️ Eliminar Garantía',
      `¿Eliminar "${g.tipo} — ${g.descripcion?.substring(0, 50)}"?\n\nEsta acción es permanente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive', onPress: async () => {
            try {
              await garantiasService.eliminar(g.id);
              setGarantias(prev => prev.filter((x: any) => x.id !== g.id));
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'No se pudo eliminar la garantía');
            }
          },
        },
      ],
    );
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) return <LoadingScreen />;
  if (!cliente) return null;

  const initials = `${cliente.nombre[0]}${cliente.apellido[0]}`.toUpperCase();
  const sc = scoringColor(cliente.scoring);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/clientes')} style={styles.backBtn}>
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
          {profile?.rol === 'admin' && (
            <TouchableOpacity onPress={handleEliminar} disabled={deleting} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>🗑️</Text>
            </TouchableOpacity>
          )}
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
          {!!cliente.alias && <Text style={styles.aliasLine}>🏷️ {cliente.alias}</Text>}
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
          {cliente.alias && <InfoRow label="Alias" value={cliente.alias} />}
          <InfoRow label="Teléfono" value={cliente.telefono} />
          {cliente.email && <InfoRow label="Email" value={cliente.email} />}
          <InfoRow label="Dirección" value={cliente.direccion} />
          <InfoRow label="Registrado" value={new Date(cliente.created_at).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })} />
        </Card>

        {/* Guarantees */}
        <View style={styles.loansSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.loansSectionTitle}>
              🔒 Garantías ({garantias.length})
            </Text>
            <TouchableOpacity
              style={styles.addGarantiaBtn}
              onPress={() => router.push(`/(app)/garantias/nuevo?clienteId=${id}` as any)}
            >
              <Text style={styles.addGarantiaBtnText}>+ Añadir</Text>
            </TouchableOpacity>
          </View>

          {garantias.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyGarantia}
              onPress={() => router.push(`/(app)/garantias/nuevo?clienteId=${id}` as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyGarantiaIcon}>🔒</Text>
              <Text style={styles.emptyGarantiaText}>Sin garantías registradas</Text>
              <Text style={styles.emptyGarantiaHint}>Toca para registrar la primera</Text>
            </TouchableOpacity>
          ) : (
            garantias.map((g: any) => (
              <TouchableOpacity
                key={g.id}
                style={styles.garantiaCard}
                onPress={() => router.push(`/(app)/garantias/${g.id}?fromClienteId=${id}` as any)}
                activeOpacity={0.7}
              >
                <View style={styles.garantiaLeft}>
                  <Text style={styles.garantiaIcon}>{GARANTIA_TIPO_ICON[g.tipo] ?? '📦'}</Text>
                </View>
                <View style={styles.garantiaBody}>
                  <Text style={styles.garantiaTipo} numberOfLines={1}>
                    {g.tipo?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </Text>
                  <Text style={styles.garantiaDesc} numberOfLines={2}>{g.descripcion}</Text>
                  {g.valor_avaluo > 0 && (
                    <Text style={styles.garantiaValor}>${Number(g.valor_avaluo).toLocaleString('es')}</Text>
                  )}
                </View>
                <View style={styles.garantiaRight}>
                  <Badge label={g.estado} variant={GARANTIA_ESTADO_VARIANT[g.estado] ?? 'default'} />
                  {profile?.rol === 'admin' && g.estado !== 'en_garantia' && (
                    <TouchableOpacity
                      style={styles.garantiaDeleteBtn}
                      onPress={() => handleEliminarGarantia(g)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.garantiaDeleteIcon}>🗑️</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

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
                onPress={() => router.push(`/(app)/creditos/${p.id}?fromClienteId=${id}` as any)}
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
  deleteBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: `${Colors.danger}30`, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 16 },
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
  aliasLine: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
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
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loansSectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  addGarantiaBtn: {
    backgroundColor: `${Colors.accent}18`, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  addGarantiaBtnText: { fontSize: 12, fontWeight: '700', color: Colors.accent },

  emptyGarantia: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 20,
    alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.border,
  },
  emptyGarantiaIcon: { fontSize: 28 },
  emptyGarantiaText: { fontSize: 14, color: Colors.muted, fontWeight: '600' },
  emptyGarantiaHint: { fontSize: 12, color: Colors.accent, fontWeight: '600' },

  garantiaCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  garantiaLeft: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: `${Colors.primary}10`,
    alignItems: 'center', justifyContent: 'center',
  },
  garantiaIcon: { fontSize: 22 },
  garantiaBody: { flex: 1, gap: 2 },
  garantiaTipo: { fontSize: 13, fontWeight: '700', color: Colors.text, textTransform: 'capitalize' },
  garantiaDesc: { fontSize: 11, color: Colors.muted, lineHeight: 16 },
  garantiaValor: { fontSize: 12, fontWeight: '700', color: Colors.success, marginTop: 2 },
  garantiaRight: { alignItems: 'flex-end', gap: 8 },
  garantiaDeleteBtn: { padding: 4 },
  garantiaDeleteIcon: { fontSize: 14 },

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
