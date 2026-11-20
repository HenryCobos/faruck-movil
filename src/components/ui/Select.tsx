import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { SearchBar } from './SearchBar';
import { optionMatchesSearch } from '../../utils/clienteSelectOption';

export interface SelectOption {
  label: string;
  value: string;
  icon?: string;
  /** Campos concatenados para filtro local cuando searchable=true */
  searchText?: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string;
  onSelect: (value: string) => void;
  placeholder?: string;
  error?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function Select({
  label,
  options,
  value,
  onSelect,
  placeholder = 'Seleccionar...',
  error,
  searchable = false,
  searchPlaceholder = 'Buscar...',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);

  const closeModal = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const openModal = useCallback(() => {
    setQuery('');
    setOpen(true);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    return options.filter((o) => optionMatchesSearch(o, query));
  }, [options, query, searchable]);

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={[styles.trigger, error ? styles.errorBorder : undefined]}
        onPress={openModal}
        activeOpacity={0.7}
      >
        <Text style={[styles.triggerText, !selected && styles.placeholder]}>
          {selected ? `${selected.icon ? selected.icon + ' ' : ''}${selected.label}` : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>
      {error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={open} transparent animationType="slide" onRequestClose={closeModal}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeModal} />
        <SafeAreaView style={styles.sheet}>
          {label && <Text style={styles.sheetTitle}>{label}</Text>}
          {searchable ? (
            <View style={styles.searchWrap}>
              <SearchBar
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
              />
            </View>
          ) : null}
          <FlatList
            data={filteredOptions}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              searchable && query.trim() ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>Sin resultados</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.option, item.value === value && styles.optionSelected]}
                onPress={() => { onSelect(item.value); closeModal(); }}
              >
                {item.icon && <Text style={styles.optionIcon}>{item.icon}</Text>}
                <Text style={[styles.optionText, item.value === value && styles.optionTextSelected]}>
                  {item.label}
                </Text>
                {item.value === value && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  trigger: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderWidth: 1.5,
    borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 16, height: 52,
  },
  errorBorder: { borderColor: Colors.danger },
  triggerText: { flex: 1, fontSize: 15, color: Colors.text },
  placeholder: { color: Colors.muted },
  chevron: { fontSize: 14, color: Colors.muted },
  error: { fontSize: 12, color: Colors.danger },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20,
    borderTopRightRadius: 20, paddingBottom: 20, maxHeight: '60%',
  },
  sheetTitle: {
    fontSize: 16, fontWeight: '800', color: Colors.text,
    padding: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  emptyWrap: { paddingVertical: 28, alignItems: 'center' },
  emptyText: { fontSize: 14, color: Colors.muted, fontWeight: '600' },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  optionSelected: { backgroundColor: `${Colors.accent}10` },
  optionIcon: { fontSize: 20 },
  optionText: { flex: 1, fontSize: 15, color: Colors.text },
  optionTextSelected: { color: Colors.accent, fontWeight: '700' },
  check: { color: Colors.accent, fontWeight: '800', fontSize: 16 },
});
