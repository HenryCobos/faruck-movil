import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
  Alert, Modal, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  contabilidadService,
  EstadoResultados,
  CapitalFlowMensual,
} from '@/services/contabilidad.service';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { formatCurrency } from '@/utils/amortizacion';
import { Colors } from '@/constants/colors';

// ─── Date helpers ──────────────────────────────────────────────────────────────

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmtMes(isoDate: string) {
  const d = new Date(isoDate);
  return `${MESES_CORTO[d.getMonth()]} ${d.getFullYear()}`;
}

/** Returns YYYY-MM-01 for the given month offset from today (negative = past) */
function mesOffset(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().split('T')[0].substring(0, 8) + '01';
}

// ─── Filter types ──────────────────────────────────────────────────────────────

type Chip = '3M' | '6M' | '12M' | 'AÑO' | 'CUSTOM';

interface Rango { desde: string; hasta: string }  // both YYYY-MM-01

function rangoDesdeChip(chip: Chip, anioSel: number, custom: Rango): Rango {
  const hoy = new Date();
  const thisYear = hoy.getFullYear();
  const mesActual = mesOffset(0);

  if (chip === '3M')  return { desde: mesOffset(-2), hasta: mesActual };
  if (chip === '6M')  return { desde: mesOffset(-5), hasta: mesActual };
  if (chip === '12M') return { desde: mesOffset(-11), hasta: mesActual };
  if (chip === 'AÑO') return { desde: `${anioSel}-01-01`, hasta: `${anioSel}-12-01` };
  return custom; // CUSTOM
}

function rangoLabel(chip: Chip, anioSel: number, custom: Rango): string {
  if (chip === 'AÑO')  return `Año ${anioSel}`;
  if (chip === 'CUSTOM') {
    const d = new Date(custom.desde);
    const h = new Date(custom.hasta);
    return `${MESES_CORTO[d.getMonth()]} ${d.getFullYear()} – ${MESES_CORTO[h.getMonth()]} ${h.getFullYear()}`;
  }
  return chip === '3M' ? 'Últimos 3 meses' : chip === '6M' ? 'Últimos 6 meses' : 'Últimos 12 meses';
}

// ─── Native iOS date-range picker modal ──────────────────────────────────────

/** Normalise any Date to the 1st of its month as YYYY-MM-01 */
function toMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

interface MonthPickerProps {
  visible: boolean;
  initial: Rango;
  onApply: (r: Rango) => void;
  onClose: () => void;
}

