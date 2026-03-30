import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CeoBackdrop } from '@/features/super-admin/components/CeoBackdrop';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';
import { listUiEventFeed, type UiEventFeedRow } from '@/features/super-admin/services/ceoObservabilityService';
import type { RolUsuario, UiEventLogEntry } from '@/shared/types';
import { FONT, SPACE } from '@/shared/utils/theme';
import type { RouteProp } from '@react-navigation/native';
import type { SuperAdminStackParamList } from '../navigation/types';

const ROLE_OPTIONS: Array<{ id: RolUsuario | 'all'; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'independent_producer', label: 'Agricultor' },
  { id: 'buyer', label: 'Comprador' },
  { id: 'agrotienda', label: 'Agrotienda' },
  { id: 'transporter', label: 'Transporte' },
  { id: 'company', label: 'Empresa' },
  { id: 'perito', label: 'Perito' },
  { id: 'zafra_ceo', label: 'CEO' },
];

const EVENT_OPTIONS: Array<{ id: UiEventLogEntry['event_type'] | 'all'; label: string }> = [
  { id: 'all', label: 'Todo' },
  { id: 'screen_view', label: 'Pantalla' },
  { id: 'tap', label: 'Tap' },
  { id: 'submit', label: 'Submit' },
  { id: 'open_modal', label: 'Abrir modal' },
  { id: 'close_modal', label: 'Cerrar modal' },
  { id: 'navigate', label: 'Navegar' },
  { id: 'error_ui', label: 'Error UI' },
  { id: 'state_change', label: 'Estado' },
];

