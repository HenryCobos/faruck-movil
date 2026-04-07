import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { usuariosService, UsuarioProfile } from '@/services/usuarios.service';
import { useAuthStore } from '@/stores/auth.store';
import { SearchBar } from '@/components/ui/SearchBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Colors, RoleColors } from '@/constants/colors';

const ROL_LABELS: Record<string, string> = {
  admin: 'Administrador', oficial: 'Oficial de Crédito',
  cajero: 'Cajero', auditor: 'Auditor',
};
const ROL_ICONS: Record<string, string> = {
  admin: '👑', oficial: '💼', cajero: '💳', auditor: '🔍',
};

function UsuarioCard({ item, onPress, onToggle, esMiPerfil }: {
  item: UsuarioProfile;
  onPress: () => void;
  onToggle: () => void;
  esMiPerfil: boolean;
}) {
  const roleColor = RoleColors[item.rol] ?? Colors.muted;
  return (
    <TouchableOpacity style={[styles.card, !item.activo && styles.cardInactivo]} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.avatar, { backgroundColor: `${roleColor}22` }]}>
        <Text style={styles.avatarIcon}>{ROL_ICONS[item.rol]}</Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardNameRow}>
          <Text style={[styles.cardName, !item.activo && styles.textInactivo]}>
            {item.nombre} {item.apellido}
            {esMiPerfil && <Text style={styles.tuLabel}> (tú)</Text>}
          </Text>
          {!item.activo && (
            <View style={styles.inactivoBadge}>
              <Text style={styles.inactivoText}>Inactivo</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardEmail}>{item.email}</Text>
        <View style={styles.cardBottom}>
          <View style={[styles.rolBadge, { backgroundColor: `${roleColor}18` }]}>
            <Text style={[styles.rolText, { color: roleColor }]}>{ROL_LABELS[item.rol]}</Text>
          </View>
          {item.telefono ? <Text style={styles.telefono}>📞 {item.telefono}</Text> : null}
        </View>
      </View>

      {!esMiPerfil && (
        <TouchableOpacity
          style={[styles.toggleBtn, { backgroundColor: item.activo ? `${Colors.danger}15` : `${Colors.success}15` }]}
          onPress={onToggle}
        >
          <Text style={[styles.toggleBtnText, { color: item.activo ? Colors.danger : Colors.success }]}>
            {item.activo ? '🔒' : '🔓'}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function UsuariosScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const [usuarios, setUsuarios] = useState<UsuarioProfile[]>([]);
  const [filtered, setFiltered] = useState<UsuarioProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await usuariosService.getAll();
      setUsuarios(data);
      applySearch(data, search);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, []));

  const applySearch = (data: UsuarioProfile[], q: string) => {
    if (!q) { setFiltered(data); return; }
    const ql = q.toLowerCase();
    setFiltered(data.filter(u =>
      u.nombre?.toLowerCase().includes(ql) ||
      u.apellido?.toLowerCase().includes(ql) ||
      u.email?.toLowerCase().includes(ql)
    ));
  };

  const onSearch = (q: string) => { setSearch(q); applySearch(usuarios, q); };

  const handleToggle = (u: UsuarioProfile) => {
    const accion = u.activo ? 'desactivar' : 'activar';
    Alert.alert(
      `¿${accion.charAt(0).toUpperCase() + accion.slice(1)} usuario?`,
      `${u.nombre} ${u.apellido} quedará ${u.activo ? 'sin acceso al sistema' : 'con acceso nuevamente'}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: accion.charAt(0).toUpperCase() + accion.slice(1),
          style: u.activo ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await usuariosService.toggleActivo(u.id, !u.activo);
              load();
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'No se pudo actualizar');
            }
          },
        },
      ]
    );
  };

  const stats = {
    total: usuarios.length,
    activos: usuarios.filter(u => u.activo).length,
    porRol: {
      admin: usuarios.filter(u => u.rol === 'admin').length,
      oficial: usuarios.filter(u => u.rol === 'oficial').length,
      cajero: usuarios.filter(u => u.rol === 'cajero').length,
      auditor: usuarios.filter(u => u.rol === 'auditor').length,
    },
  };

  if (loading) return <LoadingScreen label="Cargando usuarios..." />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Usuarios</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(app)/usuarios/nuevo' as any)}>
            <Text style={styles.addBtnText}>+ Nuevo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          {[
            { icon: '👑', label: 'Admin', count: stats.porRol.admin, color: RoleColors.admin },
            { icon: '💼', label: 'Oficial', count: stats.porRol.oficial, color: RoleColors.oficial },
            { icon: '💳', label: 'Cajero', count: stats.porRol.cajero, color: RoleColors.cajero },
            { icon: '🔍', label: 'Auditor', count: stats.porRol.auditor, color: RoleColors.auditor },
          ].map(s => (
            <View key={s.label} style={styles.statPill}>
              <Text style={styles.statIcon}>{s.icon}</Text>
              <Text style={[styles.statCount, { color: s.color }]}>{s.count}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <SearchBar value={search} onChangeText={onSearch} placeholder="Buscar por nombre o correo..." />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UsuarioCard
            item={item}
            esMiPerfil={item.id === profile?.id}
            onPress={() => router.push(`/(app)/usuarios/${item.id}` as any)}
            onToggle={() => handleToggle(item)}
          />
        )}
        contentContainerStyle={[styles.list, filtered.length === 0 && styles.listEmpty, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        ListEmptyComponent={<EmptyState icon="👥" title="Sin usuarios" description="Crea el primer usuario del sistema." />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.white, marginTop: 8 },
  addBtn: { backgroundColor: Colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statPill: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10,
    padding: 8, alignItems: 'center', gap: 2,
  },
  statIcon: { fontSize: 14 },
  statCount: { fontSize: 16, fontWeight: '900' },
  statLabel: { fontSize: 9, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  list: { padding: 14, gap: 10 },
  listEmpty: { flex: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardInactivo: { opacity: 0.55 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarIcon: { fontSize: 22 },
  cardBody: { flex: 1, gap: 3 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1 },
  textInactivo: { color: Colors.muted },
  tuLabel: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  inactivoBadge: { backgroundColor: `${Colors.danger}20`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  inactivoText: { fontSize: 10, color: Colors.danger, fontWeight: '700' },
  cardEmail: { fontSize: 12, color: Colors.muted },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  rolBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  rolText: { fontSize: 11, fontWeight: '700' },
  telefono: { fontSize: 11, color: Colors.muted },
  toggleBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  toggleBtnText: { fontSize: 18 },
});
