/**
 * Panel empresa — Unicornio B2B: cream + slate + dorado en KPIs.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { CommonActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/shared/store/AuthContext';
import { authService } from '@/shared/services/authService';
import { supabase } from '@/shared/lib/supabase';
import { NotificationsCenterModal } from '@/shared/components/NotificationsCenterModal';
import { SolicitarTransporteModal } from '@/shared/components/SolicitarTransporteModal';
import { OportunidadesDemandaModal } from '@/shared/components/OportunidadesDemandaModal';
import { getCommercialStatusLabel } from '@/shared/lib/accountStatus';
import { CATEGORIA_DESTINO_REQUERIMIENTO } from '@/shared/services/marketDemandService';
import type { CompanyStackParamList } from '@/features/company/navigation/types';
import { useCompany } from '../hooks/useCompany';
import { SHADOW } from '@/shared/utils/theme';
import { listFieldInspectionTimelineByCompany } from '@/shared/services/fieldInspectionTimelineService';
import type { FieldInspection } from '@/shared/types';
import { listarLotesFinanciadosPorEmpresa } from '@/shared/services/financingService';

type Nav = NativeStackNavigationProp<CompanyStackParamList, 'CompanyHome'>;

const SLATE = '#0F172A';
const FOREST = '#0F3B25';
const CREAM = '#FDFBF7';
const GOLD = '#FBBF24';

interface Stats {
  productores: number;
  hectareas: number;
  camiones: number;
  peritos: number;
}

export default function CompanyDashboard() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { perfil, isVerificado } = useAuth();
  const { company, loadError, refresh: refreshCompany } = useCompany();
  const [stats, setStats] = useState<Stats>({ productores: 0, hectareas: 0, camiones: 0, peritos: 0 });
  const [refresh, setRefresh] = useState(false);
  const [freightModal, setFreightModal] = useState(false);
  const [demandaIndustrialModal, setDemandaIndustrialModal] = useState(false);
  const [transitoTxt, setTransitoTxt] = useState('Sin operaciones en ruta');
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [inspectionFeed, setInspectionFeed] = useState<FieldInspection[]>([]);
  const [dataIssueMsg, setDataIssueMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!perfil) return;
    if (!company?.id) {
      setDataIssueMsg(null);
      return;
    }

    const TIMEOUT_MS = 10_000;
    const withTimeout = <T,>(p: PromiseLike<T>, fallback: T): Promise<T> => {
      let timer: ReturnType<typeof setTimeout>;
      const t = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), TIMEOUT_MS); });
      return Promise.race([Promise.resolve(p).finally(() => clearTimeout(timer)), t]);
    };
    setDataIssueMsg(null);

    const [
      { count: nPeritos, error: _ePeritos },
      { count: nProducers, error: _eProducers },
      { count: nFleet, error: _eFleet },
      inspectionRows,
      financedLots,
    ] = await withTimeout(
      Promise.all([
        supabase.from('company_employees').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('activo', true)
          .then(({ count, error }) => ({ count, error })),
        supabase.from('company_affiliations').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('activo', true)
          .then(({ count, error }) => ({ count, error })),
        supabase.from('company_fleet_units').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('activo', true)
          .then(({ count, error }) => ({ count, error })),
        listFieldInspectionTimelineByCompany(company.id, 4).catch(() => []),
        listarLotesFinanciadosPorEmpresa(company.id).catch(() => []),
      ]),
      [
        { count: null, error: null },
        { count: null, error: null },
        { count: null, error: null },
        [] as FieldInspection[],
        [],
      ] as const,
    );
    const metricsTimedOut = nPeritos == null || nProducers == null || nFleet == null;
    if (_ePeritos) console.warn('[CompanyDashboard] peritos:', _ePeritos.message);
    if (_eProducers) console.warn('[CompanyDashboard] producers:', _eProducers.message);
    if (_eFleet) console.warn('[CompanyDashboard] fleet:', _eFleet.message);
    const haTotal = financedLots.reduce((acc, row) => {
      const assigned = typeof row.hectareas_asignadas === 'number' ? row.hectareas_asignadas : null;
      const fallback = typeof row.finca?.hectareas === 'number' ? row.finca.hectareas : 0;
      return acc + (assigned ?? fallback);
    }, 0);

    const { count: nFreightActive, error: freightErr } = await withTimeout(
      supabase
        .from('freight_requests')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', perfil.id)
        .in('estado', ['abierta', 'con_postulaciones', 'asignada'])
        .then(({ count, error }) => ({ count, error })),
      { count: null, error: null },
    );

    if (!freightErr && (nFreightActive ?? 0) > 0) {
      setTransitoTxt(`${nFreightActive} solicitud(es) de flete activa(s)`);
    } else {
      setTransitoTxt('Sin operaciones en ruta');
    }
    if (metricsTimedOut || freightErr) {
      setDataIssueMsg('Algunos indicadores no pudieron cargarse completos. Desliza para reintentar y confirmar los datos del negocio.');
    }

    setStats({
      productores: nProducers ?? 0,
      hectareas: Math.round(haTotal * 10) / 10,
      camiones: nFleet ?? 0,
      peritos: nPeritos ?? 0,
    });
    setInspectionFeed(inspectionRows);
  }, [perfil, company?.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useFocusEffect(
    useCallback(() => {
      void refreshCompany();
    }, [refreshCompany]),
  );

  const onRefresh = async () => {
    setRefresh(true);
    await refreshCompany();
    await cargar();
    setRefresh(false);
  };

  const openNotificaciones = () => setNotifModalVisible(true);

  const openCompanySetup = () => {
    const parentNav = (navigation as unknown as { getParent?: () => { dispatch: (action: object) => void } | undefined }).getParent?.();
    if (parentNav) {
      parentNav.dispatch(
        CommonActions.navigate({
          name: 'PerfilEmpresa',
          params: { screen: 'CompanyProfileSettingsForm' },
        }),
      );
      return;
    }
    Alert.alert('Empresa', 'No pudimos abrir automáticamente el perfil de empresa. Ve a la pestaña Perfil y toca "Datos de empresa".');
  };

  const fmtKpi = (n: number) => {
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(1);
  };

  const kpiItems: {
    key: keyof Stats;
    label: string;
    sub: string;
    icon: keyof typeof Ionicons.glyphMap;
    tone: string;
    soft: string;
  }[] = [
    { key: 'productores', label: 'Productores vinculados', sub: 'Relación activa con tu empresa', icon: 'people-outline', tone: '#38bdf8', soft: 'rgba(56,189,248,0.14)' },
    { key: 'hectareas', label: 'Hectáreas vinculadas', sub: 'Suma de lotes productivos activos', icon: 'grid-outline', tone: '#34d399', soft: 'rgba(52,211,153,0.14)' },
    { key: 'camiones', label: 'Unidades activas', sub: 'Flota propia disponible hoy', icon: 'bus-outline', tone: '#fbbf24', soft: 'rgba(251,191,36,0.16)' },
    { key: 'peritos', label: 'Peritos activos', sub: 'Equipo técnico habilitado', icon: 'shield-checkmark-outline', tone: '#f472b6', soft: 'rgba(244,114,182,0.14)' },
  ];
  const kpiStatusLabel = (value: number) => (value > 0 ? 'Dato real' : 'Sin actividad');

  return (
    <View style={s.root}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={FOREST} />}
        contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top, 16) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.hero}>
          <View style={s.heroActions}>
            <TouchableOpacity style={s.heroBell} onPress={openNotificaciones} hitSlop={10} accessibilityLabel="Notificaciones">
              <Ionicons name="notifications-outline" size={22} color="#cbd5e1" />
            </TouchableOpacity>
            <TouchableOpacity style={s.heroBell} onPress={() => void authService.logout().catch(() => undefined)} hitSlop={10} accessibilityLabel="Cerrar sesión">
              <Ionicons name="log-out-outline" size={20} color="#fca5a5" />
            </TouchableOpacity>
          </View>
          <Text style={s.watermark}>🏢</Text>
          <View style={s.heroTop}>
            <View style={s.badgeRow}>
              <View style={s.badgeVer}>
                <Text style={s.badgeVerTxt}>{isVerificado ? 'Operativa' : getCommercialStatusLabel(perfil)}</Text>
              </View>
              <Text style={s.rifTxt}>RIF: {company?.rif ?? '–'}</Text>
            </View>
            <Text style={s.heroTitle}>{company?.razon_social ?? perfil?.nombre ?? 'Empresa'}</Text>
            <View style={s.sedeRow}>
              <Ionicons name="location-outline" size={12} color="#94a3b8" style={{ marginRight: 6 }} />
              <Text style={s.sedeTxt}>Sede principal: {perfil?.estado_ve ?? '—'}</Text>
            </View>
          </View>
          <View style={s.liveStrip}>
            <View style={s.liveLeft}>
              <View style={s.pingWrap}>
                <View style={s.pingOuter} />
                <View style={s.pingInner} />
              </View>
                <Text style={[s.liveLabel, { marginLeft: 10 }]}>Flete externo</Text>
            </View>
            <Text style={s.liveVal} numberOfLines={2}>
              {transitoTxt}
            </Text>
          </View>
        </View>
        {loadError ? (
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>Configuración de empresa pendiente</Text>
            <Text style={s.errorText}>{loadError}</Text>
            <TouchableOpacity style={s.errorBtn} onPress={openCompanySetup} activeOpacity={0.88}>
              <Text style={s.errorBtnTxt}>Completar datos de empresa</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {dataIssueMsg ? (
          <View style={s.warnCard}>
            <Text style={s.warnTitle}>Carga parcial</Text>
            <Text style={s.warnText}>{dataIssueMsg}</Text>
          </View>
        ) : null}

        <View style={s.sectionHead}>
          <View style={s.sectionBarGold} />
          <Text style={s.sectionTitle}>Indicadores clave</Text>
        </View>
        <View style={s.kpiGrid}>
          {kpiItems.map((k) => (
            <View key={k.key} style={s.kpiCard}>
              <View style={s.kpiTopRow}>
                <View style={[s.kpiIconCircle, { backgroundColor: k.soft, borderColor: k.soft }]}>
                  <Ionicons name={k.icon} size={20} color={k.tone} />
                </View>
                <Text style={[s.kpiChip, { color: k.tone, backgroundColor: k.soft }]}>
                  {kpiStatusLabel(Number(stats[k.key]) || 0)}
                </Text>
              </View>
              <Text style={s.kpiVal}>{fmtKpi(stats[k.key])}</Text>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Text style={s.kpiSub}>{k.sub}</Text>
            </View>
          ))}
        </View>

        <View style={s.sectionHead}>
          <View style={s.sectionBarGold} />
          <Text style={s.sectionTitle}>Peritaje en campo</Text>
        </View>
        <View style={s.inspectionPanel}>
          <Text style={s.inspectionPanelLead}>
            Últimas actas y visitas para tomar decisiones operativas con mejor trazabilidad.
          </Text>
          {inspectionFeed.length ? (
            inspectionFeed.map((item) => (
              <View key={item.id} style={s.inspectionRow}>
                <View style={s.inspectionRowTop}>
                  <Text style={s.inspectionControl}>{item.numero_control}</Text>
                  <Text style={s.inspectionBadge}>{item.estado_acta ?? item.estatus}</Text>
                </View>
                <Text style={s.inspectionTitle}>
                  {item.finca?.nombre ?? 'Lote sin finca'}{item.productor?.nombre ? ` · ${item.productor.nombre}` : ''}
                </Text>
                <Text style={s.inspectionMeta}>
                  {item.tipo_inspeccion ?? 'seguimiento_tecnico'} · {item.fecha_programada}
                </Text>
                <Text style={s.inspectionSummary} numberOfLines={2}>
                  {item.resumen_dictamen ?? item.observaciones_tecnicas ?? 'Sin dictamen resumido aún.'}
                </Text>
              </View>
            ))
          ) : (
            <Text style={s.inspectionEmpty}>Cuando la empresa asigne peritos, aquí verás el pulso técnico de cada lote.</Text>
          )}
        </View>

        <TouchableOpacity
          style={s.demandaCard}
          onPress={() => setDemandaIndustrialModal(true)}
          activeOpacity={0.9}
          accessibilityLabel="Requerimientos industriales"
        >
          <View style={s.demandaIconBox}>
            <Ionicons name="sparkles-outline" size={26} color={GOLD} />
          </View>
          <View style={s.demandaTextCol}>
            <Text style={s.demandaEyebrow}>Mercado B2B</Text>
            <Text style={s.demandaTitle}>Requerimientos industriales</Text>
            <Text style={s.demandaSub}>Demanda de compradores · volumen procesado y silos · no pierdas oportunidades</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={GOLD} />
        </TouchableOpacity>

        <View style={s.sectionHead}>
          <View style={s.sectionBarGold} />
          <Text style={s.sectionTitle}>Accesos rápidos</Text>
        </View>
        <View style={s.quickRow}>
          <TouchableOpacity style={s.quickBtn} onPress={() => navigation.navigate('RegisteredFarmsList')} activeOpacity={0.9}>
            <View style={s.quickIconWrap}>
              <Ionicons name="map-outline" size={26} color="#fff" />
            </View>
            <View style={s.quickTextCol}>
              <Text style={s.quickBtnTxt}>Fincas registradas</Text>
              <Text style={s.quickBtnHint}>Patrimonio en campo</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity style={s.quickBtn} onPress={() => navigation.navigate('ActiveHarvestsList')} activeOpacity={0.9}>
            <View style={s.quickIconWrap}>
              <Ionicons name="layers-outline" size={26} color="#fff" />
            </View>
            <View style={s.quickTextCol}>
              <Text style={s.quickBtnTxt}>Materia prima</Text>
              <Text style={s.quickBtnHint}>Pipeline de cosechas</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity style={s.quickBtn} onPress={() => navigation.navigate('FleetManagement')} activeOpacity={0.9}>
            <View style={s.quickIconWrap}>
              <Ionicons name="bus-outline" size={26} color="#fff" />
            </View>
            <View style={s.quickTextCol}>
              <Text style={s.quickBtnTxt}>Flota propia</Text>
              <Text style={s.quickBtnHint}>Gandolas y unidades</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.fleteBanner} onPress={() => setFreightModal(true)} activeOpacity={0.9}>
          <Ionicons name="git-compare-outline" size={22} color={SLATE} />
          <View style={{ flex: 1 }}>
            <Text style={s.fleteBannerTitle}>Solicitar transporte externo</Text>
            <Text style={s.fleteBannerSub}>Publica la necesidad en la pizarra para captar transportistas de terceros</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={26} color={SLATE} />
        </TouchableOpacity>

        <View style={[s.sectionHead, { marginTop: 8 }]}>
          <View style={s.sectionBarGold} />
          <Text style={s.sectionTitle}>Gestión operativa</Text>
        </View>
        <View style={s.menuCard}>
          <TouchableOpacity
            style={[s.menuRow, s.menuRowBorder]}
            onPress={() => navigation.navigate('AffiliatedFarmersList')}
            activeOpacity={0.85}
          >
            <Ionicons name="briefcase-outline" size={22} color={SLATE} />
            <Text style={s.menuLabel}>Cartera de productores</Text>
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.menuRow, s.menuRowBorder]}
            onPress={() => navigation.navigate('CompanyEmployeesList')}
            activeOpacity={0.85}
          >
            <Ionicons name="shield-checkmark-outline" size={22} color={SLATE} />
            <Text style={s.menuLabel}>Peritos y asignaciones</Text>
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.menuRow, s.menuRowBorder]}
            onPress={() => navigation.navigate('AffiliatedTransportersList')}
            activeOpacity={0.85}
          >
            <Ionicons name="people-circle-outline" size={22} color={SLATE} />
            <Text style={s.menuLabel}>Transportistas aliados</Text>
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
          </TouchableOpacity>
          <TouchableOpacity style={s.menuRow} onPress={() => navigation.navigate('AnalyticsDashboard')} activeOpacity={0.85}>
            <Ionicons name="bar-chart-outline" size={22} color={SLATE} />
            <Text style={s.menuLabel}>Reportes y estadísticas</Text>
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
          </TouchableOpacity>
        </View>
      </ScrollView>
      <SolicitarTransporteModal
        visible={freightModal}
        onClose={() => setFreightModal(false)}
        perfil={perfil ?? null}
        initialMode="pizarra"
        lockMode
        title="Solicitar transporte externo"
      />
      <OportunidadesDemandaModal
        visible={demandaIndustrialModal}
        onClose={() => setDemandaIndustrialModal(false)}
        categoriaDestino={CATEGORIA_DESTINO_REQUERIMIENTO.volumenProcesadoSilos}
        title="Demanda de compradores"
        subtitle="Oportunidades B2B para volumen procesado, silos y agroindustria. Valida ubicación y plazo."
        variant="company"
      />
      <NotificationsCenterModal
        visible={notifModalVisible}
        onClose={() => setNotifModalVisible(false)}
        userId={perfil?.id}
        companyId={company?.id}
        subtitle="Fletes, inspecciones y avisos de tu empresa"
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  hero: {
    backgroundColor: SLATE,
    borderRadius: 24,
    padding: 22,
    marginBottom: 20,
    overflow: 'hidden',
    position: 'relative',
    ...SHADOW.md,
  },
  heroActions: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 4,
    flexDirection: 'row',
    gap: 8,
  },
  heroBell: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  watermark: {
    position: 'absolute',
    right: -16,
    top: -20,
    fontSize: 120,
    opacity: 0.08,
  },
  heroTop: { marginBottom: 16 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  badgeVer: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    marginRight: 8,
  },
  badgeVerTxt: { fontSize: 9, fontWeight: '900', color: GOLD, textTransform: 'uppercase', letterSpacing: 1.5 },
  rifTxt: { fontSize: 9, fontWeight: '800', color: '#94a3b8' },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#fff',
    letterSpacing: -0.5,
  },
  sedeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  sedeTxt: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  liveStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
  },
  liveLeft: { flexDirection: 'row', alignItems: 'center' },
  pingWrap: { width: 12, height: 12, justifyContent: 'center', alignItems: 'center' },
  pingOuter: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GOLD,
    opacity: 0.45,
  },
  pingInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  liveLabel: { fontSize: 10, fontWeight: '900', color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: 2 },
  liveVal: { flex: 1, marginLeft: 10, fontSize: 12, fontWeight: '800', color: '#f8fafc', textAlign: 'right' },
  errorCard: {
    backgroundColor: '#fff7ed',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fdba74',
    marginBottom: 20,
    ...SHADOW.sm,
  },
  errorTitle: { color: '#9a3412', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  errorText: { color: '#7c2d12', fontSize: 12, marginTop: 8, lineHeight: 18, fontWeight: '600' },
  errorBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: SLATE,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  warnCard: {
    backgroundColor: '#FEFCE8',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 20,
    ...SHADOW.sm,
  },
  warnTitle: { color: '#854D0E', fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  warnText: { color: '#713F12', fontSize: 12, marginTop: 8, lineHeight: 18, fontWeight: '600' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 4 },
  sectionBarGold: { width: 4, height: 16, borderRadius: 4, backgroundColor: GOLD, marginRight: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: SLATE,
    textTransform: 'uppercase',
    fontStyle: 'italic',
    letterSpacing: 0.8,
  },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  kpiCard: {
    width: '48%',
    backgroundColor: SLATE,
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    ...SHADOW.md,
  },
  kpiTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  kpiIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  kpiChip: {
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  kpiVal: { fontSize: 26, fontWeight: '900', color: GOLD, letterSpacing: -0.5 },
  kpiLabel: { fontSize: 10, fontWeight: '900', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },
  kpiSub: { fontSize: 9, color: '#94a3b8', fontWeight: '600', marginTop: 4 },
  kpiMeterTrack: {
    marginTop: 14,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  kpiMeterFill: {
    height: '100%',
    borderRadius: 999,
  },
  inspectionPanel: {
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 20,
    ...SHADOW.md,
  },
  inspectionPanelLead: { fontSize: 12, color: '#475569', lineHeight: 18, marginBottom: 12, fontWeight: '600' },
  inspectionRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  inspectionRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  inspectionControl: { fontSize: 11, fontWeight: '900', color: SLATE, textTransform: 'uppercase', letterSpacing: 0.8 },
  inspectionBadge: {
    fontSize: 10,
    color: '#7c2d12',
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '800',
  },
  inspectionTitle: { marginTop: 6, fontSize: 13, fontWeight: '900', color: SLATE },
  inspectionMeta: { marginTop: 4, fontSize: 11, color: '#64748b', fontWeight: '700' },
  inspectionSummary: { marginTop: 6, fontSize: 12, color: '#475569', lineHeight: 18 },
  inspectionEmpty: { fontSize: 12, color: '#94a3b8', lineHeight: 18, fontWeight: '600' },
  demandaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SLATE,
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.45)',
    gap: 14,
    ...SHADOW.md,
  },
  demandaIconBox: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(251,191,36,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  demandaTextCol: { flex: 1, minWidth: 0 },
  demandaEyebrow: { fontSize: 9, fontWeight: '900', color: GOLD, letterSpacing: 2, textTransform: 'uppercase' },
  demandaTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  demandaSub: { marginTop: 6, fontSize: 12, color: '#94a3b8', fontWeight: '600', lineHeight: 17 },
  quickRow: { gap: 10, marginBottom: 16 },
  quickBtn: {
    backgroundColor: SLATE,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...SHADOW.md,
  },
  quickIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(251,191,36,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
  },
  quickTextCol: { flex: 1, minWidth: 0 },
  quickBtnTxt: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  quickBtnHint: { fontSize: 10, color: '#94a3b8', fontWeight: '600', marginTop: 4 },
  fleteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...SHADOW.md,
  },
  fleteBannerTitle: { fontSize: 14, fontWeight: '900', color: SLATE },
  fleteBannerSub: { fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: '600' },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    overflow: 'hidden',
    marginBottom: 24,
    ...SHADOW.md,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  menuLabel: { flex: 1, fontSize: 13, fontWeight: '800', color: SLATE },
});
