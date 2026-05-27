import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Image, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { configuracionService, Configuracion } from '@/services/configuracion.service';
import { formatCurrency } from '@/utils/amortizacion';
import { Colors } from '@/constants/colors';

// ─── HTML para PDF ────────────────────────────────────────────

function generarHtmlReciboAbono(params: {
  reciboNum: string;
  clienteNombre: string;
  montoAbonado: number;
  saldoAnterior: number;
  saldoNuevo: number;
  nCuotas: number;
  nuevaCuota?: number;
  metodo: string;
  fechaHora: string;
  config: Configuracion;
  cancelado?: boolean;
  interesAhorrado?: number;
}): string {
  const { config } = params;
  const s = config.simbolo_moneda;
  const metodosLabel: Record<string, string> = {
    efectivo: 'Efectivo', transferencia: 'Transferencia Bancaria', cheque: 'Cheque',
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', Arial, sans-serif; background: #f4f4f0; display: flex; justify-content: center; padding: 30px 20px; }
    .ticket {
      background: white; width: 100%; max-width: 420px;
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
    }
    .header {
      background: ${config.color_primario};
      padding: 28px 28px 20px; text-align: center;
    }
    .logo-wrap {
      width: 72px; height: 72px; border-radius: 16px;
      background: rgba(255,255,255,0.12); margin: 0 auto 14px;
      display: flex; align-items: center; justify-content: center; overflow: hidden;
    }
    .logo-wrap img { width: 100%; height: 100%; object-fit: contain; }
    .logo-icon { font-size: 36px; }
    .empresa-nombre { font-size: 22px; font-weight: 900; color: #F5A623; letter-spacing: 2px; }
    .empresa-slogan { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 4px; }
    .empresa-datos { margin-top: 10px; font-size: 10px; color: rgba(255,255,255,0.45); line-height: 1.6; }
    .recibo-banda {
      background: #F5A623; padding: 10px 28px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .recibo-label { font-size: 9px; font-weight: 700; color: ${config.color_primario}; letter-spacing: 2px; text-transform: uppercase; }
    .recibo-num { font-size: 15px; font-weight: 900; color: ${config.color_primario}; }
    .recibo-fecha { font-size: 9px; color: ${config.color_primario}; opacity: 0.7; text-align: right; }
    .body { padding: 22px 28px; }
    .section-label { font-size: 9px; font-weight: 700; color: #aaa; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
    .cliente-nombre { font-size: 17px; font-weight: 800; color: #111; }
    .cliente-sub { font-size: 12px; color: #888; margin-top: 3px; }
    .cut-line { border: none; border-top: 2px dashed #e5e5e5; margin: 18px 0; }
    .desglose-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .desglose-row:last-child { border-bottom: none; }
    .desglose-label { font-size: 12px; color: #666; }
    .desglose-value { font-size: 12px; font-weight: 600; color: #111; }
    .valor-saldo-nuevo { color: #2563eb !important; }
    .valor-nueva-cuota { color: #7c3aed !important; }
    .total-box {
      background: ${config.color_primario}; border-radius: 14px;
      padding: 18px 22px; margin: 18px 0; text-align: center;
    }
    .total-label { font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.5); letter-spacing: 2px; text-transform: uppercase; }
    .total-monto { font-size: 38px; font-weight: 900; color: #F5A623; letter-spacing: -1px; margin-top: 4px; }
    .total-metodo { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 6px; }
    .sello-wrap { text-align: center; margin: 10px 0 18px; }
    .sello {
      display: inline-block; border: 3px solid #22c55e;
      border-radius: 8px; padding: 6px 18px;
      font-size: 18px; font-weight: 900; color: #22c55e; letter-spacing: 4px;
      transform: rotate(-12deg); margin: 10px auto;
    }
    .footer {
      background: #fafaf8; border-top: 1px solid #f0f0f0;
      padding: 14px 28px; text-align: center;
      font-size: 9px; color: #bbb; line-height: 1.6;
    }
  </style></head><body>
  <div class="ticket">
    <div class="header">
      <div class="logo-wrap">
        ${config.logo_url
          ? `<img src="${config.logo_url}" alt="logo" />`
          : `<span class="logo-icon">🏦</span>`}
      </div>
      <div class="empresa-nombre">${config.nombre_empresa}</div>
      ${config.slogan ? `<div class="empresa-slogan">${config.slogan}</div>` : ''}
      <div class="empresa-datos">
        ${config.direccion ? `${config.direccion}<br>` : ''}
        ${config.telefono ? `Tel: ${config.telefono}  ` : ''}${config.email ? `· ${config.email}` : ''}
        ${config.ruc_nit ? `<br>RUC/NIT: ${config.ruc_nit}` : ''}
      </div>
    </div>

    <div class="recibo-banda">
      <div>
        <div class="recibo-label">Comprobante de Abono a Capital</div>
        <div class="recibo-num">${params.reciboNum}</div>
      </div>
      <div class="recibo-fecha">${params.fechaHora}</div>
    </div>

    <div class="body">
      <div style="margin-bottom:18px">
        <div class="section-label">Cliente</div>
        <div class="cliente-nombre">${params.clienteNombre}</div>
        <div class="cliente-sub">Abono a capital &nbsp;·&nbsp; ${metodosLabel[params.metodo] ?? params.metodo}</div>
      </div>

      <hr class="cut-line">

      <div class="section-label">Detalle del abono</div>
      <div class="desglose-row">
        <span class="desglose-label">Saldo anterior del capital</span>
        <span class="desglose-value">${s}${params.saldoAnterior.toLocaleString('es', { minimumFractionDigits: 2 })}</span>
      </div>
      <div class="desglose-row">
        <span class="desglose-label">Monto abonado</span>
        <span class="desglose-value" style="color:#16a34a">-${s}${params.montoAbonado.toLocaleString('es', { minimumFractionDigits: 2 })}</span>
      </div>
      <div class="desglose-row">
        <span class="desglose-label">Nuevo saldo de capital</span>
        <span class="desglose-value valor-saldo-nuevo">${s}${params.saldoNuevo.toLocaleString('es', { minimumFractionDigits: 2 })}</span>
      </div>
      <div class="desglose-row">
        <span class="desglose-label">Cuotas restantes</span>
        <span class="desglose-value">${params.nCuotas} cuota${params.nCuotas !== 1 ? 's' : ''}</span>
      </div>
      ${params.nuevaCuota !== undefined && params.nuevaCuota > 0 ? `
      <div class="desglose-row">
        <span class="desglose-label">Nueva cuota mensual</span>
        <span class="desglose-value valor-nueva-cuota">${s}${params.nuevaCuota.toLocaleString('es', { minimumFractionDigits: 2 })}</span>
      </div>` : ''}
      ${params.interesAhorrado !== undefined && params.interesAhorrado > 0 ? `
      <div class="desglose-row">
        <span class="desglose-label">Intereses futuros cancelados</span>
        <span class="desglose-value" style="color:#16a34a">${s}${params.interesAhorrado.toLocaleString('es', { minimumFractionDigits: 2 })}</span>
      </div>` : ''}

      <div class="total-box">
        <div class="total-label">Monto Abonado</div>
        <div class="total-monto">${s}${params.montoAbonado.toLocaleString('es', { minimumFractionDigits: 2 })}</div>
        <div class="total-metodo">${metodosLabel[params.metodo] ?? params.metodo}</div>
      </div>

      <div class="sello-wrap"><div class="sello">ABONADO</div></div>

      <div style="text-align:center;margin:10px 0 4px;font-size:11px;color:#888">
        ${params.cancelado
          ? 'Préstamo liquidado anticipadamente. Conserve este comprobante.'
          : 'Gracias por su pago. El cronograma ha sido actualizado.'}
      </div>

      ${params.cancelado ? `
      <div style="background:#dcfce7;border:1px solid #86efac;border-radius:12px;padding:16px;text-align:center;margin:14px 0">
        <div style="font-size:28px">🎉</div>
        <div style="font-size:15px;font-weight:900;color:#166534;margin-top:6px;letter-spacing:1px">¡PRÉSTAMO SALDADO!</div>
        <div style="font-size:11px;color:#166534;margin-top:4px">Ha cancelado su préstamo en su totalidad.<br>Su garantía quedará liberada a la brevedad.</div>
      </div>` : ''}
    </div>

    <div class="footer">
      Este comprobante acredita el abono a capital realizado.<br>
      ${config.nombre_empresa}${config.ruc_nit ? ` · RUC/NIT: ${config.ruc_nit}` : ''}<br>
      ${params.fechaHora}
    </div>
  </div>
  </body></html>`;
}

// ─── Componente ───────────────────────────────────────────────

export default function ReciboAbonoScreen() {
  const insets = useSafeAreaInsets();
  const {
    reciboNum, clienteNombre, montoAbonado,
    saldoAnterior, saldoNuevo, nCuotas,
    nuevaCuota, metodo, fechaAbono,
    prestamoId, fromClienteId, modo, cancelado, interesAhorrado,
  } = useLocalSearchParams<Record<string, string>>();

  const [config, setConfig] = useState<Configuracion | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [exportando, setExportando] = useState(false);

  const monto   = Number(montoAbonado  ?? 0);
  const saldoAnt = Number(saldoAnterior ?? 0);
  const saldoNvo = Number(saldoNuevo    ?? 0);
  const nCuotasN = Number(nCuotas       ?? 0);
  const nuevaCuotaN = nuevaCuota !== undefined && nuevaCuota !== '' ? Number(nuevaCuota) : undefined;
  const esCancelado = cancelado === '1' || saldoNvo <= 0;
  const interesAhorradoN = Number(interesAhorrado ?? 0);

  const fechaHora = (() => {
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    if (fechaAbono) {
      // ISO timestamp or YYYY-MM-DD
      const d = fechaAbono.includes('T') ? new Date(fechaAbono) : (() => {
        const [y, m, day] = fechaAbono.split('-').map(Number);
        return new Date(y, m - 1, day);
      })();
      const fechaStr = d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });
      return `${fechaStr} · ${hora}`;
    }
    return ahora.toLocaleString('es', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  })();

  useEffect(() => {
    configuracionService.get()
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setLoadingConfig(false));
  }, []);

  const metodosLabel: Record<string, string> = {
    efectivo: '💵 Efectivo', transferencia: '🏦 Transferencia', cheque: '📄 Cheque',
  };

  const colorPrim = config?.color_primario ?? Colors.primary;
  const empresa   = config?.nombre_empresa ?? 'PRÉSTAMOS AB';
  const slogan    = config?.slogan ?? 'Sistema de Créditos con Garantía';
  const logoUrl   = config?.logo_url;

  const exportarPDF = async () => {
    if (!config) return;
    setExportando(true);
    try {
      const html = generarHtmlReciboAbono({
        reciboNum:     reciboNum ?? '',
        clienteNombre: clienteNombre ?? '',
        montoAbonado:  monto,
        saldoAnterior: saldoAnt,
        saldoNuevo:    saldoNvo,
        nCuotas:       nCuotasN,
        nuevaCuota:    nuevaCuotaN,
        metodo:        metodo ?? 'efectivo',
        fechaHora,
        config,
        cancelado:     esCancelado,
        interesAhorrado: interesAhorradoN,
      });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Recibo ${reciboNum}`,
        });
      } else {
        Alert.alert('PDF generado', uri);
      }
    } catch {
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setExportando(false);
    }
  };

  const handleVolver = () => {
    if (modo === 'ver') {
      router.back();
    } else if (prestamoId) {
      router.replace(`/(app)/creditos/${prestamoId}${fromClienteId ? `?fromClienteId=${fromClienteId}` : ''}` as any);
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {/* Barra superior */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8, backgroundColor: colorPrim }]}>
        <View style={{ width: 36 }} />
        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle}>Comprobante de Abono</Text>
          <Text style={styles.topBarSub}>
            {modo === 'ver' ? 'Recibo histórico' : 'Abono aplicado exitosamente'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleVolver}
          style={styles.topBarCloseBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.topBarClose}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Tarjeta recibo */}
        <View style={styles.ticket}>

          {/* Cabecera empresa */}
          <View style={[styles.ticketHeader, { backgroundColor: colorPrim }]}>
            {loadingConfig ? (
              <ActivityIndicator color={Colors.accent} style={{ marginBottom: 12 }} />
            ) : (
              <View style={styles.logoWrap}>
                {logoUrl ? (
                  <Image source={{ uri: logoUrl }} style={styles.logoImg} resizeMode="contain" />
                ) : (
                  <Text style={styles.logoIconFallback}>🏦</Text>
                )}
              </View>
            )}
            <Text style={styles.empresaNombre}>{empresa}</Text>
            <Text style={styles.empresaSlogan}>{slogan}</Text>
            {config?.direccion && <Text style={styles.empresaDato}>{config.direccion}</Text>}
            {config?.telefono  && <Text style={styles.empresaDato}>Tel: {config.telefono}</Text>}
            {config?.ruc_nit   && <Text style={styles.empresaDato}>RUC/NIT: {config.ruc_nit}</Text>}
          </View>

          {/* Banda número de recibo */}
          <View style={styles.reciboBanda}>
            <View>
              <Text style={styles.reciboLabel}>COMPROBANTE DE ABONO A CAPITAL</Text>
              <Text style={styles.reciboNum}>{reciboNum}</Text>
            </View>
            <Text style={styles.reciboFecha}>{fechaHora}</Text>
          </View>

          <View style={styles.ticketBody}>

            {/* Cliente */}
            <View style={styles.clienteSection}>
              <Text style={styles.microLabel}>CLIENTE</Text>
              <Text style={styles.clienteNombre}>{clienteNombre}</Text>
              <Text style={styles.clienteSub}>
                Abono a capital &nbsp;·&nbsp; {metodosLabel[metodo ?? 'efectivo']}
              </Text>
            </View>

            {/* Línea punteada */}
            <View style={styles.cutLine}>
              <View style={styles.cutCircleLeft} />
              <View style={styles.cutCircleRight} />
            </View>

            {/* Desglose */}
            <Text style={[styles.microLabel, { marginBottom: 8 }]}>DETALLE DEL ABONO</Text>

            <View style={styles.desgloseRow}>
              <Text style={styles.desgloseLabel}>Saldo anterior del capital</Text>
              <Text style={styles.desgloseValue}>{formatCurrency(saldoAnt)}</Text>
            </View>
            <View style={styles.desgloseRow}>
              <Text style={styles.desgloseLabel}>Monto abonado</Text>
              <Text style={[styles.desgloseValue, { color: Colors.success }]}>
                -{formatCurrency(monto)}
              </Text>
            </View>
            <View style={[styles.desgloseRow, styles.desgloseRowDestacado]}>
              <Text style={[styles.desgloseLabel, { fontWeight: '700', color: Colors.text }]}>
                Nuevo saldo de capital
              </Text>
              <Text style={[styles.desgloseValue, { color: '#2563eb', fontSize: 15 }]}>
                {formatCurrency(saldoNvo)}
              </Text>
            </View>
            <View style={styles.desgloseRow}>
              <Text style={styles.desgloseLabel}>Cuotas restantes</Text>
              <Text style={styles.desgloseValue}>
                {nCuotasN} cuota{nCuotasN !== 1 ? 's' : ''}
              </Text>
            </View>
            {nuevaCuotaN !== undefined && nuevaCuotaN > 0 && (
              <View style={styles.desgloseRow}>
                <Text style={styles.desgloseLabel}>Nueva cuota mensual</Text>
                <Text style={[styles.desgloseValue, { color: '#7c3aed', fontSize: 14 }]}>
                  {formatCurrency(nuevaCuotaN)}
                </Text>
              </View>
            )}
            {interesAhorradoN > 0 && (
              <View style={styles.desgloseRow}>
                <Text style={styles.desgloseLabel}>Intereses futuros cancelados</Text>
                <Text style={[styles.desgloseValue, { color: Colors.success }]}>
                  {formatCurrency(interesAhorradoN)}
                </Text>
              </View>
            )}

            {/* Total */}
            <View style={[styles.totalBox, { backgroundColor: colorPrim }]}>
              <Text style={styles.totalLabel}>MONTO ABONADO</Text>
              <Text style={styles.totalMonto}>{formatCurrency(monto)}</Text>
              <Text style={styles.totalMetodo}>{metodosLabel[metodo ?? 'efectivo']}</Text>
            </View>

            {/* Sello ABONADO */}
            <View style={styles.selloWrap}>
              <View style={styles.sello}>
                <Text style={styles.selloText}>ABONADO</Text>
              </View>
            </View>

            <Text style={styles.graciasText}>
              {esCancelado
                ? 'Préstamo liquidado anticipadamente. Conserve este comprobante.'
                : 'Gracias por su pago. El cronograma ha sido actualizado.'}
            </Text>

            {esCancelado && (
              <View style={styles.canceladoBox}>
                <Text style={styles.canceladoIcon}>🎉</Text>
                <Text style={styles.canceladoTitulo}>¡PRÉSTAMO SALDADO!</Text>
                <Text style={styles.canceladoSub}>
                  Ha cancelado su préstamo en su totalidad.{'\n'}Su garantía quedará liberada a la brevedad.
                </Text>
              </View>
            )}
          </View>

          {/* Footer del ticket */}
          <View style={styles.ticketFooter}>
            <Text style={styles.footerText}>
              Este comprobante acredita el abono a capital realizado.
            </Text>
            <Text style={styles.footerEmpresa}>
              {empresa}{config?.ruc_nit ? ` · RUC/NIT: ${config.ruc_nit}` : ''}
            </Text>
          </View>
        </View>

        {/* Botones de acción */}
        <View style={styles.acciones}>
          <TouchableOpacity
            style={[styles.btnPDF, { backgroundColor: colorPrim }]}
            onPress={exportarPDF}
            disabled={exportando || !config}
          >
            <Text style={styles.btnPDFIcon}>{exportando ? '⏳' : '📄'}</Text>
            <Text style={styles.btnPDFText}>
              {exportando ? 'Generando PDF...' : 'Exportar y Compartir PDF'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnVolver} onPress={handleVolver}>
            <Text style={styles.btnVolverText}>
              {modo === 'ver' ? 'Volver' : 'Volver al Préstamo'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEDE8' },

  topBar: {
    paddingHorizontal: 20, paddingBottom: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  topBarCenter: { flex: 1, alignItems: 'center' },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: Colors.white },
  topBarSub: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  topBarCloseBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  topBarClose: { fontSize: 18, color: 'rgba(255,255,255,0.7)', fontWeight: '700' },

  scroll: { padding: 16, gap: 14 },

  ticket: {
    backgroundColor: Colors.white, borderRadius: 20, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14, shadowRadius: 20, elevation: 8,
  },

  ticketHeader: { paddingVertical: 28, paddingHorizontal: 28, alignItems: 'center', gap: 4 },
  logoWrap: {
    width: 76, height: 76, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 10, overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%' },
  logoIconFallback: { fontSize: 36 },
  empresaNombre: { fontSize: 22, fontWeight: '900', color: Colors.accent, letterSpacing: 2 },
  empresaSlogan: { fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.5, marginTop: 2 },
  empresaDato: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 },

  reciboBanda: {
    backgroundColor: Colors.accent, paddingHorizontal: 22, paddingVertical: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  reciboLabel: {
    fontSize: 9, fontWeight: '700', color: Colors.primary,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  reciboNum: { fontSize: 14, fontWeight: '900', color: Colors.primary, marginTop: 2 },
  reciboFecha: { fontSize: 9, color: `${Colors.primary}88`, textAlign: 'right', maxWidth: 110 },

  ticketBody: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
  microLabel: {
    fontSize: 9, fontWeight: '700', color: '#aaa',
    letterSpacing: 2, textTransform: 'uppercase',
  },

  clienteSection: { marginBottom: 18, gap: 4 },
  clienteNombre: { fontSize: 18, fontWeight: '800', color: Colors.text, marginTop: 4 },
  clienteSub: { fontSize: 12, color: Colors.muted },

  cutLine: {
    height: 1, marginVertical: 16, position: 'relative',
    borderTopWidth: 1.5, borderTopColor: '#e0e0e0', borderStyle: 'dashed',
  },
  cutCircleLeft: {
    position: 'absolute', left: -36, top: -8,
    width: 16, height: 16, borderRadius: 8, backgroundColor: '#EDEDE8',
  },
  cutCircleRight: {
    position: 'absolute', right: -36, top: -8,
    width: 16, height: 16, borderRadius: 8, backgroundColor: '#EDEDE8',
  },

  desgloseRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  desgloseRowDestacado: {
    backgroundColor: '#eff6ff', borderRadius: 8,
    paddingHorizontal: 10, marginTop: 2, borderBottomWidth: 0,
  },
  desgloseLabel: { fontSize: 13, color: Colors.muted, flex: 1 },
  desgloseValue: { fontSize: 13, fontWeight: '700', color: Colors.text },

  totalBox: {
    borderRadius: 16, padding: 22, alignItems: 'center', gap: 4, marginTop: 18,
  },
  totalLabel: {
    fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.5)',
    letterSpacing: 2, textTransform: 'uppercase',
  },
  totalMonto: { fontSize: 38, fontWeight: '900', color: Colors.accent, letterSpacing: -1 },
  totalMetodo: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 },

  selloWrap: { alignItems: 'center', marginTop: 16, marginBottom: 8 },
  sello: {
    borderWidth: 3, borderColor: `${Colors.success}80`, borderRadius: 8,
    paddingHorizontal: 22, paddingVertical: 7,
    transform: [{ rotate: '-12deg' }],
  },
  selloText: { fontSize: 18, fontWeight: '900', color: Colors.success, letterSpacing: 5 },

  graciasText: {
    fontSize: 11, color: Colors.muted, textAlign: 'center',
    marginTop: 10, marginBottom: 4, fontStyle: 'italic',
  },

  ticketFooter: {
    backgroundColor: '#fafaf8', borderTopWidth: 1, borderTopColor: '#f0f0f0',
    padding: 16, alignItems: 'center', gap: 4,
  },
  footerText: { fontSize: 10, color: '#bbb', textAlign: 'center' },
  footerEmpresa: { fontSize: 10, color: '#ccc', fontWeight: '600' },

  acciones: { gap: 10 },
  btnPDF: {
    borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  btnPDFIcon: { fontSize: 20 },
  btnPDFText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  btnVolver: {
    backgroundColor: 'transparent', borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  btnVolverText: { fontSize: 14, fontWeight: '700', color: Colors.muted },

  canceladoBox: {
    backgroundColor: `${Colors.success}12`, borderRadius: 14, padding: 18,
    alignItems: 'center', gap: 4, marginTop: 12, marginBottom: 6,
    borderWidth: 1, borderColor: `${Colors.success}30`,
  },
  canceladoIcon: { fontSize: 32, marginBottom: 4 },
  canceladoTitulo: { fontSize: 16, fontWeight: '900', color: Colors.success, letterSpacing: 1 },
  canceladoSub: { fontSize: 12, color: Colors.success, textAlign: 'center', lineHeight: 18, opacity: 0.8 },
});
