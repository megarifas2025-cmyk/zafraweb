import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/shared/lib/supabase';
import { FONT, SHADOW, SPACE } from '@/shared/utils/theme';
import { CeoBackdrop } from '@/features/super-admin/components/CeoBackdrop';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';

type FreightRow = {
  id: string;
  tipo_servicio: string;
  origen_municipio: string;
  origen_estado: string;
  destino_municipio: string | null;
  destino_estado: string | null;
  estado: string;
  fecha_necesaria: string | null;
  creado_en: string;
  driver_name: string | null;
};

const LOAD_MS = 8_000;
const PAGE_SIZE = 40;

const STATUS_COLORS: Record<string, string> = {
  abierta:           CEO_COLORS.cyan,
  con_postulaciones: CEO_COLORS.amber,
  asignada:          CEO_COLORS.emerald,
  completada:        CEO_COLORS.textMute,
  cancelada:         CEO_COLORS.red,
};

const STATUS_LABELS: Record<string, string> = {
  abierta:           'Abierta',
  con_postulaciones: 'Con postulaciones',
  asignada:          'Asignada',
  completada:        'Completada',
  cancelada:         'Cancelada',
};

function freightStatusLabel(value: string) {
  return STATUS_LABELS[value] ?? value;
}

type FilterKey = 'activas' | 'todas';

async function fetchAllFreights(filter: FilterKey): Promise<{ rows: FreightRow[]; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ rows: FreightRow[]; timedOut: boolean }>((resolve) => {
    timer = setTimeout(() => resolve({ rows: [], timedOut: true }), LOAD_MS);
  });

  let query = supabase
    .from('freight_requests')
    .select('id, tipo_servicio, origen_municipio, origen_estado, destino_municipio, destino_estado, estado, fecha_necesaria, creado_en, driver_name')
    .order('creado_en', { ascending: false })
    .limit(PAGE_SIZE);

  if (filter === 'activas') {
    query = query.in('estado', ['abierta', 'con_postulaciones', 'asignada']);
  }

  const result = await Promise.race([
    query.then(({ data, error }) => {
      if (error) throw error;
      return { rows: (data ?? []) as FreightRow[], timedOut: false };
    }),
    timeout,
  ]);
  if (timer) clearTimeout(timer);
  return result;
}

