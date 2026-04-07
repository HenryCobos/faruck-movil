import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, RefreshControl, Share, Linking, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { clientesService } from '@/services/clientes.service';
import { configuracionService, Configuracion } from '@/services/configuracion.service';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { formatCurrency } from '@/utils/amortizacion';
import { Colors } from '@/constants/colors';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface ProximaCuota {
  numero: number;
  fecha_vencimiento: string;
  monto_total: number;
  capital: number;
  interes: number;
  dias: number; // negative = overdue, positive = days remaining
}

interface ResumenPrestamo {
  id: string;
  monto_principal: number;
  tasa_mensual: number;
  plazo_meses: number;
  estado: string;
  fecha_desembolso?: string;
  cuotas_total: number;
  cuotas_pagadas: number;
  total_a_pagar: number;   // capital + interest total
  total_pagado: number;    // actual amount paid (from pagos)
  capital_pagado: number;
  interes_proyectado: number;
  interes_pagado: number;
  saldo_capital: number;
  mora_acumulada: number;
  mora_cobrada: number;    // actual mora collected (from pagos)
  garantia_tipo: string;
  proxima_cuota: ProximaCuota | null;
}

interface PagoReciente {
  fecha_pago: string;
  monto_pagado: number;
  mora_cobrada: number;
  metodo_pago: string;
  numero_cuota: number;
  prestamo_monto: number;
}

interface EstadoCuenta {
  cliente: any;
  prestamos: ResumenPrestamo[];
  pagos_recientes: PagoReciente[];
  totales: {
    deuda_original: number;
    saldo_total: number;
    pagado_total: number;
    interes_pagado: number;
    mora_total: number;
    mora_cobrada: number;
    prestamos_activos: number;
  };
}

// ─── Data builder ─────────────────────────────────────────────────────────────

