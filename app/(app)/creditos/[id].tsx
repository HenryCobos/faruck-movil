import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, RefreshControl, Linking, TextInput, Modal, KeyboardAvoidingView, Platform,
  Image, Dimensions, StatusBar as RNStatusBar,
} from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { prestamosService } from '@/services/prestamos.service';
import { cobrosService, PagoRegistrado } from '@/services/cobros.service';
import { exportarCronogramaPdf } from '@/utils/cronogramaPdf';
import { useAuthStore } from '@/stores/auth.store';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/colors';
import { Cuota, CuotaEstado, AbonoCapital } from '@/types';
import { formatCurrency, parseFechaLocal } from '@/utils/amortizacion';

const ESTADO_VARIANT: Record<string, any> = {
  solicitado: 'warning', aprobado: 'info', activo: 'success',
  cancelado: 'default', vencido: 'danger', ejecutado: 'danger', renovado: 'info',
};

const AMORT_LABEL: Record<string, string> = {
  francesa:                'Francesa',
  alemana:                 'Alemana',
  solo_interes:            'Solo intereses',
  solo_interes_adelantado: 'Solo intereses adelantados',
  anticipado:              'Interés anticipado',
};

const AMORT_ICON: Record<string, string> = {
  francesa:                '📐',
  alemana:                 '📏',
  solo_interes:            '💸',
  solo_interes_adelantado: '⚡💸',
  anticipado:              '⚡',
};

const CUOTA_VARIANT: Record<CuotaEstado, any> = {
  pendiente: 'default', pagada: 'success', vencida: 'danger', parcial: 'warning',
};
const CUOTA_LABEL: Record<CuotaEstado, string> = {
  pendiente: 'Pendiente', pagada: 'Pagada', vencida: 'Vencida', parcial: 'Parcial',
};

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, color ? { color } : undefined]}>{value}</Text>
    </View>
  );
}

function CuotaRow({ cuota, onVerRecibo }: { cuota: Cuota; onVerRecibo?: () => void }) {
  const isPaid    = cuota.estado === 'pagada';
  const isVencida = cuota.estado === 'vencida';
  const canPay    = cuota.estado === 'pendiente' || cuota.estado === 'vencida';

  const content = (
    <>
      <View style={[styles.cuotaNum, { backgroundColor: isPaid ? Colors.success : isVencida ? Colors.danger : Colors.primaryLight }]}>
        <Text style={styles.cuotaNumText}>{cuota.numero_cuota}</Text>
      </View>
      <View style={styles.cuotaData}>
        <Text style={styles.cuotaFecha}>
          {parseFechaLocal(cuota.fecha_vencimiento).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Text>
        <View style={styles.cuotaDesglose}>
          <Text style={[styles.cuotaDetail, { color: Colors.info }]}>Cap: {formatCurrency(cuota.capital)}</Text>
          <Text style={[styles.cuotaDetail, { color: Colors.accent }]}>Int: {formatCurrency(cuota.interes)}</Text>
        </View>
      </View>
      <View style={styles.cuotaRight}>
        <Text style={[styles.cuotaTotal, isPaid && styles.cuotaTotalPaid]}>{formatCurrency(cuota.monto_total)}</Text>
        <Badge label={CUOTA_LABEL[cuota.estado]} variant={CUOTA_VARIANT[cuota.estado]} />
        {canPay && <Text style={styles.cuotaPayHint}>Tap para pagar →</Text>}
        {isPaid && onVerRecibo && <Text style={styles.cuotaReciboHint}>📄 Ver recibo</Text>}
      </View>
    </>
  );

  if (canPay) {
    return (
      <TouchableOpacity
        style={[styles.cuotaRow, isVencida && styles.cuotaRowVencida, styles.cuotaRowTappable]}
        onPress={() => router.push(`/(app)/cobros/${cuota.id}` as any)}
        activeOpacity={0.7}
      >
        {content}
      </TouchableOpacity>
    );
  }

  if (isPaid && onVerRecibo) {
    return (
      <TouchableOpacity
        style={[styles.cuotaRow, styles.cuotaRowPaid, styles.cuotaRowTappable]}
        onPress={onVerRecibo}
        activeOpacity={0.75}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.cuotaRow, isPaid && styles.cuotaRowPaid]}>
      {content}
    </View>
  );
}

