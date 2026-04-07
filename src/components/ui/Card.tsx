import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export function Card({ children, style, padding = 16 }: CardProps) {
  return (
    <View style={[styles.card, { padding }, style]}>
      {children}
    </View>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  color?: string;
  icon?: string;
  trend?: string;
  trendUp?: boolean;
}

export function StatCard({ label, value, color = Colors.accent, icon, trend, trendUp }: StatCardProps) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statHeader}>
        <View style={[styles.statIconWrap, { backgroundColor: `${color}18` }]}>
          {icon && <Text style={styles.statIcon}>{icon}</Text>}
        </View>
        <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      {trend && (
        <Text style={[styles.statTrend, trendUp ? styles.trendUp : styles.trendDown]} numberOfLines={1}>
          {trendUp ? '↑' : '↓'} {trend}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    gap: 2,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statIcon: { fontSize: 15 },
  statLabel: {
    flex: 1,
    fontSize: 11,
    color: Colors.muted,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.accent,
    letterSpacing: -0.5,
  },
  statTrend: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  trendUp: { color: Colors.success },
  trendDown: { color: Colors.danger },
});
