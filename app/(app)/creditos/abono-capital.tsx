import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { supabase } from '../../../src/lib/supabase';
import { prestamosService } from '../../../src/services/prestamos.service';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { Select } from '../../../src/components/ui/Select';
import { Prestamo, Cuota, ResultadoAbonoCapital } from '../../../src/types';
import { formatCurrency } from '../../../src/utils/amortizacion';

const METODO_OPTIONS = [
  { label: '💵 Efectivo',      value: 'efectivo' },
  { label: '🏦 Transferencia', value: 'transferencia' },
  { label: '📄 Cheque',        value: 'cheque' },
];

const TIPO_LABEL: Record<string, string> = {
  francesa:              'Francesa',
  alemana:               'Alemana',
  solo_interes:          'Solo interés',
  anticipado:            'Anticipado',
  solo_interes_adelantado: 'Interés adelantado',
};

function calcularNuevaCuota(
  tipo: string,
  nuevoSaldo: number,
  tasa: number,
  nCuotas: number,
): number {
  if (nCuotas <= 0 || nuevoSaldo <= 0) return 0;
  if (tasa === 0) return Math.round((nuevoSaldo / nCuotas) * 100) / 100;

  switch (tipo) {
    case 'francesa': {
      const r  = tasa;
      const n  = nCuotas;
      const cf = nuevoSaldo * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      return Math.round(cf * 100) / 100;
    }
    case 'alemana':
      return Math.round((nuevoSaldo / nCuotas + nuevoSaldo * tasa) * 100) / 100;
    case 'solo_interes':
    case 'solo_interes_adelantado':
      return Math.round(nuevoSaldo * tasa * 100) / 100;
    case 'anticipado':
      return Math.round(nuevoSaldo * 100) / 100;
    default:
      return Math.round((nuevoSaldo / nCuotas) * 100) / 100;
  }
}

