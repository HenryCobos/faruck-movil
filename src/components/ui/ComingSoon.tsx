import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';

interface ComingSoonProps {
  module: string;
  icon: string;
  description: string;
  phase: string;
}

export function ComingSoon({ module, icon, description, phase }: ComingSoonProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        <Text style={styles.title}>{module}</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.phaseBadge}>
          <Text style={styles.phaseText}>📍 {phase}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { alignItems: 'center', padding: 32, gap: 12 },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: `${Colors.accent}18`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  icon: { fontSize: 36 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 14,
    color: Colors.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  phaseBadge: {
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  phaseText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
});
