import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@/shared/store/AuthContext';
import { authService } from '@/shared/services/authService';
import { WeatherTicker } from '@/shared/components/WeatherTicker';
import { NotificationsCenterModal } from '@/shared/components/NotificationsCenterModal';
import { fetchCeoDashboardMetrics } from '@/features/super-admin/services/ceoAdminService';
import { fetchCeoObservabilitySummary } from '@/features/super-admin/services/ceoObservabilityService';
import { trackUiEvent } from '@/shared/runtime/uiEventTracker';
import type { SuperAdminStackParamList } from '@/features/super-admin/navigation/types';
import type { UiEventLogEntry } from '@/shared/types';
import { FONT, SPACE, SHADOW } from '@/shared/utils/theme';
import { CeoBackdrop } from '@/features/super-admin/components/CeoBackdrop';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';

type Nav = NativeStackNavigationProp<SuperAdminStackParamList, 'SuperAdminHome'>;
type DashboardRoute =
  | 'CeoUsersOverview'
  | 'CeoGlobalActivity'
  | 'CeoAccessSessions'
  | 'CeoFreightSupervision'
  | 'CreatePeritoAccount'
  | 'CeoGovernance'
  | 'CeoChatIncidents'
  | 'CeoAuditTrail'
  | 'CeoSystemReport';

type ActionItem = {
  key: string;
  label: string;
  subtitle: string;
  screen: DashboardRoute;
  params?: Record<string, unknown>;
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  toneSoft: string;
};

type KpiItem = {
  key: string;
  label: string;
  value: number;
  tone: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen: DashboardRoute;
  params?: Record<string, unknown>;
};

