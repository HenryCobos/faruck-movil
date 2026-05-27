import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Modal, TextInput, RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  cadenasAhorroService,
  formatFechaCadena,
} from '@/services/cadenasAhorro.service';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Badge } from '@/components/ui/Badge';
import { Colors } from '@/constants/colors';
import type { CadenaAhorro, CadenaRonda, EstadoCadena } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────

const ESTADO_VARIANT: Record<EstadoCadena, 'default' | 'success' | 'danger' | 'warning'> = {
  activa: 'success', completada: 'default', cancelada: 'danger',
};
const ESTADO_LABEL: Record<EstadoCadena, string> = {
  activa: 'Activa', completada: 'Completada', cancelada: 'Cancelada',
};
const FRECUENCIA_LABEL: Record<string, string> = {
  semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual',
};

function todayIso(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function esVencida(fechaStr: string): boolean {
  const hoy = todayIso();
  return fechaStr < hoy;
}

// ─── Sub-componente: fila de ronda ────────────────────────────

interface RondaRowProps {
  ronda:       CadenaRonda;
  esCobro:     boolean;
  montoRonda:  number;
  onTogglePago: () => void;
  onEditBenef: () => void;
}

function RondaRow({ ronda, esCobro, montoRonda, onTogglePago, onEditBenef }: RondaRowProps) {
  const vencida = !esCobro && !ronda.pagado && esVencida(ronda.fecha_vencimiento);

  return (
    <View style={[styles.rondaRow, vencida && styles.rondaRowVencida]}>
      {/* Número de ronda */}
      <View style={[styles.rondaNum, esCobro ? styles.rondaNumCobro : styles.rondaNumPago]}>
        <Text style={[styles.rondaNumText, esCobro ? styles.rondaNumTextCobro : styles.rondaNumTextPago]}>
          {ronda.numero_ronda}
        </Text>
      </View>

      {/* Info central */}
      <View style={styles.rondaInfo}>
        <View style={styles.rondaInfoTop}>
          <Text style={styles.rondaFecha}>{formatFechaCadena(ronda.fecha_vencimiento)}</Text>
          {vencida && <Text style={styles.rondaVencidaTag}>VENCIDA</Text>}
        </View>

        {/* Beneficiario */}
        <TouchableOpacity style={styles.rondaBenefRow} onPress={onEditBenef} activeOpacity={0.7}>
          <Text style={styles.rondaBenef} numberOfLines={1}>
            {ronda.beneficiario_nombre
              ? (esCobro ? `⭐ ${ronda.beneficiario_nombre}` : `👤 ${ronda.beneficiario_nombre}`)
              : <Text style={styles.rondaBenefPlaceholder}>
                  {esCobro ? 'Yo cobro este turno' : '+ Nombre del beneficiario'}
                </Text>
            }
          </Text>
          <Text style={styles.rondaBenefEdit}>✎</Text>
        </TouchableOpacity>
      </View>

      {/* Monto + estado */}
      <View style={styles.rondaRight}>
        {esCobro ? (
          <>
            <Text style={styles.rondaMontoCobro}>+${montoRonda.toLocaleString('es')}</Text>
            <View style={styles.rondaCobroBadge}>
              <Text style={styles.rondaCobroText}>⭐ COBRO</Text>
            </View>
            {/* El cobro también requiere marcar el aporte propio */}
            <TouchableOpacity
              style={[styles.rondaPagadoBtn, ronda.pagado && styles.rondaPagadoBtnOk]}
              onPress={onTogglePago}
              activeOpacity={0.7}
            >
              <Text style={[styles.rondaPagadoBtnText, ronda.pagado && styles.rondaPagadoBtnTextOk]}>
                {ronda.pagado ? '✓ Aporte' : 'Aporte'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.rondaMonto}>-${montoRonda.toLocaleString('es')}</Text>
            <TouchableOpacity
              style={[styles.rondaPagadoBtn, ronda.pagado && styles.rondaPagadoBtnOk]}
              onPress={onTogglePago}
              activeOpacity={0.7}
            >
              <Text style={[styles.rondaPagadoBtnText, ronda.pagado && styles.rondaPagadoBtnTextOk]}>
                {ronda.pagado ? '✓ Pagado' : 'Marcar'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────

export default function DetalleCadenaScreen() {
  const insets = useSafeAreaInsets();
  const { id }  = useLocalSearchParams<{ id: string }>();

  const [cadena,     setCadena]     = useState<CadenaAhorro | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal editar beneficiario
  const [editModal,    setEditModal]    = useState(false);
  const [editRondaId,  setEditRondaId]  = useState<string | null>(null);
  const [editNombre,   setEditNombre]   = useState('');
  const [editSaving,   setEditSaving]   = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await cadenasAhorroService.getById(id);
      // Ordenar rondas por numero_ronda
      if (data.cadena_rondas) {
        data.cadena_rondas.sort((a, b) => a.numero_ronda - b.numero_ronda);
      }
      setCadena(data);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo cargar la cadena.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ─── Derivados ─────────────────────────────────────────────

  const misTurnos = useMemo(
    () => new Set((cadena?.cadena_puestos ?? []).map((p) => p.numero_turno)),
    [cadena],
  );

  const numPuestos  = cadena?.cadena_puestos?.length ?? 0;
  const rondas      = cadena?.cadena_rondas ?? [];
  const rondasCobro = rondas.filter((r) => misTurnos.has(r.numero_ronda));
  // Todas las rondas requieren aporte, incluyendo la de cobro
  const pagadas     = rondas.filter((r) => r.pagado).length;
  const pendientes  = rondas.length - pagadas;
  // Próximo cobro: primera ronda de cobro cuyo aporte todavía no está marcado
  const proximaCobro = rondasCobro
    .filter((r) => !r.pagado)
    .sort((a, b) => a.numero_ronda - b.numero_ronda)[0];
  // Neto que recibirá en cada cobro (pozo - su propio aporte)
  const netoCobro = ((cadena?.monto_aporte ?? 0) * (cadena?.num_participantes ?? 0))
                  - ((cadena?.monto_aporte ?? 0) * (numPuestos || 1));
  const totalCobrar = rondasCobro.length * (cadena?.monto_aporte ?? 0) * (cadena?.num_participantes ?? 0);

  function montoRonda(ronda: CadenaRonda): number {
    if (!cadena) return 0;
    // En la ronda de cobro muestra el NETO: pozo total − tu aporte
    if (misTurnos.has(ronda.numero_ronda)) return netoCobro;
    return cadena.monto_aporte * (numPuestos || 1);
  }

  // ─── Acciones ──────────────────────────────────────────────

  const handleTogglePago = useCallback((ronda: CadenaRonda) => {
    if (ronda.pagado) {
      Alert.alert(
        'Desmarcar pago',
        `¿Quitar el registro de pago de la ronda #${ronda.numero_ronda}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Desmarcar', style: 'destructive',
            onPress: async () => {
              try {
                await cadenasAhorroService.desmarcarRondaPagada(ronda.id);
                load();
              } catch { Alert.alert('Error', 'No se pudo actualizar.'); }
            },
          },
        ],
      );
    } else {
      Alert.alert(
        'Marcar como pagado',
        `¿Confirmar pago de la ronda #${ronda.numero_ronda}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Confirmar',
            onPress: async () => {
              try {
                await cadenasAhorroService.marcarRondaPagada(ronda.id, todayIso());
                load();
              } catch { Alert.alert('Error', 'No se pudo actualizar.'); }
            },
          },
        ],
      );
    }
  }, [load]);

  const abrirEditBenef = useCallback((ronda: CadenaRonda) => {
    setEditRondaId(ronda.id);
    setEditNombre(ronda.beneficiario_nombre ?? '');
    setEditModal(true);
  }, []);

  const guardarBenef = useCallback(async () => {
    if (!editRondaId) return;
    setEditSaving(true);
    try {
      await cadenasAhorroService.actualizarBeneficiario(
        editRondaId,
        editNombre.trim() || null,
      );
      setEditModal(false);
      load();
    } catch {
      Alert.alert('Error', 'No se pudo guardar.');
    } finally {
      setEditSaving(false);
    }
  }, [editRondaId, editNombre, load]);

  const handleCambiarEstado = useCallback(() => {
    if (!cadena) return;
    const opciones: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress: () => void }> = [];

    if (cadena.estado !== 'completada') {
      opciones.push({
        text: '✅ Marcar como completada',
        onPress: async () => {
          try {
            await cadenasAhorroService.actualizarInfo(cadena.id, { estado: 'completada' });
            load();
          } catch { Alert.alert('Error', 'No se pudo actualizar.'); }
        },
      });
    }
    if (cadena.estado !== 'cancelada') {
      opciones.push({
        text: '❌ Cancelar cadena',
        style: 'destructive',
        onPress: async () => {
          try {
            await cadenasAhorroService.actualizarInfo(cadena.id, { estado: 'cancelada' });
            load();
          } catch { Alert.alert('Error', 'No se pudo actualizar.'); }
        },
      });
    }
    if (cadena.estado !== 'activa') {
      opciones.push({
        text: '🔄 Reactivar cadena',
        onPress: async () => {
          try {
            await cadenasAhorroService.actualizarInfo(cadena.id, { estado: 'activa' });
            load();
          } catch { Alert.alert('Error', 'No se pudo actualizar.'); }
        },
      });
    }
    opciones.push({ text: 'Cancelar', style: 'cancel', onPress: () => {} });

    Alert.alert('Estado de la cadena', 'Selecciona una acción', opciones);
  }, [cadena, load]);

  const handleEliminar = useCallback(() => {
    if (!cadena) return;
    Alert.alert(
      'Eliminar cadena',
      `¿Eliminar "${cadena.nombre}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            try {
              await cadenasAhorroService.eliminar(cadena.id);
              router.replace('/(app)/cadenas' as any);
            } catch { Alert.alert('Error', 'No se pudo eliminar.'); }
          },
        },
      ],
    );
  }, [cadena]);

  // ─── Render ────────────────────────────────────────────────

  if (loading) return <LoadingScreen label="Cargando cadena…" />;
  if (!cadena) return null;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle} numberOfLines={1}>{cadena.nombre}</Text>
            <Text style={styles.headerSub}>
              {cadena.num_participantes} participantes · {FRECUENCIA_LABEL[cadena.frecuencia]}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Badge label={ESTADO_LABEL[cadena.estado]} variant={ESTADO_VARIANT[cadena.estado]} />
            <TouchableOpacity onPress={handleCambiarEstado} style={styles.menuBtn}>
              <Text style={styles.menuBtnText}>⋯</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Resumen numérico */}
        <View style={styles.headerStats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>${cadena.monto_aporte.toLocaleString('es')}</Text>
            <Text style={styles.statLabel}>Por aporte</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.success }]}>
              ${(cadena.monto_aporte * cadena.num_participantes).toLocaleString('es')}
            </Text>
            <Text style={styles.statLabel}>Pozo total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatFechaCadena(cadena.fecha_inicio)}</Text>
            <Text style={styles.statLabel}>Inicio</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />
        }
      >
        {/* ── Mis turnos ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>MIS PUESTOS</Text>
          {cadena.cadena_puestos && cadena.cadena_puestos.length > 0 ? (
            cadena.cadena_puestos.map((p) => {
              const rondaCobro = rondas.find((r) => r.numero_ronda === p.numero_turno);
              return (
                <View key={p.id} style={styles.puestoRow}>
                  <View style={styles.puestoIconWrap}>
                    <Text style={styles.puestoIcon}>⭐</Text>
                  </View>
                  <View style={styles.puestoInfo}>
                    <Text style={styles.puestoTurno}>Turno #{p.numero_turno}</Text>
                    {rondaCobro && (
                      <Text style={styles.puestoFecha}>
                        {formatFechaCadena(rondaCobro.fecha_vencimiento)}
                      </Text>
                    )}
                  </View>
                  <View>
                    <Text style={styles.puestoMonto}>+${netoCobro.toLocaleString('es')} neto</Text>
                    <Text style={styles.puestoMontoSub}>
                      bruto ${(cadena.monto_aporte * cadena.num_participantes).toLocaleString('es')}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.sinPuestos}>Sin turnos asignados</Text>
          )}
        </View>

        {/* ── Resumen de aportes ── */}
        <View style={[styles.card, styles.cardRow]}>
          <View style={styles.resumenItem}>
            <Text style={styles.resumenNum}>{pagadas}/{rondas.length}</Text>
            <Text style={styles.resumenLabel}>Aportes pagados</Text>
          </View>
          <View style={styles.resumenDivider} />
          <View style={styles.resumenItem}>
            <Text style={[styles.resumenNum, { color: Colors.warning }]}>{pendientes}</Text>
            <Text style={styles.resumenLabel}>Pendientes</Text>
          </View>
          <View style={styles.resumenDivider} />
          <View style={styles.resumenItem}>
            <Text style={[styles.resumenNum, { color: Colors.success }]}>
              ${totalCobrar.toLocaleString('es')}
            </Text>
            <Text style={styles.resumenLabel}>Cobrarás (bruto)</Text>
          </View>
        </View>

        {/* Próximo cobro destacado */}
        {proximaCobro && (
          <View style={styles.proximoCobroCard}>
            <Text style={styles.proximoCobroLabel}>Tu próximo cobro · Turno #{proximaCobro.numero_ronda}</Text>
            <Text style={styles.proximoCobroFecha}>
              {formatFechaCadena(proximaCobro.fecha_vencimiento)}
            </Text>
            <Text style={styles.proximoCobroMonto}>
              +${netoCobro.toLocaleString('es')} neto
            </Text>
            <Text style={styles.proximoCobroBruto}>
              Bruto ${(cadena.monto_aporte * cadena.num_participantes).toLocaleString('es')} − tu aporte ${(cadena.monto_aporte * (numPuestos || 1)).toLocaleString('es')}
            </Text>
          </View>
        )}

        {/* ── Cronograma de rondas ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>CRONOGRAMA DE RONDAS</Text>
          {rondas.map((ronda) => (
            <RondaRow
              key={ronda.id}
              ronda={ronda}
              esCobro={misTurnos.has(ronda.numero_ronda)}
              montoRonda={montoRonda(ronda)}
              onTogglePago={() => handleTogglePago(ronda)}
              onEditBenef={() => abrirEditBenef(ronda)}
            />
          ))}
        </View>

        {/* ── Acciones ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>ACCIONES</Text>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCambiarEstado}>
            <Text style={styles.actionBtnIcon}>🔄</Text>
            <Text style={styles.actionBtnText}>Cambiar estado de la cadena</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={handleEliminar}>
            <Text style={styles.actionBtnIcon}>🗑️</Text>
            <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Eliminar cadena</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Modal editar beneficiario ── */}
      <Modal visible={editModal} transparent animationType="fade" onRequestClose={() => setEditModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nombre del beneficiario</Text>
            <Text style={styles.modalSub}>¿Quién cobra en esta ronda?</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nombre de la persona…"
              placeholderTextColor={Colors.muted}
              value={editNombre}
              onChangeText={setEditNombre}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={guardarBenef}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setEditModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, editSaving && { opacity: 0.6 }]}
                onPress={guardarBenef}
                disabled={editSaving}
              >
                <Text style={styles.modalConfirmText}>{editSaving ? 'Guardando…' : 'Guardar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 16 },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 22, color: Colors.white },
  headerTitles: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  menuBtnText: { fontSize: 20, color: Colors.white, lineHeight: 24 },

  headerStats: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, padding: 12,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: 14, fontWeight: '800', color: Colors.white },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 4 },

  scroll: { padding: 16, gap: 12 },

  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2, gap: 10,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.muted,
    letterSpacing: 1.2, marginBottom: 2,
  },

  puestoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  puestoIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: `${Colors.success}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  puestoIcon: { fontSize: 18 },
  puestoInfo: { flex: 1 },
  puestoTurno: { fontSize: 14, fontWeight: '700', color: Colors.text },
  puestoFecha: { fontSize: 12, color: Colors.muted },
  puestoMonto: { fontSize: 15, fontWeight: '800', color: Colors.success },
  puestoMontoSub: { fontSize: 10, color: Colors.muted, fontWeight: '500' },
  sinPuestos: { fontSize: 13, color: Colors.muted, textAlign: 'center', padding: 8 },

  resumenItem: { flex: 1, alignItems: 'center', gap: 4 },
  resumenNum: { fontSize: 20, fontWeight: '900', color: Colors.text },
  resumenLabel: { fontSize: 10, color: Colors.muted, fontWeight: '600', textAlign: 'center' },
  resumenDivider: { width: 1, height: 40, backgroundColor: Colors.border },

  proximoCobroCard: {
    backgroundColor: `${Colors.success}12`, borderRadius: 14,
    padding: 16, alignItems: 'center', borderWidth: 1,
    borderColor: `${Colors.success}30`,
  },
  proximoCobroLabel: { fontSize: 11, color: Colors.success, fontWeight: '700' },
  proximoCobroFecha: { fontSize: 20, fontWeight: '800', color: Colors.text, marginTop: 4 },
  proximoCobroMonto: { fontSize: 28, fontWeight: '900', color: Colors.success, marginTop: 2 },
  proximoCobroBruto: { fontSize: 11, color: Colors.muted, marginTop: 4 },

  // Ronda row
  rondaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rondaRowVencida: { backgroundColor: `${Colors.danger}06`, borderRadius: 8, paddingHorizontal: 4 },
  rondaNum: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    backgroundColor: `${Colors.info}15`,
  },
  rondaNumCobro: { backgroundColor: `${Colors.success}20` },
  rondaNumPago:  { backgroundColor: `${Colors.info}15` },
  rondaNumText: { fontSize: 12, fontWeight: '800', color: Colors.info },
  rondaNumTextCobro: { color: Colors.success },
  rondaNumTextPago:  { color: Colors.info },

  rondaInfo: { flex: 1, gap: 2 },
  rondaInfoTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rondaFecha: { fontSize: 13, fontWeight: '600', color: Colors.text },
  rondaVencidaTag: {
    fontSize: 9, fontWeight: '700', color: Colors.danger,
    backgroundColor: `${Colors.danger}15`, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 4,
  },
  rondaBenefRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rondaBenef: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  rondaBenefPlaceholder: { fontSize: 12, color: Colors.muted },
  rondaBenefEdit: { fontSize: 14, color: Colors.muted },

  rondaRight: { alignItems: 'flex-end', gap: 5, flexShrink: 0 },
  rondaMonto: { fontSize: 13, fontWeight: '800', color: Colors.text },
  rondaMontoCobro: { color: Colors.success },

  rondaCobroBadge: {
    backgroundColor: `${Colors.success}15`, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  rondaCobroText: { fontSize: 10, fontWeight: '700', color: Colors.success },

  rondaPagadoBtn: {
    backgroundColor: `${Colors.info}15`, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: `${Colors.info}30`,
  },
  rondaPagadoBtnOk: {
    backgroundColor: `${Colors.success}15`,
    borderColor: `${Colors.success}30`,
  },
  rondaPagadoBtnText: { fontSize: 11, fontWeight: '700', color: Colors.info },
  rondaPagadoBtnTextOk: { color: Colors.success },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  actionBtnDanger: { borderBottomWidth: 0 },
  actionBtnIcon: { fontSize: 18 },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: Colors.text },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', paddingHorizontal: 28,
  },
  modalCard: {
    backgroundColor: Colors.surface, borderRadius: 18,
    padding: 24, gap: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  modalSub: { fontSize: 13, color: Colors.muted, marginTop: -6 },
  modalInput: {
    backgroundColor: Colors.surface2, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.text,
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancel: {
    flex: 1, backgroundColor: Colors.surface2, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  modalConfirm: {
    flex: 1, backgroundColor: Colors.accent, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  modalConfirmText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
