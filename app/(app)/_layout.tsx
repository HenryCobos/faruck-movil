import React from 'react';
import { Tabs } from 'expo-router';
import { Text, StyleSheet, View } from 'react-native';
import { useAuthStore } from '@/stores/auth.store';
import { Colors } from '@/constants/colors';
import { UserRole } from '@/types';

interface TabConfig {
  name: string;
  title: string;
  icon: string;
}

// Perfil se accede desde la pantalla Sistema (no es tab directo)

const TAB_CONFIGS: Record<UserRole, TabConfig[]> = {
  admin: [
    { name: 'index',    title: 'Inicio',    icon: '📊' },
    { name: 'creditos', title: 'Créditos',  icon: '💰' },
    { name: 'cobros',   title: 'Cobros',    icon: '💳' },
    { name: 'informes', title: 'Informes',  icon: '📋' },
    { name: 'sistema',  title: 'Sistema',   icon: '☰'  },
  ],
  oficial: [
    { name: 'index',    title: 'Inicio',    icon: '📊' },
    { name: 'creditos', title: 'Créditos',  icon: '💰' },
    { name: 'cobros',   title: 'Cobros',    icon: '💳' },
    { name: 'clientes', title: 'Clientes',  icon: '👥' },
    { name: 'sistema',  title: 'Más',       icon: '☰'  },
  ],
  cajero: [
    { name: 'index',    title: 'Inicio',    icon: '📊' },
    { name: 'cobros',   title: 'Cobros',    icon: '💳' },
    { name: 'clientes', title: 'Clientes',  icon: '👥' },
    { name: 'sistema',  title: 'Más',       icon: '☰'  },
  ],
  auditor: [
    { name: 'index',    title: 'Inicio',    icon: '📊' },
    { name: 'cobros',   title: 'Cobros',    icon: '💳' },
    { name: 'informes', title: 'Informes',  icon: '📋' },
    { name: 'sistema',  title: 'Más',       icon: '☰'  },
  ],
};

// Todas las rutas que pueden existir como tabs (incluidas las ocultas)
const ALL_TAB_NAMES = [
  'creditos', 'clientes', 'garantias', 'reportes', 'cobros',
  'contabilidad', 'usuarios', 'auditoria', 'configuracion',
  'perfil', 'informes', 'sistema',
] as const;

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Text style={styles.tabEmoji}>{icon}</Text>
    </View>
  );
}

export default function AppLayout() {
  const { profile } = useAuthStore();
  const role = (profile?.rol ?? 'cajero') as UserRole;
  const tabs = TAB_CONFIGS[role];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.muted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused }) => <TabIcon icon={tab.icon} focused={focused} />,
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              // Cancelamos el comportamiento por defecto para evitar doble navegación.
              // Siempre vuelve al index del stack (descarta modales como "nuevo").
              e.preventDefault();
              navigation.navigate(tab.name, { screen: 'index' });
            },
          })}
        />
      ))}

      {/* Rutas que existen en el file system pero no son tabs del rol actual */}
      {ALL_TAB_NAMES
        .filter((name) => !tabs.find((t) => t.name === name))
        .map((name) => (
          <Tabs.Screen key={name} name={name} options={{ href: null }} />
        ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    height: 62,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabIcon: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabIconActive: {
    backgroundColor: `${Colors.accent}18`,
  },
  tabEmoji: { fontSize: 18 },
});
