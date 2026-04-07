import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const notificacionesService = {
  async solicitarPermisos(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },

  async programarRecordatoriosDiarios(): Promise<void> {
    const permiso = await notificacionesService.solicitarPermisos();
    if (!permiso) return;

    // Cancelar notificaciones previas para no duplicar
    await Notifications.cancelAllScheduledNotificationsAsync();

    const hoy = new Date().toISOString().split('T')[0];
    const en3 = new Date();
    en3.setDate(en3.getDate() + 3);
    const hasta = en3.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('cuotas')
      .select('id, fecha_vencimiento, monto_total, prestamos(clientes(nombre, apellido))')
      .in('estado', ['pendiente', 'vencida'])
      .lte('fecha_vencimiento', hasta);

    if (error) { console.warn('notificaciones.programar error:', error.message); return; }
    if (!data?.length) return;

    const vencidas = data.filter((c: any) => c.fecha_vencimiento < hoy);
    const proximas = data.filter((c: any) => c.fecha_vencimiento >= hoy);

    // Notificación inmediata si hay cuotas vencidas
    if (vencidas.length > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 Cuotas vencidas',
          body: `Tienes ${vencidas.length} cuota(s) vencida(s) pendiente(s) de cobro`,
          sound: true,
          data: { tipo: 'vencidas', cantidad: vencidas.length },
        },
        trigger: null,
      });
    }

    // Recordatorio para cuotas próximas
    if (proximas.length > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Cuotas próximas a vencer',
          body: `${proximas.length} cuota(s) vencen en los próximos 3 días`,
          sound: true,
          data: { tipo: 'proximas', cantidad: proximas.length },
        },
        trigger: null,
      });
    }

    // Programar notificación diaria a las 8am
    const hora8am = new Date();
    hora8am.setHours(8, 0, 0, 0);
    if (hora8am.getTime() <= Date.now()) {
      hora8am.setDate(hora8am.getDate() + 1);
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '☀️ Préstamos AB — Resumen del día',
        body: 'Revisa las cuotas pendientes y cobros del día',
        sound: true,
        data: { tipo: 'diario' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 8,
        minute: 0,
      },
    });
  },

  async cancelarTodas(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },
};
