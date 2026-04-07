import { supabase } from '../lib/supabase';
import { configuracionService, Configuracion } from './configuracion.service';

export interface AsientoContable {
  id: string;
  fecha: string;
  concepto: string;
  debe: number;
  haber: number;
  cuenta_id: string;
  referencia_id?: string;
  tipo_referencia?: string;
  usuario_id?: string;
  created_at: string;
  plan_cuentas?: { codigo: string; nombre: string; tipo: string };
}

export interface EstadoResultados {
  mes: string;
  ingresos_intereses: number;
  ingresos_comisiones: number;
  ingresos_mora: number;
  egresos: number;
  utilidad_neta: number;
}

// Flujo de capital mensual derivado de prestamos + pagos
export interface CapitalFlowMensual {
  mes: string;              // ISO date first-of-month (YYYY-MM-01)
  capital_desplegado: number;  // monto_principal de nuevos préstamos ese mes
  prestamos_nuevos: number;    // cantidad de préstamos desembolsados
  capital_recuperado: number;  // capital de cuotas pagadas ese mes
  intereses_cobrados: number;  // interés de cuotas pagadas ese mes
  roi: number;                 // intereses_cobrados / capital_desplegado * 100
}

export interface ResumenContable {
  ingresos_mes: number;
  mora_mes: number;
  egresos_mes: number;
  utilidad_mes: number;
  cartera_vigente: number;
  total_cobrado_mes: number;
}