async function buildEstadoCuenta(clienteId: string): Promise<EstadoCuenta> {
  const { supabase } = await import('@/lib/supabase');

  const { data, error } = await supabase
    .from('prestamos')
    .select(`
      id, monto_principal, tasa_mensual, plazo_meses, estado, fecha_desembolso,
      garantias(tipo),
      cuotas(
        id, numero_cuota, estado, capital, interes, monto_total,
        mora_acumulada, fecha_vencimiento,
        pagos(monto_pagado, mora_cobrada, fecha_pago, metodo_pago)
      )
    `)
    .eq('cliente_id', clienteId)
    .in('estado', ['activo', 'vencido', 'cancelado'])
    .order('created_at', { ascending: false });

  if (error) throw error;

  const cliente = await clientesService.getById(clienteId);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const allPagos: PagoReciente[] = [];

  const prestamos: ResumenPrestamo[] = (data ?? []).map((p: any) => {
    const cuotas: any[] = p.cuotas ?? [];
    const cuotasPagadas = cuotas.filter((c: any) => c.estado === 'pagada');
    const cuotasPendientes = cuotas
      .filter((c: any) => c.estado !== 'pagada')
      .sort((a: any, b: any) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));

    const saldo_capital     = cuotasPendientes.reduce((s: number, c: any) => s + Number(c.capital), 0);
    const mora_acumulada    = cuotas.reduce((s: number, c: any) => s + Number(c.mora_acumulada ?? 0), 0);
    const interes_proyectado = cuotas.reduce((s: number, c: any) => s + Number(c.interes), 0);
    const interes_pagado    = cuotasPagadas.reduce((s: number, c: any) => s + Number(c.interes), 0);
    const capital_pagado    = cuotasPagadas.reduce((s: number, c: any) => s + Number(c.capital), 0);
    const total_a_pagar     = cuotas.reduce((s: number, c: any) => s + Number(c.monto_total), 0);

    // Suma de pagos registrados
    const allCuotaPagos = cuotas.flatMap((c: any) => (c.pagos ?? []).map((pg: any) => ({
      ...pg,
      numero_cuota: c.numero_cuota,
    })));
    const total_pagado  = allCuotaPagos.reduce((s: number, pg: any) => s + Number(pg.monto_pagado ?? 0), 0);
    const mora_cobrada  = allCuotaPagos.reduce((s: number, pg: any) => s + Number(pg.mora_cobrada ?? 0), 0);

    // Collect pagos for the "recent payments" section
    allCuotaPagos.forEach((pg: any) => {
      allPagos.push({
        fecha_pago:    pg.fecha_pago,
        monto_pagado:  Number(pg.monto_pagado),
        mora_cobrada:  Number(pg.mora_cobrada ?? 0),
        metodo_pago:   pg.metodo_pago ?? 'efectivo',
        numero_cuota:  pg.numero_cuota,
        prestamo_monto: Number(p.monto_principal),
      });
    });

    // Próxima cuota
    let proxima_cuota: ProximaCuota | null = null;
    if (cuotasPendientes.length > 0) {
      const c = cuotasPendientes[0];
      const venc = new Date(c.fecha_vencimiento);
      venc.setHours(0, 0, 0, 0);
      const dias = Math.round((venc.getTime() - hoy.getTime()) / 86400000);
      proxima_cuota = {
        numero:           c.numero_cuota,
        fecha_vencimiento: c.fecha_vencimiento,
        monto_total:      Number(c.monto_total),
        capital:          Number(c.capital),
        interes:          Number(c.interes),
        dias,
      };
    }

    return {
      id: p.id,
      monto_principal:     Number(p.monto_principal),
      tasa_mensual:        Number(p.tasa_mensual),
      plazo_meses:         p.plazo_meses,
      estado:              p.estado,
      fecha_desembolso:    p.fecha_desembolso,
      cuotas_total:        cuotas.length,
      cuotas_pagadas:      cuotasPagadas.length,
      total_a_pagar:       Math.round(total_a_pagar * 100) / 100,
      total_pagado:        Math.round(total_pagado * 100) / 100,
      capital_pagado:      Math.round(capital_pagado * 100) / 100,
      interes_proyectado:  Math.round(interes_proyectado * 100) / 100,
      interes_pagado:      Math.round(interes_pagado * 100) / 100,
      saldo_capital:       Math.round(saldo_capital * 100) / 100,
      mora_acumulada:      Math.round(mora_acumulada * 100) / 100,
      mora_cobrada:        Math.round(mora_cobrada * 100) / 100,
      garantia_tipo:       p.garantias?.tipo ?? '',
      proxima_cuota,
    };
  });

  // Recent payments — all loans, sorted by date desc, last 8
  const pagos_recientes = allPagos
    .sort((a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())
    .slice(0, 8);

  const activos = prestamos.filter(p => p.estado === 'activo' || p.estado === 'vencido');

  return {
    cliente,
    prestamos,
    pagos_recientes,
    totales: {
      deuda_original:     Math.round(activos.reduce((s, p) => s + p.monto_principal, 0) * 100) / 100,
      saldo_total:        Math.round(activos.reduce((s, p) => s + p.saldo_capital, 0) * 100) / 100,
      pagado_total:       Math.round(prestamos.reduce((s, p) => s + p.total_pagado, 0) * 100) / 100,
      interes_pagado:     Math.round(prestamos.reduce((s, p) => s + p.interes_pagado, 0) * 100) / 100,
      mora_total:         Math.round(activos.reduce((s, p) => s + p.mora_acumulada, 0) * 100) / 100,
      mora_cobrada:       Math.round(prestamos.reduce((s, p) => s + p.mora_cobrada, 0) * 100) / 100,
      prestamos_activos:  activos.length,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function fmtFecha(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES_CORTO[d.getMonth()]} ${d.getFullYear()}`;
}

function diasLabel(dias: number): { text: string; color: string } {
  if (dias < 0)  return { text: `Vencida hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`, color: Colors.danger };
  if (dias === 0) return { text: 'Vence hoy',    color: Colors.warning };
  if (dias <= 7)  return { text: `Vence en ${dias} día${dias !== 1 ? 's' : ''}`, color: Colors.warning };
  return { text: `Vence en ${dias} días`, color: Colors.success };
}

function scoringColor(s: number) {
  return s >= 75 ? Colors.success : s >= 50 ? Colors.warning : Colors.danger;
}

const METODO_ICON: Record<string, string> = {
  efectivo: '💵', transferencia: '🏦', cheque: '📄', tarjeta: '💳',
};

// ─── WhatsApp text generator ──────────────────────────────────────────────────

function generarTextoWhatsApp(ec: EstadoCuenta, cfg: Configuracion): string {
  const cl  = ec.cliente;
  const s   = cfg.simbolo_moneda;
  const t   = ec.totales;

  const lineas: string[] = [
    `📊 *Estado de Cuenta — ${cl.nombre} ${cl.apellido}*`,
    `_${new Date().toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })}_`,
    '',
    `💰 Saldo pendiente: *${s}${t.saldo_total.toLocaleString('es')}*`,
    `✅ Total pagado: ${s}${t.pagado_total.toLocaleString('es')}`,
    `📈 Interés pagado: ${s}${t.interes_pagado.toLocaleString('es')}`,
    ...(t.mora_total > 0 ? [`⚠️ Mora acumulada: *${s}${t.mora_total.toFixed(2)}*`] : []),
    '',
    `📋 *Préstamos activos: ${t.prestamos_activos}*`,
  ];

  ec.prestamos
    .filter(p => p.estado === 'activo' || p.estado === 'vencido')
    .forEach((p, i) => {
      lineas.push('');
      lineas.push(`${i + 1}. Préstamo ${s}${p.monto_principal.toLocaleString('es')} · ${p.cuotas_pagadas}/${p.cuotas_total} cuotas`);
      if (p.proxima_cuota) {
        const pc = p.proxima_cuota;
        const dl = diasLabel(pc.dias);
        lineas.push(`   📅 Cuota ${pc.numero}: ${s}${pc.monto_total.toLocaleString('es')} — ${fmtFecha(pc.fecha_vencimiento)} (${dl.text})`);
      } else {
        lineas.push(`   ✅ Todas las cuotas pagadas`);
      }
    });

  lineas.push('');
  lineas.push(`━━━━━━━━━━━━━━━━━━`);
  lineas.push(`Emitido por *${cfg.nombre_empresa}*`);
  if (cfg.telefono) lineas.push(`📞 ${cfg.telefono}`);

  return lineas.join('\n');
}

// ─── PDF generator ────────────────────────────────────────────────────────────

function generarHtml(ec: EstadoCuenta, config: Configuracion): string {
  const fecha  = new Date().toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });
  const cl     = ec.cliente;
  const color  = config.color_primario ?? '#0D1B2A';
  const acento = '#F5A623';
  const s      = config.simbolo_moneda;

  const contactLine = [
    config.direccion,
    config.telefono ? `Tel: ${config.telefono}` : null,
    config.email,
    config.ruc_nit  ? `RUC/NIT: ${config.ruc_nit}` : null,
  ].filter(Boolean).join(' · ');

  const encabezado = `
    <table style="width:100%;background:${color};border-radius:10px;margin-bottom:24px;border-collapse:collapse">
      <tr>
        <td style="padding:20px 12px 20px 20px;width:76px;vertical-align:middle">
          <div style="width:64px;height:64px;background:rgba(255,255,255,0.15);border-radius:10px;overflow:hidden;text-align:center;line-height:64px">
            ${config.logo_url
              ? `<img src="${config.logo_url}" alt="logo" style="width:64px;height:64px;object-fit:contain;display:block" />`
              : `<span style="font-size:30px;line-height:64px">🏦</span>`}
          </div>
        </td>
        <td style="padding:20px 20px 20px 8px;vertical-align:middle">
          <div style="font-size:22px;font-weight:900;color:${acento};letter-spacing:2px;margin-bottom:3px">${config.nombre_empresa}</div>
          ${config.slogan ? `<div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:5px">${config.slogan}</div>` : ''}
          ${contactLine ? `<div style="font-size:10px;color:rgba(255,255,255,0.45);line-height:1.8">${contactLine}</div>` : ''}
        </td>
      </tr>
    </table>`;

  // Loan rows with expanded columns
  const filasPrestamos = ec.prestamos.map(p => {
    const estadoColor = { activo: '#0d9488', vencido: '#dc2626', cancelado: '#6b7280' }[p.estado] ?? '#6b7280';
    const progreso    = p.cuotas_total > 0 ? Math.round(p.cuotas_pagadas / p.cuotas_total * 100) : 0;
    const pcLabel     = p.proxima_cuota
      ? `Cuota ${p.proxima_cuota.numero} — ${fmtFecha(p.proxima_cuota.fecha_vencimiento)}<br/>${s}${p.proxima_cuota.monto_total.toLocaleString('es')}`
      : '<span style="color:#0d9488">✓ Pagado</span>';
    return `
    <tr>
      <td>${p.garantia_tipo || '—'} / ${s}${p.monto_principal.toLocaleString('es')}</td>
      <td style="text-align:center">${p.tasa_mensual * 100}% / ${p.plazo_meses}m</td>
      <td style="text-align:right;color:#0d9488">${s}${p.capital_pagado.toLocaleString('es')}</td>
      <td style="text-align:right;color:#0369a1">${s}${p.interes_pagado.toLocaleString('es')} <span style="color:#aaa;font-size:9px">/ ${s}${p.interes_proyectado.toLocaleString('es')}</span></td>
      <td style="text-align:right;color:#dc2626">${s}${p.saldo_capital.toLocaleString('es')}</td>
      <td style="text-align:center">${p.cuotas_pagadas}/${p.cuotas_total} (${progreso}%)</td>
      ${p.mora_acumulada > 0 ? `<td style="color:#dc2626;text-align:right">${s}${p.mora_acumulada.toFixed(2)}</td>` : '<td style="text-align:center;color:#ccc">—</td>'}
      <td style="font-size:10px">${pcLabel}</td>
      <td><span style="background:${estadoColor}20;color:${estadoColor};padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">${p.estado.toUpperCase()}</span></td>
    </tr>`;
  }).join('');

  // Recent payments rows
  const filasPageos = ec.pagos_recientes.map(pg => {
    const icon = METODO_ICON[pg.metodo_pago] ?? '💰';
    return `
    <tr>
      <td>${fmtFecha(pg.fecha_pago)}</td>
      <td>${icon} ${pg.metodo_pago}</td>
      <td>Préstamo ${s}${pg.prestamo_monto.toLocaleString('es')} — Cuota ${pg.numero_cuota}</td>
      <td style="text-align:right;font-weight:700;color:#0d9488">${s}${pg.monto_pagado.toLocaleString('es')}</td>
      ${pg.mora_cobrada > 0 ? `<td style="text-align:right;color:#b45309">${s}${pg.mora_cobrada.toFixed(2)}</td>` : '<td style="text-align:center;color:#ccc">—</td>'}
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body{font-family:Arial,sans-serif;margin:30px;color:#333;font-size:12px}
    .titulo{font-size:15px;font-weight:900;color:${color};border-bottom:2px solid ${acento};padding-bottom:6px;margin:20px 0 12px}
    .cliente-box{background:#f9fafb;border-radius:8px;padding:14px 18px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start}
    .ci p{margin:3px 0;font-size:11px;color:#555} .ci strong{font-size:14px;color:${color}}
    .kpis{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
    .kpi{flex:1;min-width:80px;background:${color};border-radius:8px;padding:12px;text-align:center}
    .kv{font-size:16px;font-weight:900;color:${acento}} .kl{font-size:9px;color:rgba(255,255,255,.5);margin-top:3px;text-transform:uppercase;letter-spacing:1px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th{background:${color};color:#fff;padding:7px 5px;text-align:left}
    td{padding:6px 5px;border-bottom:1px solid #eee}
    tr:nth-child(even){background:#fafafa}
    .alerta{background:#fee2e2;border-left:3px solid #dc2626;padding:10px 14px;border-radius:4px;margin-bottom:16px;font-size:11px;color:#7f1d1d}
    .footer{margin-top:30px;text-align:center;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
  </style></head><body>
  ${encabezado}
  <div class="titulo">ESTADO DE CUENTA</div>
  <div style="font-size:10px;color:#888;margin-bottom:14px">Generado el ${fecha}</div>

  <div class="cliente-box">
    <div class="ci">
      <strong>${cl.nombre} ${cl.apellido}</strong>
      <p>${cl.documento_tipo?.toUpperCase()} ${cl.documento_numero}</p>
      <p>📞 ${cl.telefono}${cl.email ? ` · ✉️ ${cl.email}` : ''}</p>
      ${cl.direccion ? `<p>📍 ${cl.direccion}</p>` : ''}
    </div>
    <div class="ci" style="text-align:right">
      <p>Scoring: <strong style="color:${cl.scoring >= 75 ? '#0d9488' : cl.scoring >= 50 ? '#f59e0b' : '#dc2626'}">${cl.scoring}/100</strong></p>
      <p>Estado: <strong style="color:${cl.estado === 'activo' ? '#0d9488' : '#dc2626'}">${cl.estado?.toUpperCase()}</strong></p>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="kv">${s}${ec.totales.saldo_total.toLocaleString('es')}</div><div class="kl">Saldo pendiente</div></div>
    <div class="kpi"><div class="kv">${s}${ec.totales.pagado_total.toLocaleString('es')}</div><div class="kl">Total pagado</div></div>
    <div class="kpi"><div class="kv" style="color:#6ee7b7">${s}${ec.totales.interes_pagado.toLocaleString('es')}</div><div class="kl">Interés pagado</div></div>
    <div class="kpi"><div class="kv">${s}${ec.totales.deuda_original.toLocaleString('es')}</div><div class="kl">Deuda original</div></div>
    <div class="kpi"><div class="kv" style="color:${ec.totales.mora_total > 0 ? '#ef4444' : acento}">${s}${ec.totales.mora_total.toFixed(2)}</div><div class="kl">Mora acumulada</div></div>
    <div class="kpi"><div class="kv">${ec.totales.prestamos_activos}</div><div class="kl">Activos</div></div>
  </div>

  ${ec.totales.mora_total > 0 ? `<div class="alerta">⚠️ Mora acumulada: ${s}${ec.totales.mora_total.toFixed(2)} · Tasa: ${config.tasa_mora_label}</div>` : ''}

  <div class="titulo">Detalle de Préstamos</div>
  <table>
    <thead><tr>
      <th>Garantía / Monto</th><th>Tasa/Plazo</th>
      <th style="text-align:right">Cap. Pagado</th>
      <th style="text-align:right">Int. Pagado / Proyect.</th>
      <th style="text-align:right">Saldo Cap.</th>
      <th style="text-align:center">Cuotas</th>
      <th style="text-align:right">Mora</th>
      <th>Próxima Cuota</th><th>Estado</th>
    </tr></thead>
    <tbody>${filasPrestamos}</tbody>
  </table>

  ${ec.pagos_recientes.length > 0 ? `
  <div class="titulo">Últimos Pagos Registrados</div>
  <table>
    <thead><tr>
      <th>Fecha</th><th>Método</th><th>Concepto</th>
      <th style="text-align:right">Monto</th><th style="text-align:right">Mora</th>
    </tr></thead>
    <tbody>${filasPageos}</tbody>
  </table>` : ''}

  <div class="footer">
    ${config.nombre_empresa}${config.ruc_nit ? ` · RUC/NIT: ${config.ruc_nit}` : ''} · Generado automáticamente · ${fecha}
  </div>
  </body></html>`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EstadoCuentaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [data,       setData]       = useState<EstadoCuenta | null>(null);
  const [config,     setConfig]     = useState<Configuracion | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [sharing,    setSharing]    = useState(false);

  const load = async () => {
    if (!id) { setLoading(false); return; }
    try {
      const [ec, cfg] = await Promise.all([
        buildEstadoCuenta(id),
        configuracionService.get(),
      ]);
      setData(ec);
      setConfig(cfg);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo cargar el estado de cuenta');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const exportarPDF = async () => {
    if (!data || !config) return;
    setExporting(true);
    try {
      const html = generarHtml(data, config);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Estado de Cuenta — ${data.cliente.nombre} ${data.cliente.apellido}`,
        });
      } else {
        Alert.alert('PDF generado', uri);
      }
    } catch {
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setExporting(false);
    }
  };

  const compartirWhatsApp = async () => {
    if (!data || !config) return;
    setSharing(true);
    try {
      const texto = generarTextoWhatsApp(data, config);
      const url   = `whatsapp://send?text=${encodeURIComponent(texto)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        // Fallback: native share sheet
        await Share.share({ message: texto });
      }
    } catch {
      Alert.alert('Error', 'No se pudo abrir WhatsApp');
    } finally {
      setSharing(false);
    }
  };

  if (loading) return <LoadingScreen label="Generando estado de cuenta..." />;
  if (!data) return (
    <View style={styles.errorState}>
      <Text style={styles.errorText}>No se pudo cargar el estado de cuenta.</Text>
      <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={styles.retryBtn}>
        <Text style={styles.retryText}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );

  const { cliente, prestamos, pagos_recientes, totales } = data;
  const ESTADO_COLOR: Record<string, string> = {
    activo: Colors.success, vencido: Colors.danger, cancelado: Colors.muted,
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Estado de Cuenta</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.waBtn} onPress={compartirWhatsApp} disabled={sharing}>
              {sharing
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.waBtnText}>💬</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.pdfBtn} onPress={exportarPDF} disabled={exporting}>
              {exporting
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Text style={styles.pdfBtnText}>📄 PDF</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
      >
        {/* ── Client profile ── */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {cliente.nombre?.charAt(0)}{cliente.apellido?.charAt(0)}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.profileNameRow}>
              <Text style={styles.profileName}>{cliente.nombre} {cliente.apellido}</Text>
              <View style={[styles.estadoCliBadge, {
                backgroundColor: cliente.estado === 'activo' ? `${Colors.success}20` : `${Colors.danger}20`,
              }]}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: cliente.estado === 'activo' ? Colors.success : Colors.danger }}>
                  {cliente.estado?.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.profileDoc}>{cliente.documento_tipo?.toUpperCase()} {cliente.documento_numero}</Text>
            <View style={styles.profileContacts}>
              {cliente.telefono && <Text style={styles.profileContact}>📞 {cliente.telefono}</Text>}
              {cliente.email    && <Text style={styles.profileContact}>✉️ {cliente.email}</Text>}
            </View>
          </View>
          {/* Scoring */}
          <View style={[styles.scoringBadge, { borderColor: scoringColor(cliente.scoring) }]}>
            <Text style={[styles.scoringValue, { color: scoringColor(cliente.scoring) }]}>{cliente.scoring}</Text>
            <Text style={styles.scoringLabel}>SCORE</Text>
          </View>
        </View>

        {/* ── 6 KPIs ── */}
        <View style={styles.kpiCard}>
          {[
            { val: formatCurrency(totales.saldo_total),    label: 'Saldo pendiente',  color: Colors.danger  },
            { val: formatCurrency(totales.deuda_original), label: 'Deuda original',   color: 'rgba(255,255,255,0.8)' },
            { val: formatCurrency(totales.pagado_total),   label: 'Total pagado',     color: Colors.success },
            { val: formatCurrency(totales.interes_pagado), label: 'Interés pagado',   color: '#93c5fd' },
            { val: formatCurrency(totales.mora_total),     label: 'Mora acumulada',   color: totales.mora_total > 0 ? Colors.warning : Colors.muted },
            { val: String(totales.prestamos_activos),      label: 'Préstamos activos',color: Colors.accent  },
          ].map(({ val, label, color }) => (
            <View key={label} style={styles.kpiItem}>
              <Text style={[styles.kpiValue, { color }]}>{val}</Text>
              <Text style={styles.kpiLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Mora alert ── */}
        {totales.mora_total > 0 && (
          <View style={styles.moraAlerta}>
            <Text style={styles.moraAlertaIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.moraAlertaText}>Mora acumulada: {formatCurrency(totales.mora_total)}</Text>
              <Text style={styles.moraAlertaSub}>Mora cobrada: {formatCurrency(totales.mora_cobrada)} · Tasa: {config?.tasa_mora_label}</Text>
            </View>
          </View>
        )}

        {/* ── Loans ── */}
        <Text style={styles.sectionTitle}>Detalle de Préstamos</Text>
        {prestamos.map(p => {
          const progreso = p.cuotas_total > 0 ? p.cuotas_pagadas / p.cuotas_total : 0;
          const color    = ESTADO_COLOR[p.estado] ?? Colors.muted;
          const pc       = p.proxima_cuota;
          const dl       = pc ? diasLabel(pc.dias) : null;

          return (
            <TouchableOpacity
              key={p.id}
              style={styles.prestamoCard}
              onPress={() => router.push(`/(app)/creditos/${p.id}` as any)}
              activeOpacity={0.75}
            >
              {/* Top row */}
              <View style={styles.prestamoHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prestamoMonto}>{formatCurrency(p.monto_principal)}</Text>
                  <Text style={styles.prestamoSub}>
                    📦 {p.garantia_tipo || 'Sin garantía'} · {p.tasa_mensual * 100}% mes · {p.plazo_meses}m
                  </Text>
                </View>
                <View style={[styles.estadoBadge, { backgroundColor: `${color}20` }]}>
                  <Text style={[styles.estadoText, { color }]}>{p.estado.toUpperCase()}</Text>
                </View>
              </View>

              {/* Financials grid */}
              <View style={styles.prestamoGrid}>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Capital pagado</Text>
                  <Text style={[styles.gridValue, { color: Colors.success }]}>{formatCurrency(p.capital_pagado)}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Interés pagado</Text>
                  <Text style={[styles.gridValue, { color: '#60a5fa' }]}>{formatCurrency(p.interes_pagado)}</Text>
                  <Text style={styles.gridSub}>de {formatCurrency(p.interes_proyectado)}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Saldo capital</Text>
                  <Text style={[styles.gridValue, { color: Colors.danger }]}>{formatCurrency(p.saldo_capital)}</Text>
                </View>
                {p.mora_acumulada > 0 && (
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Mora</Text>
                    <Text style={[styles.gridValue, { color: Colors.warning }]}>{formatCurrency(p.mora_acumulada)}</Text>
                  </View>
                )}
              </View>

              {/* Progress */}
              <View style={styles.progressSection}>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: `${Math.min(progreso * 100, 100)}%`, backgroundColor: color }]} />
                </View>
                <Text style={styles.progressText}>{p.cuotas_pagadas} de {p.cuotas_total} cuotas pagadas</Text>
              </View>

              {/* Próxima cuota box */}
              {pc && (
                <View style={[styles.proximaBox, { borderColor: `${dl!.color}40`, backgroundColor: `${dl!.color}08` }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.proximaTitle, { color: dl!.color }]}>📅 Cuota {pc.numero} — {fmtFecha(pc.fecha_vencimiento)}</Text>
                    <Text style={styles.proximaSub}>{dl!.text}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.proximaMonto, { color: dl!.color }]}>{formatCurrency(pc.monto_total)}</Text>
                    <Text style={styles.proximaDesglose}>Cap. {formatCurrency(pc.capital)} · Int. {formatCurrency(pc.interes)}</Text>
                  </View>
                </View>
              )}
              {!pc && p.estado !== 'cancelado' && (
                <View style={[styles.proximaBox, { borderColor: `${Colors.success}40`, backgroundColor: `${Colors.success}08` }]}>
                  <Text style={[styles.proximaTitle, { color: Colors.success }]}>✅ Todas las cuotas pagadas</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {prestamos.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No hay préstamos registrados para este cliente</Text>
          </View>
        )}

        {/* ── Recent payments ── */}
        {pagos_recientes.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Últimos Pagos</Text>
            <View style={styles.pagosCard}>
              {pagos_recientes.map((pg, i) => (
                <View key={i} style={[styles.pagoRow, i < pagos_recientes.length - 1 && styles.pagoRowBorder]}>
                  <View style={styles.pagoIconWrap}>
                    <Text style={styles.pagoIcon}>{METODO_ICON[pg.metodo_pago] ?? '💰'}</Text>
                  </View>
                  <View style={styles.pagoInfo}>
                    <Text style={styles.pagoConcepto}>
                      Cuota {pg.numero_cuota} · Préstamo {formatCurrency(pg.prestamo_monto)}
                    </Text>
                    <Text style={styles.pagoFecha}>{fmtFecha(pg.fecha_pago)} · {pg.metodo_pago}</Text>
                    {pg.mora_cobrada > 0 && (
                      <Text style={styles.pagoMora}>+ Mora: {formatCurrency(pg.mora_cobrada)}</Text>
                    )}
                  </View>
                  <Text style={styles.pagoMonto}>{formatCurrency(pg.monto_pagado)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: Colors.background },
  errorState:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  errorText:   { fontSize: 16, color: Colors.muted },
  retryBtn:    { marginTop: 16, padding: 12 },
  retryText:   { color: Colors.accent, fontWeight: '700' },

  // Header
  header: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 20, color: Colors.white },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white, flex: 1, textAlign: 'center' },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  waBtn: { width: 36, height: 36, backgroundColor: '#25D366', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  waBtnText: { fontSize: 18 },
  pdfBtn: { backgroundColor: Colors.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, minWidth: 70, alignItems: 'center' },
  pdfBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  scroll: { padding: 14, gap: 12 },

  // Profile card
  profileCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  profileAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarText: { fontSize: 18, fontWeight: '900', color: Colors.accent },
  profileInfo: { flex: 1, gap: 3 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  profileName: { fontSize: 16, fontWeight: '800', color: Colors.text },
  estadoCliBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  profileDoc: { fontSize: 12, color: Colors.muted },
  profileContacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  profileContact: { fontSize: 11, color: Colors.muted },
  scoringBadge: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
  },
  scoringValue: { fontSize: 16, fontWeight: '900' },
  scoringLabel: { fontSize: 8, color: Colors.muted, fontWeight: '700', letterSpacing: 0.5 },

  // KPIs
  kpiCard: {
    backgroundColor: Colors.primary, borderRadius: 18, padding: 6,
    flexDirection: 'row', flexWrap: 'wrap',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  kpiItem: { width: '33.33%', padding: 14, alignItems: 'center', gap: 4 },
  kpiValue: { fontSize: 16, fontWeight: '900' },
  kpiLabel: { fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'center' },

  // Mora alert
  moraAlerta: {
    flexDirection: 'row', gap: 10, backgroundColor: `${Colors.warning}12`,
    borderRadius: 10, padding: 12, borderWidth: 1, borderColor: `${Colors.warning}30`,
  },
  moraAlertaIcon: { fontSize: 18 },
  moraAlertaText: { fontSize: 13, color: Colors.warning, fontWeight: '700' },
  moraAlertaSub: { fontSize: 11, color: Colors.muted, marginTop: 2 },

  // Section title
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Loan card
  prestamoCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16, gap: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  prestamoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  prestamoMonto: { fontSize: 20, fontWeight: '900', color: Colors.text },
  prestamoSub: { fontSize: 11, color: Colors.muted, marginTop: 3, textTransform: 'capitalize' },
  estadoBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  estadoText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  prestamoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { flex: 1, minWidth: '22%', backgroundColor: `${Colors.primary}06`, borderRadius: 8, padding: 10 },
  gridLabel: { fontSize: 10, color: Colors.muted, marginBottom: 3 },
  gridValue: { fontSize: 13, fontWeight: '800' },
  gridSub: { fontSize: 9, color: Colors.muted, marginTop: 2 },

  progressSection: { gap: 4 },
  progressBg: { height: 5, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 11, color: Colors.muted },

  // Próxima cuota
  proximaBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, borderWidth: 1.5, padding: 12, gap: 8,
  },
  proximaTitle: { fontSize: 13, fontWeight: '700' },
  proximaSub: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  proximaMonto: { fontSize: 16, fontWeight: '900' },
  proximaDesglose: { fontSize: 10, color: Colors.muted, marginTop: 2 },

  empty: { backgroundColor: Colors.surface, borderRadius: 12, padding: 24, alignItems: 'center' },
  emptyText: { color: Colors.muted, fontSize: 13, textAlign: 'center' },

  // Pagos recientes
  pagosCard: {
    backgroundColor: Colors.surface, borderRadius: 14, overflow: 'hidden',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  pagoRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  pagoRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  pagoIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: `${Colors.primary}10`, alignItems: 'center', justifyContent: 'center',
  },
  pagoIcon: { fontSize: 18 },
  pagoInfo: { flex: 1, gap: 2 },
  pagoConcepto: { fontSize: 13, fontWeight: '600', color: Colors.text },
  pagoFecha: { fontSize: 11, color: Colors.muted, textTransform: 'capitalize' },
  pagoMora: { fontSize: 11, color: Colors.warning, fontWeight: '600' },
  pagoMonto: { fontSize: 15, fontWeight: '800', color: Colors.success },
});
