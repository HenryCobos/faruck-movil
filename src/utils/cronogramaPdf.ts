import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { ResumenAmortizacion } from './amortizacion';
import { configuracionService, Configuracion } from '../services/configuracion.service';

export interface DatosCronogramaPdf {
  resumen: ResumenAmortizacion;
  monto: number;
  tasaMensual: number;   // porcentaje (ej. 3.5)
  plazoMeses: number;
  tipoAmortizacion: string;
  comisionApertura?: number;
  clienteNombre?: string;
  observaciones?: string;
  empresa?: Configuracion; // si no se pasa se carga automáticamente desde configuración
}

const AMORT_LABEL: Record<string, string> = {
  francesa:                'Francesa (cuota fija)',
  alemana:                 'Alemana (capital fijo)',
  solo_interes:            'Solo intereses + capital al final',
  solo_interes_adelantado: 'Solo intereses adelantados + capital al final',
  anticipado:              'Interés anticipado + capital al final',
};

function fmt(value: number): string {
  const decimals = value % 1 !== 0 ? 2 : 0;
  return '$' + value.toLocaleString('es', { minimumFractionDigits: decimals, maximumFractionDigits: 2 });
}

function fmtFecha(date: Date): string {
  return date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

function filasTabla(cuotas: ResumenAmortizacion['cuotas']): string {
  return cuotas.map((c, idx) => {
    const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
    return `
      <tr style="background:${bg}">
        <td class="center">${c.numero}</td>
        <td class="center">${fmtFecha(c.fechaVencimiento)}</td>
        <td class="right bold">${fmt(c.cuotaTotal)}</td>
        <td class="right" style="color:#3b82f6">${fmt(c.capital)}</td>
        <td class="right" style="color:#f59e0b">${fmt(c.interes)}</td>
        <td class="right" style="color:#10b981">${fmt(c.saldo)}</td>
      </tr>`;
  }).join('');
}

function generarHtml(datos: DatosCronogramaPdf & { empresa: Configuracion }): string {
  const { resumen, monto, tasaMensual, plazoMeses, tipoAmortizacion, comisionApertura, clienteNombre, empresa } = datos;
  const costoTotal = resumen.totalCapital > 0
    ? ((resumen.totalIntereses / resumen.totalCapital) * 100).toFixed(2)
    : '0.00';
  const fechaGeneracion = new Date().toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const logoHtml = empresa.logo_url
    ? `<img class="brand-logo" src="${empresa.logo_url}" alt="Logo" onerror="this.style.display='none'" />`
    : '';

  const contactLines = [
    empresa.ruc_nit   ? `<div class="ci-row">RUC/NIT: ${empresa.ruc_nit}</div>` : '',
    empresa.telefono  ? `<div class="ci-row">Tel: ${empresa.telefono}</div>` : '',
    empresa.email     ? `<div class="ci-row">${empresa.email}</div>` : '',
    empresa.direccion ? `<div class="ci-row">${empresa.direccion}</div>` : '',
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cronograma de Pagos</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }

    /* ── Header ── */
    .header { background: linear-gradient(135deg, #1e3a5f 0%, #0ea5e9 100%); color: #fff; padding: 22px 32px 18px; }
    .header-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }

    /* Lado izquierdo: logo + nombre */
    .brand-section { display: flex; align-items: center; gap: 12px; }
    .brand-logo { height: 48px; width: auto; border-radius: 6px; object-fit: contain; background: rgba(255,255,255,0.12); padding: 4px; }
    .brand-name { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; line-height: 1.1; }
    .brand-slogan { font-size: 9.5px; color: rgba(255,255,255,0.7); margin-top: 3px; letter-spacing: 0.3px; }

    /* Lado derecho: datos de empresa + fecha */
    .header-right { text-align: right; }
    .ci-row { font-size: 9.5px; color: rgba(255,255,255,0.75); line-height: 1.6; }
    .header-date { font-size: 9px; color: rgba(255,255,255,0.5); margin-top: 6px; }

    /* Franja del título del documento */
    .doc-title-bar { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); }
    .doc-title { font-size: 11px; color: rgba(255,255,255,0.9); letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700; }

    /* ── Info section ── */
    .info-section { padding: 20px 32px 0; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
    .info-row { display: flex; justify-content: space-between; padding: 9px 16px; border-bottom: 1px solid #f1f5f9; }
    .info-row:last-child { border-bottom: none; }
    .info-row.col-span { grid-column: 1 / -1; }
    .info-label { color: #64748b; font-size: 11px; }
    .info-value { font-weight: 700; font-size: 11px; color: #0f172a; text-align: right; }
    .info-value.accent { color: #0ea5e9; }
    .col-left { border-right: 1px solid #e2e8f0; }

    /* ── Stats ── */
    .stats { display: flex; gap: 10px; padding: 0 32px 20px; }
    .stat-card { flex: 1; border-radius: 10px; padding: 14px 12px; text-align: center; }
    .stat-card.blue   { background: #eff6ff; border: 1px solid #bfdbfe; }
    .stat-card.amber  { background: #fffbeb; border: 1px solid #fde68a; }
    .stat-card.green  { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .stat-card.slate  { background: #f8fafc; border: 1px solid #e2e8f0; }
    .stat-val { font-size: 15px; font-weight: 900; color: #0f172a; }
    .stat-val.blue  { color: #2563eb; }
    .stat-val.amber { color: #d97706; }
    .stat-val.green { color: #16a34a; }
    .stat-val.slate { color: #475569; }
    .stat-lbl { font-size: 9px; color: #94a3b8; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px; }

    /* ── Table ── */
    .table-wrap { padding: 0 32px 32px; }
    .table-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
    thead tr { background: #1e3a5f; color: #fff; }
    thead th { padding: 10px 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    tbody td { padding: 8px 12px; font-size: 11px; border-bottom: 1px solid #f1f5f9; }
    tbody tr:last-child td { border-bottom: none; }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: 700; }

    /* ── Totals row ── */
    .totals-row td { background: #f8fafc; font-weight: 700; border-top: 2px solid #e2e8f0; color: #0f172a; font-size: 11px; }

    /* ── Footer ── */
    .footer { border-top: 1px solid #e2e8f0; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; color: #94a3b8; font-size: 9px; }
    .footer-note { max-width: 60%; line-height: 1.5; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-top">
      <!-- Izquierda: logo + nombre empresa + slogan -->
      <div class="brand-section">
        ${logoHtml}
        <div>
          <div class="brand-name">${empresa.nombre_empresa}</div>
          ${empresa.slogan ? `<div class="brand-slogan">${empresa.slogan}</div>` : ''}
        </div>
      </div>
      <!-- Derecha: datos de contacto + fecha de generación -->
      <div class="header-right">
        ${contactLines}
        <div class="header-date">Generado el ${fechaGeneracion}</div>
      </div>
    </div>
    <!-- Título del documento separado visualmente -->
    <div class="doc-title-bar">
      <span class="doc-title">&#128197; Cronograma de Pagos</span>
    </div>
  </div>

  <!-- Información del préstamo -->
  <div class="info-section">
    <div class="info-grid">
      <div class="info-row col-left">
        <span class="info-label">Tipo de Amortización</span>
        <span class="info-value accent">${AMORT_LABEL[tipoAmortizacion] ?? tipoAmortizacion}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Plazo</span>
        <span class="info-value">${plazoMeses} meses</span>
      </div>
      <div class="info-row col-left">
        <span class="info-label">Monto Principal</span>
        <span class="info-value accent">${fmt(monto)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Tasa Mensual</span>
        <span class="info-value">${tasaMensual.toFixed(2)}%</span>
      </div>
      ${(() => {
        // TEA real = (1 + tasa_mensual)^12 - 1, donde tasa_mensual es fracción decimal
        const teaReal = ((Math.pow(1 + tasaMensual / 100, 12) - 1) * 100).toFixed(2);
        const tanNominal = (tasaMensual * 12).toFixed(2);
        return comisionApertura && comisionApertura > 0 ? `
      <div class="info-row col-left">
        <span class="info-label">Comisión de Apertura</span>
        <span class="info-value">${fmt(comisionApertura)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">TAN / TEA</span>
        <span class="info-value">${tanNominal}% / ${teaReal}%</span>
      </div>` : `
      <div class="info-row col-span" style="grid-column:1/-1">
        <span class="info-label">Tasa Anual Nominal (TAN) / TEA</span>
        <span class="info-value">${tanNominal}% / ${teaReal}%</span>
      </div>`;
      })()}
      ${clienteNombre ? `
      <div class="info-row col-span" style="grid-column:1/-1; background:#f8fafc;">
        <span class="info-label">Cliente / Prestatario</span>
        <span class="info-value">${clienteNombre}</span>
      </div>` : ''}
    </div>
  </div>

  <!-- Stats -->
  <div class="stats">
    <div class="stat-card blue">
      <div class="stat-val blue">${fmt(resumen.primeraCuota)}</div>
      <div class="stat-lbl">${tipoAmortizacion === 'anticipado' ? 'Interés al desembolso' : '1ª Cuota'}</div>
    </div>
    <div class="stat-card amber">
      <div class="stat-val amber">${fmt(resumen.totalIntereses)}</div>
      <div class="stat-lbl">Total Intereses</div>
    </div>
    <div class="stat-card green">
      <div class="stat-val green">${fmt(resumen.totalPagar)}</div>
      <div class="stat-lbl">Total a Pagar</div>
    </div>
    <div class="stat-card slate">
      <div class="stat-val slate">${costoTotal}%</div>
      <div class="stat-lbl">Costo Total</div>
    </div>
  </div>

  <!-- Tabla de cuotas -->
  <div class="table-wrap">
    <div class="table-title">Detalle de Cuotas (${resumen.cuotas.length})</div>
    <table>
      <thead>
        <tr>
          <th class="center">N°</th>
          <th class="center">Vencimiento</th>
          <th class="right">Cuota Total</th>
          <th class="right">Capital</th>
          <th class="right">Interés</th>
          <th class="right">Saldo</th>
        </tr>
      </thead>
      <tbody>
        ${filasTabla(resumen.cuotas)}
        <tr class="totals-row">
          <td class="center" colspan="2">TOTALES</td>
          <td class="right">${fmt(resumen.totalPagar)}</td>
          <td class="right" style="color:#2563eb">${fmt(resumen.totalCapital)}</td>
          <td class="right" style="color:#d97706">${fmt(resumen.totalIntereses)}</td>
          <td class="right">—</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-note">
      Este cronograma es referencial. Las fechas exactas se confirman al momento del desembolso.
      ${tipoAmortizacion === 'anticipado' ? 'En interés anticipado, la cuota de intereses vence el día del desembolso (entrega del crédito), no al fin del primer mes.' : ''}
    </div>
    <div>${empresa.nombre_empresa} · ${new Date().getFullYear()}</div>
  </div>

</body>
</html>`;
}

export async function exportarCronogramaPdf(datos: DatosCronogramaPdf): Promise<void> {
  // Cargar configuración de empresa (usa caché en memoria — no hace fetch extra si ya se cargó)
  const empresa = datos.empresa ?? await configuracionService.get();
  const html = generarHtml({ ...datos, empresa });
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const disponible = await Sharing.isAvailableAsync();
  if (!disponible) {
    throw new Error('La función de compartir no está disponible en este dispositivo.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Exportar cronograma',
    UTI: 'com.adobe.pdf',
  });
}