function fmtDate(value: string) {
  return new Date(value).toLocaleString('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function roleLabel(role: RolUsuario | null | undefined) {
  return ROLE_OPTIONS.find((item) => item.id === role)?.label ?? role ?? 'Sin rol';
}

function metadataSummary(item: UiEventFeedRow) {
  const parts = [
    item.target_type ? `objetivo: ${item.target_type}` : null,
    item.target_id ? `id: ${item.target_id}` : null,
    item.status ? `estado: ${item.status}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

export default function CeoGlobalActivityScreen() {
  const route = useRoute<RouteProp<SuperAdminStackParamList, 'CeoGlobalActivity'>>();
  const routeParams = route.params;
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<UiEventFeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<RolUsuario | 'all'>('all');
  const [eventType, setEventType] = useState<UiEventLogEntry['event_type'] | 'all'>('all');
  const [screenFilter, setScreenFilter] = useState('');
  const [sessionFilter, setSessionFilter] = useState('');

  useEffect(() => {
    if (!routeParams) return;
    if (routeParams.initialRole) setRole(routeParams.initialRole);
    if (routeParams.initialEventType) setEventType(routeParams.initialEventType);
    if (typeof routeParams.initialScreen === 'string') setScreenFilter(routeParams.initialScreen);
    if (typeof routeParams.initialSessionKey === 'string') setSessionFilter(routeParams.initialSessionKey);
  }, [
    routeParams,
    routeParams?.initialRole,
    routeParams?.initialEventType,
    routeParams?.initialScreen,
    routeParams?.initialSessionKey,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listUiEventFeed({
        role,
        eventType,
        screen: screenFilter.trim() || undefined,
        sessionKey: sessionFilter.trim() || undefined,
        limit: 80,
      });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [eventType, role, screenFilter, sessionFilter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return (
    <View style={s.root}>
      <CeoBackdrop />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CEO_COLORS.cyan} />}
        contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, SPACE.md) }]}
        ListHeaderComponent={(
          <View>
            <Text style={s.title}>{routeParams?.title ?? 'Actividad global'}</Text>
            <Text style={s.sub}>
              {routeParams?.subtitle ?? 'Feed transversal de pantallas, clics y acciones sensibles instrumentadas en todos los roles.'}
            </Text>

            <View style={s.card}>
              <Text style={s.cardTitle}>Filtros</Text>
              <TextInput
                style={s.input}
                value={screenFilter}
                onChangeText={setScreenFilter}
                placeholder="Pantalla exacta, por ejemplo Chat"
                placeholderTextColor={CEO_COLORS.textMute}
              />
              <TextInput
                style={s.input}
                value={sessionFilter}
                onChangeText={setSessionFilter}
                placeholder="Clave de sesión"
                placeholderTextColor={CEO_COLORS.textMute}
                autoCapitalize="none"
              />

              <Text style={s.filterLabel}>Rol</Text>
              <View style={s.filterWrap}>
                {ROLE_OPTIONS.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[s.chip, role === item.id && s.chipActive]}
                    onPress={() => setRole(item.id)}
                    activeOpacity={0.88}
                  >
                    <Text style={[s.chipTxt, role === item.id && s.chipTxtActive]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.filterLabel}>Tipo de evento</Text>
              <View style={s.filterWrap}>
                {EVENT_OPTIONS.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[s.chip, eventType === item.id && s.chipActive]}
                    onPress={() => setEventType(item.id)}
                    activeOpacity={0.88}
                  >
                    <Text style={[s.chipTxt, eventType === item.id && s.chipTxtActive]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={s.reloadBtn} onPress={() => void load()} activeOpacity={0.9}>
                <Text style={s.reloadTxt}>Actualizar feed</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={CEO_COLORS.cyan} style={{ marginTop: SPACE.xl }} />
          ) : (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>Sin eventos para este filtro</Text>
              <Text style={s.emptySub}>Prueba con otro rol, pantalla o una sesión distinta.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={s.rowTop}>
              <Text style={s.rowTitle}>
                {item.actor_name?.trim() || item.actor_id.slice(0, 8)} · {roleLabel(item.actor_role)}
              </Text>
              <Text style={s.rowDate}>{fmtDate(item.created_at)}</Text>
            </View>
            <Text style={s.rowMain}>
              {item.event_name}
              {item.screen ? ` · ${item.screen}` : ''}
            </Text>
            <Text style={s.rowSub}>
              {item.event_type}
              {item.module ? ` · modulo ${item.module}` : ''}
            </Text>
            {metadataSummary(item) ? <Text style={s.rowMeta}>{metadataSummary(item)}</Text> : null}
            <Text style={s.rowSession}>{item.session_key}</Text>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CEO_COLORS.bg },
  content: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  title: { color: CEO_COLORS.text, fontSize: 24, fontWeight: FONT.weights.bold },
  sub: { marginTop: 6, color: CEO_COLORS.textSoft, lineHeight: 20, fontSize: FONT.sizes.sm },
  card: {
    marginTop: SPACE.md,
    marginBottom: SPACE.md,
    backgroundColor: CEO_COLORS.panel,
    borderRadius: 28,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
  },
  cardTitle: {
    color: CEO_COLORS.cyan,
    fontSize: FONT.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: FONT.weights.bold,
    marginBottom: SPACE.sm,
  },
  input: {
    backgroundColor: 'rgba(2,6,23,0.55)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    color: CEO_COLORS.text,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm + 2,
    marginBottom: SPACE.sm,
  },
  filterLabel: { marginTop: SPACE.xs, marginBottom: 8, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.sm },
  filterWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    backgroundColor: CEO_COLORS.panelSoft,
  },
  chipActive: {
    backgroundColor: 'rgba(34,211,238,0.18)',
    borderColor: 'rgba(34,211,238,0.45)',
  },
  chipTxt: { color: CEO_COLORS.textSoft, fontSize: FONT.sizes.xs, fontWeight: FONT.weights.semibold },
  chipTxtActive: { color: CEO_COLORS.text },
  reloadBtn: {
    marginTop: SPACE.md,
    backgroundColor: CEO_COLORS.cyan,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.sm + 2,
  },
  reloadTxt: { color: '#02131B', fontWeight: FONT.weights.bold },
  row: {
    backgroundColor: CEO_COLORS.panelSoft,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  rowTitle: { flex: 1, color: CEO_COLORS.text, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  rowDate: { color: CEO_COLORS.textMute, fontSize: FONT.sizes.xs },
  rowMain: { marginTop: 6, color: CEO_COLORS.cyan, fontWeight: FONT.weights.semibold },
  rowSub: { marginTop: 4, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.sm },
  rowMeta: { marginTop: 6, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.xs, lineHeight: 18 },
  rowSession: { marginTop: 8, color: CEO_COLORS.textMute, fontSize: 11 },
  empty: {
    alignItems: 'center',
    paddingVertical: SPACE.xl,
  },
  emptyTitle: { color: CEO_COLORS.text, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md },
  emptySub: { marginTop: 6, color: CEO_COLORS.textSoft, textAlign: 'center' },
});
