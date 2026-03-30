import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CeoBackdrop } from '@/features/super-admin/components/CeoBackdrop';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';
import { fetchCeoDashboardMetrics } from '@/features/super-admin/services/ceoAdminService';
import {
  listSessionLoginFeed,
  listUiEventFeed,
  type SessionLoginFeedRow,
  type UiEventFeedRow,
} from '@/features/super-admin/services/ceoObservabilityService';
import { supabase } from '@/shared/lib/supabase';
import { trackUiEvent } from '@/shared/runtime/uiEventTracker';
import { listChatIncidentsForCeo } from '@/shared/services/chatGovernanceService';
import type { ChatIncident } from '@/shared/types';
import { FONT, SPACE, SHADOW } from '@/shared/utils/theme';

type FreightPreview = {
  id: string;
  tipo_servicio: string;
  estado: string;
  origen_municipio: string;
  origen_estado: string;
  creado_en: string;
};

function fmtDate(value: string) {
  return new Date(value).toLocaleString('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function severityColor(severity: ChatIncident['severity']) {
  if (severity === 'critica') return CEO_COLORS.red;
  if (severity === 'alta') return CEO_COLORS.amber;
  return CEO_COLORS.blue;
}

function incidentStatusLabel(status: ChatIncident['status']) {
  switch (status) {
    case 'reviewing':
      return 'En revisión';
    case 'resolved':
      return 'Resuelto';
    case 'dismissed':
      return 'Descartado';
    default:
      return status;
  }
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

export default function CeoOperationalSupervisionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof fetchCeoDashboardMetrics>> | null>(null);
  const [freights, setFreights] = useState<FreightPreview[]>([]);
  const [incidents, setIncidents] = useState<ChatIncident[]>([]);
  const [uiErrors, setUiErrors] = useState<UiEventFeedRow[]>([]);
  const [sessions, setSessions] = useState<SessionLoginFeedRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [m, freightRes, incidentRows, errorRows, loginRows] = await Promise.all([
        fetchCeoDashboardMetrics(),
        supabase
          .from('freight_requests')
          .select('id, tipo_servicio, estado, origen_municipio, origen_estado, creado_en')
          .in('estado', ['abierta', 'con_postulaciones', 'asignada'])
          .order('creado_en', { ascending: false })
          .limit(4),
        listChatIncidentsForCeo(4),
        listUiEventFeed({ eventType: 'error_ui', limit: 4 }),
        listSessionLoginFeed({ limit: 4 }),
      ]);
      if (freightRes.error) {
        throw freightRes.error;
      }

      setMetrics(m);
      setFreights((freightRes.data ?? []) as FreightPreview[]);
      setIncidents(incidentRows);
      setUiErrors(errorRows);
      setSessions(loginRows);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'No se pudo cargar la supervisión operativa.');
      setMetrics(null);
      setFreights([]);
      setIncidents([]);
      setUiErrors([]);
      setSessions([]);
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

  function openDashboardScreen(screen: string, params?: Record<string, unknown>) {
    trackUiEvent({
      eventType: 'tap',
      eventName: `ceo_supervision_open_${screen}`,
      screen: 'CeoOperationalSupervision',
      module: 'ceo_supervision',
      targetType: 'screen',
      targetId: screen,
      status: 'success',
    });
    (navigation as unknown as { navigate: (name: string, params?: Record<string, unknown>) => void })
      .navigate('Dashboard', { screen, params });
  }

  return (
    <View style={s.root}>
      <CeoBackdrop />
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, SPACE.md) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CEO_COLORS.cyan} />}
      >
        <Text style={s.title}>Supervisión operativa</Text>
        <Text style={s.sub}>
          Cabina transversal para operación, incidencias, errores UI y accesos recientes. Ya no se limita solo a cargas.
        </Text>
        {errorMsg ? <Text style={s.errorTxt}>{errorMsg}</Text> : null}

        {loading ? <ActivityIndicator color={CEO_COLORS.cyan} style={{ marginTop: SPACE.md }} /> : null}

        <View style={s.heroGrid}>
          <View style={s.heroCard}>
            <Text style={s.heroLabel}>Cargas activas</Text>
            <Text style={s.heroValue}>{metrics?.activeFreight ?? 0}</Text>
            <TouchableOpacity onPress={() => openDashboardScreen('CeoFreightSupervision')}>
              <Text style={s.heroLink}>Abrir logística</Text>
            </TouchableOpacity>
          </View>
          <View style={s.heroCard}>
            <Text style={s.heroLabel}>Pendientes KYC</Text>
            <Text style={[s.heroValue, { color: CEO_COLORS.amber }]}>{metrics?.pendingKyc ?? 0}</Text>
            <TouchableOpacity onPress={() => openDashboardScreen('CeoGovernance')}>
              <Text style={s.heroLink}>Abrir gobierno</Text>
            </TouchableOpacity>
          </View>
          <View style={s.heroCard}>
            <Text style={s.heroLabel}>Incidentes chat</Text>
            <Text style={[s.heroValue, { color: CEO_COLORS.red }]}>{incidents.length}</Text>
            <Text style={s.heroCaption}>Muestra reciente</Text>
            <TouchableOpacity onPress={() => openDashboardScreen('CeoChatIncidents')}>
              <Text style={s.heroLink}>Abrir incidencias</Text>
            </TouchableOpacity>
          </View>
          <View style={s.heroCard}>
            <Text style={s.heroLabel}>Errores UI recientes</Text>
            <Text style={[s.heroValue, { color: CEO_COLORS.red }]}>{uiErrors.length}</Text>
            <TouchableOpacity
              onPress={() => openDashboardScreen('CeoGlobalActivity', { initialEventType: 'error_ui', title: 'Errores UI', subtitle: 'Supervisión de errores de interfaz por rol y pantalla.' })}
            >
              <Text style={s.heroLink}>Abrir errores</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Logística crítica</Text>
            <TouchableOpacity onPress={() => openDashboardScreen('CeoFreightSupervision')}>
              <Text style={s.sectionLink}>Ver todo</Text>
            </TouchableOpacity>
          </View>
          {freights.length === 0 ? (
            <Text style={s.empty}>No hay cargas activas ahora mismo.</Text>
          ) : freights.map((item) => (
            <View key={item.id} style={s.row}>
              <Text style={s.rowTitle}>{item.tipo_servicio}</Text>
              <Text style={s.rowBadge}>
                {item.estado === 'abierta'
                  ? 'Abierta'
                  : item.estado === 'con_postulaciones'
                    ? 'Con postulaciones'
                    : item.estado === 'asignada'
                      ? 'Asignada'
                      : item.estado}
              </Text>
              <Text style={s.rowSub}>{item.origen_municipio}, {item.origen_estado}</Text>
              <Text style={s.rowMeta}>{fmtDate(item.creado_en)}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Incidentes de chat</Text>
            <TouchableOpacity onPress={() => openDashboardScreen('CeoChatIncidents')}>
              <Text style={s.sectionLink}>Ver todo</Text>
            </TouchableOpacity>
          </View>
          {incidents.length === 0 ? (
            <Text style={s.empty}>No hay incidentes abiertos recientes.</Text>
          ) : incidents.map((item) => (
            <View key={item.id} style={s.row}>
              <Text style={[s.rowTitle, { color: severityColor(item.severity) }]}>{item.category}</Text>
              <Text style={s.rowBadge}>{incidentStatusLabel(item.status)}</Text>
              <Text style={s.rowSub}>{item.source === 'market' ? 'Chat comercial' : 'Chat logístico'}</Text>
              <Text style={s.rowMeta}>{fmtDate(item.created_at)}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Errores UI recientes</Text>
            <TouchableOpacity onPress={() => openDashboardScreen('CeoGlobalActivity', { initialEventType: 'error_ui', title: 'Errores UI', subtitle: 'Eventos de error de interfaz filtrados para revisión prioritaria.' })}>
              <Text style={s.sectionLink}>Ver todo</Text>
            </TouchableOpacity>
          </View>
          {uiErrors.length === 0 ? (
            <Text style={s.empty}>No hay errores UI registrados en este corte.</Text>
          ) : uiErrors.map((item) => (
            <View key={item.id} style={s.row}>
              <Text style={s.rowTitle}>{item.event_name}</Text>
              <Text style={s.rowBadge}>{item.actor_role ?? 'sin rol'}</Text>
              <Text style={s.rowSub}>{item.screen ?? 'sin pantalla'}{item.module ? ` · ${item.module}` : ''}</Text>
              <Text style={s.rowMeta}>{fmtDate(item.created_at)}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Accesos recientes</Text>
            <TouchableOpacity onPress={() => openDashboardScreen('CeoAccessSessions')}>
              <Text style={s.sectionLink}>Ver todo</Text>
            </TouchableOpacity>
          </View>
          {sessions.length === 0 ? (
            <Text style={s.empty}>No hay sesiones recientes disponibles.</Text>
          ) : sessions.map((item) => (
            <View key={item.id} style={s.row}>
              <Text style={s.rowTitle}>{item.actor_name?.trim() || item.actor_id.slice(0, 8)}</Text>
              <Text style={s.rowBadge}>{roleLabel(item.actor_role)}</Text>
              <Text style={s.rowSub}>{[item.municipio, item.estado_ve].filter(Boolean).join(', ') || 'Sin ubicación resuelta'}</Text>
              <Text style={s.rowMeta}>{fmtDate(item.created_at)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CEO_COLORS.bg },
  content: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  title: { fontSize: 24, fontWeight: FONT.weights.bold, color: CEO_COLORS.text },
  sub: { marginTop: 6, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.sm, lineHeight: 20 },
  errorTxt: { marginTop: SPACE.sm, color: CEO_COLORS.red, fontSize: FONT.sizes.sm, lineHeight: 20 },
  heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.md, marginBottom: SPACE.md },
  heroCard: {
    width: '47%',
    borderRadius: 24,
    padding: SPACE.md,
    backgroundColor: CEO_COLORS.panel,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    ...SHADOW.sm,
  },
  heroLabel: { color: CEO_COLORS.textMute, fontSize: FONT.sizes.xs, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: FONT.weights.bold },
  heroValue: { marginTop: 10, color: CEO_COLORS.text, fontSize: 28, fontWeight: FONT.weights.bold },
  heroCaption: { marginTop: 4, color: CEO_COLORS.textMute, fontSize: FONT.sizes.xs, textTransform: 'uppercase', letterSpacing: 1 },
  heroLink: { marginTop: 10, color: CEO_COLORS.cyan, fontWeight: FONT.weights.bold },
  section: {
    marginBottom: SPACE.md,
    borderRadius: 24,
    padding: SPACE.md,
    backgroundColor: CEO_COLORS.panelSoft,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm },
  sectionTitle: { color: CEO_COLORS.text, fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold },
  sectionLink: { color: CEO_COLORS.cyan, fontWeight: FONT.weights.bold },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: CEO_COLORS.border,
  },
  rowTitle: { color: CEO_COLORS.text, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  rowBadge: { marginTop: 4, color: CEO_COLORS.amber, fontSize: FONT.sizes.xs, fontWeight: FONT.weights.bold, textTransform: 'uppercase' },
  rowSub: { marginTop: 4, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.sm },
  rowMeta: { marginTop: 4, color: CEO_COLORS.textMute, fontSize: FONT.sizes.xs },
  empty: { color: CEO_COLORS.textSoft, fontSize: FONT.sizes.sm },
});