export const contabilidadService = {
  async getLibroDiario(limite = 50, offset = 0): Promise<AsientoContable[]> {
    const { data, error } = await supabase
      .from('asientos_contables')
      .select('*, plan_cuentas(codigo, nombre, tipo)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limite - 1);
    if (error) throw error;
    return (data ?? []) as AsientoContable[];
  },

  async getAsientosPorFecha(desde: string, hasta: string): Promise<AsientoContable[]> {
    const { data, error } = await supabase
      .from('asientos_contables')
      .select('*, plan_cuentas(codigo, nombre, tipo)')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AsientoContable[];
  },

  async getEstadoResultados(desde?: string, hasta?: string): Promise<EstadoResultados[]> {
    let q = supabase.from('v_estado_resultados').select('*');
    if (desde) q = q.gte('mes', desde);
    if (hasta) {
      // hasta is first-of-month; include the whole month by going to first of next month
      const d = new Date(hasta);
      d.setMonth(d.getMonth() + 1);
      q = q.lt('mes', d.toISOString().split('T')[0]);
    }
    q = q.order('mes', { ascending: false }).limit(60);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as EstadoResultados[];
  },

  async getResumenMes(): Promise<ResumenContable> {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const desde = inicioMes.toISOString().split('T')[0];
    const hasta = new Date().toISOString().split('T')[0];

    const [asientosRes, carteraRes] = await Promise.all([
      supabase
        .from('asientos_contables')
        .select('haber, debe, plan_cuentas(tipo, codigo)')
        .gte('fecha', desde)
        .lte('fecha', hasta),
      supabase
        .from('prestamos')
        .select('monto_principal')
        .eq('estado', 'activo'),
    ]);

    if (asientosRes.error) throw asientosRes.error;
    if (carteraRes.error) throw carteraRes.error;

    const asientos = asientosRes.data ?? [];
    const cartera = carteraRes.data ?? [];

    const ingresos_mes = asientos
      .filter((a: any) => a.plan_cuentas?.tipo === 'ingreso')
      .reduce((s: number, a: any) => s + Number(a.haber), 0);

    const mora_mes = asientos
      .filter((a: any) => a.plan_cuentas?.codigo === '4130')
      .reduce((s: number, a: any) => s + Number(a.haber), 0);

    const egresos_mes = asientos
      .filter((a: any) => a.plan_cuentas?.tipo === 'egreso')
      .reduce((s: number, a: any) => s + Number(a.debe), 0);

    const total_cobrado_mes = asientos
      .filter((a: any) => a.plan_cuentas?.codigo === '1110')
      .reduce((s: number, a: any) => s + Number(a.debe), 0);

    const cartera_vigente = cartera
      .reduce((s: number, p: any) => s + Number(p.monto_principal), 0);

    return {
      ingresos_mes: Math.round(ingresos_mes * 100) / 100,
      mora_mes: Math.round(mora_mes * 100) / 100,
      egresos_mes: Math.round(egresos_mes * 100) / 100,
      utilidad_mes: Math.round((ingresos_mes - egresos_mes) * 100) / 100,
      cartera_vigente: Math.round(cartera_vigente * 100) / 100,
      total_cobrado_mes: Math.round(total_cobrado_mes * 100) / 100,
    };
  },

  async getCapitalFlowMensual(desde?: string, hasta?: string): Promise<CapitalFlowMensual[]> {
    // Default to last 12 months when no range given
    if (!desde) {
      const d = new Date();
      d.setMonth(d.getMonth() - 11);
      d.setDate(1);
      desde = d.toISOString().split('T')[0];
    }
    let hastaExcl: string | undefined;
    if (hasta) {
      const d = new Date(hasta);
      d.setMonth(d.getMonth() + 1);
      hastaExcl = d.toISOString().split('T')[0];
    }
    const desdeStr = desde;

    let prestamosQ = supabase.from('prestamos')
      .select('monto_principal, fecha_desembolso')
      .gte('fecha_desembolso', desdeStr);
    if (hastaExcl) prestamosQ = prestamosQ.lt('fecha_desembolso', hastaExcl);

    let pagosQ = supabase.from('pagos')
      .select('fecha_pago, cuotas(capital, interes)')
      .gte('fecha_pago', desdeStr);
    if (hastaExcl) pagosQ = pagosQ.lt('fecha_pago', hastaExcl);

    const [prestamosRes, pagosRes] = await Promise.all([prestamosQ, pagosQ]);

    if (prestamosRes.error) throw prestamosRes.error;
    if (pagosRes.error) throw pagosRes.error;

    const mesKey = (d: string) => `${d.substring(0, 7)}-01`;

    const flowMap = new Map<string, CapitalFlowMensual>();
    const ensure = (m: string) => {
      if (!flowMap.has(m)) {
        flowMap.set(m, { mes: m, capital_desplegado: 0, prestamos_nuevos: 0, capital_recuperado: 0, intereses_cobrados: 0, roi: 0 });
      }
      return flowMap.get(m)!;
    };

    for (const p of prestamosRes.data ?? []) {
      const e = ensure(mesKey(p.fecha_desembolso));
      e.capital_desplegado += Number(p.monto_principal);
      e.prestamos_nuevos   += 1;
    }

    for (const pg of pagosRes.data ?? []) {
      const e = ensure(mesKey((pg as any).fecha_pago));
      const c = (pg as any).cuotas;
      if (c) {
        e.capital_recuperado += Number(c.capital  ?? 0);
        e.intereses_cobrados += Number(c.interes  ?? 0);
      }
    }

    return Array.from(flowMap.values())
      .map(e => ({
        ...e,
        capital_desplegado:  Math.round(e.capital_desplegado  * 100) / 100,
        capital_recuperado:  Math.round(e.capital_recuperado  * 100) / 100,
        intereses_cobrados:  Math.round(e.intereses_cobrados  * 100) / 100,
        roi: e.capital_desplegado > 0
          ? Math.round((e.intereses_cobrados / e.capital_desplegado) * 10000) / 100
          : 0,
      }))
      .sort((a, b) => b.mes.localeCompare(a.mes));
  },

  async generarHtmlEstadoResultados(
    datos: EstadoResultados[],
    flujo: CapitalFlowMensual[],
  ): Promise<string> {
    const fecha = new Date().toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });

    let cfg: Configuracion;
    try { cfg = await configuracionService.get(); }
    catch { cfg = { id: '', nombre_empresa: 'PRÉSTAMOS AB', moneda: 'Bs', simbolo_moneda: '$', tasa_mora_diaria: 0.001, tasa_mora_label: '0.1% diario', dias_gracia: 0, color_primario: '#0D1B2A', updated_at: '' }; }

    const s       = cfg.simbolo_moneda;
    const empresa = cfg.nombre_empresa;
    const slogan  = cfg.slogan ?? '';
    const color   = cfg.color_primario;
    const acento  = '#F5A623';

    const contactLine = [
      cfg.direccion,
      cfg.telefono ? `Tel: ${cfg.telefono}` : null,
      cfg.email,
      cfg.ruc_nit  ? `RUC/NIT: ${cfg.ruc_nit}` : null,
    ].filter(Boolean).join(' · ');

    const encabezado = `
      <table style="width:100%;background:${color};border-radius:10px;margin-bottom:24px;border-collapse:collapse">
        <tr>
          <td style="padding:20px 12px 20px 20px;width:76px;vertical-align:middle">
            <div style="width:64px;height:64px;background:rgba(255,255,255,0.15);border-radius:10px;overflow:hidden;text-align:center;line-height:64px">
              ${cfg.logo_url
                ? `<img src="${cfg.logo_url}" alt="logo" style="width:64px;height:64px;object-fit:contain;display:block" />`
                : `<span style="font-size:30px;line-height:64px">🏦</span>`}
            </div>
          </td>
          <td style="padding:20px 20px 20px 8px;vertical-align:middle">
            <div style="font-size:22px;font-weight:900;color:${acento};letter-spacing:2px;margin-bottom:3px">${empresa}</div>
            ${slogan ? `<div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:5px">${slogan}</div>` : ''}
            ${contactLine ? `<div style="font-size:10px;color:rgba(255,255,255,0.45);line-height:1.8">${contactLine}</div>` : ''}
          </td>
        </tr>
      </table>`;

    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const mesLabel = (iso: string) => {
      const d = new Date(iso);
      return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
    };

    // Annual totals
    const totales = datos.reduce((acc, d) => ({
      intereses:   acc.intereses   + d.ingresos_intereses,
      comisiones:  acc.comisiones  + d.ingresos_comisiones,
      mora:        acc.mora        + d.ingresos_mora,
      egresos:     acc.egresos     + d.egresos,
      utilidad:    acc.utilidad    + d.utilidad_neta,
    }), { intereses: 0, comisiones: 0, mora: 0, egresos: 0, utilidad: 0 });

    const totalIngresos  = totales.intereses + totales.comisiones + totales.mora;
    const margenAnual    = totalIngresos > 0 ? Math.round((totales.utilidad / totalIngresos) * 100) : 0;
    const mejorMes       = datos.reduce((best, d) => d.utilidad_neta > best.utilidad_neta ? d : best, datos[0] ?? { mes: '', utilidad_neta: 0 });

    const flowMap = new Map(flujo.map(f => [f.mes, f]));

    // Main table rows — newest first
    const filas = datos.map((d, i) => {
      const ti = d.ingresos_intereses + d.ingresos_comisiones + d.ingresos_mora;
      const margen = ti > 0 ? Math.round((d.utilidad_neta / ti) * 100) : 0;
      const prev   = datos[i + 1];
      const mom    = prev && prev.utilidad_neta !== 0
        ? Math.round(((d.utilidad_neta - prev.utilidad_neta) / Math.abs(prev.utilidad_neta)) * 100)
        : null;
      const momLabel = mom !== null ? (mom >= 0 ? `▲ +${mom}%` : `▼ ${mom}%`) : '—';
      const momColor = mom !== null ? (mom >= 0 ? '#0d9488' : '#dc2626') : '#888';
      const flow     = flowMap.get(d.mes);

      return `
        <tr>
          <td style="font-weight:700">${mesLabel(d.mes)}</td>
          <td style="text-align:right;color:#0d9488">${s}${d.ingresos_intereses.toLocaleString('es')}</td>
          <td style="text-align:right;color:#0369a1">${s}${d.ingresos_comisiones.toLocaleString('es')}</td>
          <td style="text-align:right;color:#b45309">${s}${d.ingresos_mora.toLocaleString('es')}</td>
          <td style="text-align:right">${s}${ti.toLocaleString('es')}</td>
          <td style="text-align:right;color:#dc2626">${s}${d.egresos.toLocaleString('es')}</td>
          <td style="text-align:right;font-weight:800;color:${d.utilidad_neta >= 0 ? '#0d9488' : '#dc2626'}">${s}${d.utilidad_neta.toLocaleString('es')}</td>
          <td style="text-align:center;font-weight:700;color:#7c3aed">${margen}%</td>
          <td style="text-align:center;font-weight:700;color:${momColor}">${momLabel}</td>
          ${flow ? `<td style="text-align:right;color:#0369a1">${s}${flow.capital_desplegado.toLocaleString('es')}</td>
          <td style="text-align:right;color:#0d9488">${s}${flow.capital_recuperado.toLocaleString('es')}</td>
          <td style="text-align:center;color:#7c3aed">${flow.roi > 0 ? `+${flow.roi}%` : '—'}</td>` : '<td colspan="3" style="text-align:center;color:#ccc">—</td>'}
        </tr>`;
    }).join('');

    const filaTotales = `
      <tr style="background:#f0f4ff">
        <td style="font-weight:900;border-top:2px solid ${color};border-bottom:2px solid ${color}">TOTALES</td>
        <td style="text-align:right;font-weight:900;border-top:2px solid ${color};border-bottom:2px solid ${color};color:#0d9488">${s}${totales.intereses.toLocaleString('es')}</td>
        <td style="text-align:right;font-weight:900;border-top:2px solid ${color};border-bottom:2px solid ${color};color:#0369a1">${s}${totales.comisiones.toLocaleString('es')}</td>
        <td style="text-align:right;font-weight:900;border-top:2px solid ${color};border-bottom:2px solid ${color};color:#b45309">${s}${totales.mora.toLocaleString('es')}</td>
        <td style="text-align:right;font-weight:900;border-top:2px solid ${color};border-bottom:2px solid ${color}">${s}${totalIngresos.toLocaleString('es')}</td>
        <td style="text-align:right;font-weight:900;border-top:2px solid ${color};border-bottom:2px solid ${color};color:#dc2626">${s}${totales.egresos.toLocaleString('es')}</td>
        <td style="text-align:right;font-weight:900;border-top:2px solid ${color};border-bottom:2px solid ${color};color:${totales.utilidad >= 0 ? '#0d9488' : '#dc2626'}">${s}${totales.utilidad.toLocaleString('es')}</td>
        <td style="text-align:center;font-weight:900;border-top:2px solid ${color};border-bottom:2px solid ${color};color:#7c3aed">${margenAnual}%</td>
        <td colspan="4" style="border-top:2px solid ${color};border-bottom:2px solid ${color}"></td>
      </tr>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; margin: 30px; color: #333; }
      .titulo { font-size: 18px; font-weight: 900; color: ${color}; margin-bottom: 4px; }
      .sub { color: #888; font-size: 13px; margin-bottom: 20px; }
      .kpis { display: flex; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; }
      .kpi { background: #f5f5f5; border-radius: 8px; padding: 12px 16px; flex: 1; min-width: 90px; }
      .kpi-value { font-size: 17px; font-weight: 900; color: ${color}; }
      .kpi-value.green  { color: #0d9488; }
      .kpi-value.orange { color: #b45309; }
      .kpi-value.purple { color: #7c3aed; }
      .kpi-label { font-size: 10px; color: #888; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { background: ${color}; color: white; padding: 9px 6px; text-align: left; font-size: 10px; }
      td { padding: 7px 6px; border-bottom: 1px solid #eee; font-size: 11px; }
      tr:nth-child(even) { background: #fafafa; }
      .footer { margin-top: 30px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
    </style></head><body>
    ${encabezado}
    <div class="titulo">Estado de Resultados</div>
    <div class="sub">Generado el ${fecha} · Últimos ${datos.length} meses</div>

    <div class="kpis">
      <div class="kpi"><div class="kpi-value">${s}${totalIngresos.toLocaleString('es')}</div><div class="kpi-label">Ingresos Totales</div></div>
      <div class="kpi"><div class="kpi-value green">${s}${totales.intereses.toLocaleString('es')}</div><div class="kpi-label">Intereses</div></div>
      <div class="kpi"><div class="kpi-value orange">${s}${totales.mora.toLocaleString('es')}</div><div class="kpi-label">Mora</div></div>
      <div class="kpi"><div class="kpi-value">${s}${totales.comisiones.toLocaleString('es')}</div><div class="kpi-label">Comisiones</div></div>
      <div class="kpi"><div class="kpi-value" style="color:${totales.utilidad >= 0 ? '#0d9488' : '#dc2626'}">${s}${totales.utilidad.toLocaleString('es')}</div><div class="kpi-label">Utilidad Total</div></div>
      <div class="kpi"><div class="kpi-value purple">${margenAnual}%</div><div class="kpi-label">Margen Anual</div></div>
      ${mejorMes.mes ? `<div class="kpi"><div class="kpi-value" style="font-size:14px">${mesLabel(mejorMes.mes)}</div><div class="kpi-label">Mejor Mes</div></div>` : ''}
    </div>

    <table>
      <thead><tr>
        <th>Mes</th>
        <th style="text-align:right">Intereses</th>
        <th style="text-align:right">Comisiones</th>
        <th style="text-align:right">Mora</th>
        <th style="text-align:right">Total Ing.</th>
        <th style="text-align:right">Egresos</th>
        <th style="text-align:right">Utilidad</th>
        <th style="text-align:center">Margen</th>
        <th style="text-align:center">vs Anterior</th>
        <th style="text-align:right">Cap. Desplegado</th>
        <th style="text-align:right">Cap. Recuperado</th>
        <th style="text-align:center">ROI</th>
      </tr></thead>
      <tbody>${filas}${filaTotales}</tbody>
    </table>
    <div class="footer">${empresa}${cfg.ruc_nit ? ` · RUC/NIT: ${cfg.ruc_nit}` : ''} · ${fecha}</div>
    </body></html>`;
  },
};
