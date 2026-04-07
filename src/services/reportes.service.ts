import { supabase } from '../lib/supabase';
import { configuracionService, Configuracion } from './configuracion.service';

export interface PrestamoCartera {
  id: string;
  cliente_nombre: string;
  cliente_apellido: string;
  cliente_documento: string;
  monto_principal: number;
  tasa_mensual: number;
  plazo_meses: number;
  fecha_desembolso: string;
  estado: string;
  cuotas_pagadas: number;
  cuotas_total: number;
  saldo_pendiente: number;
  garantia_tipo: string;
  garantia_descripcion: string;
  // Campos de rentabilidad
  interes_proyectado: number;   // total de interés que genera el préstamo
  interes_cobrado: number;      // interés ya cobrado (cuotas pagadas)
  total_a_cobrar: number;       // capital + interés total del préstamo
  total_cobrado: number;        // capital + interés ya recibido
  mora_cobrada: number;         // mora real cobrada (desde pagos)
  rentabilidad: number;         // interes_proyectado / monto_principal * 100
}

export interface ClienteMoroso {
  cliente_id: string;
  nombre: string;
  apellido: string;
  documento: string;
  telefono: string;
  cuotas_vencidas: number;
  monto_vencido: number;
  mora_total: number;
  dias_mayor_mora: number;
  prestamos_activos: number;
}

export interface ResumenCartera {
  total_prestamos: number;
  activos: number;
  cancelados: number;
  vencidos: number;
  monto_total_cartera: number;
  monto_por_cobrar: number;
  tasa_mora: number;
  // Métricas de rentabilidad global
  total_interes_proyectado: number; // suma de intereses proyectados (cartera activa)
  total_a_recuperar: number;        // capital + intereses totales
  total_recuperado: number;         // capital + interés ya cobrado
  total_mora_cobrada: number;       // mora cobrada en toda la cartera
  rentabilidad_global: number;      // total_interes_proyectado / monto_total_cartera * 100
}