export default function AbonoCaptialScreen() {
  const { prestamoId, fromClienteId } = useLocalSearchParams<{
    prestamoId: string;
    fromClienteId?: string;
  }>();

  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);

  const [prestamo,       setPrestamo]       = useState<Prestamo | null>(null);
  const [cuotasPendientes, setCuotasPendientes] = useState<Cuota[]>([]);
  const [saldoPendiente, setSaldoPendiente] = useState(0);

  const [monto,          setMonto]          = useState('');
  const [metodoPago,     setMetodoPago]     = useState<'efectivo' | 'transferencia' | 'cheque'>('efectivo');
  const [observaciones,  setObservaciones]  = useState('');

  const [resultado, setResultado] = useState<ResultadoAbonoCapital | null>(null);

  const load = useCallback(async () => {
    if (!prestamoId) return;
    try {
      setLoading(true);
      const { data: p, error: pe } = await supabase
        .from('prestamos')
        .select('*, clientes(*)')
        .eq('id', prestamoId)
        .single();
      if (pe) throw pe;
      setPrestamo(p as Prestamo);

      const { data: cuotas, error: ce } = await supabase
        .from('cuotas')
        .select('*')
        .eq('prestamo_id', prestamoId)
        .neq('estado', 'pagada')
        .order('numero_cuota', { ascending: true });
      if (ce) throw ce;

      const lista = (cuotas ?? []) as Cuota[];
      setCuotasPendientes(lista);
      const saldo = lista.reduce((acc, c) => acc + (c.capital ?? 0), 0);
      setSaldoPendiente(Math.round(saldo * 100) / 100);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo cargar el préstamo');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [prestamoId]);

  useEffect(() => { load(); }, [load]);

  const montoNum = parseFloat(monto.replace(',', '.')) || 0;
  const nuevoSaldo = Math.max(0, Math.round((saldoPendiente - montoNum) * 100) / 100);
  const nCuotas   = cuotasPendientes.length;
  const interesPendiente = Math.round(
    cuotasPendientes.reduce((acc, c) => acc + (c.interes ?? 0), 0) * 100,
  ) / 100;
  const esLiquidacion = saldoPendiente > 0 && montoNum >= saldoPendiente - 0.01;
  const nuevaCuota = prestamo && !esLiquidacion
    ? calcularNuevaCuota(prestamo.tipo_amortizacion, nuevoSaldo, prestamo.tasa_mensual, nCuotas)
    : 0;

  const montoValido = montoNum > 0 && montoNum <= saldoPendiente + 0.01;

  function goBack() {
    if (fromClienteId) {
      router.replace(`/(app)/clientes/${fromClienteId}` as any);
    } else {
      router.back();
    }
  }

  async function handleConfirmar() {
    if (!prestamo) return;
    if (!montoValido) {
      Alert.alert(
        'Monto inválido',
        montoNum <= 0
          ? 'El abono debe ser mayor a cero.'
          : `El monto no puede superar el saldo de capital (${formatCurrency(saldoPendiente)}).`,
      );
      return;
    }

    const montoAplicar = esLiquidacion ? saldoPendiente : montoNum;
    const msg = esLiquidacion
      ? `¿Liquidar el préstamo abonando ${formatCurrency(montoAplicar)}?\n\n`
        + `Se cancelarán ${nCuotas} cuota(s) pendientes`
        + (interesPendiente > 0 ? ` (incluye ${formatCurrency(interesPendiente)} de intereses futuros).` : '.')
        + '\n\nEl préstamo quedará saldado y la garantía se liberará.'
      : `¿Registrar abono de ${formatCurrency(montoAplicar)}?\n\nNuevo saldo capital: ${formatCurrency(nuevoSaldo)}`;

    Alert.alert(
      esLiquidacion ? 'Liquidar Préstamo' : 'Confirmar Abono',
      msg,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: esLiquidacion ? 'Liquidar' : 'Confirmar',
          onPress: () => ejecutarAbono(montoAplicar),
        },
      ],
    );
  }

  async function ejecutarAbono(montoAplicar: number) {
    if (!prestamo) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert('Error', 'Sesión expirada'); return; }

    try {
      setSaving(true);
      const res = await prestamosService.abonarCapital(
        { prestamoId: prestamo.id, monto: montoAplicar, metodoPago, observaciones: observaciones || undefined },
        user.id,
      );
      setResultado(res);
    } catch (e: any) {
      Alert.alert('Error al aplicar abono', e.message ?? 'Intente nuevamente');
    } finally {
      setSaving(false);
    }
  }

  // Navegar al recibo cuando el resultado está listo
  useEffect(() => {
    if (!resultado || !prestamo) return;
    const cliente = (prestamo as any)?.clientes;
    const clienteNombre = cliente ? `${cliente.nombre} ${cliente.apellido}` : '';
    const esCancelado = resultado.prestamo_cancelado === true;
    router.replace({
      pathname: '/(app)/creditos/recibo-abono',
      params: {
        reciboNum:       resultado.recibo_num,
        clienteNombre,
        montoAbonado:    String(resultado.saldo_anterior - resultado.saldo_nuevo),
        saldoAnterior:   String(resultado.saldo_anterior),
        saldoNuevo:      String(resultado.saldo_nuevo),
        nCuotas:         String(resultado.n_cuotas),
        nuevaCuota:      esCancelado ? '' : String(resultado.nueva_cuota_monto),
        metodo:          metodoPago,
        fechaAbono:      new Date().toISOString(),
        prestamoId:      prestamoId ?? '',
        fromClienteId:   fromClienteId ?? '',
        modo:            'nuevo',
        cancelado:       esCancelado ? '1' : '0',
        interesAhorrado: String(resultado.interes_ahorrado ?? 0),
      },
    } as any);
  }, [resultado]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  const cliente = (prestamo as any)?.clientes;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Text style={{ fontSize: 20, color: '#1f2937' }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Abono a Capital</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* Resumen del préstamo */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumen del Préstamo</Text>
          {cliente ? (
            <View style={styles.infoRow}>
              <Text style={{ fontSize: 16, color: '#6b7280' }}>👤</Text>
              <Text style={styles.infoText}>{cliente.nombre} {cliente.apellido}</Text>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <Text style={{ fontSize: 16, color: '#6b7280' }}>📄</Text>
            <Text style={styles.infoText}>
              {prestamo?.tipo_prestamo === 'credito_producto'
                ? `Crédito de Producto${prestamo.descripcion_producto ? ` — ${prestamo.descripcion_producto}` : ''}`
                : `${TIPO_LABEL[prestamo?.tipo_amortizacion ?? ''] ?? prestamo?.tipo_amortizacion} · ${(prestamo!.tasa_mensual * 100).toFixed(1)}% mens.`}
            </Text>
          </View>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryCellLabel}>Saldo capital</Text>
              <Text style={styles.summaryCellValue}>${saldoPendiente.toLocaleString('es', { minimumFractionDigits: 2 })}</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryCellLabel}>Cuotas pendientes</Text>
              <Text style={styles.summaryCellValue}>{nCuotas}</Text>
            </View>
          </View>
        </View>

        {/* Monto del abono */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monto del Abono</Text>
          <Input
            label="Monto a abonar ($)"
            value={monto}
            onChangeText={setMonto}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
          {saldoPendiente > 0 && (
            <TouchableOpacity
              style={styles.btnLiquidarTotal}
              onPress={() => setMonto(String(saldoPendiente))}
              activeOpacity={0.75}
            >
              <Text style={styles.btnLiquidarTotalText}>
                💰 Liquidar capital total ({formatCurrency(saldoPendiente)})
              </Text>
            </TouchableOpacity>
          )}
          {monto.length > 0 && !montoValido && (
            <Text style={styles.errorText}>
              {montoNum <= 0
                ? 'El monto debe ser mayor a cero'
                : `El monto no puede superar el saldo de capital (${formatCurrency(saldoPendiente)})`}
            </Text>
          )}
        </View>

        {/* Preview liquidación */}
        {montoValido && esLiquidacion && (
          <View style={styles.liquidacionCard}>
            <Text style={styles.liquidacionTitle}>✅ Liquidación anticipada del préstamo</Text>
            <View style={styles.previewRow}>
              <Text style={styles.liquidacionLabel}>Capital a pagar</Text>
              <Text style={styles.liquidacionValue}>{formatCurrency(saldoPendiente)}</Text>
            </View>
            {interesPendiente > 0 && (
              <View style={styles.previewRow}>
                <Text style={styles.liquidacionLabel}>Intereses futuros que se cancelan</Text>
                <Text style={[styles.liquidacionValue, { color: '#16a34a' }]}>
                  {formatCurrency(interesPendiente)}
                </Text>
              </View>
            )}
            <View style={styles.previewRow}>
              <Text style={styles.liquidacionLabel}>Cuotas pendientes a cancelar</Text>
              <Text style={styles.liquidacionValue}>{nCuotas}</Text>
            </View>
            <Text style={styles.liquidacionNote}>
              El préstamo quedará saldado y la garantía se liberará.
            </Text>
          </View>
        )}

        {/* Preview abono parcial */}
        {montoValido && !esLiquidacion && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Vista previa tras el abono</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Nuevo saldo capital</Text>
              <Text style={[styles.previewValue, { color: '#3b82f6' }]}>
                ${nuevoSaldo.toLocaleString('es', { minimumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Nueva cuota estimada</Text>
              <Text style={[styles.previewValue, { color: '#7c3aed' }]}>
                ${nuevaCuota.toLocaleString('es', { minimumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Cuotas restantes</Text>
              <Text style={styles.previewValue}>{nCuotas}</Text>
            </View>
            <Text style={styles.previewNote}>
              * El cronograma real se recalculará en el servidor. Esta es una estimación.
            </Text>
          </View>
        )}

        {/* Método de pago */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Método de Pago</Text>
          <Select
            label="Método de pago"
            options={METODO_OPTIONS}
            value={metodoPago}
            onSelect={(v) => setMetodoPago(v as typeof metodoPago)}
          />
        </View>

        {/* Observaciones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Observaciones (opcional)</Text>
          <Input
            label=""
            value={observaciones}
            onChangeText={setObservaciones}
            multiline
            numberOfLines={3}
            placeholder="Notas adicionales..."
          />
        </View>

        {/* Botón confirmar */}
        <View style={styles.section}>
          <Button
            title={
              saving
                ? 'Aplicando…'
                : esLiquidacion
                  ? `Liquidar Préstamo · ${formatCurrency(saldoPendiente)}`
                  : `Confirmar Abono · ${montoNum > 0 ? formatCurrency(montoNum) : '$0'}`
            }
            onPress={handleConfirmar}
            variant="primary"
            size="lg"
            disabled={!montoValido || saving}
            loading={saving}
          />
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f9fafb' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backBtn:     { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 },
  infoRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  infoText: { fontSize: 14, color: '#374151', flex: 1 },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  summaryCell: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  summaryCellLabel: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  summaryCellValue: { fontSize: 18, fontWeight: '700', color: '#1f2937' },

  errorText: { fontSize: 12, color: '#ef4444', marginTop: 4 },

  btnLiquidarTotal: {
    marginTop: 10,
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#86efac',
    alignItems: 'center',
  },
  btnLiquidarTotalText: { fontSize: 13, fontWeight: '700', color: '#15803d' },

  liquidacionCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  liquidacionTitle: { fontSize: 14, fontWeight: '700', color: '#15803d', marginBottom: 10 },
  liquidacionLabel: { fontSize: 13, color: '#166534' },
  liquidacionValue: { fontSize: 14, fontWeight: '700', color: '#14532d' },
  liquidacionNote: { fontSize: 11, color: '#15803d', marginTop: 8, fontStyle: 'italic' },

  previewCard: {
    backgroundColor: '#ede9fe',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#c4b5fd',
  },
  previewTitle: { fontSize: 14, fontWeight: '700', color: '#5b21b6', marginBottom: 10 },
  previewRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  previewLabel: { fontSize: 13, color: '#5b21b6' },
  previewValue: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  previewNote:  { fontSize: 11, color: '#7c3aed', marginTop: 8, fontStyle: 'italic' },

});