export default function CreditoDetailScreen() {
  const { id, fromClienteId } = useLocalSearchParams<{ id: string; fromClienteId?: string }>();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const [prestamo, setPrestamo] = useState<any>(null);
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [pagos, setPagos] = useState<PagoRegistrado[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activating, setActivating] = useState(false);
  const [uploadingContrato, setUploadingContrato] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [pagoAAnular, setPagoAAnular] = useState<PagoRegistrado | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [exportandoCronograma, setExportandoCronograma] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [abonos, setAbonos] = useState<AbonoCapital[]>([]);
  const [abonoAAnular, setAbonoAAnular] = useState<AbonoCapital | null>(null);
  const [motivoAnulacionAbono, setMotivoAnulacionAbono] = useState('');
  const [anulandoAbono, setAnulandoAbono] = useState(false);
  const [showActivarModal, setShowActivarModal] = useState(false);
  const [fechaDesembolso, setFechaDesembolso] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    try {
      const [p, cs, ps, abs] = await Promise.all([
        prestamosService.getById(id),
        prestamosService.getCuotas(id),
        cobrosService.getPagosByPrestamo(id),
        prestamosService.getAbonosByPrestamo(id),
      ]);
      setPrestamo(p);
      setCuotas(cs);
      setPagos(ps);
      setAbonos(abs);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el préstamo');
      router.canGoBack() ? router.back() : router.replace('/(app)/creditos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  // Single focus-based load — avoids double-fetch on mount + focus
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAprobar = () => {
    if (!id || !profile?.id) return;
    Alert.alert(
      esProducto ? 'Aprobar crédito de producto' : 'Aprobar Préstamo',
      esProducto ? '¿Confirmas la aprobación de este crédito de producto?' : '¿Confirmas la aprobación de este préstamo?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprobar', onPress: async () => {
            try {
              await prestamosService.aprobar(id, profile.id);
              load();
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'No se pudo aprobar');
            }
          },
        },
      ],
    );
  };

  const handleActivar = () => {
    setFechaDesembolso(new Date());
    setShowActivarModal(true);
  };

  const handleConfirmarActivar = async () => {
    const fechaStr = fechaDesembolso.toISOString().split('T')[0];
    setShowActivarModal(false);
    setActivating(true);
    try {
      await prestamosService.activar(id!, fechaStr);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActivating(false);
    }
  };

  const onChangeFecha = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected) setFechaDesembolso(selected);
  };

  const fmtFechaLocal = (d: Date) =>
    d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });

  const handleVerContrato = async () => {
    if (!prestamo?.contrato_url) return;
    const supported = await Linking.canOpenURL(prestamo.contrato_url);
    if (supported) {
      await Linking.openURL(prestamo.contrato_url);
    } else {
      Alert.alert('Error', 'No se puede abrir el documento en este dispositivo');
    }
  };

  const handleCompartirContrato = async () => {
    if (!prestamo?.contrato_url) return;
    try {
      const rawName = prestamo.contrato_url.split('/').pop()?.split('?')[0] ?? 'contrato';
      const localUri = `${FileSystem.cacheDirectory}${rawName}`;
      await FileSystem.downloadAsync(prestamo.contrato_url, localUri);
      await Sharing.shareAsync(localUri);
    } catch {
      Alert.alert('Error', 'No se pudo compartir el documento');
    }
  };

  const handleAdjuntarContrato = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    setUploadingContrato(true);
    try {
      const url = await prestamosService.uploadContrato(
        asset.uri,
        id!,
        asset.mimeType ?? 'application/pdf',
      );
      await prestamosService.actualizarContrato(id!, url);
      await load();
    } catch {
      Alert.alert('Error', 'No se pudo subir el contrato. Intenta de nuevo.');
    } finally {
      setUploadingContrato(false);
    }
  };

  const handleCancelar = () => {
    if (!id) return;
    Alert.alert(
      esProducto ? 'Cancelar crédito de producto' : 'Cancelar Préstamo',
      '¿Estás seguro? Esta acción no se puede deshacer.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: esProducto ? 'Cancelar crédito' : 'Cancelar Préstamo',
          style: 'destructive',
          onPress: async () => {
            try {
              await prestamosService.cancelar(id);
              load();
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'No se pudo cancelar');
            }
          },
        },
      ],
    );
  };

  const handleEliminar = () => {
    if (!id || !prestamo) return;

    // Activo con pagos vigentes → debe cancelarse primero
    if (prestamo.estado === 'activo') {
      const pagosVigentes = pagos.filter((p: PagoRegistrado) => !p.anulado);
      if (pagosVigentes.length > 0) {
        Alert.alert(
          'No se puede eliminar',
          `Este ${esProducto ? 'crédito de producto' : 'préstamo'} tiene ${pagosVigentes.length} pago(s) registrado(s). Para eliminarlo primero debes cancelarlo desde las acciones.`,
        );
        return;
      }
    }

    const esActivo = prestamo.estado === 'activo';
    const advertencia = esActivo
      ? `Este ${esProducto ? 'crédito de producto' : 'préstamo'} está ACTIVO pero aún no tiene pagos registrados.\n\nSe eliminará el cronograma generado.${!esProducto ? ' La garantía quedará disponible.' : ''}`
      : `Se eliminará permanentemente este ${esProducto ? 'crédito de producto' : 'préstamo'} de ${formatCurrency(prestamo.monto_principal)} y su historial.`;

    Alert.alert(
      `⚠️ Eliminar ${esProducto ? 'crédito de producto' : 'Préstamo'}`,
      `${advertencia}\n\nEsta acción es irreversible.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive', onPress: async () => {
            try {
              await prestamosService.eliminar(id);
              router.replace('/(app)/creditos' as any);
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'No se pudo eliminar el préstamo');
            }
          },
        },
      ],
    );
  };

  const handleExportarCronograma = async () => {
    if (!prestamo || cuotas.length === 0) return;
    setExportandoCronograma(true);
    try {
      // Convertir cuotas DB a formato ResumenAmortizacion
      // El saldo de cada fila = suma de capitales de las cuotas siguientes
      const cuotasOrdenadas = [...cuotas].sort((a, b) => a.numero_cuota - b.numero_cuota);
      const totalCapital = cuotasOrdenadas.reduce((s, c) => s + Number(c.capital), 0);
      let saldoAcumulado = totalCapital;
      const cuotasCalc = cuotasOrdenadas.map((c) => {
        saldoAcumulado -= Number(c.capital);
        return {
          numero:          c.numero_cuota,
          fechaVencimiento: parseFechaLocal(c.fecha_vencimiento),
          capital:         Number(c.capital),
          interes:         Number(c.interes),
          cuotaTotal:      Number(c.monto_total),
          saldo:           Math.round(saldoAcumulado * 100) / 100,
        };
      });

      const totalIntereses = cuotasCalc.reduce((s, c) => s + c.interes, 0);

      await exportarCronogramaPdf({
        resumen: {
          cuotas:         cuotasCalc,
          totalCapital:   Math.round(totalCapital * 100) / 100,
          totalIntereses: Math.round(totalIntereses * 100) / 100,
          totalPagar:     Math.round((totalCapital + totalIntereses) * 100) / 100,
          primeraCuota:   cuotasCalc[0]?.cuotaTotal ?? 0,
          ultimaCuota:    cuotasCalc[cuotasCalc.length - 1]?.cuotaTotal ?? 0,
        },
        monto:            Number(prestamo.monto_principal),
        tasaMensual:      Number(prestamo.tasa_mensual) * 100,
        plazoMeses:       prestamo.plazo_meses,
        tipoAmortizacion: prestamo.tipo_amortizacion,
        comisionApertura: prestamo.comision_apertura > 0 ? Number(prestamo.comision_apertura) : undefined,
        clienteNombre:    cliente ? `${cliente.nombre} ${cliente.apellido}` : undefined,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo generar el PDF');
    } finally {
      setExportandoCronograma(false);
    }
  };

  const handleConfirmarAnulacion = async () => {
    if (!pagoAAnular || !profile?.id) return;
    const motivo = motivoAnulacion.trim();
    if (!motivo) {
      Alert.alert('Motivo requerido', 'Debes ingresar el motivo de la anulación.');
      return;
    }
    setAnulando(true);
    try {
      const resultado = await cobrosService.anularPago({
        pagoId:  pagoAAnular.id,
        adminId: profile.id,
        motivo,
      });
      setPagoAAnular(null);
      setMotivoAnulacion('');
      await load();
      let mensaje = `Recibo ${resultado.recibo} anulado correctamente.\nCuota vuelve a estado: ${resultado.cuota_nuevo_estado}.`;
      if (resultado.prestamo_revertido) mensaje += '\nEl préstamo volvió a estado activo.';
      if (resultado.garantia_revertida) mensaje += '\nLa garantía volvió a estado en garantía.';
      Alert.alert('Pago Anulado', mensaje);
    } catch (e: any) {
      Alert.alert('Error al anular', e.message ?? 'No se pudo anular el pago');
    } finally {
      setAnulando(false);
    }
  };

  const handleConfirmarAnulacionAbono = async () => {
    if (!abonoAAnular || !profile?.id) return;
    const motivo = motivoAnulacionAbono.trim();
    if (!motivo) {
      Alert.alert('Motivo requerido', 'Debes ingresar el motivo de la anulación.');
      return;
    }
    setAnulandoAbono(true);
    try {
      const resultado = await prestamosService.anularAbono({
        abonoId:  abonoAAnular.id,
        adminId:  profile.id,
        motivo,
      });
      setAbonoAAnular(null);
      setMotivoAnulacionAbono('');
      await load();
      Alert.alert(
        'Abono Anulado',
        `Recibo ${resultado.recibo} anulado.\nSaldo restaurado: $${resultado.saldo_restaurado.toLocaleString('es', { minimumFractionDigits: 2 })}`,
      );
    } catch (e: any) {
      Alert.alert('Error al anular', e.message ?? 'No se pudo anular el abono');
    } finally {
      setAnulandoAbono(false);
    }
  };

  // ── Hooks de navegación a recibo histórico ────────────────
  // IMPORTANTE: deben ir ANTES de cualquier early return para no violar las Rules of Hooks.

  const verReciboCuota = useCallback((cuota: Cuota) => {
    if (!prestamo) return;
    const pago = pagos.find(p => p.cuota_id === cuota.id && !p.anulado);
    if (!pago) {
      Alert.alert('Sin recibo', 'No se encontró un pago registrado para esta cuota.');
      return;
    }
    const clienteDatos = prestamo.clientes;
    const clienteNombre = clienteDatos ? `${clienteDatos.nombre} ${clienteDatos.apellido}` : '';
    const maxCuota = cuotas.length > 0 ? Math.max(...cuotas.map((c: Cuota) => c.numero_cuota)) : 0;
    const esCancelado = prestamo.estado === 'cancelado' && cuota.numero_cuota === maxCuota;
    const fechaIso = (pago.fecha_pago ?? '').substring(0, 10);
    const esPagoSoloInteres = Number(cuota.capital) === 0 && Number(cuota.interes) > 0;
    const saldoCapitalPendiente = esPagoSoloInteres
      ? cuotas
          .filter((c: Cuota) => c.numero_cuota > cuota.numero_cuota)
          .reduce((s: number, c: Cuota) => s + Number(c.capital), 0)
      : 0;

    router.push({
      pathname: '/(app)/cobros/recibo',
      params: {
        reciboNum:     pago.numero_recibo,
        clienteNombre,
        numeroCuota:   String(cuota.numero_cuota),
        capital:       String(cuota.capital),
        interes:       String(cuota.interes),
        total:         String(pago.monto_pagado),
        metodo:        pago.metodo_pago,
        cancelado:     esCancelado ? '1' : '0',
        fechaPago:     fechaIso,
        modo:          'ver',
        ...(esPagoSoloInteres ? {
          saldoPendiente: String(saldoCapitalPendiente),
          soloInteres:    '1',
        } : {}),
      },
    } as any);
  }, [prestamo, pagos, cuotas]);

  const verReciboPago = useCallback((pago: PagoRegistrado) => {
    const cuota = cuotas.find((c: Cuota) => c.id === pago.cuota_id);
    if (!cuota) return;
    verReciboCuota(cuota);
  }, [cuotas, verReciboCuota]);

  // ── Early returns ─────────────────────────────────────────

  if (loading) return <LoadingScreen />;
  if (!prestamo) return null;

  const cliente = prestamo.clientes;
  const garantia = prestamo.garantias;
  const esProducto = prestamo.tipo_prestamo === 'credito_producto';
  const cuotasPagadas = cuotas.filter((c: Cuota) => c.estado === 'pagada').length;
  const progreso = cuotas.length > 0 ? cuotasPagadas / cuotas.length : 0;

  // Renovación solo aplica para préstamos regulares (no créditos de producto)
  const puedeRenovar =
    !esProducto &&
    (profile?.rol === 'admin' || profile?.rol === 'oficial') &&
    (
      prestamo.estado === 'activo' ||
      (prestamo.estado === 'cancelado' && cuotas.length > 0 && cuotas.every((c: any) => c.estado === 'pagada'))
    );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => {
            if (fromClienteId) {
              router.replace(`/(app)/clientes/${fromClienteId}` as any);
            } else if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(app)/creditos');
            }
          }}
          style={styles.backBtn}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{esProducto ? 'Venta a Crédito' : 'Detalle Préstamo'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroAmount}>{formatCurrency(prestamo.monto_principal)}</Text>
              <Text style={styles.heroClient}>
                {cliente?.nombre} {cliente?.apellido}
                {!!cliente?.alias && <Text style={styles.heroAlias}> · {cliente.alias}</Text>}
              </Text>
            </View>
            <Badge label={prestamo.estado} variant={ESTADO_VARIANT[prestamo.estado] ?? 'default'} />
          </View>
          <View style={styles.heroPills}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>
                {esProducto ? '🏷️ Venta a crédito' : `📅 ${prestamo.tipo_amortizacion === 'anticipado' && prestamo.plazo_dias ? `${prestamo.plazo_dias} días` : `${prestamo.plazo_meses} meses`}`}
              </Text>
            </View>
            {esProducto ? (
              <>
                <View style={styles.heroPill}><Text style={styles.heroPillText}>📦 {prestamo.plazo_meses} cuota{prestamo.plazo_meses !== 1 ? 's' : ''}</Text></View>
                <View style={styles.heroPill}><Text style={styles.heroPillText}>✅ Sin interés</Text></View>
              </>
            ) : (
              <>
                <View style={styles.heroPill}><Text style={styles.heroPillText}>% {(prestamo.tasa_mensual * 100).toFixed(2)}% mensual</Text></View>
                <View style={styles.heroPill}><Text style={styles.heroPillText}>{AMORT_ICON[prestamo.tipo_amortizacion] ?? '📐'} {AMORT_LABEL[prestamo.tipo_amortizacion] ?? prestamo.tipo_amortizacion}</Text></View>
              </>
            )}
          </View>

          {cuotas.length > 0 && (
            <View style={styles.progressSection}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>Progreso de Pago</Text>
                <Text style={styles.progressPct}>{cuotasPagadas}/{cuotas.length} cuotas</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progreso * 100}%` }]} />
              </View>
            </View>
          )}
        </View>

        {/* Actions */}
        {(profile?.rol === 'admin' || profile?.rol === 'oficial' || profile?.rol === 'cajero') && (
          <View style={styles.actionsCard}>
            {(profile?.rol === 'admin' || profile?.rol === 'oficial') && prestamo.estado === 'solicitado' && (
              <Button
                title={esProducto ? '✅ Aprobar crédito de producto' : '✅ Aprobar Préstamo'}
                onPress={handleAprobar}
                variant="secondary"
                size="md"
              />
            )}
            {(profile?.rol === 'admin' || profile?.rol === 'oficial') && prestamo.estado === 'aprobado' && (
              <Button
                title={esProducto ? '🚀 Activar y entregar producto' : '🚀 Activar y Desembolsar'}
                onPress={handleActivar}
                loading={activating}
                size="md"
              />
            )}
            {(profile?.rol === 'admin' || profile?.rol === 'oficial') && (prestamo.estado === 'solicitado' || prestamo.estado === 'aprobado') && (
              <Button
                title={esProducto ? 'Cancelar crédito' : 'Cancelar Préstamo'}
                onPress={handleCancelar}
                variant="danger"
                size="md"
              />
            )}
            {prestamo.estado === 'activo' &&
              cuotas.filter((c: Cuota) => c.estado !== 'pagada').length >= 1 && (
              <Button
                title="💳 Abono a Capital"
                onPress={() => router.push(`/(app)/creditos/abono-capital?prestamoId=${id}${fromClienteId ? `&fromClienteId=${fromClienteId}` : ''}` as any)}
                variant="secondary"
                size="md"
              />
            )}
            {(profile?.rol === 'admin' || profile?.rol === 'oficial') && puedeRenovar && (
              <Button
                title={prestamo.estado === 'activo' ? '🔄 Renovar / Refinanciar' : '🔄 Renovar Préstamo'}
                onPress={() => router.push(`/(app)/creditos/renovar?prestamoId=${id}` as any)}
                variant="secondary"
                size="md"
              />
            )}
            {profile?.rol === 'admin' && (
              <Button
                title={esProducto ? '🗑️ Eliminar crédito' : '🗑️ Eliminar Préstamo'}
                onPress={handleEliminar}
                variant="danger"
                size="md"
              />
            )}
          </View>
        )}

        {/* Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{esProducto ? '👤 Cliente' : '👤 Cliente & Garantía'}</Text>
          <InfoRow
            label="Cliente"
            value={cliente?.alias
              ? `${cliente.nombre} ${cliente.apellido} · ${cliente.alias}`
              : `${cliente?.nombre} ${cliente?.apellido}`}
          />
          <InfoRow label="Documento" value={cliente?.documento_numero ?? '-'} />
          <InfoRow label="Teléfono" value={cliente?.telefono ?? '-'} />
          {garantia && <InfoRow label="Garantía" value={`${garantia.tipo} — ${garantia.descripcion?.substring(0, 40)}`} />}
          {garantia && <InfoRow label="Avalúo" value={formatCurrency(garantia.valor_avaluo)} color={Colors.accent} />}
          {garantia?.fotos?.length > 0 && (
            <View style={styles.fotosContainer}>
              <Text style={styles.fotosLabel}>📷 Fotos de la garantía ({garantia.fotos.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fotosScroll}>
                {garantia.fotos.map((url: string, i: number) => (
                  <TouchableOpacity key={i} onPress={() => setViewerIndex(i)} activeOpacity={0.8}>
                    <Image source={{ uri: url }} style={styles.fotoThumb} />
                    <View style={styles.fotoZoomBadge}>
                      <Text style={styles.fotoZoomIcon}>🔍</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Visor de fotos de garantía */}
        {garantia?.fotos?.length > 0 && viewerIndex !== null && (
          <Modal
            visible={viewerIndex !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setViewerIndex(null)}
            statusBarTranslucent
          >
            <RNStatusBar backgroundColor="#000" barStyle="light-content" />
            <View style={styles.viewerBg}>
              <View style={styles.viewerHeader}>
                <Text style={styles.viewerCounter}>{viewerIndex + 1} / {garantia.fotos.length}</Text>
                <TouchableOpacity
                  onPress={() => setViewerIndex(null)}
                  style={styles.viewerClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.viewerCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <Image
                source={{ uri: garantia.fotos[viewerIndex] }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
              {garantia.fotos.length > 1 && (
                <View style={styles.viewerNav}>
                  <TouchableOpacity
                    style={[styles.viewerNavBtn, viewerIndex === 0 && styles.viewerNavBtnDisabled]}
                    onPress={() => setViewerIndex(prev => (prev !== null ? Math.max(0, prev - 1) : 0))}
                    disabled={viewerIndex === 0}
                  >
                    <Text style={styles.viewerNavText}>‹</Text>
                  </TouchableOpacity>
                  <View style={styles.viewerDots}>
                    {garantia.fotos.map((_: any, di: number) => (
                      <TouchableOpacity key={di} onPress={() => setViewerIndex(di)}>
                        <View style={[styles.viewerDot, di === viewerIndex && styles.viewerDotActive]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[styles.viewerNavBtn, viewerIndex === garantia.fotos.length - 1 && styles.viewerNavBtnDisabled]}
                    onPress={() => setViewerIndex(prev => (prev !== null ? Math.min(garantia.fotos.length - 1, prev + 1) : 0))}
                    disabled={viewerIndex === garantia.fotos.length - 1}
                  >
                    <Text style={styles.viewerNavText}>›</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Modal>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{esProducto ? '🏷️ Producto & Condiciones' : '💰 Condiciones'}</Text>
          {esProducto && prestamo.descripcion_producto ? (
            <InfoRow label="Producto" value={prestamo.descripcion_producto} />
          ) : null}
          <InfoRow label="Monto Total" value={formatCurrency(prestamo.monto_principal)} color={Colors.accent} />
          {esProducto ? (
            <>
              <InfoRow
                label="Cuotas"
                value={`${prestamo.plazo_meses} cuota${prestamo.plazo_meses !== 1 ? 's' : ''} iguales`}
              />
              <InfoRow label="Intereses" value="Sin interés" color={Colors.success} />
            </>
          ) : (
            <>
              <InfoRow label="Tasa Mensual" value={`${(prestamo.tasa_mensual * 100).toFixed(2)}%`} />
              <InfoRow
                label="Plazo"
                value={
                  prestamo.tipo_amortizacion === 'anticipado' && prestamo.plazo_dias
                    ? `${prestamo.plazo_dias} días (≈ ${prestamo.plazo_meses} mes${prestamo.plazo_meses !== 1 ? 'es' : ''})`
                    : `${prestamo.plazo_meses} meses`
                }
              />
              <InfoRow label="Amortización" value={AMORT_LABEL[prestamo.tipo_amortizacion] ?? prestamo.tipo_amortizacion} />
              {prestamo.comision_apertura > 0 && <InfoRow label="Comisión Apertura" value={formatCurrency(prestamo.comision_apertura)} />}
              {prestamo.tipo_amortizacion === 'anticipado' && prestamo.fecha_desembolso && (() => {
                const diasEfectivos = prestamo.plazo_dias ?? prestamo.plazo_meses * 30;
                const totalIntereses = Math.round(prestamo.monto_principal * prestamo.tasa_mensual * diasEfectivos / 30 * 100) / 100;
                const comision = Number(prestamo.comision_apertura ?? 0);
                return (
                  <InfoRow
                    label="Neto recibido por cliente"
                    value={formatCurrency(prestamo.monto_principal - totalIntereses - comision)}
                    color={Colors.success}
                  />
                );
              })()}
            </>
          )}
          {prestamo.fecha_desembolso && (
            <InfoRow
              label={esProducto ? 'Fecha entrega' : 'Fecha Desembolso'}
              value={parseFechaLocal(prestamo.fecha_desembolso).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })}
            />
          )}
          {prestamo.fecha_vencimiento && <InfoRow label="Fecha Vencimiento" value={parseFechaLocal(prestamo.fecha_vencimiento).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })} />}
          {prestamo.prestamo_padre_id && (
            <TouchableOpacity onPress={() => router.push(`/(app)/creditos/${prestamo.prestamo_padre_id}${fromClienteId ? `?fromClienteId=${fromClienteId}` : ''}` as any)}>
              <InfoRow label="🔄 Renovación de" value={`#${prestamo.prestamo_padre_id.slice(-8).toUpperCase()} →`} color={Colors.info} />
            </TouchableOpacity>
          )}
        </View>

        {/* Contrato */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{esProducto ? '📄 Documento del acuerdo' : '📄 Contrato del Préstamo'}</Text>
          {prestamo.contrato_url ? (
            <>
              <View style={styles.contratoFile}>
                <Text style={styles.contratoFileIcon}>📄</Text>
                <Text style={styles.contratoFileName} numberOfLines={2}>
                  {decodeURIComponent(prestamo.contrato_url.split('/').pop()?.split('?')[0] ?? 'Contrato').replace(/^\d+\./, '')}
                </Text>
              </View>
              <View style={styles.contratoActions}>
                <TouchableOpacity style={styles.contratoBtn} onPress={handleVerContrato} activeOpacity={0.75}>
                  <Text style={styles.contratoBtnText}>👁  Ver / Abrir</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.contratoBtn, styles.contratoBtnShare]} onPress={handleCompartirContrato} activeOpacity={0.75}>
                  <Text style={styles.contratoBtnText}>📤  Compartir</Text>
                </TouchableOpacity>
              </View>
              {(profile?.rol === 'admin' || profile?.rol === 'oficial') && (
                <TouchableOpacity style={styles.contratoReplaceBtn} onPress={handleAdjuntarContrato} disabled={uploadingContrato} activeOpacity={0.7}>
                  <Text style={styles.contratoReplaceTxt}>{uploadingContrato ? 'Subiendo...' : '🔄 Reemplazar contrato'}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <View style={styles.contratoEmpty}>
              <Text style={styles.contratoEmptyIcon}>📋</Text>
              <Text style={styles.contratoEmptyTitle}>Sin contrato adjunto</Text>
              <Text style={styles.contratoEmptyDesc}>Aún no se ha subido el documento del contrato</Text>
              {(profile?.rol === 'admin' || profile?.rol === 'oficial') && (
                <TouchableOpacity
                  style={styles.adjuntarBtn}
                  onPress={handleAdjuntarContrato}
                  disabled={uploadingContrato}
                  activeOpacity={0.75}
                >
                  <Text style={styles.adjuntarBtnText}>
                    {uploadingContrato ? '⏳ Subiendo...' : '📎 Adjuntar Contrato'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Cronograma */}
        {cuotas.length > 0 && (
          <View style={styles.cronograma}>
            <View style={styles.cronogramaHeader}>
              <Text style={styles.sectionTitle}>📅 Cronograma de Pagos</Text>
              <TouchableOpacity
                style={[styles.btnPdfCronograma, exportandoCronograma && styles.btnPdfCronogramaDisabled]}
                onPress={handleExportarCronograma}
                disabled={exportandoCronograma}
                activeOpacity={0.7}
              >
                <Text style={styles.btnPdfCronogramaText}>
                  {exportandoCronograma ? '⏳ Generando...' : '📄 PDF'}
                </Text>
              </TouchableOpacity>
            </View>
            {cuotas.map((cuota) => (
              <CuotaRow
                key={cuota.id}
                cuota={cuota}
                onVerRecibo={cuota.estado === 'pagada' ? () => verReciboCuota(cuota) : undefined}
              />
            ))}
          </View>
        )}

        {cuotas.length === 0 && prestamo.estado === 'activo' && (
          <View style={styles.noCronograma}>
            <Text style={styles.noCronogramaText}>⏳ Generando cronograma...</Text>
          </View>
        )}

        {/* Historial de pagos registrados */}
        {pagos.length > 0 && (
          <View style={styles.pagosSection}>
            <Text style={styles.sectionTitle}>
              ✅ Pagos Registrados ({pagos.filter((p: PagoRegistrado) => !p.anulado).length}
              {pagos.some((p: PagoRegistrado) => p.anulado) ? ` · ${pagos.filter((p: PagoRegistrado) => p.anulado).length} anulado${pagos.filter((p: PagoRegistrado) => p.anulado).length > 1 ? 's' : ''}` : ''})
            </Text>
            {pagos.map((pago: PagoRegistrado) => {
              const metodoIcon: Record<string, string> = { efectivo: '💵', transferencia: '🏦', cheque: '📄' };
              const esAnulado = pago.anulado;
              return (
                <View key={pago.id} style={[styles.pagoRow, esAnulado && styles.pagoRowAnulado]}>
                  <Text style={[styles.pagoIcon, esAnulado && styles.textoAnulado]}>
                    {esAnulado ? '🚫' : (metodoIcon[pago.metodo_pago] ?? '💰')}
                  </Text>
                  <View style={styles.pagoBody}>
                    <Text style={[styles.pagoRecibo, esAnulado && styles.textoAnulado, esAnulado && styles.tachado]}>
                      {pago.numero_recibo}
                    </Text>
                    <Text style={[styles.pagoFecha, esAnulado && styles.textoAnulado]}>
                      {new Date(pago.fecha_pago).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {esAnulado && (
                      <Text style={styles.pagoAnuladoLabel}>
                        Anulado {pago.anulado_at ? new Date(pago.anulado_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                        {pago.motivo_anulacion ? ` · ${pago.motivo_anulacion}` : ''}
                      </Text>
                    )}
                    {!esAnulado && pago.observaciones ? <Text style={styles.pagoObs}>{pago.observaciones}</Text> : null}
                  </View>
                  <View style={styles.pagoRight}>
                    <Text style={[styles.pagoMonto, esAnulado && styles.textoAnulado, esAnulado && styles.tachado]}>
                      {formatCurrency(pago.monto_pagado)}
                    </Text>
                    {!esAnulado && (
                      <TouchableOpacity
                        style={styles.btnVerRecibo}
                        onPress={() => verReciboPago(pago)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.btnVerReciboText}>📄 Recibo</Text>
                      </TouchableOpacity>
                    )}
                    {!esAnulado && profile?.rol === 'admin' && (
                      <TouchableOpacity
                        style={styles.btnAnular}
                        onPress={() => { setPagoAAnular(pago); setMotivoAnulacion(''); }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.btnAnularText}>Anular</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Historial de Abonos a Capital */}
        {abonos.length > 0 && (
          <View style={styles.pagosSection}>
            <Text style={styles.sectionTitle}>
              💳 Abonos a Capital ({abonos.filter((a: AbonoCapital) => !a.anulado).length}
              {abonos.some((a: AbonoCapital) => a.anulado) ? ` · ${abonos.filter((a: AbonoCapital) => a.anulado).length} anulado${abonos.filter((a: AbonoCapital) => a.anulado).length > 1 ? 's' : ''}` : ''})
            </Text>
            {abonos.map((abono: AbonoCapital) => {
              const metodoIcon: Record<string, string> = { efectivo: '💵', transferencia: '🏦', cheque: '📄' };
              const esAnulado = abono.anulado;
              return (
                <View key={abono.id} style={[styles.pagoRow, esAnulado && styles.pagoRowAnulado]}>
                  <Text style={[styles.pagoIcon, esAnulado && styles.textoAnulado]}>
                    {esAnulado ? '🚫' : (metodoIcon[abono.metodo_pago] ?? '💳')}
                  </Text>
                  <View style={styles.pagoBody}>
                    <Text style={[styles.pagoRecibo, esAnulado && styles.textoAnulado, esAnulado && styles.tachado]}>
                      {abono.numero_recibo}
                    </Text>
                    <Text style={[styles.pagoFecha, esAnulado && styles.textoAnulado]}>
                      {new Date(abono.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Text>
                    {!esAnulado && (
                      <Text style={[styles.pagoObs, { color: Colors.info }]}>
                        Saldo: {formatCurrency(abono.saldo_anterior)} → {formatCurrency(abono.saldo_nuevo)}
                      </Text>
                    )}
                    {esAnulado && (
                      <Text style={styles.pagoAnuladoLabel}>
                        Anulado {abono.anulado_at ? new Date(abono.anulado_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                        {abono.motivo_anulacion ? ` · ${abono.motivo_anulacion}` : ''}
                      </Text>
                    )}
                    {!esAnulado && abono.observaciones ? <Text style={styles.pagoObs}>{abono.observaciones}</Text> : null}
                  </View>
                  <View style={styles.pagoRight}>
                    <Text style={[styles.pagoMonto, esAnulado ? styles.textoAnulado : { color: Colors.success }, esAnulado && styles.tachado]}>
                      -{formatCurrency(abono.monto_abono)}
                    </Text>
                    {!esAnulado && (
                      <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>
                        {abono.n_cuotas_restantes} cuota{abono.n_cuotas_restantes !== 1 ? 's' : ''}
                      </Text>
                    )}
                    {!esAnulado && (
                      <TouchableOpacity
                        style={styles.btnVerRecibo}
                        onPress={() => router.push({
                          pathname: '/(app)/creditos/recibo-abono',
                          params: {
                            reciboNum:     abono.numero_recibo,
                            clienteNombre: cliente ? `${cliente.nombre} ${cliente.apellido}` : '',
                            montoAbonado:  String(abono.monto_abono),
                            saldoAnterior: String(abono.saldo_anterior),
                            saldoNuevo:    String(abono.saldo_nuevo),
                            nCuotas:       String(abono.n_cuotas_restantes),
                            metodo:        abono.metodo_pago,
                            fechaAbono:    abono.created_at,
                            prestamoId:    id,
                            fromClienteId: fromClienteId ?? '',
                            modo:          'ver',
                            cancelado:     abono.saldo_nuevo <= 0 ? '1' : '0',
                          },
                        } as any)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.btnVerReciboText}>📄 Recibo</Text>
                      </TouchableOpacity>
                    )}
                    {!esAnulado && profile?.rol === 'admin' && (
                      <TouchableOpacity
                        style={styles.btnAnular}
                        onPress={() => { setAbonoAAnular(abono); setMotivoAnulacionAbono(''); }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.btnAnularText}>Anular</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Modal anulación de abono */}
        <Modal
          visible={abonoAAnular !== null}
          transparent
          animationType="slide"
          onRequestClose={() => { if (!anulandoAbono) setAbonoAAnular(null); }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.activarOverlay}
          >
            <View style={[styles.activarModalCard, { maxHeight: '60%' }]}>
              <View style={styles.activarModalHeader}>
                <Text style={styles.modalTitle}>🚫 Anular Abono a Capital</Text>
                <TouchableOpacity
                  onPress={() => { if (!anulandoAbono) setAbonoAAnular(null); }}
                  style={styles.activarModalCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.activarModalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.activarModalScroll}
                contentContainerStyle={styles.activarModalScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {abonoAAnular && (
                  <View style={[styles.activarAviso, { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }]}>
                    <Text style={[styles.activarAvisoText, { color: '#991b1b' }]}>
                      Se anulará el recibo {abonoAAnular.numero_recibo} por {formatCurrency(abonoAAnular.monto_abono)}.{'\n'}
                      El cronograma se restaurará al saldo anterior: {formatCurrency(abonoAAnular.saldo_anterior)}.
                    </Text>
                  </View>
                )}
                <Text style={styles.modalLabel}>Motivo de anulación *</Text>
                <TextInput
                  style={styles.motivoInput}
                  value={motivoAnulacionAbono}
                  onChangeText={setMotivoAnulacionAbono}
                  placeholder="Ej: Error en el monto registrado..."
                  multiline
                  numberOfLines={3}
                  editable={!anulandoAbono}
                />
                <Button
                  title={anulandoAbono ? 'Anulando...' : 'Confirmar Anulación'}
                  onPress={handleConfirmarAnulacionAbono}
                  variant="danger"
                  size="lg"
                  loading={anulandoAbono}
                  disabled={anulandoAbono || !motivoAnulacionAbono.trim()}
                />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Modal de activación con selector de fecha */}
        <Modal
          visible={showActivarModal}
          transparent
          animationType="slide"
          onRequestClose={() => { if (!activating) setShowActivarModal(false); }}
        >
          <View style={styles.activarOverlay}>
            <View style={styles.activarModalCard}>
              {/* Cabecera fija */}
              <View style={styles.activarModalHeader}>
                <Text style={styles.modalTitle}>🚀 Activar y Desembolsar</Text>
                <TouchableOpacity
                  onPress={() => { if (!activating) setShowActivarModal(false); }}
                  style={styles.activarModalCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.activarModalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Contenido scrollable */}
              <ScrollView
                style={styles.activarModalScroll}
                contentContainerStyle={styles.activarModalScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Aviso según tipo */}
                {prestamo?.tipo_amortizacion === 'anticipado' && (
                  <View style={styles.activarAviso}>
                    <Text style={styles.activarAvisoText}>
                      ⚡ Interés anticipado: el interés total del período vence el mismo día del desembolso. El capital íntegro vence al término del plazo.
                    </Text>
                  </View>
                )}
                {prestamo?.tipo_amortizacion === 'solo_interes' && (
                  <View style={styles.activarAviso}>
                    <Text style={styles.activarAvisoText}>
                      💸 Modalidad Solo Intereses: cada mes se cobra solo el interés. El capital completo se paga en la última cuota.
                    </Text>
                  </View>
                )}
                {prestamo?.tipo_amortizacion === 'solo_interes_adelantado' && (
                  <View style={styles.activarAviso}>
                    <Text style={styles.activarAvisoText}>
                      ⚡💸 Solo Intereses Adelantados: la primera cuota de interés vence el mismo día del desembolso. Las siguientes cuotas de interés se cobran mensualmente y el capital íntegro al final del plazo.
                    </Text>
                  </View>
                )}

                {/* Selector de fecha de desembolso */}
                <Text style={styles.modalLabel}>Fecha de desembolso</Text>
                <TouchableOpacity
                  style={styles.fechaBtn}
                  onPress={() => {
                    if (Platform.OS === 'android') {
                      DateTimePickerAndroid.open({
                        value: fechaDesembolso,
                        mode: 'date',
                        is24Hour: true,
                        maximumDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                        minimumDate: new Date(2020, 0, 1),
                        onChange: (event, selected) => {
                          if (event.type === 'set' && selected) setFechaDesembolso(selected);
                        },
                      });
                    } else {
                      setShowDatePicker(prev => !prev);
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.fechaBtnIcon}>📅</Text>
                  <View style={styles.fechaBtnInfo}>
                    <Text style={styles.fechaBtnValue}>{fmtFechaLocal(fechaDesembolso)}</Text>
                    <Text style={styles.fechaBtnHint}>Toca para cambiar la fecha</Text>
                  </View>
                  <Text style={styles.fechaBtnArrow}>{showDatePicker && Platform.OS === 'ios' ? '▲' : '›'}</Text>
                </TouchableOpacity>

                {/* DateTimePicker iOS — solo cuando el usuario toca el botón */}
                {showDatePicker && Platform.OS === 'ios' && (
                  <View style={styles.iosPickerWrap}>
                    <DateTimePicker
                      value={fechaDesembolso}
                      mode="date"
                      display="spinner"
                      onChange={onChangeFecha}
                      maximumDate={new Date(new Date().setFullYear(new Date().getFullYear() + 1))}
                      minimumDate={new Date(2020, 0, 1)}
                      locale="es-ES"
                      style={{ width: '100%' }}
                    />
                    <TouchableOpacity
                      style={styles.iosPickerConfirmBtn}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <Text style={styles.iosPickerConfirmText}>Listo ✓</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Resumen de fechas del cronograma */}
                {prestamo && !showDatePicker && (
                  <View style={styles.resumenFechas}>
                    <Text style={styles.resumenFechasTitulo}>Vista previa del cronograma</Text>
                    {(prestamo.tipo_amortizacion === 'anticipado' || prestamo.tipo_amortizacion === 'solo_interes_adelantado') ? (
                      <>
                        <View style={styles.resumenRow}>
                          <Text style={styles.resumenLabel}>
                            {prestamo.tipo_amortizacion === 'anticipado' ? 'Interés total (al desembolso)' : '1ª cuota de interés (al desembolso)'}
                          </Text>
                          <Text style={styles.resumenFecha}>{fmtFechaLocal(fechaDesembolso)}</Text>
                        </View>
                        <View style={styles.resumenRow}>
                          <Text style={styles.resumenLabel}>
                            Capital (vencimiento){prestamo.tipo_amortizacion === 'anticipado' && prestamo.plazo_dias ? ` — ${prestamo.plazo_dias} días` : ''}
                          </Text>
                          <Text style={styles.resumenFecha}>
                            {prestamo.tipo_amortizacion === 'anticipado' && prestamo.plazo_dias
                              ? fmtFechaLocal(new Date(fechaDesembolso.getFullYear(), fechaDesembolso.getMonth(), fechaDesembolso.getDate() + prestamo.plazo_dias))
                              : fmtFechaLocal(new Date(fechaDesembolso.getFullYear(), fechaDesembolso.getMonth() + prestamo.plazo_meses, fechaDesembolso.getDate()))}
                          </Text>
                        </View>
                        {prestamo.tipo_amortizacion === 'anticipado' && prestamo.plazo_dias && (
                          <View style={styles.resumenRow}>
                            <Text style={styles.resumenLabel}>Interés ({prestamo.plazo_dias} días)</Text>
                            <Text style={[styles.resumenFecha, { color: Colors.accent }]}>
                              {`${((prestamo.tasa_mensual / 30) * prestamo.plazo_dias * 100).toFixed(2)}% total`}
                            </Text>
                          </View>
                        )}
                        {prestamo.tipo_amortizacion === 'anticipado' && (() => {
                          const diasEfectivos = prestamo.plazo_dias ?? prestamo.plazo_meses * 30;
                          const totalIntereses = Math.round(prestamo.monto_principal * prestamo.tasa_mensual * diasEfectivos / 30 * 100) / 100;
                          const comision = Number(prestamo.comision_apertura ?? 0);
                          const neto = prestamo.monto_principal - totalIntereses - comision;
                          return (
                            <View style={styles.netoDesembolsoBox}>
                              <View style={styles.resumenRow}>
                                <Text style={[styles.resumenLabel, { color: Colors.muted, fontSize: 11 }]}>Capital</Text>
                                <Text style={[styles.resumenFecha, { color: Colors.muted, fontSize: 11 }]}>{formatCurrency(prestamo.monto_principal)}</Text>
                              </View>
                              <View style={styles.resumenRow}>
                                <Text style={[styles.resumenLabel, { color: Colors.muted, fontSize: 11 }]}>− Interés anticipado</Text>
                                <Text style={[styles.resumenFecha, { color: Colors.accent, fontSize: 11 }]}>−{formatCurrency(totalIntereses)}</Text>
                              </View>
                              {comision > 0 && (
                                <View style={styles.resumenRow}>
                                  <Text style={[styles.resumenLabel, { color: Colors.muted, fontSize: 11 }]}>− Comisión apertura</Text>
                                  <Text style={[styles.resumenFecha, { color: Colors.accent, fontSize: 11 }]}>−{formatCurrency(comision)}</Text>
                                </View>
                              )}
                              <View style={[styles.resumenRow, styles.netoDesembolsoTotal]}>
                                <Text style={styles.netoDesembolsoLabel}>Monto a entregar al cliente</Text>
                                <Text style={styles.netoDesembolsoValor}>{formatCurrency(neto)}</Text>
                              </View>
                            </View>
                          );
                        })()}
                      </>
                    ) : (
                      <>
                        <View style={styles.resumenRow}>
                          <Text style={styles.resumenLabel}>Primera cuota</Text>
                          <Text style={styles.resumenFecha}>
                            {fmtFechaLocal(new Date(fechaDesembolso.getFullYear(), fechaDesembolso.getMonth() + 1, fechaDesembolso.getDate()))}
                          </Text>
                        </View>
                        <View style={styles.resumenRow}>
                          <Text style={styles.resumenLabel}>Última cuota</Text>
                          <Text style={styles.resumenFecha}>
                            {fmtFechaLocal(new Date(fechaDesembolso.getFullYear(), fechaDesembolso.getMonth() + prestamo.plazo_meses, fechaDesembolso.getDate()))}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                )}
              </ScrollView>

              {/* Botones fijos al fondo */}
              <View style={styles.activarModalFooter}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                  onPress={() => setShowActivarModal(false)}
                  disabled={activating}
                >
                  <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: Colors.success }, activating && styles.modalBtnDisabled]}
                  onPress={handleConfirmarActivar}
                  disabled={activating}
                >
                  <Text style={styles.modalBtnConfirmText}>{activating ? 'Activando...' : '✓ Activar'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal de confirmación de anulación */}
        <Modal
          visible={pagoAAnular !== null}
          transparent
          animationType="fade"
          onRequestClose={() => { if (!anulando) { setPagoAAnular(null); setMotivoAnulacion(''); } }}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>⚠️ Anular Pago</Text>
              {pagoAAnular && (
                <>
                  <Text style={styles.modalSubtitle}>
                    {pagoAAnular.numero_recibo}
                  </Text>
                  <Text style={styles.modalMonto}>
                    {formatCurrency(pagoAAnular.monto_pagado)}
                  </Text>
                  <Text style={styles.modalDesc}>
                    Esta acción reversa el asiento contable y la cuota volverá a estado pendiente o vencido. No se puede deshacer.
                  </Text>
                  <Text style={styles.modalLabel}>Motivo de la anulación *</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Ej: Error de cajero, pago duplicado..."
                    placeholderTextColor={Colors.muted}
                    value={motivoAnulacion}
                    onChangeText={setMotivoAnulacion}
                    multiline
                    numberOfLines={3}
                    editable={!anulando}
                    autoFocus
                  />
                </>
              )}
              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                  onPress={() => { setPagoAAnular(null); setMotivoAnulacion(''); }}
                  disabled={anulando}
                >
                  <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnConfirm, anulando && styles.modalBtnDisabled]}
                  onPress={handleConfirmarAnulacion}
                  disabled={anulando}
                >
                  <Text style={styles.modalBtnConfirmText}>
                    {anulando ? 'Anulando...' : 'Confirmar Anulación'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 22, color: Colors.white },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white },
  scroll: { padding: 16, gap: 14 },
  hero: {
    backgroundColor: Colors.primary, borderRadius: 16, padding: 20, gap: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroAmount: { fontSize: 28, fontWeight: '900', color: Colors.white, letterSpacing: -0.5 },
  heroClient: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  heroAlias: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' },
  heroPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  heroPill: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  heroPillText: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  progressSection: { gap: 8 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  progressPct: { fontSize: 12, color: Colors.accent, fontWeight: '700' },
  progressBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3 },
  progressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 3 },
  actionsCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, gap: 10,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  section: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel: { fontSize: 13, color: Colors.muted, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.text, flex: 2, textAlign: 'right', textTransform: 'capitalize' },
  cronograma: { gap: 2 },
  cronogramaHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  },
  btnPdfCronograma: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  btnPdfCronogramaDisabled: { opacity: 0.5 },
  btnPdfCronogramaText: { fontSize: 12, fontWeight: '700', color: Colors.white },
  cuotaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 4,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  cuotaRowPaid: { opacity: 0.6 },
  cuotaRowVencida: { borderLeftWidth: 3, borderLeftColor: Colors.danger },
  cuotaNum: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cuotaNumText: { fontSize: 12, fontWeight: '800', color: Colors.white },
  cuotaData: { flex: 1, gap: 3 },
  cuotaFecha: { fontSize: 12, fontWeight: '600', color: Colors.text },
  cuotaDesglose: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  cuotaDetail: { fontSize: 10, fontWeight: '600' },
  cuotaRight: { alignItems: 'flex-end', gap: 4 },
  cuotaTotal: { fontSize: 14, fontWeight: '800', color: Colors.text },
  cuotaTotalPaid: { color: Colors.success },
  noCronograma: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 20, alignItems: 'center',
  },
  noCronogramaText: { color: Colors.muted, fontSize: 14 },
  cuotaRowTappable: {
    borderWidth: 1, borderColor: `${Colors.accent}30`,
  },
  cuotaPayHint: { fontSize: 9, color: Colors.accent, fontWeight: '700', marginTop: 2 },
  cuotaReciboHint: { fontSize: 9, color: Colors.success, fontWeight: '700', marginTop: 2 },
  pagosSection: { gap: 6, marginTop: 4 },
  pagoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: 10, padding: 12,
    borderLeftWidth: 3, borderLeftColor: Colors.success,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  pagoIcon: { fontSize: 20, flexShrink: 0 },
  pagoBody: { flex: 1, gap: 2 },
  pagoRecibo: { fontSize: 12, fontWeight: '700', color: Colors.text },
  pagoFecha: { fontSize: 11, color: Colors.muted },
  pagoObs: { fontSize: 10, color: Colors.muted, fontStyle: 'italic' },
  pagoRight: { alignItems: 'flex-end', gap: 2 },
  pagoMonto: { fontSize: 14, fontWeight: '800', color: Colors.success },
  pagoRowAnulado: {
    opacity: 0.6,
    borderLeftColor: Colors.danger,
    backgroundColor: `${Colors.danger}08`,
  },
  textoAnulado: { color: Colors.muted },
  tachado: { textDecorationLine: 'line-through' },
  pagoAnuladoLabel: {
    fontSize: 10,
    color: Colors.danger,
    fontWeight: '600',
    fontStyle: 'italic',
    marginTop: 2,
  },
  btnVerRecibo: {
    marginTop: 4,
    backgroundColor: `${Colors.primary}12`,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  btnVerReciboText: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  btnAnular: {
    marginTop: 4,
    backgroundColor: `${Colors.danger}15`,
    borderWidth: 1,
    borderColor: `${Colors.danger}40`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  btnAnularText: { fontSize: 10, fontWeight: '700', color: Colors.danger },
  // Modal de anulación
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: Colors.text },
  modalSubtitle: { fontSize: 13, fontWeight: '700', color: Colors.muted },
  modalMonto: { fontSize: 22, fontWeight: '900', color: Colors.danger },
  modalDesc: {
    fontSize: 13,
    color: Colors.muted,
    lineHeight: 19,
    backgroundColor: `${Colors.warning}15`,
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  modalLabel: { fontSize: 12, fontWeight: '700', color: Colors.text, marginTop: 4 },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.text,
    backgroundColor: Colors.background,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: Colors.border },
  modalBtnCancelText: { fontSize: 14, fontWeight: '700', color: Colors.muted },
  modalBtnConfirm: { backgroundColor: Colors.danger },
  modalBtnConfirmText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  modalBtnDisabled: { opacity: 0.5 },
  // Modal de activar — bottom sheet
  activarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  activarModalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  activarModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  activarModalCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: `${Colors.muted}18`,
    alignItems: 'center', justifyContent: 'center',
  },
  activarModalCloseText: { fontSize: 14, color: Colors.muted, fontWeight: '700' },
  activarModalScroll: { flexGrow: 0 },
  activarModalScrollContent: { padding: 20, gap: 12 },
  activarModalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  iosPickerWrap: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iosPickerConfirmBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  iosPickerConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  // Modal activar — fecha desembolso
  activarAviso: {
    backgroundColor: `${Colors.accent}15`,
    borderRadius: 8, padding: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.accent,
  },
  activarAvisoText: { fontSize: 12, color: Colors.accent, lineHeight: 18 },
  fechaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.background, borderRadius: 12,
    padding: 14, borderWidth: 1.5, borderColor: Colors.border,
  },
  fechaBtnIcon: { fontSize: 22, flexShrink: 0 },
  fechaBtnInfo: { flex: 1 },
  fechaBtnValue: { fontSize: 16, fontWeight: '700', color: Colors.text },
  fechaBtnHint: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  fechaBtnArrow: { fontSize: 20, color: Colors.muted },
  resumenFechas: {
    backgroundColor: `${Colors.primary}08`,
    borderRadius: 10, padding: 12, gap: 8,
  },
  netoDesembolsoBox: {
    gap: 4,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: `${Colors.primary}18`,
  },
  netoDesembolsoTotal: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1.5,
    borderTopColor: `${Colors.success}50`,
  },
  netoDesembolsoLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.success,
    flex: 1,
  },
  netoDesembolsoValor: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.success,
  },
  resumenFechasTitulo: { fontSize: 11, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  resumenRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resumenLabel: { fontSize: 12, color: Colors.muted },
  resumenFecha: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  contratoFile: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: `${Colors.info}10`, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: `${Colors.info}25`, marginBottom: 10,
  },
  contratoFileIcon: { fontSize: 28, flexShrink: 0 },
  contratoFileName: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text },
  contratoActions: { flexDirection: 'row', gap: 10 },
  contratoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 11,
  },
  contratoBtnShare: { backgroundColor: Colors.accent },
  contratoBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  contratoReplaceBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 6 },
  contratoReplaceTxt: { fontSize: 12, color: Colors.muted, textDecorationLine: 'underline' },
  contratoEmpty: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  contratoEmptyIcon: { fontSize: 36, opacity: 0.4 },
  contratoEmptyTitle: { fontSize: 14, fontWeight: '700', color: Colors.muted },
  contratoEmptyDesc: { fontSize: 12, color: Colors.muted, textAlign: 'center', lineHeight: 18 },
  adjuntarBtn: {
    marginTop: 8, backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 11,
  },
  adjuntarBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  // Fotos de garantía
  fotosContainer: { marginTop: 12, gap: 8 },
  fotosLabel: { fontSize: 12, fontWeight: '600', color: Colors.muted },
  fotosScroll: { marginTop: 4 },
  fotoThumb: { width: 110, height: 88, borderRadius: 10, marginRight: 10 },
  fotoZoomBadge: {
    position: 'absolute', bottom: 5, right: 15,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 6,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  fotoZoomIcon: { fontSize: 11 },
  // Visor pantalla completa
  viewerBg: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  viewerHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  viewerCounter: { color: '#fff', fontSize: 15, fontWeight: '600' },
  viewerClose: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  viewerCloseText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  viewerImage: { width: SCREEN_W, height: SCREEN_H * 0.72, alignSelf: 'center' },
  viewerNav: {
    position: 'absolute', bottom: 48, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  viewerNavBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  viewerNavBtnDisabled: { opacity: 0.25 },
  viewerNavText: { color: '#fff', fontSize: 32, fontWeight: '300', lineHeight: 40 },
  viewerDots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  viewerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  viewerDotActive: { backgroundColor: '#fff', width: 10, height: 10, borderRadius: 5 },
  motivoInput: {
    borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#1f2937', minHeight: 80,
    textAlignVertical: 'top', backgroundColor: '#f9fafb',
  },
});
