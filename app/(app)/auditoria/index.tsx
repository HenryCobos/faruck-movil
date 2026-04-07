import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { auditoriaService, AuditoriaEntry } from '@/services/auditoria.service';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Colors } from '@/constants/colors';

const TABLAS = ['Todos', 'prestamos', 'pagos', 'clientes', 'garantias', 'profiles'];
const TABLA_LABEL: Record<string, string> = {
  prestamos: 'Préstamos', pagos: 'Pagos',
  clientes: 'Clientes', garantias: 'Garantías', profiles: 'Usuarios',
};

function EventoItem({ item }: { item: AuditoriaEntry }) {
  const icon = auditoriaService.TABLA_ICON[item.tabla] ?? auditoriaService.TABLA_ICON.default;
  const color = auditoriaService.ACCION_COLOR[item.accion] ?? Colors.muted;
  const userInicial = item.usuario_nombre
    ? `${item.usuario_nombre[0]}${item.usuario_apellido?.[0] ?? ''}`.toUpperCase()
    : '?';

  return (
    <View style={styles.item}>
      {/* Línea de tiempo */}
      <View style={styles.timelineCol}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <View style={styles.line} />
      </View>

      {/* Contenido */}
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <View style={[styles.iconBubble, { backgroundColor: `${color}18` }]}>
            <Text style={styles.iconText}>{icon}</Text>
          </View>
          <View style={styles.itemMeta}>
            <View style={styles.accionRow}>
              <View style={[styles.accionBadge, { backgroundColor: `${color}18` }]}>
                <Text style={[styles.accionText, { color }]}>{item.accion.toUpperCase()}</Text>
              </View>
              <Text style={styles.tablaText}>{TABLA_LABEL[item.tabla] ?? item.tabla}</Text>
            </View>
            <Text style={styles.timeText}>{auditoriaService.timeAgo(item.created_at)}</Text>
          </View>
          {/* Avatar usuario */}
          {item.usuario_nombre && (
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{userInicial}</Text>
            </View>
          )}
        </View>

        <Text style={styles.descripcion}>{item.descripcion}</Text>

        {item.usuario_nombre && (
          <Text style={styles.usuarioLine}>
            {item.usuario_nombre} {item.usuario_apellido} · {item.usuario_rol?.toUpperCase()}
          </Text>
        )}

        {item.datos && (
          <View style={styles.datosBox}>
            <Text style={styles.datosText} numberOfLines={2}>
              {Object.entries(item.datos).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function AuditoriaScreen() {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<AuditoriaEntry[]>([]);
  const [filtered, setFiltered] = useState<AuditoriaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tablaFiltro, setTablaFiltro] = useState('Todos');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await auditoriaService.getAll(100);
      setEntries(data);
    } catch {
      // Si la tabla no existe aún, mostrar vacío
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, []));

  useEffect(() => {
    let result = entries;
    if (tablaFiltro !== 'Todos') {
      result = result.filter(e => e.tabla === tablaFiltro);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.descripcion.toLowerCase().includes(q) ||
        e.usuario_nombre?.toLowerCase().includes(q) ||
        e.accion.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [entries, tablaFiltro, search]);

  if (loading) return <LoadingScreen label="Cargando auditoría..." />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Auditoría del Sistema</Text>
        <Text style={styles.headerSub}>{filtered.length} eventos registrados</Text>
      </View>

      {/* Buscador */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar evento, usuario..."
          placeholderTextColor={Colors.muted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filtro por tabla */}
      <View style={styles.filterRow}>
        {TABLAS.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.filterChip, tablaFiltro === t && styles.filterChipActive]}
            onPress={() => setTablaFiltro(t)}
          >
            <Text style={[styles.filterChipText, tablaFiltro === t && styles.filterChipTextActive]}>
              {t === 'Todos' ? 'Todos' : (TABLA_LABEL[t] ?? t)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>Sin eventos</Text>
          <Text style={styles.emptyText}>
            {entries.length === 0
              ? 'Los eventos del sistema aparecerán aquí conforme se realicen operaciones.'
              : 'No hay eventos que coincidan con el filtro.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <EventoItem item={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 30 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.legendDot} />
              <Text style={styles.legendText}>Timeline de actividad más reciente</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.white, marginTop: 8 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    marginHorizontal: 16, marginTop: 12, borderRadius: 12, paddingHorizontal: 12, height: 42,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  clearIcon: { fontSize: 14, color: Colors.muted, paddingLeft: 8 },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterChipText: { fontSize: 12, color: Colors.muted, fontWeight: '600' },
  filterChipTextActive: { color: Colors.primary },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  legendText: { fontSize: 11, color: Colors.muted },
  item: { flexDirection: 'row', gap: 0, marginBottom: 4 },
  timelineCol: { width: 24, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 14, zIndex: 1 },
  line: { flex: 1, width: 1.5, backgroundColor: Colors.border, marginTop: 2 },
  itemContent: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12,
    marginLeft: 8, marginBottom: 8, gap: 6,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  iconBubble: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconText: { fontSize: 16 },
  itemMeta: { flex: 1, gap: 3 },
  accionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  accionBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  accionText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  tablaText: { fontSize: 11, color: Colors.muted, fontWeight: '600' },
  timeText: { fontSize: 10, color: Colors.muted },
  userAvatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  descripcion: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  usuarioLine: { fontSize: 11, color: Colors.muted, fontStyle: 'italic' },
  datosBox: {
    backgroundColor: `${Colors.primary}06`, borderRadius: 6, padding: 8,
    borderLeftWidth: 2, borderLeftColor: Colors.border,
  },
  datosText: { fontSize: 10, color: Colors.muted, fontFamily: 'monospace' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 20 },
});
