import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, TextInput } from 'react-native';
import { Colors } from '@/constants/colors';
import { formatCurrency } from '@/utils/amortizacion';
import {
  type CuotaManualFila,
  buildCuotasIguales,
  validarCronogramaManual,
  ajustarUltimaCuota,
} from '@/utils/cronogramaManual';

type Props = {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  principal: number;
  nCuotas: number;
  filas: CuotaManualFila[];
  onFilasChange: (filas: CuotaManualFila[]) => void;
};

export function CronogramaManualEditor({
  enabled,
  onEnabledChange,
  principal,
  nCuotas,
  filas,
  onFilasChange,
}: Props) {
  useEffect(() => {
    if (!enabled || principal <= 0 || nCuotas <= 0) return;
    if (filas.length !== nCuotas) {
      onFilasChange(buildCuotasIguales(principal, nCuotas));
    }
  }, [enabled, nCuotas, principal, filas.length, onFilasChange]);

  const validacion = enabled && principal > 0 && filas.length > 0
    ? validarCronogramaManual(principal, filas, nCuotas)
    : null;

  const updateCapital = (index: number, text: string) => {
    const raw = text.replace(/[^\d.,]/g, '').replace(',', '.');
    const num = raw === '' ? 0 : parseFloat(raw);
    const next = filas.map((f, i) =>
      i === index ? { ...f, capital: Number.isFinite(num) ? num : 0 } : f,
    );
    onFilasChange(next);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchTitle}>Personalizar montos por cuota</Text>
          <Text style={styles.switchHint}>Solo sin interés. Define el capital de cada cuota.</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={v => {
            onEnabledChange(v);
            if (v && principal > 0 && nCuotas > 0) {
              onFilasChange(buildCuotasIguales(principal, nCuotas));
            }
          }}
          trackColor={{ false: Colors.border, true: Colors.accent }}
        />
      </View>

      {enabled && nCuotas > 0 && (
        <>
          {validacion && (
            <View style={[styles.sumBanner, validacion.ok ? styles.sumOk : styles.sumBad]}>
              <Text style={styles.sumText}>
                Suma: {formatCurrency(validacion.suma)} / {formatCurrency(principal)}
                {!validacion.ok && validacion.diferencia !== 0
                  ? ` · Falta: ${formatCurrency(validacion.diferencia)}`
                  : ''}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.cuadrarBtn}
            onPress={() => onFilasChange(ajustarUltimaCuota(filas, principal))}
            activeOpacity={0.75}
          >
            <Text style={styles.cuadrarBtnText}>Cuadrar última cuota</Text>
          </TouchableOpacity>

          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colNum]}>#</Text>
              <Text style={[styles.th, styles.colMonto]}>Capital a pagar</Text>
            </View>
            {filas.map((f, idx) => (
              <View key={f.numero} style={styles.tableRow}>
                <Text style={styles.colNum}>{f.numero}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={f.capital > 0 ? String(f.capital) : ''}
                  onChangeText={t => updateCapital(idx, t)}
                  placeholder="0"
                  placeholderTextColor={Colors.muted}
                />
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

export function cronogramaManualValido(
  enabled: boolean,
  principal: number,
  filas: CuotaManualFila[],
  nCuotas: number,
): boolean {
  if (!enabled) return true;
  return validarCronogramaManual(principal, filas, nCuotas).ok;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  switchTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  switchHint: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  sumBanner: {
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  sumOk: { backgroundColor: `${Colors.success}22` },
  sumBad: { backgroundColor: `${Colors.danger}18` },
  sumText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  cuadrarBtn: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cuadrarBtnText: { fontSize: 13, fontWeight: '600', color: Colors.accent },
  table: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  th: { fontSize: 12, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  colNum: { width: 36, fontSize: 14, fontWeight: '700', color: Colors.text },
  colMonto: { flex: 1 },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
