import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: {
    label: string;
    onPress: () => void;
    icon?: string;
  };
  onBack?: () => void;
  dark?: boolean;
}

export function ScreenHeader({ title, subtitle, rightAction, onBack, dark = false }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const isDark = dark;

  return (
    <View
      style={[
        styles.header,
        isDark ? styles.dark : styles.light,
        { paddingTop: insets.top + 8 },
      ]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? Colors.primary : Colors.surface}
      />
      <View style={styles.row}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[styles.backIcon, isDark && styles.textLight]}>←</Text>
          </TouchableOpacity>
        )}
        <View style={styles.titleWrap}>
          <Text style={[styles.title, isDark && styles.textLight]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.subtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
              {subtitle}
            </Text>
          )}
        </View>
        {rightAction && (
          <TouchableOpacity onPress={rightAction.onPress} style={styles.rightBtn}>
            {rightAction.icon ? (
              <Text style={styles.rightIcon}>{rightAction.icon}</Text>
            ) : (
              <Text style={styles.rightLabel}>{rightAction.label}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  dark: {
    backgroundColor: Colors.primary,
    borderBottomColor: Colors.primaryLight,
  },
  light: {
    backgroundColor: Colors.surface,
    borderBottomColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 22, color: Colors.text },
  titleWrap: { flex: 1 },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: 13, marginTop: 1 },
  textLight: { color: Colors.white },
  subtitleDark: { color: 'rgba(255,255,255,0.6)' },
  subtitleLight: { color: Colors.muted },
  rightBtn: { padding: 8 },
  rightIcon: { fontSize: 22 },
  rightLabel: { color: Colors.accent, fontWeight: '700', fontSize: 14 },
});
