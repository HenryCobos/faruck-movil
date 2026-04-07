import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, RefreshControl, Linking,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { prestamosService } from '@/services/prestamos.service';
import { cobrosService, PagoRegistrado } from '@/services/cobros.service';
import { useAuthStore } from '@/stores/auth.store';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/colors';
import { Cuota, CuotaEstado } from '@/types';
import { formatCurrency } from '@/utils/amortizacion';

const ESTADO_VARIANT: Record<string, any> = {
  solicitado: 'warning', aprobado: 'info', activo: 'success',
  cancelado: 'default', vencido: 'danger', ejecutado: 'danger',
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

function CuotaRow({ cuota }: { cuota: Cuota }) {
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
          {new Date(cuota.fecha_vencimiento).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Text>
        <View style={styles.cuotaDesglose}>
          <Text style={[styles.cuotaDetail, { color: Colors.info }]}>Cap: {formatCurrency(cuota.capital)}</Text>
          <Text style={[styles.cuotaDetail, { color: Colors.accent }]}>Int: {formatCurrency(cuota.interes)}</Text>
          {cuota.mora_acumulada > 0 && (
            <Text style={[styles.cuotaDetail, { color: Colors.danger }]}>Mora: {formatCurrency(cuota.mora_acumulada)}</Text>
          )}
        </View>
      </View>
      <View style={styles.cuotaRight}>
        <Text style={[styles.cuotaTotal, isPaid && styles.cuotaTotalPaid]}>{formatCurrency(cuota.monto_total)}</Text>
        <Badge label={CUOTA_LABEL[cuota.estado]} variant={CUOTA_VARIANT[cuota.estado]} />
        {canPay && <Text style={styles.cuotaPayHint}>Tap para pagar →</Text>}
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

  return (
    <View style={[styles.cuotaRow, isPaid && styles.cuotaRowPaid]}>
      {content}
    </View>
  );
}

export default function CreditoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const [prestamo, setPrestamo] = useState<any>(null);
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [pagos, setPagos] = useState<PagoRegistrado[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activating, setActivating] = useState(false);
  const [uploadingContrato, setUploadingContrato] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    try {
      const [p, cs, ps] = await Promise.all([
        prestamosService.getById(id),
        prestamosService.getCuotas(id),
        cobrosService.getPagosByPrestamo(id),
      ]);
      setPrestamo(p);
      setCuotas(cs);
      setPagos(ps);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el préstamo');
      router.back();
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
    Alert.alert('Aprobar Préstamo', '¿Confirmas la aprobación de este préstamo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprobar', onPress: async () => {
          try {
            await prestamosService.aprobar(id, profile.id);
            load();
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'No se pudo aprobar el préstamo');
          }
        },
      },
    ]);
  };

  const handleActivar = () => {
    const hoy = new Date().toISOString().split('T')[0];
    Alert.alert('Activar y Desembolsar', `¿Confirmas el desembolso con fecha ${hoy}? Se generará el cronograma de pagos.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Activar', onPress: async () => {
          setActivating(true);
          try {
            await prestamosService.activar(id!, hoy);
            await load();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          } finally {
            setActivating(false);
          }
        }
      },
    ]);
  };

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
    Alert.alert('Cancelar Préstamo', '¿Estás seguro? Esta acción no se puede deshacer.', [
      { text: 'Volver', style: 'cancel' },
      {
        text: 'Cancelar Préstamo', style: 'destructive', onPress: async () => {
          try {
            await prestamosService.cancelar(id);
            load();
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'No se pudo cancelar el préstamo');
          }
        },
      },
    ]);
  };

  if (loading) return <LoadingScreen />;
  if (!prestamo) return null;

  const cliente = prestamo.clientes;
  const garantia = prestamo.garantias;
  const cuotasPagadas = cuotas.filter(c => c.estado === 'pagada').length;
  const progreso = cuotas.length > 0 ? cuotasPagadas / cuotas.length : 0;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalle Crédito</Text>
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
              <Text style={styles.heroClient}>{cliente?.nombre} {cliente?.apellido}</Text>
            </View>
            <Badge label={prestamo.estado} variant={ESTADO_VARIANT[prestamo.estado] ?? 'default'} />
          </View>
          <View style={styles.heroPills}>
            <View style={styles.heroPill}><Text style={styles.heroPillText}>📅 {prestamo.plazo_meses} meses</Text></View>
            <View style={styles.heroPill}><Text style={styles.heroPillText}>% {(prestamo.tasa_mensual * 100).toFixed(1)}% mensual</Text></View>
            <View style={styles.heroPill}><Text style={styles.heroPillText}>📐 {prestamo.tipo_amortizacion}</Text></View>
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
        {(profile?.rol === 'admin' || profile?.rol === 'oficial') && (
          <View style={styles.actionsCard}>
            {prestamo.estado === 'solicitado' && (
              <Button title="✅ Aprobar Préstamo" onPress={handleAprobar} variant="secondary" size="md" />
            )}
            {prestamo.estado === 'aprobado' && (
              <Button title="🚀 Activar y Desembolsar" onPress={handleActivar} loading={activating} size="md" />
            )}
            {(prestamo.estado === 'solicitado' || prestamo.estado === 'aprobado') && (
              <Button title="Cancelar Préstamo" onPress={handleCancelar} variant="danger" size="md" />
            )}
          </View>
        )}

        {/* Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👤 Cliente & Garantía</Text>
          <InfoRow label="Cliente" value={`${cliente?.nombre} ${cliente?.apellido}`} />
          <InfoRow label="Documento" value={cliente?.documento_numero ?? '-'} />
          <InfoRow label="Teléfono" value={cliente?.telefono ?? '-'} />
          {garantia && <InfoRow label="Garantía" value={`${garantia.tipo} — ${garantia.descripcion?.substring(0, 40)}`} />}
          {garantia && <InfoRow label="Avalúo" value={formatCurrency(garantia.valor_avaluo)} color={Colors.accent} />}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 Condiciones</Text>
          <InfoRow label="Monto Principal" value={formatCurrency(prestamo.monto_principal)} color={Colors.accent} />
          <InfoRow label="Tasa Mensual" value={`${(prestamo.tasa_mensual * 100).toFixed(2)}%`} />
          <InfoRow label="Plazo" value={`${prestamo.plazo_meses} meses`} />
          <InfoRow label="Amortización" value={prestamo.tipo_amortizacion} />
          {prestamo.comision_apertura > 0 && <InfoRow label="Comisión Apertura" value={formatCurrency(prestamo.comision_apertura)} />}
          {prestamo.fecha_desembolso && <InfoRow label="Fecha Desembolso" value={new Date(prestamo.fecha_desembolso).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })} />}
          {prestamo.fecha_vencimiento && <InfoRow label="Fecha Vencimiento" value={new Date(prestamo.fecha_vencimiento).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })} />}
        </View>

        {/* Contrato */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📄 Contrato del Préstamo</Text>
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
            <Text style={styles.sectionTitle}>📅 Cronograma de Pagos</Text>
            {cuotas.map((cuota) => (
              <CuotaRow key={cuota.id} cuota={cuota} />
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
            <Text style={styles.sectionTitle}>✅ Pagos Registrados ({pagos.length})</Text>
            {pagos.map((pago: any) => {
              const metodoIcon: Record<string, string> = { efectivo: '💵', transferencia: '🏦', cheque: '📄' };
              return (
                <View key={pago.id} style={styles.pagoRow}>
                  <Text style={styles.pagoIcon}>{metodoIcon[pago.metodo_pago] ?? '💰'}</Text>
                  <View style={styles.pagoBody}>
                    <Text style={styles.pagoRecibo}>{pago.numero_recibo}</Text>
                    <Text style={styles.pagoFecha}>
                      {new Date(pago.fecha_pago).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {pago.observaciones ? <Text style={styles.pagoObs}>{pago.observaciones}</Text> : null}
                  </View>
                  <View style={styles.pagoRight}>
                    <Text style={styles.pagoMonto}>{formatCurrency(pago.monto_pagado)}</Text>
                    {pago.mora_cobrada > 0 && (
                      <Text style={styles.pagMora}>+{formatCurrency(pago.mora_cobrada)} mora</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
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
  pagMora: { fontSize: 10, color: Colors.warning, fontWeight: '600' },
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
});
