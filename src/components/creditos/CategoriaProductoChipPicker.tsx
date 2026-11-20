import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Input } from '@/components/ui/Input';
import { CATEGORIAS_PRODUCTO_OPTIONS } from '@/constants/categoriasProducto';
import { Colors } from '@/constants/colors';

export type CategoriaProductoChipPickerProps = {
  value: string;
  categoriaOtro: string;
  onSelect: (slug: string) => void;
  onOtroChange: (text: string) => void;
  label: string;
  hint?: string;
  otroInputLabel?: string;
  otroPlaceholder?: string;
  errorCategoria?: string;
  errorOtro?: string;
  showClearButton?: boolean;
};

export function CategoriaProductoChipPicker({
  value,
  categoriaOtro,
  onSelect,
  onOtroChange,
  label,
  hint,
  otroInputLabel = 'Nombre de categoría',
  otroPlaceholder = 'Ej: Muebles, Herramientas...',
  errorCategoria,
  errorOtro,
  showClearButton,
}: CategoriaProductoChipPickerProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {showClearButton ? (
        <TouchableOpacity
          style={styles.clearBtn}
          onPress={() => {
            onSelect('');
            onOtroChange('');
          }}
        >
          <Text style={styles.clearBtnText}>Quitar categoría</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.categoriasGrid}>
        {CATEGORIAS_PRODUCTO_OPTIONS.map(({ value: slug, label: chipLabel }) => (
          <TouchableOpacity
            key={slug}
            style={[
              styles.categoriaChip,
              value === slug && styles.categoriaChipActive,
            ]}
            onPress={() => {
              onSelect(slug);
              if (slug !== 'otro') onOtroChange('');
            }}
          >
            <Text
              style={[
                styles.categoriaChipText,
                value === slug && styles.categoriaChipTextActive,
              ]}
            >
              {chipLabel}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {errorCategoria ? <Text style={styles.fieldError}>{errorCategoria}</Text> : null}
      {value === 'otro' ? (
        <Input
          label={otroInputLabel}
          placeholder={otroPlaceholder}
          value={categoriaOtro}
          onChangeText={onOtroChange}
          error={errorOtro}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  hint: { fontSize: 12, color: Colors.muted, lineHeight: 17, marginTop: -2 },
  clearBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  clearBtnText: { fontSize: 13, fontWeight: '600', color: Colors.danger },
  categoriasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  categoriaChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.primaryLight + '30', borderWidth: 1.5, borderColor: Colors.primaryLight,
  },
  categoriaChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  categoriaChipText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  categoriaChipTextActive: { color: Colors.white },
  fieldError: { fontSize: 12, color: Colors.danger, marginTop: 4 },
});