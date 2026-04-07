import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, RoleColors } from '@/constants/colors';
import { UserRole } from '@/types';

interface MenuItem {
  icon: string;
  title: string;
  desc: string;
  route: string;
  color: string;
  adminOnly?: boolean;
}

const MENU_ITEMS: Record<UserRole, MenuItem[]> = {
  admin: [
    { icon: '👥', title: 'Clientes',       desc: 'Registro y consulta',     route: '/(app)/clientes',      color: Colors.info },
    { icon: '🏠', title: 'Garantías',      desc: 'Bienes en custodia',      route: '/(app)/garantias',     color: Colors.warning },
    { icon: '🔑', title: 'Usuarios',       desc: 'Control de acceso',       route: '/(app)/usuarios',      color: '#9B74F5' },
    { icon: '🛡️', title: 'Auditoría',      desc: 'Historial de acciones',   route: '/(app)/auditoria',     color: Colors.success },
    { icon: '⚙️', title: 'Configuración',  desc: 'Datos de la empresa',     route: '/(app)/configuracion', color: Colors.muted },
    { icon: '👤', title: 'Mi Perfil',      desc: 'Cuenta y contraseña',     route: '/(app)/perfil',        color: Colors.accent },
  ],
  oficial: [
    { icon: '👥', title: 'Clientes',       desc: 'Registro y consulta',     route: '/(app)/clientes',  color: Colors.info },
    { icon: '🏠', title: 'Garantías',      desc: 'Bienes en custodia',      route: '/(app)/garantias', color: Colors.warning },
    { icon: '👤', title: 'Mi Perfil',      desc: 'Cuenta y contraseña',     route: '/(app)/perfil',    color: Colors.accent },
  ],
  cajero: [
    { icon: '👥', title: 'Clientes',       desc: 'Consultar clientes',      route: '/(app)/clientes',  color: Colors.info },
    { icon: '👤', title: 'Mi Perfil',      desc: 'Cuenta y contraseña',     route: '/(app)/perfil',    color: Colors.accent },
  ],
  auditor: [
    { icon: '🛡️', title: 'Auditoría',      desc: 'Historial de acciones',   route: '/(app)/auditoria', color: Colors.success },
    { icon: '👤', title: 'Mi Perfil',      desc: 'Cuenta y contraseña',     route: '/(app)/perfil',    color: Colors.accent },
  ],
};

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrador', oficial: 'Oficial de Crédito',
  cajero: 'Cajero', auditor: 'Auditor',
};

export default function SistemaScreen() {
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuthStore();
  const role = (profile?.rol ?? 'cajero') as UserRole;
  const items = MENU_ITEMS[role];
  const roleColor = RoleColors[role];
  const initials = profile
    ? `${profile.nombre?.[0] ?? ''}${profile.apellido?.[0] ?? ''}`.toUpperCase()
    : '??';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {/* Header con perfil */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: `${roleColor}30` }]}>
            <Text style={[styles.avatarText, { color: roleColor }]}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile?.nombre} {profile?.apellido}</Text>
            <Text style={styles.profileEmail}>{profile?.email}</Text>
            <View style={[styles.rolePill, { backgroundColor: `${roleColor}25` }]}>
              <Text style={[styles.rolePillText, { color: roleColor }]}>{ROLE_LABEL[role]}</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>MÓDULOS Y HERRAMIENTAS</Text>

        {/* Grid de módulos */}
        <View style={styles.grid}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.route}
              style={styles.card}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.cardIconWrap, { backgroundColor: `${item.color}15` }]}>
                <Text style={styles.cardIcon}>{item.icon}</Text>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDesc}>{item.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Separador */}
        <View style={styles.divider} />

        {/* Cerrar sesión */}
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut} activeOpacity={0.7}>
          <Text style={styles.signOutIcon}>⎋</Text>
          <View>
            <Text style={styles.signOutText}>Cerrar sesión</Text>
            <Text style={styles.signOutSub}>{profile?.email}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 24 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '900' },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 18, fontWeight: '800', color: Colors.white },
  profileEmail: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  rolePill: {
    alignSelf: 'flex-start', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3, marginTop: 2,
  },
  rolePillText: { fontSize: 11, fontWeight: '700' },

  scroll: { padding: 16 },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.muted,
    letterSpacing: 1.5, marginBottom: 12, marginTop: 4,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47%',
    backgroundColor: Colors.surface, borderRadius: 16, padding: 18, gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  cardIcon: { fontSize: 24 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  cardDesc: { fontSize: 11, color: Colors.muted, lineHeight: 15 },

  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 20 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: `${Colors.danger}25`,
  },
  signOutIcon: { fontSize: 22, color: Colors.danger },
  signOutText: { fontSize: 14, fontWeight: '700', color: Colors.danger },
  signOutSub: { fontSize: 11, color: Colors.muted, marginTop: 1 },
});