export default function CeoFreightSupervisionScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<FreightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('activas');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchAllFreights(filter);
      setRows(data.rows);
      if (data.timedOut) {
        setErrorMsg('La supervisión de cargas tardó demasiado en responder. Desliza para reintentar.');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo cargar la supervisión de cargas.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefresh(true);
    await load();
    setRefresh(false);
  }, [load]);

  const statColor = (estado: string) => STATUS_COLORS[estado] ?? CEO_COLORS.textMute;
  const statLabel = (estado: string) => freightStatusLabel(estado);

  const activas = rows.filter((r) => ['abierta', 'con_postulaciones', 'asignada'].includes(r.estado)).length;

  return (
    <View style={s.root}>
      <CeoBackdrop />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, SPACE.md) }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={CEO_COLORS.cyan} />}
        ListHeaderComponent={
          <View>
            <Text style={s.title}>Supervisión de cargas</Text>
            <Text style={s.subtitle}>Vista ejecutiva de todas las solicitudes de transporte en la plataforma.</Text>

            {errorMsg ? (
              <View style={s.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={CEO_COLORS.red} />
                <Text style={s.errorTxt}>{errorMsg}</Text>
              </View>
            ) : null}

            <View style={s.statRow}>
              <View style={s.statCard}>
                <Text style={[s.statVal, { color: CEO_COLORS.cyan }]}>{rows.length}</Text>
                <Text style={s.statLabel}>{filter === 'activas' ? 'Activas' : 'Total cargadas'}</Text>
              </View>
              <View style={s.statCard}>
                <Text style={[s.statVal, { color: CEO_COLORS.emerald }]}>{activas}</Text>
                <Text style={s.statLabel}>En operación</Text>
              </View>
              <View style={s.statCard}>
                <Text style={[s.statVal, { color: CEO_COLORS.amber }]}>
                  {rows.filter((r) => r.estado === 'con_postulaciones').length}
                </Text>
                <Text style={s.statLabel}>Con postulaciones</Text>
              </View>
            </View>

            <View style={s.filterRow}>
              {(['activas', 'todas'] as FilterKey[]).map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[s.chip, filter === key && s.chipOn]}
                  onPress={() => setFilter(key)}
                >
                  <Text style={[s.chipTxt, filter === key && s.chipTxtOn]}>
                    {key === 'activas' ? 'Activas' : 'Todas'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: SPACE.xl }} color={CEO_COLORS.cyan} />
          ) : (
            <View style={s.emptyBox}>
              <Ionicons name="cube-outline" size={36} color={CEO_COLORS.textMute} />
              <Text style={s.emptyTxt}>
                {filter === 'activas'
                  ? 'No hay cargas activas en la plataforma en este momento.'
                  : 'No hay solicitudes de transporte registradas.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardTop}>
              <Text style={s.tipo} numberOfLines={1}>{item.tipo_servicio}</Text>
              <View style={[s.badge, { backgroundColor: `${statColor(item.estado)}18`, borderColor: `${statColor(item.estado)}44` }]}>
                <Text style={[s.badgeTxt, { color: statColor(item.estado) }]}>{statLabel(item.estado)}</Text>
              </View>
            </View>

            <View style={s.routeRow}>
              <Ionicons name="location-outline" size={13} color={CEO_COLORS.cyan} />
              <Text style={s.routeTxt} numberOfLines={1}>
                {item.origen_municipio}, {item.origen_estado}
                {item.destino_municipio ? ` → ${item.destino_municipio}, ${item.destino_estado ?? ''}` : ''}
              </Text>
            </View>

            {item.driver_name ? (
              <View style={s.routeRow}>
                <Ionicons name="person-outline" size={13} color={CEO_COLORS.textMute} />
                <Text style={s.metaTxt}>{item.driver_name}</Text>
              </View>
            ) : null}

            <View style={s.footer}>
              {item.fecha_necesaria ? (
                <View style={s.dateRow}>
                  <Ionicons name="calendar-outline" size={12} color={CEO_COLORS.textMute} />
                  <Text style={s.dateTxt}>{item.fecha_necesaria}</Text>
                </View>
              ) : null}
              <Text style={s.dateTxt}>{new Date(item.creado_en).toLocaleDateString('es-VE')}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CEO_COLORS.bg },
  content: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  title: { fontSize: 24, fontWeight: FONT.weights.bold, color: CEO_COLORS.text },
  subtitle: { marginTop: 6, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.sm, lineHeight: 20 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACE.sm,
    padding: SPACE.sm,
    backgroundColor: 'rgba(220,38,38,0.12)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.3)',
  },
  errorTxt: { flex: 1, color: CEO_COLORS.red, fontSize: FONT.sizes.sm },
  statRow: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
  statCard: {
    flex: 1,
    backgroundColor: CEO_COLORS.panelSoft,
    borderRadius: 18,
    padding: SPACE.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
  },
  statVal: { fontSize: 24, fontWeight: FONT.weights.bold },
  statLabel: { color: CEO_COLORS.textMute, fontSize: 10, marginTop: 2, textAlign: 'center', fontWeight: FONT.weights.bold, textTransform: 'uppercase', letterSpacing: 0.8 },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: SPACE.md, marginBottom: SPACE.sm },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: CEO_COLORS.panel,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
  },
  chipOn: { backgroundColor: CEO_COLORS.panelSoft, borderColor: CEO_COLORS.cyan },
  chipTxt: { color: CEO_COLORS.textMute, fontSize: FONT.sizes.sm, fontWeight: FONT.weights.medium },
  chipTxtOn: { color: CEO_COLORS.cyan, fontWeight: FONT.weights.bold },
  emptyBox: { marginTop: SPACE.xl, alignItems: 'center', gap: 12 },
  emptyTxt: { color: CEO_COLORS.textSoft, textAlign: 'center', lineHeight: 22 },
  card: {
    backgroundColor: CEO_COLORS.panel,
    borderRadius: 20,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    ...SHADOW.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tipo: { flex: 1, color: CEO_COLORS.text, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeTxt: { fontSize: 10, fontWeight: FONT.weights.bold, textTransform: 'uppercase', letterSpacing: 0.8 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  routeTxt: { flex: 1, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.sm },
  metaTxt: { color: CEO_COLORS.textMute, fontSize: FONT.sizes.sm },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateTxt: { color: CEO_COLORS.textMute, fontSize: FONT.sizes.xs },
});
