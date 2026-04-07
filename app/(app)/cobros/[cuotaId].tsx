import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cobrosService, CuotaPendiente } from '@/services/cobros.service';
import { useAuthStore } from '@/stores/auth.store';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/utils/amortizacion';
import { Colors } from '@/constants/colors';

const METODOS = [
  { label: 'Efectivo', value: 'efectivo', icon: '💵' },
  { label: 'Transferencia', value: 'transferencia', icon: '🏦' },
  { label: 'Cheque', value: 'cheque', icon: '📄' },
];

function LineItem({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <View style={styles.lineItem}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, bold && styles.lineBold, color ? { color } : undefined]}>{value}</Text>
    </View>
  );
}

export default function RegistrarPagoScreen() {
  const { cuotaId } = useLocalSearchParams<{ cuotaId: string }>();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();

  const [cuota, setCuota] = useState<CuotaPendiente | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [observaciones, setObservaciones] = useState('');
  const [cobrarMora, setCobrarMora] = useState(true);

  useEffect(() => {
    if (!cuotaId) { router.back(); return; }
    cobrosService.getCuotaById(cuotaId)
      .then(setCuota)
      .catch(() => { Alert.alert('Error', 'No se pudo cargar la cuota'); router.back(); })
      .finally(() => setLoading(false));
  }, [cuotaId]);

  if (loading) return <LoadingScreen />;
  if (!cuota) return null;

  const mora = cobrarMora
    ? (cuota.mora_calculada ?? cobrosService.calcularMora(cuota.monto_total, cuota.fecha_vencimiento))
    : 0;
  const totalPagar = cuota.monto_total + mora;

  const handleConfirmar = () => {
    Alert.alert(
      'Confirmar Pago',
      `¿Registrar pago de ${formatCurrency(totalPagar)} para ${cuota.cliente_nombre} ${cuota.cliente_apellido}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar', onPress: async () => {
            if (!profile?.id) return;
            setSaving(true);
            try {
              const resultado = await cobrosService.registrarPago({
                cuotaId: cuota.id,
                cajeroId: profile.id,
                montoPagado: totalPagar,
                moraCobrada: mora,
                metodoPago: metodoPago as any,
                observaciones: observaciones || undefined,
              });
              router.replace({
                pathname: '/(app)/cobros/recibo',
                params: {
                  reciboNum: resultado.recibo_num,
                  clienteNombre: `${cuota.cliente_nombre} ${cuota.cliente_apellido}`,
                  numeroCuota: String(cuota.numero_cuota),
                  capital: String(resultado.capital),
                  interes: String(resultado.interes),
                  mora: String(resultado.mora),
                  total: String(resultado.total),
                  metodo: metodoPago,
                  cancelado: resultado.prestamo_cancelado ? '1' : '0',
                },
              } as any);
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'No se pudo registrar el pago');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Registrar Pago</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>

          {/* Cliente */}
          <View style={styles.clienteCard}>
            <View style={styles.clienteAvatar}>
              <Text style={styles.clienteInitials}>
                {cuota.cliente_nombre[0]}{cuota.cliente_apellido[0]}
              </Text>
            </View>
            <View>
              <Text style={styles.clienteNombre}>{cuota.cliente_nombre} {cuota.cliente_apellido}</Text>
              <Text style={styles.clienteDoc}>{cuota.cliente_documento} · {cuota.cliente_telefono}</Text>
              <Text style={styles.garantiaInfo}>📦 {cuota.garantia_tipo} — {cuota.garantia_descripcion?.substring(0, 35)}...</Text>
            </View>
          </View>

          {/* Detalle cuota */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cuota #{cuota.numero_cuota}</Text>
            <LineItem label="Fecha de vencimiento" value={new Date(cuota.fecha_vencimiento).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })} />
            <LineItem label="Capital" value={formatCurrency(cuota.capital)} color={Colors.info} />
            <LineItem label="Interés" value={formatCurrency(cuota.interes)} color={Colors.accent} />
            <LineItem label="Subtotal cuota" value={formatCurrency(cuota.monto_total)} bold />
            {cuota.dias_mora > 0 && (
              <>
                <View style={styles.divider} />
                <View style={styles.moraToggle}>
                  <View>
                    <Text style={styles.moraToggleTitle}>⚠️ Mora acumulada ({cuota.dias_mora} días)</Text>
                    <Text style={styles.moraToggleSub}>Tasa: 0.1% diario sobre la cuota</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.toggle, cobrarMora && styles.toggleActive]}
                    onPress={() => setCobrarMora(v => !v)}
                  >
                    <Text style={[styles.toggleText, cobrarMora && styles.toggleTextActive]}>
                      {cobrarMora ? 'Cobrar' : 'Exonerar'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {cobrarMora && (
                  <LineItem label="Mora calculada" value={formatCurrency(mora)} color={Colors.danger} />
                )}
              </>
            )}
          </View>

          {/* Total a pagar */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>TOTAL A PAGAR</Text>
            <Text style={styles.totalAmount}>{formatCurrency(totalPagar)}</Text>
            {mora > 0 && (
              <Text style={styles.totalBreak}>
                {formatCurrency(cuota.monto_total)} cuota + {formatCurrency(mora)} mora
              </Text>
            )}
          </View>

          {/* Método y observaciones */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Método de Pago</Text>
            <Select options={METODOS} value={metodoPago} onSelect={setMetodoPago} />
            <Input
              label="Referencia / Observación (opcional)"
              placeholder="N° de transferencia, comprobante..."
              value={observaciones}
              onChangeText={setObservaciones}
            />
          </View>

          <Button
            title={`Confirmar Pago · ${formatCurrency(totalPagar)}`}
            onPress={handleConfirmar}
            loading={saving}
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  header: {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 18, color: Colors.white },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white },
  scroll: { padding: 16, gap: 14 },
  clienteCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  clienteAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: `${Colors.accent}22`, alignItems: 'center', justifyContent: 'center',
  },
  clienteInitials: { fontSize: 18, fontWeight: '800', color: Colors.accent },
  clienteNombre: { fontSize: 16, fontWeight: '700', color: Colors.text },
  clienteDoc: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  garantiaInfo: { fontSize: 11, color: Colors.muted, marginTop: 3 },
  section: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 18, gap: 2,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border },
  lineLabel: { fontSize: 13, color: Colors.muted, flex: 1 },
  lineValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
  lineBold: { fontSize: 15, fontWeight: '800' },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },
  moraToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  moraToggleTitle: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  moraToggleSub: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  toggle: { backgroundColor: Colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  toggleActive: { backgroundColor: Colors.danger },
  toggleText: { fontSize: 12, fontWeight: '700', color: Colors.muted },
  toggleTextActive: { color: Colors.white },
  totalCard: {
    backgroundColor: Colors.primary, borderRadius: 16, padding: 24,
    alignItems: 'center', gap: 6,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  totalLabel: { fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' },
  totalAmount: { fontSize: 36, fontWeight: '900', color: Colors.accent, letterSpacing: -1 },
  totalBreak: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
});
