import React, { useCallback, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CeoBackdrop } from '@/features/super-admin/components/CeoBackdrop';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';
import { listSessionLoginFeed, type SessionLoginFeedRow } from '@/features/super-admin/services/ceoObservabilityService';
import type { RolUsuario } from '@/shared/types';
import { FONT, SPACE } from '@/shared/utils/theme';

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

function fmtDate(value: string) {
  return new Date(value).toLocaleString('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function roleLabel(role: RolUsuario | null | undefined) {
  return ROLE_OPTIONS.find((item) => item.id === role)?.label ?? role ?? 'Sin rol';
}

function locationLabel(item: SessionLoginFeedRow) {
  const place = [item.municipio, item.estado_ve].filter(Boolean).join(', ');
  const coords = item.latitude != null && item.longitude != null
    ? `${item.latitude}, ${item.longitude}`
    : 'Sin coordenadas';
  return [place || null, coords].filter(Boolean).join(' · ');
}

export default function CeoAccessSessionsScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<SessionLoginFeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<RolUsuario | 'all'>('all');
  const [userId, setUserId] = useState('');
  const [sessionKey, setSessionKey] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSessionLoginFeed({
        role,
        userId: userId.trim() || undefined,
        sessionKey: sessionKey.trim() || undefined,
        limit: 80,
      });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [role, sessionKey, userId]);

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
            <Text style={s.title}>Sesiones y acceso</Text>
            <Text style={s.sub}>
              Registro aproximado de dónde inició sesión cada usuario autenticado, sin rastreo continuo posterior.
            </Text>

            <View style={s.card}>
              <Text style={s.cardTitle}>Filtros de acceso</Text>
              <TextInput
                style={s.input}
                value={userId}
                onChangeText={setUserId}
                placeholder="ID exacto del usuario"
                placeholderTextColor={CEO_COLORS.textMute}
                autoCapitalize="none"
              />
              <TextInput
                style={s.input}
                value={sessionKey}
                onChangeText={setSessionKey}
                placeholder="Clave de sesión"
                placeholderTextColor={CEO_COLORS.textMute}
                autoCapitalize="none"
              />

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

              <TouchableOpacity style={s.reloadBtn} onPress={() => void load()} activeOpacity={0.9}>
                <Text style={s.reloadTxt}>Actualizar sesiones</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={CEO_COLORS.cyan} style={{ marginTop: SPACE.xl }} />
          ) : (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>Sin inicios de sesión para este filtro</Text>
              <Text style={s.emptySub}>Cuando entren usuarios autenticados, aparecerán aquí.</Text>
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
            <Text style={s.rowMain}>{locationLabel(item)}</Text>
            <Text style={s.rowSub}>
              {item.device_label || item.platform || 'Dispositivo no reportado'}
              {item.app_version ? ` · v${item.app_version}` : ''}
              {item.accuracy_m != null ? ` · ±${item.accuracy_m}m` : ''}
            </Text>
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
    color: CEO_COLORS.emerald,
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
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderColor: 'rgba(16,185,129,0.45)',
  },
  chipTxt: { color: CEO_COLORS.textSoft, fontSize: FONT.sizes.xs, fontWeight: FONT.weights.semibold },
  chipTxtActive: { color: CEO_COLORS.text },
  reloadBtn: {
    marginTop: SPACE.md,
    backgroundColor: CEO_COLORS.emerald,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.sm + 2,
  },
  reloadTxt: { color: '#03120C', fontWeight: FONT.weights.bold },
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
  rowMain: { marginTop: 6, color: CEO_COLORS.emerald, fontWeight: FONT.weights.semibold },
  rowSub: { marginTop: 4, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.sm },
  rowSession: { marginTop: 8, color: CEO_COLORS.textMute, fontSize: 11 },
  empty: { alignItems: 'center', paddingVertical: SPACE.xl },
  emptyTitle: { color: CEO_COLORS.text, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md },
  emptySub: { marginTop: 6, color: CEO_COLORS.textSoft, textAlign: 'center' },
});
