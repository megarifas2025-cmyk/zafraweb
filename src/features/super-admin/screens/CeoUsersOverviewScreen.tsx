import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CeoBackdrop } from '@/features/super-admin/components/CeoBackdrop';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';
import { fetchCeoDashboardMetrics } from '@/features/super-admin/services/ceoAdminService';
import {
  fetchCeoObservabilitySummary,
  listSessionLoginFeed,
  type SessionLoginFeedRow,
} from '@/features/super-admin/services/ceoObservabilityService';
import { trackUiEvent } from '@/shared/runtime/uiEventTracker';
import { FONT, SPACE } from '@/shared/utils/theme';
import type { SuperAdminStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<SuperAdminStackParamList, 'CeoUsersOverview'>;

function fmtDate(value: string) {
  return new Date(value).toLocaleString('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function roleLabel(role: string | null | undefined) {
  switch (role) {
    case 'zafra_ceo':
      return 'Zafra CEO';
    case 'company':
      return 'Empresa';
    case 'perito':
      return 'Perito';
    case 'independent_producer':
      return 'Productor';
    case 'buyer':
      return 'Comprador';
    case 'transporter':
      return 'Transportista';
    case 'agrotienda':
      return 'Agrotienda';
    default:
      return role ?? 'sin rol';
  }
}

export default function CeoUsersOverviewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof fetchCeoDashboardMetrics>> | null>(null);
  const [observability, setObservability] = useState<Awaited<ReturnType<typeof fetchCeoObservabilitySummary>> | null>(null);
  const [recentLogins, setRecentLogins] = useState<SessionLoginFeedRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [m, o, logins] = await Promise.all([
        fetchCeoDashboardMetrics(),
        fetchCeoObservabilitySummary(24),
        listSessionLoginFeed({ limit: 8 }),
      ]);
      setMetrics(m);
      setObservability(o);
      setRecentLogins(logins);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'No se pudo cargar el centro de usuarios.');
      setMetrics(null);
      setObservability(null);
      setRecentLogins([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const topRoles = useMemo(() => (observability?.roles ?? []).slice(0, 4), [observability?.roles]);

  function openGovernance() {
    trackUiEvent({
      eventType: 'tap',
      eventName: 'ceo_users_center_open_governance',
      screen: 'CeoUsersOverview',
      module: 'ceo_users',
      targetType: 'screen',
      targetId: 'CeoGovernance',
      status: 'success',
    });
    navigation.navigate('CeoGovernance');
  }

  function openSessions() {
    trackUiEvent({
      eventType: 'tap',
      eventName: 'ceo_users_center_open_sessions',
      screen: 'CeoUsersOverview',
      module: 'ceo_users',
      targetType: 'screen',
      targetId: 'CeoAccessSessions',
      status: 'success',
    });
    navigation.navigate('CeoAccessSessions');
  }

  function openActivityByRole() {
    trackUiEvent({
      eventType: 'tap',
      eventName: 'ceo_users_center_open_activity',
      screen: 'CeoUsersOverview',
      module: 'ceo_users',
      targetType: 'screen',
      targetId: 'CeoGlobalActivity',
      status: 'success',
    });
    navigation.navigate('CeoGlobalActivity', {
      title: 'Actividad de usuarios',
      subtitle: 'Eventos funcionales agrupados desde la perspectiva de usuarios y roles.',
    });
  }

  return (
    <View style={s.root}>
      <CeoBackdrop />
      <FlatList
        data={recentLogins}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CEO_COLORS.emerald} />}
        contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, SPACE.md) }]}
        ListHeaderComponent={(
          <View>
            <Text style={s.title}>Centro de usuarios</Text>
            <Text style={s.sub}>
              Vista ejecutiva para cuentas, accesos, revisión KYC y concentración operativa por rol.
            </Text>
            {errorMsg ? <Text style={s.errorTxt}>{errorMsg}</Text> : null}

            {loading && !metrics ? <ActivityIndicator color={CEO_COLORS.emerald} style={{ marginTop: SPACE.md }} /> : null}

            <View style={s.kpiGrid}>
              <View style={s.kpiCard}>
                <Text style={s.kpiLabel}>Usuarios totales</Text>
                <Text style={s.kpiValue}>{metrics?.totalUsers ?? 0}</Text>
              </View>
              <View style={s.kpiCard}>
                <Text style={s.kpiLabel}>Usuarios activos 24h</Text>
                <Text style={s.kpiValue}>{observability?.unique_users ?? 0}</Text>
              </View>
              <View style={s.kpiCard}>
                <Text style={s.kpiLabel}>Pendientes KYC</Text>
                <Text style={[s.kpiValue, { color: CEO_COLORS.amber }]}>{metrics?.pendingKyc ?? 0}</Text>
              </View>
              <View style={s.kpiCard}>
                <Text style={s.kpiLabel}>Bloqueados</Text>
                <Text style={[s.kpiValue, { color: CEO_COLORS.red }]}>{metrics?.blockedUsers ?? 0}</Text>
              </View>
            </View>

            <View style={s.actionGrid}>
              <TouchableOpacity style={s.actionCard} onPress={openGovernance} activeOpacity={0.9}>
                <Ionicons name="people-outline" size={20} color={CEO_COLORS.emerald} />
                <Text style={s.actionTitle}>Gobierno de usuarios</Text>
                <Text style={s.actionSub}>Bloqueos, KYC, estados y control administrativo.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionCard} onPress={openSessions} activeOpacity={0.9}>
                <Ionicons name="location-outline" size={20} color={CEO_COLORS.cyan} />
                <Text style={s.actionTitle}>Sesiones y acceso</Text>
                <Text style={s.actionSub}>Dónde y cuándo entró cada cuenta autenticada.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionCard} onPress={openActivityByRole} activeOpacity={0.9}>
                <Ionicons name="pulse-outline" size={20} color={CEO_COLORS.blue} />
                <Text style={s.actionTitle}>Actividad por usuario</Text>
                <Text style={s.actionSub}>Pantallas, clics y acciones funcionales por rol.</Text>
              </TouchableOpacity>
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Roles con más movimiento</Text>
              {topRoles.length === 0 ? (
                <Text style={s.emptyHint}>Todavía no hay suficiente actividad registrada.</Text>
              ) : (
                topRoles.map((item) => (
                  <View key={item.role} style={s.roleRow}>
                    <Text style={s.roleLabel}>{roleLabel(item.role)}</Text>
                    <Text style={s.roleTotal}>{item.total}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Últimos accesos</Text>
              <Text style={s.sectionSub}>Esto diferencia claramente usuarios/accesos del feed general de eventos.</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>Sin inicios de sesión recientes</Text>
              <Text style={s.emptyHint}>Aparecerán aquí cuando entren usuarios autenticados.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={s.loginRow}>
            <View style={s.loginTop}>
              <Text style={s.loginName}>{item.actor_name?.trim() || item.actor_id.slice(0, 8)}</Text>
              <Text style={s.loginDate}>{fmtDate(item.created_at)}</Text>
            </View>
            <Text style={s.loginSub}>
              {roleLabel(item.actor_role)}
              {item.municipio || item.estado_ve ? ` · ${[item.municipio, item.estado_ve].filter(Boolean).join(', ')}` : ''}
            </Text>
            <Text style={s.loginMeta}>
              {item.platform || 'plataforma N/D'}
              {item.app_version ? ` · v${item.app_version}` : ''}
            </Text>
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
  errorTxt: { marginTop: SPACE.sm, color: CEO_COLORS.red, fontSize: FONT.sizes.sm, lineHeight: 20 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.md, marginBottom: SPACE.md },
  kpiCard: {
    width: '47%',
    backgroundColor: CEO_COLORS.panel,
    borderRadius: 24,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
  },
  kpiLabel: { color: CEO_COLORS.textMute, fontSize: FONT.sizes.xs, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: FONT.weights.bold },
  kpiValue: { marginTop: 10, color: CEO_COLORS.text, fontSize: 28, fontWeight: FONT.weights.bold },
  actionGrid: { gap: SPACE.sm, marginBottom: SPACE.md },
  actionCard: {
    backgroundColor: CEO_COLORS.panelSoft,
    borderRadius: 24,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
  },
  actionTitle: { marginTop: 8, color: CEO_COLORS.text, fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold },
  actionSub: { marginTop: 4, color: CEO_COLORS.textSoft, lineHeight: 18, fontSize: FONT.sizes.sm },
  section: {
    backgroundColor: CEO_COLORS.panel,
    borderRadius: 24,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    marginBottom: SPACE.md,
  },
  sectionTitle: { color: CEO_COLORS.text, fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold },
  sectionSub: { marginTop: 4, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.sm },
  roleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CEO_COLORS.border },
  roleLabel: { color: CEO_COLORS.textSoft },
  roleTotal: { color: CEO_COLORS.emerald, fontWeight: FONT.weights.bold },
  loginRow: {
    backgroundColor: CEO_COLORS.panelSoft,
    borderRadius: 22,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    marginBottom: SPACE.sm,
  },
  loginTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  loginName: { flex: 1, color: CEO_COLORS.text, fontWeight: FONT.weights.bold },
  loginDate: { color: CEO_COLORS.textMute, fontSize: FONT.sizes.xs },
  loginSub: { marginTop: 6, color: CEO_COLORS.emerald, fontSize: FONT.sizes.sm },
  loginMeta: { marginTop: 4, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.xs },
  empty: { alignItems: 'center', paddingVertical: SPACE.xl },
  emptyTitle: { color: CEO_COLORS.text, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md },
  emptyHint: { marginTop: 6, color: CEO_COLORS.textSoft },
});
