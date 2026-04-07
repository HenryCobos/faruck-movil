import { supabase, withTimeout } from '../lib/supabase';

export interface DashboardStatsReal {
  cartera_total: number;
  prestamos_activos: number;
  cuotas_vencidas: number;
  /** Total cobrado este mes (capital + intereses + mora) — métrica de flujo de caja */
  ingresos_mes: number;
  /** Solo intereses + mora + comisiones del mes — ingreso contable real */
  ingresos_contables_mes: number;
  cobros_hoy: number;
  cuotas_pendientes_hoy: number;
  en_mora: number;
  /** Ingresos contables − egresos del mes */
  utilidad_mes: number;
  clientes_activos: number;
  garantias_en_custodia: number;
}

export interface ActividadReciente {
  id: string;
  tipo: 'pago' | 'prestamo' | 'cliente' | 'mora';
  descripcion: string;
  monto?: number;
  fecha: string;
}

export const dashboardService = {
  async getStats(): Promise<DashboardStatsReal> {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioMes = new Date();
    inicioMes.setDate(1);
    const desdeMes = inicioMes.toISOString().split('T')[0];

    const [
      carteraRes, activosRes, vencidasRes,
      cobrosHoyRes, pendientesHoyRes, moraRes,
      ingresosRes, clientesRes, garantiasRes,
      resultadoMesRes,
    ] = await withTimeout(Promise.all([
      supabase.from('prestamos').select('monto_principal').eq('estado', 'activo'),
      supabase.from('prestamos').select('id', { count: 'exact' }).eq('estado', 'activo'),
      supabase.from('cuotas').select('id', { count: 'exact' }).eq('estado', 'vencida'),
      supabase.from('pagos').select('monto_pagado').gte('fecha_pago', hoy),
      supabase.from('cuotas').select('id', { count: 'exact' })
        .eq('estado', 'pendiente').eq('fecha_vencimiento', hoy),
      supabase.from('cuotas').select('id', { count: 'exact' })
        .eq('estado', 'vencida').gt('fecha_vencimiento', '2000-01-01'),
      supabase.from('pagos').select('monto_pagado, mora_cobrada')
        .gte('fecha_pago', desdeMes),
      supabase.from('clientes').select('id', { count: 'exact' }).eq('estado', 'activo'),
      supabase.from('garantias').select('id', { count: 'exact' }).eq('estado', 'en_garantia'),
      // Vista contable del mes actual para ingresos y utilidad reales
      supabase.from('v_estado_resultados').select('*').eq('mes', desdeMes).maybeSingle(),
    ]));

    const cartera_total = (carteraRes.data ?? [])
      .reduce((s: number, p: any) => s + Number(p.monto_principal), 0);

    const cobros_hoy = (cobrosHoyRes.data ?? [])
      .reduce((s: number, p: any) => s + Number(p.monto_pagado), 0);

    // Total cobrado en el mes (capital + intereses + mora) — flujo de caja
    const total_cobrado_mes = (ingresosRes.data ?? [])
      .reduce((s: number, p: any) => s + Number(p.monto_pagado), 0);

    // Ingresos y utilidad contables reales desde la vista v_estado_resultados
    const rm = (resultadoMesRes as any).data;
    const ingresos_contables_mes = rm
      ? Math.round(((rm.ingresos_intereses ?? 0) + (rm.ingresos_mora ?? 0) + (rm.ingresos_comisiones ?? 0)) * 100) / 100
      : 0;
    const utilidad_mes = rm
      ? Math.round((rm.utilidad_neta ?? 0) * 100) / 100
      : 0;

    return {
      cartera_total: Math.round(cartera_total * 100) / 100,
      prestamos_activos: activosRes.count ?? 0,
      cuotas_vencidas: vencidasRes.count ?? 0,
      ingresos_mes: Math.round(total_cobrado_mes * 100) / 100,
      ingresos_contables_mes,
      cobros_hoy: Math.round(cobros_hoy * 100) / 100,
      cuotas_pendientes_hoy: pendientesHoyRes.count ?? 0,
      en_mora: moraRes.count ?? 0,
      utilidad_mes,
      clientes_activos: clientesRes.count ?? 0,
      garantias_en_custodia: garantiasRes.count ?? 0,
    };
  },

  async getActividadReciente(limite = 8): Promise<ActividadReciente[]> {
    const [pagosRes, prestamosRes, clientesRes] = await Promise.all([
      supabase
        .from('pagos')
        .select(`id, monto_pagado, fecha_pago, cuotas(prestamo_id, prestamos(clientes(nombre, apellido)))`)
        .order('fecha_pago', { ascending: false })
        .limit(4),
      supabase
        .from('prestamos')
        .select(`id, monto_principal, created_at, clientes(nombre, apellido)`)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('clientes')
        .select('id, nombre, apellido, created_at')
        .order('created_at', { ascending: false })
        .limit(2),
    ]);

    if (pagosRes.error) console.warn('dashboard.actividad pagos:', pagosRes.error.message);
    if (prestamosRes.error) console.warn('dashboard.actividad prestamos:', prestamosRes.error.message);
    if (clientesRes.error) console.warn('dashboard.actividad clientes:', clientesRes.error.message);

    const actividad: ActividadReciente[] = [];

    for (const p of (pagosRes.data ?? [])) {
      const cliente = (p as any).cuotas?.prestamos?.clientes;
      actividad.push({
        id: p.id,
        tipo: 'pago',
        descripcion: `Pago recibido — ${cliente?.nombre ?? ''} ${cliente?.apellido ?? ''}`.trim(),
        monto: Number(p.monto_pagado),
        fecha: p.fecha_pago,
      });
    }
    for (const pr of (prestamosRes.data ?? [])) {
      const cliente = (pr as any).clientes;
      actividad.push({
        id: pr.id,
        tipo: 'prestamo',
        descripcion: `Nuevo préstamo — ${cliente?.nombre ?? ''} ${cliente?.apellido ?? ''}`.trim(),
        monto: Number(pr.monto_principal),
        fecha: pr.created_at,
      });
    }
    for (const cl of (clientesRes.data ?? [])) {
      actividad.push({
        id: cl.id,
        tipo: 'cliente',
        descripcion: `Nuevo cliente — ${cl.nombre} ${cl.apellido}`,
        fecha: cl.created_at,
      });
    }

    return actividad
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, limite);
  },

  async getAlerts(): Promise<{ tipo: 'danger' | 'warning' | 'info'; icon: string; mensaje: string }[]> {
    const hoy = new Date().toISOString().split('T')[0];
    const en3dias = new Date();
    en3dias.setDate(en3dias.getDate() + 3);
    const hasta = en3dias.toISOString().split('T')[0];

    const [vencidasRes, proxRes] = await Promise.all([
      supabase.from('cuotas').select('id', { count: 'exact' }).eq('estado', 'vencida'),
      supabase.from('cuotas').select('id', { count: 'exact' })
        .eq('estado', 'pendiente').gt('fecha_vencimiento', hoy).lte('fecha_vencimiento', hasta),
    ]);

    if (vencidasRes.error) console.warn('dashboard.alerts vencidas:', vencidasRes.error.message);
    if (proxRes.error) console.warn('dashboard.alerts proximas:', proxRes.error.message);

    const alertas = [];
    const vencidas = vencidasRes.count ?? 0;
    const proximas = proxRes.count ?? 0;

    if (vencidas > 0)
      alertas.push({ tipo: 'danger' as const, icon: '🚨', mensaje: `${vencidas} cuota${vencidas > 1 ? 's' : ''} vencida${vencidas > 1 ? 's' : ''} sin pagar` });
    if (proximas > 0)
      alertas.push({ tipo: 'warning' as const, icon: '⏰', mensaje: `${proximas} cuota${proximas > 1 ? 's' : ''} vence${proximas > 1 ? 'n' : ''} en los próximos 3 días` });
    if (alertas.length === 0)
      alertas.push({ tipo: 'info' as const, icon: '✅', mensaje: 'Todo al día. ¡Sin alertas pendientes!' });

    return alertas;
  },
};