function MonthPicker({ visible, initial, onApply, onClose }: MonthPickerProps) {
  // iOS native picker works on full Date objects; we ignore the day component
  const [desdeDate, setDesdeDate] = useState(() => new Date(initial.desde));
  const [hastaDate, setHastaDate] = useState(() => new Date(initial.hasta));
  // Which picker is active: 'desde' or 'hasta'
  const [tab, setTab] = useState<'desde' | 'hasta'>('desde');

  const today = new Date();

  const apply = () => {
    const desde = toMes(desdeDate);
    const hasta = toMes(hastaDate);
    if (desde > hasta) {
      Alert.alert('Rango inválido', 'El mes de inicio debe ser anterior o igual al mes de fin.');
      return;
    }
    onApply({ desde, hasta });
  };

  const onChangeDesde = (_: DateTimePickerEvent, date?: Date) => {
    if (date) setDesdeDate(date);
  };
  const onChangeHasta = (_: DateTimePickerEvent, date?: Date) => {
    if (date) setHastaDate(date);
  };

  const desdeLabel = `${MESES_LARGO[desdeDate.getMonth()]} ${desdeDate.getFullYear()}`;
  const hastaLabel = `${MESES_LARGO[hastaDate.getMonth()]} ${hastaDate.getFullYear()}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mpStyles.overlay}>
        <View style={mpStyles.sheet}>
          <View style={mpStyles.sheetHandle} />
          <Text style={mpStyles.title}>Rango personalizado</Text>

          {/* Tab switcher */}
          <View style={mpStyles.tabs}>
            <TouchableOpacity
              style={[mpStyles.tabBtn, tab === 'desde' && mpStyles.tabBtnActive]}
              onPress={() => setTab('desde')}
            >
              <Text style={mpStyles.tabSubLabel}>Desde</Text>
              <Text style={[mpStyles.tabDateLabel, tab === 'desde' && { color: Colors.primary }]}>
                {desdeLabel}
              </Text>
            </TouchableOpacity>
            <Text style={mpStyles.tabArrow}>→</Text>
            <TouchableOpacity
              style={[mpStyles.tabBtn, tab === 'hasta' && mpStyles.tabBtnActive]}
              onPress={() => setTab('hasta')}
            >
              <Text style={mpStyles.tabSubLabel}>Hasta</Text>
              <Text style={[mpStyles.tabDateLabel, tab === 'hasta' && { color: Colors.primary }]}>
                {hastaLabel}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Native iOS spinner picker */}
          {tab === 'desde' ? (
            <DateTimePicker
              value={desdeDate}
              mode="date"
              display="spinner"
              onChange={onChangeDesde}
              maximumDate={today}
              locale="es-ES"
              style={mpStyles.picker}
              textColor={Colors.text}
            />
          ) : (
            <DateTimePicker
              value={hastaDate}
              mode="date"
              display="spinner"
              onChange={onChangeHasta}
              maximumDate={today}
              minimumDate={desdeDate}
              locale="es-ES"
              style={mpStyles.picker}
              textColor={Colors.text}
            />
          )}

          {/* Summary preview */}
          <View style={mpStyles.previewRow}>
            <Text style={mpStyles.preview}>{desdeLabel}</Text>
            <Text style={mpStyles.previewArrow}>→</Text>
            <Text style={mpStyles.preview}>{hastaLabel}</Text>
          </View>

          {/* Actions */}
          <View style={mpStyles.actions}>
            <TouchableOpacity style={mpStyles.cancelBtn} onPress={onClose}>
              <Text style={mpStyles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mpStyles.applyBtn} onPress={apply}>
              <Text style={mpStyles.applyText}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={styles.miniBarBg}>
      <View style={[styles.miniBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

interface MesCardProps {
  item: EstadoResultados;
  maxIngresos: number;
  prev: EstadoResultados | null;
  flow: CapitalFlowMensual | null;
}

function MesCard({ item, maxIngresos, prev, flow }: MesCardProps) {
  const totalIngresos = item.ingresos_intereses + item.ingresos_comisiones + item.ingresos_mora;
  const margen = totalIngresos > 0 ? Math.round((item.utilidad_neta / totalIngresos) * 100) : 0;
  const utilPos = item.utilidad_neta >= 0;

  const mom = prev && prev.utilidad_neta !== 0
    ? Math.round(((item.utilidad_neta - prev.utilidad_neta) / Math.abs(prev.utilidad_neta)) * 100)
    : null;

  const pctI  = totalIngresos > 0 ? Math.round(item.ingresos_intereses  / totalIngresos * 100) : 0;
  const pctM  = totalIngresos > 0 ? Math.round(item.ingresos_mora        / totalIngresos * 100) : 0;
  const pctC  = totalIngresos > 0 ? Math.round(item.ingresos_comisiones  / totalIngresos * 100) : 0;

  return (
    <View style={styles.mesCard}>
      <View style={styles.mesCardHeader}>
        <Text style={styles.mesLabel}>{fmtMes(item.mes)}</Text>
        <View style={styles.mesHeaderBadges}>
          {mom !== null && (
            <View style={[styles.momBadge, { backgroundColor: mom >= 0 ? `${Colors.success}18` : `${Colors.danger}18` }]}>
              <Text style={[styles.momText, { color: mom >= 0 ? Colors.success : Colors.danger }]}>
                {mom >= 0 ? '▲' : '▼'} {Math.abs(mom)}% vs ant.
              </Text>
            </View>
          )}
          <View style={[styles.utilBadge, { backgroundColor: utilPos ? `${Colors.success}20` : `${Colors.danger}20` }]}>
            <Text style={[styles.utilBadgeText, { color: utilPos ? Colors.success : Colors.danger }]}>
              {margen}% margen
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.mesGrid}>
        {[
          { label: 'Intereses',   value: item.ingresos_intereses,  pct: pctI, color: Colors.success },
          { label: 'Mora',        value: item.ingresos_mora,        pct: pctM, color: Colors.warning },
          { label: 'Comisiones',  value: item.ingresos_comisiones,  pct: pctC, color: Colors.info },
          { label: 'Egresos',     value: item.egresos,              pct: null, color: Colors.danger },
        ].map(({ label, value, pct, color }) => (
          <View key={label} style={styles.mesItem}>
            <View style={styles.mesItemHeader}>
              <Text style={styles.mesItemLabel}>{label}</Text>
              {pct !== null && <Text style={[styles.mesItemPct, { color }]}>{pct}%</Text>}
            </View>
            <Text style={[styles.mesItemValue, { color }]}>{formatCurrency(value)}</Text>
            <MiniBar pct={value / maxIngresos * 100} color={color} />
          </View>
        ))}
      </View>

      <View style={styles.mesFooter}>
        <Text style={styles.mesFooterLabel}>Total: {formatCurrency(totalIngresos)}</Text>
        <Text style={[styles.mesUtilidadFinal, { color: utilPos ? Colors.success : Colors.danger }]}>
          Utilidad: {formatCurrency(item.utilidad_neta)}
        </Text>
      </View>

      {flow && (flow.capital_desplegado > 0 || flow.capital_recuperado > 0) && (
        <View style={styles.flowRow}>
          <View style={styles.flowItem}>
            <Text style={styles.flowLabel}>Desplegado</Text>
            <Text style={[styles.flowValue, { color: Colors.danger }]}>{formatCurrency(flow.capital_desplegado)}</Text>
            {flow.prestamos_nuevos > 0 && (
              <Text style={styles.flowSub}>{flow.prestamos_nuevos} préstamo{flow.prestamos_nuevos !== 1 ? 's' : ''}</Text>
            )}
          </View>
          <Text style={styles.flowArrow}>→</Text>
          <View style={styles.flowItem}>
            <Text style={styles.flowLabel}>Recuperado</Text>
            <Text style={[styles.flowValue, { color: Colors.success }]}>{formatCurrency(flow.capital_recuperado)}</Text>
            <Text style={styles.flowSub}>capital</Text>
          </View>
          {flow.roi > 0 && (
            <>
              <Text style={styles.flowArrow}>·</Text>
              <View style={styles.flowItem}>
                <Text style={styles.flowLabel}>ROI mes</Text>
                <Text style={[styles.flowValue, { color: '#7c3aed' }]}>+{flow.roi}%</Text>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

interface ResumenAnualProps {
  totales: { intereses: number; comisiones: number; mora: number; egresos: number; utilidad: number };
  margenAnual: number;
  mejorMes: EstadoResultados | null;
  totalCapitalFlow: { desplegado: number; recuperado: number };
  rango: string;
}

function ResumenHeader({ totales, margenAnual, mejorMes, totalCapitalFlow, rango }: ResumenAnualProps) {
  const totalIngresos = totales.intereses + totales.comisiones + totales.mora;
  return (
    <View style={styles.resumenAnual}>
      <Text style={styles.resumenTitle}>{rango.toUpperCase()}</Text>
      <View style={styles.resumenUtilidad}>
        <Text style={styles.resumenUtilidadLabel}>UTILIDAD TOTAL</Text>
        <Text style={[styles.resumenUtilidadValue, { color: totales.utilidad >= 0 ? Colors.accent : Colors.danger }]}>
          {formatCurrency(totales.utilidad)}
        </Text>
        <Text style={styles.resumenMargenLabel}>{margenAnual}% margen sobre ingresos totales</Text>
      </View>
      <View style={styles.resumenGrid}>
        {[
          { val: totales.intereses,  label: 'Intereses',        color: '#6ee7b7' },
          { val: totales.mora,       label: 'Mora cobrada',     color: '#fcd34d' },
          { val: totales.comisiones, label: 'Comisiones',       color: '#93c5fd' },
          { val: totales.egresos,    label: 'Egresos totales',  color: '#fca5a5' },
          { val: totalIngresos,      label: 'Total ingresos',   color: '#d8b4fe' },
        ].map(({ val, label, color }) => (
          <View key={label} style={styles.resumenItem}>
            <Text style={[styles.resumenValue, { color }]}>{formatCurrency(val)}</Text>
            <Text style={styles.resumenLabel}>{label}</Text>
          </View>
        ))}
        {mejorMes && (
          <View style={styles.resumenItem}>
            <Text style={[styles.resumenValue, { color: Colors.accent, fontSize: 13 }]}>{fmtMes(mejorMes.mes)}</Text>
            <Text style={styles.resumenLabel}>Mejor mes</Text>
          </View>
        )}
      </View>
      {(totalCapitalFlow.desplegado > 0 || totalCapitalFlow.recuperado > 0) && (
        <View style={styles.resumenFlowRow}>
          <View style={styles.resumenFlowItem}>
            <Text style={[styles.resumenFlowValue, { color: '#fca5a5' }]}>{formatCurrency(totalCapitalFlow.desplegado)}</Text>
            <Text style={styles.resumenLabel}>Capital desplegado</Text>
          </View>
          <View style={styles.resumenFlowItem}>
            <Text style={[styles.resumenFlowValue, { color: '#6ee7b7' }]}>{formatCurrency(totalCapitalFlow.recuperado)}</Text>
            <Text style={styles.resumenLabel}>Capital recuperado</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const CHIPS: Chip[] = ['3M', '6M', '12M', 'AÑO', 'CUSTOM'];
const CHIP_LABEL: Record<Chip, string> = { '3M': '3 meses', '6M': '6 meses', '12M': '12 meses', 'AÑO': 'Año', 'CUSTOM': 'Personalizado' };

export default function EstadoResultadosScreen() {
  const insets = useSafeAreaInsets();

  // Filter state
  const [chip,     setChip]     = useState<Chip>('12M');
  const [anioSel,  setAnioSel]  = useState(new Date().getFullYear());
  const [custom,   setCustom]   = useState<Rango>({ desde: mesOffset(-11), hasta: mesOffset(0) });
  const [showPicker, setShowPicker] = useState(false);

  // Data state
  const [data,    setData]    = useState<EstadoResultados[]>([]);
  const [flujo,   setFlujo]   = useState<CapitalFlowMensual[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting,  setExporting]  = useState(false);

  const currentYear = new Date().getFullYear();

  const rango = rangoDesdeChip(chip, anioSel, custom);

  const load = useCallback(async (r?: Rango) => {
    const range = r ?? rangoDesdeChip(chip, anioSel, custom);
    try {
      const [er, fl] = await Promise.all([
        contabilidadService.getEstadoResultados(range.desde, range.hasta),
        contabilidadService.getCapitalFlowMensual(range.desde, range.hasta),
      ]);
      setData(er);
      setFlujo(fl);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [chip, anioSel, custom]);

  useEffect(() => { load(); }, [chip, anioSel, custom]);

  const applyCustom = (r: Rango) => {
    setCustom(r);
    setChip('CUSTOM');
    setShowPicker(false);
    // useEffect will re-fetch via dependency on custom
  };

  const exportarPDF = async () => {
    setExporting(true);
    try {
      const html = await contabilidadService.generarHtmlEstadoResultados(data, flujo);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Exportar Estado de Resultados' });
      } else {
        Alert.alert('PDF generado', `Guardado en: ${uri}`);
      }
    } catch {
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <LoadingScreen label="Cargando estado de resultados..." />;

  const maxIngresos = Math.max(...data.map(d =>
    d.ingresos_intereses + d.ingresos_comisiones + d.ingresos_mora
  ), 1);

  const totales = data.reduce((acc, d) => ({
    intereses:  acc.intereses  + d.ingresos_intereses,
    comisiones: acc.comisiones + d.ingresos_comisiones,
    mora:       acc.mora       + d.ingresos_mora,
    egresos:    acc.egresos    + d.egresos,
    utilidad:   acc.utilidad   + d.utilidad_neta,
  }), { intereses: 0, comisiones: 0, mora: 0, egresos: 0, utilidad: 0 });

  const totalIngresos = totales.intereses + totales.comisiones + totales.mora;
  const margenAnual   = totalIngresos > 0 ? Math.round(totales.utilidad / totalIngresos * 100) : 0;
  const mejorMes      = data.length > 0 ? data.reduce((b, d) => d.utilidad_neta > b.utilidad_neta ? d : b) : null;

  const flujoMap = new Map(flujo.map(f => [f.mes, f]));
  const totalCapitalFlow = flujo.reduce(
    (acc, f) => ({ desplegado: acc.desplegado + f.capital_desplegado, recuperado: acc.recuperado + f.capital_recuperado }),
    { desplegado: 0, recuperado: 0 },
  );

  return (
    <View style={styles.screen}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Estado de Resultados</Text>
          <TouchableOpacity style={styles.pdfBtn} onPress={exportarPDF} disabled={exporting || data.length === 0}>
            {exporting
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Text style={styles.pdfBtnText}>📄 PDF</Text>}
          </TouchableOpacity>
        </View>

        {/* ── Filter chips ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContent}>
          {CHIPS.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, chip === c && styles.chipActive]}
              onPress={() => {
                if (c === 'CUSTOM') { setShowPicker(true); }
                else { setChip(c); }
              }}
            >
              <Text style={[styles.chipText, chip === c && styles.chipTextActive]}>
                {CHIP_LABEL[c]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Year selector (only for AÑO chip) ── */}
        {chip === 'AÑO' && (
          <View style={styles.yearRow}>
            <TouchableOpacity style={styles.yearBtn} onPress={() => setAnioSel(y => y - 1)}>
              <Text style={styles.yearBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.yearValue}>{anioSel}</Text>
            <TouchableOpacity style={styles.yearBtn} onPress={() => setAnioSel(y => y + 1)}
              disabled={anioSel >= currentYear}>
              <Text style={[styles.yearBtnText, anioSel >= currentYear && { opacity: 0.3 }]}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Custom range label ── */}
        {chip === 'CUSTOM' && (
          <TouchableOpacity style={styles.customLabel} onPress={() => setShowPicker(true)}>
            <Text style={styles.customLabelText}>
              📅 {rangoLabel('CUSTOM', anioSel, custom)}
            </Text>
            <Text style={styles.customLabelEdit}>Editar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── List ── */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.mes}
        renderItem={({ item, index }) => (
          <MesCard
            item={item}
            maxIngresos={maxIngresos}
            prev={data[index + 1] ?? null}
            flow={flujoMap.get(item.mes) ?? null}
          />
        )}
        ListHeaderComponent={() => (
          <ResumenHeader
            totales={totales}
            margenAnual={margenAnual}
            mejorMes={mejorMes}
            totalCapitalFlow={totalCapitalFlow}
            rango={rangoLabel(chip, anioSel, custom)}
          />
        )}
        contentContainerStyle={[styles.list, data.length === 0 && styles.listEmpty, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
        ListEmptyComponent={<EmptyState icon="📊" title="Sin datos" description="No hay resultados para el período seleccionado." />}
        showsVerticalScrollIndicator={false}
      />

      {/* ── Custom month-range picker ── */}
      <MonthPicker
        visible={showPicker}
        initial={custom}
        onApply={applyCustom}
        onClose={() => setShowPicker(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 20, color: Colors.white },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white, flex: 1, textAlign: 'center' },
  pdfBtn: { backgroundColor: Colors.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, minWidth: 70, alignItems: 'center' },
  pdfBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  // Chips
  chipsScroll: { flexGrow: 0 },
  chipsContent: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)' },
  chipActive: { backgroundColor: Colors.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  chipTextActive: { color: Colors.primary },

  // Year selector
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 4 },
  yearBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16 },
  yearBtnText: { fontSize: 20, color: Colors.white, fontWeight: '700', lineHeight: 24 },
  yearValue: { fontSize: 18, fontWeight: '800', color: Colors.white, minWidth: 55, textAlign: 'center' },

  // Custom label bar
  customLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  customLabelText: { fontSize: 13, fontWeight: '600', color: Colors.white },
  customLabelEdit: { fontSize: 12, fontWeight: '700', color: Colors.accent },

  // List
  list: { padding: 14, gap: 12 },
  listEmpty: { flex: 1 },

  // Resumen header
  resumenAnual: {
    backgroundColor: Colors.primary, borderRadius: 18, padding: 20, marginBottom: 8, gap: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4,
  },
  resumenTitle: { fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase' },
  resumenUtilidad: { alignItems: 'center', gap: 4 },
  resumenUtilidadLabel: { fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase' },
  resumenUtilidadValue: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  resumenMargenLabel: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  resumenGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resumenItem: { flex: 1, minWidth: '30%', alignItems: 'center', gap: 3 },
  resumenValue: { fontSize: 14, fontWeight: '800' },
  resumenLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  resumenFlowRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 12, gap: 8 },
  resumenFlowItem: { flex: 1, alignItems: 'center', gap: 3 },
  resumenFlowValue: { fontSize: 15, fontWeight: '800' },

  // Month card
  mesCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16, gap: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  mesCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 },
  mesLabel: { fontSize: 16, fontWeight: '800', color: Colors.text },
  mesHeaderBadges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  momBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  momText: { fontSize: 11, fontWeight: '700' },
  utilBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  utilBadgeText: { fontSize: 11, fontWeight: '700' },
  mesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mesItem: { flex: 1, minWidth: '44%', gap: 4 },
  mesItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mesItemLabel: { fontSize: 11, color: Colors.muted },
  mesItemPct: { fontSize: 10, fontWeight: '700' },
  mesItemValue: { fontSize: 14, fontWeight: '800' },
  miniBarBg: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  miniBarFill: { height: '100%', borderRadius: 2 },
  mesFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10,
  },
  mesFooterLabel: { fontSize: 12, color: Colors.muted },
  mesUtilidadFinal: { fontSize: 15, fontWeight: '800' },
  flowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${Colors.primary}08`, borderRadius: 10, padding: 10 },
  flowItem: { flex: 1, alignItems: 'center', gap: 2 },
  flowLabel: { fontSize: 10, color: Colors.muted, textAlign: 'center' },
  flowValue: { fontSize: 13, fontWeight: '800' },
  flowSub: { fontSize: 9, color: Colors.muted },
  flowArrow: { fontSize: 14, color: Colors.muted },
});

// ─── Month picker styles ──────────────────────────────────────────────────────

const mpStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 44, gap: 16,
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  // Tab selector
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabBtn: {
    flex: 1, borderRadius: 14, padding: 12, backgroundColor: Colors.background,
    borderWidth: 2, borderColor: Colors.border, alignItems: 'center', gap: 2,
  },
  tabBtnActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}10` },
  tabSubLabel: { fontSize: 10, fontWeight: '600', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  tabDateLabel: { fontSize: 14, fontWeight: '800', color: Colors.text },
  tabArrow: { fontSize: 18, color: Colors.muted },
  // Native picker
  picker: { width: '100%', height: 180 },
  // Preview
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  preview: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  previewArrow: { fontSize: 14, color: Colors.muted },
  // Actions
  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700', color: Colors.muted },
  applyBtn: { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center' },
  applyText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
