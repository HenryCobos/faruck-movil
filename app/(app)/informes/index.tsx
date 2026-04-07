import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '@/constants/colors';

interface ModuleCard {
  icon: string;
  title: string;
  subtitle: string;
  desc: string;
  color: string;
  route: string;
  items: string[];
}

const MODULOS: ModuleCard[] = [
  {
    icon: '📋',
    title: 'Reportes',
    subtitle: 'Análisis de cartera',
    desc: 'Visualiza y exporta el estado de tu cartera de préstamos activos, vencidos y cancelados. Incluye listado de clientes en mora.',
    color: Colors.info,
    route: '/(app)/reportes',
    items: ['Cartera activa con filtros', 'Clientes morosos', 'Exportar a PDF'],
  },
  {
    icon: '📒',
    title: 'Contabilidad',
    subtitle: 'Libro mayor y resultados',
    desc: 'Consulta el libro diario de asientos contables, estado de resultados mensual y resumen de ingresos por intereses y mora.',
    color: '#9B74F5',
    route: '/(app)/contabilidad',
    items: ['Libro diario de asientos', 'Estado de resultados', 'Ingresos por mes'],
  },
];

export default function InformesScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Informes</Text>
        <Text style={styles.headerSub}>Reportes financieros y contabilidad</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>SELECCIONA UN MÓDULO</Text>

        {MODULOS.map((mod) => (
          <TouchableOpacity
            key={mod.route}
            style={styles.card}
            onPress={() => router.push(mod.route as any)}
            activeOpacity={0.75}
          >
            {/* Franja de color lateral */}
            <View style={[styles.cardStripe, { backgroundColor: mod.color }]} />

            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconWrap, { backgroundColor: `${mod.color}18` }]}>
                  <Text style={styles.cardIcon}>{mod.icon}</Text>
                </View>
                <View style={styles.cardTitles}>
                  <Text style={styles.cardTitle}>{mod.title}</Text>
                  <Text style={[styles.cardSubtitle, { color: mod.color }]}>{mod.subtitle}</Text>
                </View>
                <Text style={styles.cardChevron}>›</Text>
              </View>

              <Text style={styles.cardDesc}>{mod.desc}</Text>

              <View style={styles.cardFeatures}>
                {mod.items.map((item) => (
                  <View key={item} style={styles.featureRow}>
                    <View style={[styles.featureDot, { backgroundColor: mod.color }]} />
                    <Text style={styles.featureText}>{item}</Text>
                  </View>
                ))}
              </View>

              <View style={[styles.cardCta, { backgroundColor: `${mod.color}12`, borderColor: `${mod.color}30` }]}>
                <Text style={[styles.cardCtaText, { color: mod.color }]}>Abrir {mod.title} →</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 20,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.white, marginTop: 8 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 },

  scroll: { padding: 16, gap: 16 },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.muted,
    letterSpacing: 1.5, marginBottom: 4,
  },

  card: {
    backgroundColor: Colors.surface, borderRadius: 18, overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
  },
  cardStripe: { width: 5 },
  cardContent: { flex: 1, padding: 20, gap: 12 },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrap: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardIcon: { fontSize: 26 },
  cardTitles: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: '900', color: Colors.text },
  cardSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  cardChevron: { fontSize: 28, color: Colors.muted, fontWeight: '300' },

  cardDesc: { fontSize: 13, color: Colors.muted, lineHeight: 19 },

  cardFeatures: { gap: 6 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureDot: { width: 6, height: 6, borderRadius: 3 },
  featureText: { fontSize: 12, color: Colors.textSecondary },

  cardCta: {
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, alignItems: 'center',
  },
  cardCtaText: { fontSize: 13, fontWeight: '700' },
});