export const reportesService = {
  async getCartera(estado?: string): Promise<PrestamoCartera[]> {
    let q = supabase
      .from('prestamos')
      .select(`
        id, monto_principal, tasa_mensual, plazo_meses, fecha_desembolso, estado,
        clientes(nombre, apellido, documento_numero),
        garantias(tipo, descripcion),
        cuotas(id, estado, monto_total, capital, interes, pagos(mora_cobrada))
      `)
      .order('created_at', { ascending: false });

    if (estado) q = q.eq('estado', estado);

    const { data, error } = await q;
    if (error) throw error;

    return (data ?? []).map((p: any) => {
      const cuotas = p.cuotas ?? [];
      const cuotasPagadas = cuotas.filter((c: any) => c.estado === 'pagada');
      const cuotasPendientes = cuotas.filter((c: any) => c.estado !== 'pagada');

      // Capital
      const saldo_pendiente = cuotasPendientes.reduce((s: number, c: any) => s + Number(c.capital), 0);

      // Interés
      const interes_proyectado = cuotas.reduce((s: number, c: any) => s + Number(c.interes), 0);
      const interes_cobrado    = cuotasPagadas.reduce((s: number, c: any) => s + Number(c.interes), 0);

      // Totales
      const total_a_cobrar = cuotas.reduce((s: number, c: any) => s + Number(c.monto_total), 0);
      const capital_cobrado = cuotasPagadas.reduce((s: number, c: any) => s + Number(c.capital), 0);
      const total_cobrado   = capital_cobrado + interes_cobrado;

      // Mora real (suma de pagos.mora_cobrada)
      const mora_cobrada = cuotas.reduce((s: number, c: any) => {
        const pags = c.pagos ?? [];
        return s + pags.reduce((ps: number, pg: any) => ps + Number(pg.mora_cobrada ?? 0), 0);
      }, 0);

      const principal = Number(p.monto_principal);

      return {
        id: p.id,
        cliente_nombre: p.clientes?.nombre ?? '',
        cliente_apellido: p.clientes?.apellido ?? '',
        cliente_documento: p.clientes?.documento_numero ?? '',
        monto_principal: principal,
        tasa_mensual: Number(p.tasa_mensual),
        plazo_meses: p.plazo_meses,
        fecha_desembolso: p.fecha_desembolso,
        estado: p.estado,
        cuotas_pagadas: cuotasPagadas.length,
        cuotas_total: cuotas.length,
        saldo_pendiente:     Math.round(saldo_pendiente * 100) / 100,
        garantia_tipo:       p.garantias?.tipo ?? '',
        garantia_descripcion: p.garantias?.descripcion ?? '',
        interes_proyectado:  Math.round(interes_proyectado * 100) / 100,
        interes_cobrado:     Math.round(interes_cobrado * 100) / 100,
        total_a_cobrar:      Math.round(total_a_cobrar * 100) / 100,
        total_cobrado:       Math.round(total_cobrado * 100) / 100,
        mora_cobrada:        Math.round(mora_cobrada * 100) / 100,
        rentabilidad:        principal > 0 ? Math.round((interes_proyectado / principal) * 10000) / 100 : 0,
      };
    });
  },

  async getResumenCartera(): Promise<ResumenCartera> {
    const { data, error } = await supabase
      .from('prestamos')
      .select('estado, monto_principal, cuotas(estado, capital, interes, monto_total, pagos(mora_cobrada))');
    if (error) throw error;

    const prestamos = data ?? [];
    const total    = prestamos.length;
    const activos  = prestamos.filter((p: any) => p.estado === 'activo').length;
    const cancelados = prestamos.filter((p: any) => p.estado === 'cancelado').length;
    const vencidos = prestamos.filter((p: any) => p.estado === 'vencido').length;

    const activosList = prestamos.filter((p: any) => p.estado === 'activo');

    const monto_total = activosList
      .reduce((s: number, p: any) => s + Number(p.monto_principal), 0);

    const monto_cobrar = activosList.reduce((s: number, p: any) => {
      const cuotas = p.cuotas ?? [];
      return s + cuotas
        .filter((c: any) => c.estado !== 'pagada')
        .reduce((cs: number, c: any) => cs + Number(c.capital), 0);
    }, 0);

    const cuotas_vencidas = prestamos.reduce((s: number, p: any) => {
      return s + (p.cuotas ?? []).filter((c: any) => c.estado === 'vencida').length;
    }, 0);
    const cuotas_total_pendientes = prestamos.reduce((s: number, p: any) => {
      return s + (p.cuotas ?? []).filter((c: any) => c.estado !== 'pagada').length;
    }, 0);

    // Rentabilidad — sólo sobre cartera activa
    const total_interes_proyectado = activosList.reduce((s: number, p: any) => {
      return s + (p.cuotas ?? []).reduce((cs: number, c: any) => cs + Number(c.interes), 0);
    }, 0);

    const total_a_recuperar = activosList.reduce((s: number, p: any) => {
      return s + (p.cuotas ?? []).reduce((cs: number, c: any) => cs + Number(c.monto_total), 0);
    }, 0);

    const total_recuperado = activosList.reduce((s: number, p: any) => {
      const cuotasPagadas = (p.cuotas ?? []).filter((c: any) => c.estado === 'pagada');
      return s + cuotasPagadas.reduce((cs: number, c: any) => cs + Number(c.capital) + Number(c.interes), 0);
    }, 0);

    const total_mora_cobrada = prestamos.reduce((s: number, p: any) => {
      return s + (p.cuotas ?? []).reduce((cs: number, c: any) => {
        const pags = c.pagos ?? [];
        return cs + pags.reduce((ps: number, pg: any) => ps + Number(pg.mora_cobrada ?? 0), 0);
      }, 0);
    }, 0);

    return {
      total_prestamos:          total,
      activos,
      cancelados,
      vencidos,
      monto_total_cartera:      Math.round(monto_total * 100) / 100,
      monto_por_cobrar:         Math.round(monto_cobrar * 100) / 100,
      tasa_mora:                cuotas_total_pendientes > 0
                                  ? Math.round((cuotas_vencidas / cuotas_total_pendientes) * 10000) / 100
                                  : 0,
      total_interes_proyectado: Math.round(total_interes_proyectado * 100) / 100,
      total_a_recuperar:        Math.round(total_a_recuperar * 100) / 100,
      total_recuperado:         Math.round(total_recuperado * 100) / 100,
      total_mora_cobrada:       Math.round(total_mora_cobrada * 100) / 100,
      rentabilidad_global:      monto_total > 0
                                  ? Math.round((total_interes_proyectado / monto_total) * 10000) / 100
                                  : 0,
    };
  },

  async getMorosos(): Promise<ClienteMoroso[]> {
    const { data, error } = await supabase
      .from('clientes')
      .select(`
        id, nombre, apellido, documento_numero, telefono,
        prestamos(
          id, estado,
          cuotas(id, estado, monto_total, fecha_vencimiento)
        )
      `)
      .eq('estado', 'moroso');
    if (error) throw error;

    const hoy = new Date();

    return (data ?? []).map((cl: any) => {
      const prestamos = cl.prestamos ?? [];
      const cuotasVencidas = prestamos
        .filter((p: any) => p.estado === 'activo')
        .flatMap((p: any) => (p.cuotas ?? []).filter((c: any) => c.estado === 'vencida'));

      const monto_vencido = cuotasVencidas.reduce((s: number, c: any) => s + Number(c.monto_total), 0);
      const mora_total = cuotasVencidas.reduce((s: number, c: any) => {
        const venc = new Date(c.fecha_vencimiento);
        const dias = Math.max(0, Math.floor((hoy.getTime() - venc.getTime()) / 86400000));
        return s + Number(c.monto_total) * 0.001 * dias;
      }, 0);

      const dias_mayor_mora = cuotasVencidas.reduce((max: number, c: any) => {
        const dias = Math.floor((hoy.getTime() - new Date(c.fecha_vencimiento).getTime()) / 86400000);
        return Math.max(max, dias);
      }, 0);

      return {
        cliente_id: cl.id,
        nombre: cl.nombre,
        apellido: cl.apellido,
        documento: cl.documento_numero,
        telefono: cl.telefono,
        cuotas_vencidas: cuotasVencidas.length,
        monto_vencido: Math.round(monto_vencido * 100) / 100,
        mora_total: Math.round(mora_total * 100) / 100,
        dias_mayor_mora,
        prestamos_activos: prestamos.filter((p: any) => p.estado === 'activo').length,
      };
    }).filter((c: ClienteMoroso) => c.cuotas_vencidas > 0)
      .sort((a: ClienteMoroso, b: ClienteMoroso) => b.dias_mayor_mora - a.dias_mayor_mora);
  },

  async generarHtmlReporte(tipo: 'cartera' | 'morosos', data: any[], resumen?: ResumenCartera): Promise<string> {
    const fecha = new Date().toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });
    let cfg: Configuracion;
    try { cfg = await configuracionService.get(); }
    catch { cfg = { id: '', nombre_empresa: 'PRÉSTAMOS AB', moneda: 'Bs', simbolo_moneda: '$', tasa_mora_diaria: 0.001, tasa_mora_label: '0.1% diario', dias_gracia: 0, color_primario: '#0D1B2A', updated_at: '' }; }

    const s       = cfg.simbolo_moneda;
    const empresa = cfg.nombre_empresa;
    const slogan  = cfg.slogan ?? 'Sistema de Créditos con Garantía';
    const color   = cfg.color_primario;
    const acento  = '#F5A623';

    // Línea de contacto con todos los datos disponibles
    const contactLine = [
      cfg.direccion,
      cfg.telefono  ? `Tel: ${cfg.telefono}`      : null,
      cfg.email,
      cfg.ruc_nit   ? `RUC/NIT: ${cfg.ruc_nit}`  : null,
    ].filter(Boolean).join(' · ');

    // Cabecera con logo, nombre, slogan y contacto (usa <table> para máx. compatibilidad en PDF)
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

    if (tipo === 'cartera') {
      const carteraData = data as PrestamoCartera[];

      // Totals row
      const tot_principal  = carteraData.reduce((s, p) => s + p.monto_principal, 0);
      const tot_interes    = carteraData.reduce((s, p) => s + p.interes_proyectado, 0);
      const tot_cobrar     = carteraData.reduce((s, p) => s + p.total_a_cobrar, 0);
      const tot_cobrado    = carteraData.reduce((s, p) => s + p.total_cobrado, 0);
      const tot_saldo      = carteraData.reduce((s, p) => s + p.saldo_pendiente, 0);
      const rent_global    = tot_principal > 0 ? Math.round((tot_interes / tot_principal) * 10000) / 100 : 0;

      const filas = carteraData.map(p => `
        <tr>
          <td>${p.cliente_nombre} ${p.cliente_apellido}</td>
          <td>${p.cliente_documento}</td>
          <td style="text-align:right">${s}${p.monto_principal.toLocaleString('es')}</td>
          <td style="text-align:right;color:#0d6e4f">${s}${p.interes_proyectado.toLocaleString('es')}</td>
          <td style="text-align:right;font-weight:700">${s}${p.total_a_cobrar.toLocaleString('es')}</td>
          <td style="text-align:right;color:#0369a1">${s}${p.total_cobrado.toLocaleString('es')}</td>
          <td style="text-align:right">${s}${p.saldo_pendiente.toLocaleString('es')}</td>
          <td style="text-align:center">${p.tasa_mensual}%</td>
          <td style="text-align:center;color:#7c3aed;font-weight:700">+${p.rentabilidad}%</td>
          <td style="text-align:center">${p.cuotas_pagadas}/${p.cuotas_total}</td>
          <td>${p.garantia_tipo}</td>
          <td><span class="estado ${p.estado}">${p.estado.toUpperCase()}</span></td>
        </tr>
      `).join('');

      const filaTotales = `
        <tr class="totales">
          <td colspan="2" style="font-weight:900;font-size:12px">TOTALES (${carteraData.length} préstamos)</td>
          <td style="text-align:right;font-weight:900">${s}${tot_principal.toLocaleString('es')}</td>
          <td style="text-align:right;font-weight:900;color:#0d6e4f">${s}${tot_interes.toLocaleString('es')}</td>
          <td style="text-align:right;font-weight:900">${s}${tot_cobrar.toLocaleString('es')}</td>
          <td style="text-align:right;font-weight:900;color:#0369a1">${s}${tot_cobrado.toLocaleString('es')}</td>
          <td style="text-align:right;font-weight:900">${s}${tot_saldo.toLocaleString('es')}</td>
          <td></td>
          <td style="text-align:center;font-weight:900;color:#7c3aed">+${rent_global}%</td>
          <td colspan="3"></td>
        </tr>`;

      return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 30px; color: #333; }
        .titulo { font-size: 18px; font-weight: 900; color: ${color}; margin-bottom: 4px; }
        .sub { color: #888; font-size: 13px; margin-bottom: 20px; }
        .kpis { display: flex; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; }
        .kpi { background: #f5f5f5; border-radius: 8px; padding: 12px 16px; flex: 1; min-width: 100px; }
        .kpi-value { font-size: 17px; font-weight: 900; color: ${color}; }
        .kpi-value.green { color: #0d9488; }
        .kpi-value.purple { color: #7c3aed; }
        .kpi-label { font-size: 10px; color: #888; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: ${color}; color: white; padding: 9px 6px; text-align: left; }
        td { padding: 7px 6px; border-bottom: 1px solid #eee; }
        tr:nth-child(even) { background: #fafafa; }
        tr.totales { background: #f0f4ff !important; }
        tr.totales td { border-top: 2px solid ${color}; border-bottom: 2px solid ${color}; }
        .estado { padding: 3px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
        .activo { background: #d1faf0; color: #0d9488; }
        .cancelado { background: #e0f2fe; color: #0369a1; }
        .vencido { background: #fee2e2; color: #dc2626; }
        .footer { margin-top: 30px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
      </style></head><body>
      ${encabezado}
      <div class="titulo">Reporte de Cartera</div>
      <div class="sub">Generado el ${fecha}</div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-value">${resumen?.total_prestamos ?? 0}</div><div class="kpi-label">Total Préstamos</div></div>
        <div class="kpi"><div class="kpi-value">${resumen?.activos ?? 0}</div><div class="kpi-label">Activos</div></div>
        <div class="kpi"><div class="kpi-value">${s}${(resumen?.monto_total_cartera ?? 0).toLocaleString('es')}</div><div class="kpi-label">Capital Prestado</div></div>
        <div class="kpi"><div class="kpi-value green">${s}${(resumen?.total_interes_proyectado ?? 0).toLocaleString('es')}</div><div class="kpi-label">Intereses Proyectados</div></div>
        <div class="kpi"><div class="kpi-value">${s}${(resumen?.total_a_recuperar ?? 0).toLocaleString('es')}</div><div class="kpi-label">Total a Recuperar</div></div>
        <div class="kpi"><div class="kpi-value purple">+${resumen?.rentabilidad_global ?? 0}%</div><div class="kpi-label">Rendimiento Global</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Cliente</th><th>Documento</th>
          <th style="text-align:right">Monto</th>
          <th style="text-align:right">Interés Proy.</th>
          <th style="text-align:right">Total a Cobrar</th>
          <th style="text-align:right">Ya Cobrado</th>
          <th style="text-align:right">Saldo Cap.</th>
          <th style="text-align:center">Tasa</th>
          <th style="text-align:center">Rentab.</th>
          <th style="text-align:center">Cuotas</th>
          <th>Garantía</th><th>Estado</th>
        </tr></thead>
        <tbody>${filas}${filaTotales}</tbody>
      </table>
      <div class="footer">${empresa}${cfg.ruc_nit ? ` · RUC/NIT: ${cfg.ruc_nit}` : ''} · ${fecha}</div>
      </body></html>`;
    }

    // morosos
    const filas = (data as ClienteMoroso[]).map(m => `
      <tr>
        <td>${m.nombre} ${m.apellido}</td>
        <td>${m.documento}</td>
        <td>${m.telefono}</td>
        <td style="text-align:center;color:#dc2626;font-weight:700">${m.cuotas_vencidas}</td>
        <td style="text-align:right;color:#dc2626">${s}${m.monto_vencido.toLocaleString('es')}</td>
        <td style="text-align:right;color:#b45309">${s}${m.mora_total.toFixed(2)}</td>
        <td style="text-align:center;font-weight:700">${m.dias_mayor_mora} días</td>
      </tr>
    `).join('');

    // Para morosos, el encabezado usa color rojo oscuro en vez del color primario
    const encabezadoMorosos = encabezado.replace(
      `background:${color}`,
      'background:#7f1d1d',
    );

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; margin: 30px; color: #333; }
      .titulo { font-size: 18px; font-weight: 900; color: #dc2626; }
      .sub { color: #888; font-size: 13px; margin-bottom: 20px; }
      .alerta { background: #fee2e2; border-left: 4px solid #dc2626; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; color: #7f1d1d; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #7f1d1d; color: white; padding: 10px 8px; text-align: left; }
      td { padding: 8px; border-bottom: 1px solid #eee; }
      tr:nth-child(even) { background: #fff5f5; }
      .footer { margin-top: 30px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
    </style></head><body>
    ${encabezadoMorosos}
    <div class="titulo">⚠️ Clientes Morosos</div>
    <div class="sub">Generado el ${fecha}</div>
    <div class="alerta">Total de clientes en mora: ${data.length}</div>
    <table>
      <thead><tr><th>Cliente</th><th>Documento</th><th>Teléfono</th><th>Cuotas Vencidas</th><th>Monto Vencido</th><th>Mora</th><th>Mayor Mora</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="footer">${empresa}${cfg.ruc_nit ? ` · RUC/NIT: ${cfg.ruc_nit}` : ''} · ${fecha}</div>
    </body></html>`;
  },
};