export default function SuperAdminDashboard() {
  const { perfil } = useAuth();
  const navigation = useNavigation<Nav>();
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof fetchCeoDashboardMetrics>> | null>(null);
  const [observability, setObservability] = useState<Awaited<ReturnType<typeof fetchCeoObservabilitySummary>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [metricsError, setMetricsError] = useState(false);

  const openNotificaciones = () => setNotifModalVisible(true);
  const openClima = () =>
    (navigation as unknown as { getParent: () => { navigate: (n: string) => void } }).getParent()?.navigate('Clima');

  const load = useCallback(async () => {
    setLoading(true);
    setMetricsError(false);
    try {
      const [metricsResult, observabilityResult] = await Promise.all([
        fetchCeoDashboardMetrics(),
        fetchCeoObservabilitySummary(24),
      ]);
      setMetrics(metricsResult);
      setObservability(observabilityResult);
    } catch {
      setMetricsError(true);
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
    setRefresh(true);
    await load();
    setRefresh(false);
  }, [load]);

  const actions = useMemo<ActionItem[]>(
    () => [
      {
        key: 'users-center',
        label: 'Centro de usuarios',
        subtitle: 'Cuentas, accesos y control ejecutivo',
        screen: 'CeoUsersOverview',
        icon: 'people-outline',
        tone: CEO_COLORS.emerald,
        toneSoft: CEO_COLORS.emeraldSoft,
      },
      {
        key: 'activity',
        label: 'Actividad global',
        subtitle: 'Pantallas, clics y acciones por usuario',
        screen: 'CeoGlobalActivity',
        icon: 'pulse-outline',
        tone: CEO_COLORS.cyan,
        toneSoft: CEO_COLORS.cyanSoft,
      },
      {
        key: 'access',
        label: 'Sesiones y acceso',
        subtitle: 'Ubicación aproximada del inicio de sesión',
        screen: 'CeoAccessSessions',
        icon: 'location-outline',
        tone: CEO_COLORS.emerald,
        toneSoft: CEO_COLORS.emeraldSoft,
      },
      {
        key: 'freight',
        label: 'Supervisión de cargas',
        subtitle: 'Solicitudes, postulaciones y operación logística',
        screen: 'CeoFreightSupervision',
        icon: 'car-outline',
        tone: CEO_COLORS.blue,
        toneSoft: CEO_COLORS.blueSoft,
      },
      {
        key: 'kyc',
        label: 'Gobierno de usuarios',
        subtitle: 'Revisar usuarios, estados y bloqueos',
        screen: 'CeoGovernance',
        icon: 'shield-checkmark-outline',
        tone: CEO_COLORS.emerald,
        toneSoft: CEO_COLORS.emeraldSoft,
      },
      {
        key: 'chat-incidents',
        label: 'Incidentes de chat',
        subtitle: 'Fraude, lenguaje y reportes',
        screen: 'CeoChatIncidents',
        icon: 'shield-outline',
        tone: CEO_COLORS.red,
        toneSoft: CEO_COLORS.redSoft,
      },
      {
        key: 'audit',
        label: 'Bitácora ejecutiva',
        subtitle: 'Historial de acciones sensibles',
        screen: 'CeoAuditTrail',
        icon: 'server-outline',
        tone: CEO_COLORS.blue,
        toneSoft: CEO_COLORS.blueSoft,
      },
      {
        key: 'report',
        label: 'Reporte del sistema',
        subtitle: 'Analítica agregada y distribución por rol',
        screen: 'CeoSystemReport',
        icon: 'stats-chart-outline',
        tone: CEO_COLORS.cyan,
        toneSoft: CEO_COLORS.cyanSoft,
      },
      {
        key: 'peritos',
        label: 'Crear cuenta perito',
        subtitle: 'Alta de personal oficial e institucional',
        screen: 'CreatePeritoAccount',
        icon: 'person-add-outline',
        tone: CEO_COLORS.purple,
        toneSoft: CEO_COLORS.purpleSoft,
      },
    ],
    [],
  );

  const kpis: KpiItem[] = [
    {
      key: 'events',
      label: 'Eventos 24h',
      value: observability?.events_total ?? 0,
      tone: CEO_COLORS.cyan,
      icon: 'pulse-outline' as const,
      screen: 'CeoGlobalActivity' as const,
      params: {
        title: 'Actividad global',
        subtitle: 'Vista completa de eventos funcionales, clics y navegación.',
      },
    },
    { key: 'logins', label: 'Accesos 24h', value: observability?.login_count ?? 0, tone: CEO_COLORS.emerald, icon: 'location-outline' as const, screen: 'CeoAccessSessions' as const },
    { key: 'active-users', label: 'Usuarios activos', value: observability?.unique_users ?? 0, tone: CEO_COLORS.blue, icon: 'people-outline' as const, screen: 'CeoUsersOverview' as const },
    {
      key: 'ui-errors',
      label: 'Errores UI',
      value: observability?.ui_errors ?? 0,
      tone: CEO_COLORS.red,
      icon: 'alert-circle-outline' as const,
      screen: 'CeoGlobalActivity' as const,
      params: {
        initialEventType: 'error_ui' satisfies UiEventLogEntry['event_type'],
        title: 'Errores UI',
        subtitle: 'Eventos de error de interfaz filtrados para revisión prioritaria.',
      },
    },
    { key: 'kyc', label: 'KYC en revisión', value: metrics?.pendingKyc ?? 0, tone: CEO_COLORS.amber, icon: 'document-text-outline' as const, screen: 'CeoGovernance' as const },
    { key: 'freight', label: 'Cargas activas', value: metrics?.activeFreight ?? 0, tone: CEO_COLORS.emerald, icon: 'car-outline' as const, screen: 'CeoFreightSupervision' as const },
  ];

  function navigateTo(screen: DashboardRoute, params?: Record<string, unknown>) {
    (navigation as unknown as { navigate: (target: DashboardRoute, payload?: Record<string, unknown>) => void })
      .navigate(screen, params);
  }

  return (
    <View style={s.root}>
      <CeoBackdrop />
      <WeatherTicker topInset estado_ve={perfil?.estado_ve} onPress={openClima} />
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={CEO_COLORS.cyan} />}>
        <View style={s.headerRow}>
          <View style={s.brandWrap}>
            <View style={s.logoShell}>
              <Ionicons name="shield-checkmark-outline" size={24} color={CEO_COLORS.cyan} />
            </View>
            <View>
              <Text style={s.titulo}>Zafra CEO</Text>
              <Text style={s.sub}>Panel ejecutivo</Text>
            </View>
          </View>
          <View style={s.topActions}>
            <TouchableOpacity style={s.iconBtn} onPress={openNotificaciones} hitSlop={12} accessibilityLabel="Notificaciones">
              <Ionicons name="notifications-outline" size={18} color={CEO_COLORS.textSoft} />
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={() => void authService.logout()} hitSlop={12} accessibilityLabel="Cerrar sesión">
              <Ionicons name="log-out-outline" size={18} color={CEO_COLORS.red} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.heroCard}>
          <Text style={s.heroEyebrow}>Cabina de mando</Text>
          <Text style={s.heroTitle}>Supervisión total sobre usuarios, accesos, actividad funcional y operación nacional.</Text>
          <Text style={s.heroBody}>
            Aquí concentras accesos con ubicación de entrada, feed de clics y pantallas, alertas críticas, gobierno de cuentas y salud general de la plataforma.
          </Text>
        </View>

        {loading && !metrics ? <ActivityIndicator color={CEO_COLORS.cyan} style={{ marginBottom: SPACE.lg }} /> : null}

        {metricsError && !loading ? (
          <View style={s.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color={CEO_COLORS.amber} />
            <Text style={s.errorTxt}>Métricas no disponibles. Desliza hacia abajo para reintentar.</Text>
          </View>
        ) : null}

        <View style={s.kpiGrid}>
          {kpis.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={s.kpiCard}
              onPress={() => {
                trackUiEvent({
                  eventType: 'tap',
                  eventName: `ceo_dashboard_kpi_${item.key}`,
                  screen: 'SuperAdminHome',
                  module: 'ceo_dashboard',
                  targetType: 'screen',
                  targetId: item.screen,
                  status: 'success',
                });
                navigateTo(item.screen, item.params);
              }}
              activeOpacity={0.9}
            >
              <View style={s.kpiHeader}>
                <Text style={[s.kpiLabel, { color: item.tone }]}>{item.label}</Text>
                <Ionicons name={item.icon} size={15} color={item.tone} />
              </View>
              <Text style={s.kpiValue}>{metricsError ? '—' : item.value}</Text>
              {metricsError ? <Text style={s.kpiHint}>Sin dato</Text> : null}
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.sectionHeader}>
          <Text style={s.sectionEyebrow}>Centro de mando</Text>
          <Text style={s.sectionHint}>Accesos ejecutivos directos</Text>
        </View>

        <View style={s.commandList}>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={s.accionRow}
              onPress={() => {
                trackUiEvent({
                  eventType: 'tap',
                  eventName: `ceo_dashboard_open_${action.key}`,
                  screen: 'SuperAdminHome',
                  module: 'ceo_dashboard',
                  targetType: 'screen',
                  targetId: action.screen,
                  status: 'success',
                });
                navigateTo(action.screen, action.params);
              }}
              activeOpacity={0.92}
            >
              <View style={s.actionLeft}>
                <View style={[s.actionIconWrap, { backgroundColor: action.toneSoft, borderColor: `${action.tone}44` }]}>
                  <Ionicons name={action.icon} size={20} color={action.tone} />
                </View>
                <View style={s.actionCopy}>
                  <Text style={s.accionTxtHighlight}>{action.label}</Text>
                  <Text style={s.accionSub}>{action.subtitle}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={CEO_COLORS.textMute} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <NotificationsCenterModal
        visible={notifModalVisible}
        onClose={() => setNotifModalVisible(false)}
        userId={perfil?.id}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CEO_COLORS.bg },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl + SPACE.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.md, marginTop: 4 },
  brandWrap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoShell: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CEO_COLORS.panelSoft,
    borderWidth: 1,
    borderColor: CEO_COLORS.borderStrong,
  },
  topActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CEO_COLORS.panel,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
  },
  alertDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 999,
    top: 11,
    right: 11,
    backgroundColor: CEO_COLORS.red,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACE.md,
    padding: SPACE.sm,
    backgroundColor: 'rgba(180,83,9,0.15)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  errorTxt: { flex: 1, color: CEO_COLORS.amber, fontSize: FONT.sizes.sm },
  titulo: { fontSize: 22, fontWeight: FONT.weights.bold, color: CEO_COLORS.text },
  sub: { fontSize: FONT.sizes.xs, color: CEO_COLORS.cyan, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1.6 },
  heroCard: {
    borderRadius: 28,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
    backgroundColor: CEO_COLORS.panel,
    borderWidth: 1,
    borderColor: CEO_COLORS.borderStrong,
    ...SHADOW.lg,
  },
  heroEyebrow: { color: CEO_COLORS.emerald, fontSize: FONT.sizes.xs, textTransform: 'uppercase', letterSpacing: 1.8, fontWeight: FONT.weights.bold },
  heroTitle: { marginTop: 10, color: CEO_COLORS.text, fontSize: 24, lineHeight: 30, fontWeight: FONT.weights.bold },
  heroBody: { marginTop: 10, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.sm, lineHeight: 21 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.lg },
  kpiCard: {
    width: '47%',
    borderRadius: 24,
    padding: SPACE.md,
    backgroundColor: CEO_COLORS.panelSoft,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    minHeight: 112,
  },
  kpiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kpiLabel: { fontSize: FONT.sizes.xs, textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: FONT.weights.bold },
  kpiValue: { color: CEO_COLORS.text, fontSize: 30, fontWeight: FONT.weights.regular, marginTop: 14 },
  kpiHint: { marginTop: 6, color: CEO_COLORS.textMute, fontSize: FONT.sizes.xs, textTransform: 'uppercase', letterSpacing: 1.1 },
  sectionHeader: { marginBottom: SPACE.sm },
  sectionEyebrow: { color: CEO_COLORS.textMute, fontSize: FONT.sizes.xs, textTransform: 'uppercase', letterSpacing: 1.7, fontWeight: FONT.weights.bold },
  sectionHint: { marginTop: 4, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.sm },
  commandList: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: CEO_COLORS.panel,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
  },
  accionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: CEO_COLORS.border,
    gap: SPACE.sm,
  },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionCopy: { flex: 1 },
  accionTxtHighlight: { fontSize: FONT.sizes.md, color: CEO_COLORS.text, fontWeight: FONT.weights.bold },
  accionSub: { marginTop: 2, color: CEO_COLORS.textMute, fontSize: FONT.sizes.xs, lineHeight: 17 },
});
