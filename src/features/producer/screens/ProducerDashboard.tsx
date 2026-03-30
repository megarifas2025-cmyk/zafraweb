/**
 * Tablero agricultor — `diseños/agricultor.txt` (Unicornio): crema #FDFBF7, verde #0F3B25, oro #FBBC24,
 * Consola Operativa, Mis Lotes, datos reales Supabase.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@/shared/store/AuthContext';
import { useChatUnread } from '@/shared/store/ChatUnreadContext';
import { authService } from '@/shared/services/authService';
import type { ProducerStackParamList } from '@/features/producer/navigation/types';
import { supabase } from '@/shared/lib/supabase';
import { WeatherTicker } from '@/shared/components/WeatherTicker';
import { NotificationsCenterModal } from '@/shared/components/NotificationsCenterModal';
import { SolicitarTransporteModal } from '@/shared/components/SolicitarTransporteModal';
import { FitosanitarioSosModal } from '@/shared/components/FitosanitarioSosModal';
import { YieldCalculator } from '@/shared/components/YieldCalculator';
import { ProducerIdentityHeader } from '@/features/producer/components/ProducerIdentityHeader';
import { OportunidadesDemandaModal } from '@/shared/components/OportunidadesDemandaModal';
import { PlagueRadarModal } from '@/features/producer/components/PlagueRadarModal';
import { HistorialVentasModal } from '@/features/producer/components/HistorialVentasModal';
import { CATEGORIA_DESTINO_REQUERIMIENTO } from '@/shared/services/marketDemandService';
import { listAffiliationsForProducer, respondToAffiliation, type CompanyAffiliation } from '@/shared/services/companyAffiliationsService';
import {
  listarFinanciamientosComoProductor,
  resumirFinanciamientosProductor,
  type LoteFinanciadoProductor,
} from '@/shared/services/financingService';
import { logWarn, serializeError } from '@/shared/runtime/appLogger';
import { buildAgronomicAssistantSnapshot, type AgronomicAssistantSnapshot, type LocalFieldEvent } from '@/features/producer/services/agronomicAssistantService';
import { weatherService } from '@/shared/services/weatherService';
import { cachearFincas, leerFincasLocales, listarDiarioLocal, useOfflineSync } from '@/hooks/useOfflineSync';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import { normalizeFincaCoordenadas } from '@/shared/utils/geo';
import type { Finca, Cosecha, AlertaClima, FieldInspection } from '@/shared/types';
import { listFieldInspectionTimelineByProducer } from '@/shared/services/fieldInspectionTimelineService';

const CREAM = '#FDFBF7';
const SLATE = '#0F172A';
const FOREST = '#0F3B25';

type ProducerNav = NativeStackNavigationProp<ProducerStackParamList, 'ProducerHome'>;

function parseClimaLinea(line: string, perfilNombre: string | undefined): { lugar: string; detalle: string } {
  if (!line || line.includes('activa ubicación')) {
    return { lugar: '—', detalle: 'Activa ubicación para clima en vivo' };
  }
  const i = line.indexOf(':');
  if (i === -1) return { lugar: perfilNombre || '—', detalle: line };
  const lugar = line.slice(0, i).trim();
  const resto = line.slice(i + 1).trim().replace(/\s*[–-]\s*/g, ' • ');
  return { lugar, detalle: resto };
}

function isUnavailableLocationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('current location is unavailable')
    || normalized.includes('location services are enabled')
    || normalized.includes('location provider is unavailable');
}

function cosechaEstadoLabel(estado: string): string {
  switch (estado) {
    case 'borrador':
      return 'Borrador';
    case 'publicada':
      return 'Publicada';
    case 'negociando':
      return 'En negociacion';
    case 'vendida':
      return 'Vendida';
    case 'cancelada':
      return 'Cancelada';
    default:
      return estado;
  }
}

type ToolDef = {
  key: string;
  label: string;
  emoji: string;
  bg: string;
  onPress: () => void;
  disabled?: boolean;
};

export default function ProducerDashboard() {
  const { contarPendientes, intentarSync } = useOfflineSync();
  const navigation = useNavigation<ProducerNav>();
  const route = useRoute<RouteProp<ProducerStackParamList, 'ProducerHome'>>();
  const { perfil, isVerificado } = useAuth();
  const { mercadoUnread } = useChatUnread();
  const [fincas, setFincas] = useState<Finca[]>([]);
  const [cosechas, setCosechas] = useState<Cosecha[]>([]);
  const [localEntries, setLocalEntries] = useState<LocalFieldEvent[]>([]);
  const [alertas, setAlertas] = useState<AlertaClima[]>([]);
  const [clima, setClima] = useState<string>('');
  const [refresh, setRefresh] = useState(false);
  const [freightModal, setFreightModal] = useState(false);
  const [freightPrefill, setFreightPrefill] = useState<{ peso?: string; descripcion?: string } | null>(null);
  const [sosModal, setSosModal] = useState(false);
  const [oppVentaDirectaModal, setOppVentaDirectaModal] = useState(false);
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [radarModalVisible, setRadarModalVisible] = useState(false);
  const [historialVentasModal, setHistorialVentasModal] = useState(false);
  const [affiliations, setAffiliations] = useState<CompanyAffiliation[]>([]);
  const [financedLots, setFinancedLots] = useState<LoteFinanciadoProductor[]>([]);
  const [assistantSnapshot, setAssistantSnapshot] = useState<AgronomicAssistantSnapshot | null>(null);
  const [affActionId, setAffActionId] = useState<string | null>(null);
  const [inspectionFeed, setInspectionFeed] = useState<FieldInspection[]>([]);
  const { lugar: climaLugar, detalle: climaDetalle } = parseClimaLinea(clima, perfil?.municipio ?? perfil?.estado_ve);
  const climaTicker = clima && !clima.includes('Obteniendo') ? clima : undefined;
  const financedSummaries = useMemo(() => resumirFinanciamientosProductor(financedLots), [financedLots]);

  const cargar = useCallback(async () => {
    if (!perfil) return;
    const [f, c, a, aff, financed, inspections] = await Promise.all([
      supabase.from('fincas').select('*').eq('propietario_id', perfil.id),
      supabase.from('cosechas').select('*').eq('agricultor_id', perfil.id).neq('estado', 'cancelada').order('creado_en', { ascending: false }).limit(5),
      supabase.from('alertas_clima').select('*').eq('perfil_id', perfil.id).eq('leida', false).order('creado_en', { ascending: false }).limit(3),
      listAffiliationsForProducer(perfil.id).catch((error: unknown) => {
        logWarn('producer.dashboard.affiliations', 'No se pudieron cargar las afiliaciones del productor.', {
          perfilId: perfil.id,
          error: serializeError(error),
        });
        return [];
      }),
      listarFinanciamientosComoProductor(perfil.id).catch((error: unknown) => {
        logWarn('producer.dashboard.financed_lots', 'No se pudieron cargar los lotes financiados del productor.', {
          perfilId: perfil.id,
          error: serializeError(error),
        });
        return [];
      }),
      listFieldInspectionTimelineByProducer(perfil.id, 4).catch((error: unknown) => {
        logWarn('producer.dashboard.inspections', 'No se pudieron cargar las inspecciones del productor.', {
          perfilId: perfil.id,
          error: serializeError(error),
        });
        return [];
      }),
    ]);
    if (f.error) {
      logWarn('producer.dashboard.fincas', 'No se pudieron cargar las fincas del productor.', {
        perfilId: perfil.id,
        message: f.error.message,
        code: f.error.code ?? null,
      });
    }
    if (c.error) {
      logWarn('producer.dashboard.cosechas', 'No se pudieron cargar las cosechas del productor.', {
        perfilId: perfil.id,
        message: c.error.message,
        code: c.error.code ?? null,
      });
    }
    if (a.error) {
      logWarn('producer.dashboard.alertas', 'No se pudieron cargar las alertas del productor.', {
        perfilId: perfil.id,
        message: a.error.message,
        code: a.error.code ?? null,
      });
    }
    if (f.data) {
      const rows = f.data as Finca[];
      const mapped = rows.map((row) => ({
        ...row,
        coordenadas: normalizeFincaCoordenadas(row.coordenadas) as Finca['coordenadas'],
      }));
      setFincas(mapped);
      cachearFincas(mapped as object[]);
    } else if (!f.error) {
      const cached = leerFincasLocales() as Finca[];
      setFincas(cached);
    }
    if (c.data) setCosechas(c.data as Cosecha[]);
    else if (!c.error) setCosechas([]);
    if (a.data) setAlertas(a.data as AlertaClima[]);
    else if (!a.error) setAlertas([]);
    setAffiliations(aff);
    setFinancedLots(financed);
    setInspectionFeed(inspections);
    setLocalEntries(perfil ? (listarDiarioLocal(perfil.id) as LocalFieldEvent[]) : []);
  }, [perfil]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!perfil) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelado) return;
      if (status !== 'granted') {
        setClima(`⛅ ${perfil.estado_ve}: activa ubicación (Ajustes) para ver temperatura y condición en tu municipio`);
        return;
      }
      let loc;
      try {
        loc = await Location.getCurrentPositionAsync({});
      } catch (error) {
        if (!cancelado) {
          setClima(
            isUnavailableLocationError(error)
              ? `⛅ ${perfil.estado_ve}: ubicación no disponible, usando modo sin clima en vivo`
              : `⛅ ${perfil.estado_ve}: no se pudo obtener la ubicación para el clima`,
          );
        }
        return;
      }
      if (cancelado) return;
      const c = await weatherService.obtenerPorCoordenadas(loc.coords.latitude, loc.coords.longitude);
      if (cancelado) return;
      const linea = c.descripcion === 'Sin conexión'
        ? `⛅ ${perfil.estado_ve} – no se pudo obtener clima en vivo`
        : [
            c.temperatura ? `${c.temperatura}°C` : null,
            c.sensacionTermica != null ? `ST ${c.sensacionTermica}°C` : null,
            c.humedad != null ? `💧${c.humedad}%` : null,
            c.descripcion,
          ].filter(Boolean).join(' · ');
      setClima(linea);
      if (fincas.length > 0 && c.descripcion !== 'Sin conexión') {
        const primeraFinca = fincas[0];
        const lluvia = primeraFinca?.coordenadas
          ? await weatherService.lluviaAcumuladaProximasHoras(primeraFinca.coordenadas.lat, primeraFinca.coordenadas.lng)
          : { mm: 0, sinApi: true };
        const alerts = await weatherService.generarAlertasAgricolas({
          clima: c,
          rubro: primeraFinca?.rubro,
          mmLluviaProxima: lluvia.mm,
          stageLabel: assistantSnapshot?.stageLabel,
        });
        const heatAlert = await weatherService.generarAlerta(c, primeraFinca?.rubro);
        const allAlerts = [...alerts, ...(heatAlert ? [heatAlert] : [])];
        for (const alerta of allAlerts) {
          await weatherService.guardarAlerta(perfil.id, alerta, primeraFinca?.id);
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [perfil, fincas, assistantSnapshot?.stageLabel]);

  useEffect(() => {
    const snapshot = buildAgronomicAssistantSnapshot({
      fincas,
      cosechas,
      localEntries,
      currentClimate: clima
        ? {
            municipio: climaLugar,
            temperatura: Number.parseInt((climaDetalle.match(/-?\d+/)?.[0] ?? '0'), 10) || 0,
            descripcion: climaDetalle,
          }
        : null,
    });
    setAssistantSnapshot(snapshot);
  }, [fincas, cosechas, localEntries, clima, climaDetalle, climaLugar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!route.params?.openScan) return;
    navigation.setParams({ openScan: undefined });
    const t = setTimeout(() => {
      setSosModal(true);
    }, 400);
    return () => clearTimeout(t);
  }, [route.params?.openScan, navigation]);

  const onRefresh = async () => {
    setRefresh(true);
    await cargar();
    await intentarSync();
    setRefresh(false);
  };

  const openNotificaciones = () => setNotifModalVisible(true);

  const pendingAffiliations = affiliations.filter((item) => item.status === 'pending');
  const activeAffiliations = affiliations.filter((item) => item.status === 'active');

  const responderInvitacion = async (affiliationId: string, accept: boolean) => {
    setAffActionId(affiliationId);
    try {
      await respondToAffiliation(affiliationId, accept);
      await cargar();
      Alert.alert(
        accept ? 'Vinculación aceptada' : 'Invitación rechazada',
        accept ? 'La empresa ya aparece vinculada a tu perfil productivo.' : 'La invitación fue descartada.',
      );
    } catch (error: unknown) {
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo responder la invitación.');
    } finally {
      setAffActionId(null);
    }
  };

  const openClimaTab = () => {
    navigation.getParent()?.navigate('Clima' as never);
  };

  const nombreCorto = perfil?.nombre?.split(' ')[0] ?? 'Productor';

  const ESTADO_COLOR: Record<string, string> = {
    borrador: COLORS.textDisabled,
    publicada: COLORS.success,
    negociando: COLORS.warning,
    vendida: COLORS.info,
  };

  const tools: ToolDef[] = [
    { key: 'flete', label: 'Solicitar Flete', emoji: '🚚', bg: '#EFF6FF', onPress: () => { setFreightPrefill(null); setFreightModal(true); } },
    { key: 'sos', label: 'S.O.S Fitosan.', emoji: '🆘', bg: '#FFF1F2', onPress: () => setSosModal(true) },
    { key: 'radar', label: 'Radar Plagas', emoji: '📡', bg: '#EEF2FF', onPress: () => setRadarModalVisible(true) },
    {
      key: 'vender',
      label: 'Publicar cosecha',
      emoji: '📦',
      bg: '#FFFBEB',
      onPress: () => navigation.navigate('PublicarCosecha'),
    },
    { key: 'diario', label: 'Diario Campo', emoji: '📒', bg: '#ECFDF5', onPress: () => navigation.navigate('DiarioCampo') },
    { key: 'ventas', label: 'Mis ventas', emoji: '🏷️', bg: '#F0FDF4', onPress: () => setHistorialVentasModal(true) },
    { key: 'insumos', label: 'Mis insumos', emoji: '🧪', bg: '#CCFBF1', onPress: () => navigation.navigate('MisInsumos') },
    { key: 'comprar', label: 'Comprar', emoji: '🛒', bg: '#EFF6FF', onPress: () => navigation.navigate('ComprarAgrotienda') },
    { key: 'maq', label: 'Maquinaria', emoji: '🚜', bg: '#F1F5F9', onPress: () => navigation.navigate('Maquinaria') },
  ];

  return (
    <View style={s.root}>
      <ProducerIdentityHeader
        perfil={perfil ?? null}
        isVerificado={isVerificado}
        onBell={openNotificaciones}
        onLogout={() => void authService.logout()}
        showNotificationDot={alertas.length > 0 || pendingAffiliations.length > 0 || mercadoUnread > 0}
      />
      <WeatherTicker estado_ve={perfil?.estado_ve} climaEnVivo={climaTicker} />
      <ScrollView
        style={s.scrollView}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={FOREST} />}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.modoRow}>
          <View style={s.modoLeft}>
            <View style={s.modoBar} />
            <Text style={s.modoTxt}>Modo Productor</Text>
          </View>
          <View style={s.zafraBadge}>
            <Text style={s.zafraBadgeTxt}>ZAFRA-PRO</Text>
          </View>
        </View>

        <View style={s.comandoRow}>
          <View>
            <Text style={s.comandoLabel}>Comando Central</Text>
            <Text style={s.comandoHola}>
              ¡Hola, {nombreCorto}! 👋
            </Text>
          </View>
          <View style={s.starBadge}>
            <Text style={s.starEmoji}>⭐</Text>
            <Text style={s.starNum}>{perfil?.reputacion != null ? perfil.reputacion.toFixed(1) : 'N/D'}</Text>
          </View>
        </View>

        <View style={s.dailyAssistantCard}>
          <View style={s.dailyAssistantTop}>
            <Text style={s.dailyAssistantKicker}>Qué debo hacer hoy</Text>
            <Text style={s.dailyAssistantStage}>{assistantSnapshot?.stageLabel ?? 'Sin datos'}</Text>
          </View>
          <Text style={s.dailyAssistantTitle}>
            {assistantSnapshot?.finca?.nombre ?? 'Completa tu finca y diario para activar el acompañamiento'}
          </Text>
          <Text style={s.dailyAssistantBody}>{assistantSnapshot?.todayTask ?? 'Registra finca, siembra y primeras labores para activar el plan diario.'}</Text>
          <Text style={s.dailyAssistantHint}>Siguiente paso: {assistantSnapshot?.nextTask ?? 'Completar datos mínimos del cultivo.'}</Text>
        </View>

        <View style={s.dailySplitRow}>
          <View style={[s.dailyMiniCard, s.dailyMiniCardFirst]}>
            <Text style={s.dailyMiniKicker}>Riesgos del día</Text>
            {assistantSnapshot?.risks?.length ? (
              assistantSnapshot.risks.map((risk) => (
                <Text key={risk} style={s.dailyMiniText}>• {risk}</Text>
              ))
            ) : (
              <Text style={s.dailyMiniText}>Sin riesgos críticos detectados por ahora.</Text>
            )}
          </View>
          <View style={s.dailyMiniCard}>
            <Text style={s.dailyMiniKicker}>Ventana de aplicación</Text>
            <Text style={s.dailyMiniText}>{assistantSnapshot?.applicationWindow ?? 'Aún no hay una recomendación clara.'}</Text>
          </View>
        </View>

        {activeAffiliations.map((item) => (
          <View key={item.id} style={s.financeCard}>
            <View style={s.financeTop}>
              <Text style={s.financeKicker}>Empresa vinculada</Text>
              <Text style={s.financeState}>Activa</Text>
            </View>
            <Text style={s.financeName}>{item.company?.razon_social ?? 'Empresa financiadora'}</Text>
            <Text style={s.financeMeta}>
              {item.company?.telefono_contacto ?? 'Sin teléfono'}{item.company?.rif ? ` · ${item.company.rif}` : ''}
            </Text>
          </View>
        ))}

        {financedSummaries.length > 0 ? (
          <View style={s.financedLotsCard}>
            <View style={s.financeTop}>
              <Text style={s.financeKicker}>Lotes financiados</Text>
              <Text style={s.financeState}>{financedSummaries.length} finca(s)</Text>
            </View>
            <Text style={s.financedLotsTitle}>Distribucion de superficie por empresa y remanente propio</Text>
            {financedSummaries.slice(0, 4).map((item) => (
              <View key={item.fincaId} style={s.financedLotGroup}>
                <Text style={s.financedLotName}>{item.fincaNombre}</Text>
                <Text style={s.financedLotMeta}>
                  {item.rubro ?? 'Rubro sin definir'}
                  {item.hectareasTotales != null ? ` · ${item.hectareasTotales} ha totales` : ''}
                  {item.municipio ? ` · ${item.municipio}` : ''}
                </Text>
                {item.tramos.map((segment) => (
                  <View key={segment.id} style={s.financedSegmentRow}>
                    <Text style={s.financedSegmentLabel}>
                      {segment.subLotName ?? 'Tramo financiado'} · {segment.companyName}
                    </Text>
                    <Text style={s.financedSegmentValue}>
                      {segment.hectareas != null ? `${segment.hectareas} ha` : 'ha sin cargar'}
                    </Text>
                  </View>
                ))}
                {item.hectareasPropias != null ? (
                  <View style={s.financedOwnRow}>
                    <Text style={s.financedOwnLabel}>Superficie propia</Text>
                    <Text style={s.financedOwnValue}>{item.hectareasPropias} ha</Text>
                  </View>
                ) : null}
              </View>
            ))}
            {financedSummaries.length > 4 ? (
              <Text style={s.financedLotsHint}>Tienes {financedSummaries.length - 4} finca(s) adicionales con reparto financiado.</Text>
            ) : null}
          </View>
        ) : null}

        {inspectionFeed.length > 0 ? (
          <View style={s.inspectionFeedCard}>
            <View style={s.financeTop}>
              <Text style={s.financeKicker}>Visitas técnicas</Text>
              <Text style={s.financeState}>{inspectionFeed.length} reciente(s)</Text>
            </View>
            <Text style={s.inspectionFeedTitle}>Actas y recomendaciones que ya están conectando tu lote con la empresa</Text>
            {inspectionFeed.map((item) => (
              <View key={item.id} style={s.inspectionFeedRow}>
                <Text style={s.inspectionFeedControl}>{item.numero_control}</Text>
                <Text style={s.inspectionFeedMeta}>
                  {(item.finca?.nombre ?? 'Lote')} · {item.fecha_programada} · {item.estado_acta ?? item.estatus}
                </Text>
                <Text style={s.inspectionFeedBody} numberOfLines={2}>
                  {item.resumen_dictamen ?? item.recomendacion_insumos ?? item.observaciones_tecnicas ?? 'Visita registrada sin resumen aún.'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {pendingAffiliations.map((item) => (
          <View key={item.id} style={s.pendingFinanceCard}>
            <Text style={s.pendingFinanceTitle}>Invitación de empresa</Text>
            <Text style={s.pendingFinanceName}>{item.company?.razon_social ?? 'Empresa'}</Text>
            <Text style={s.pendingFinanceSub}>
              Esta empresa quiere registrarte como agricultor financiado dentro de su cartera.
            </Text>
            <View style={s.pendingFinanceActions}>
              <TouchableOpacity
                style={s.pendingRejectBtn}
                onPress={() => void responderInvitacion(item.id, false)}
                disabled={affActionId === item.id}
              >
                <Text style={s.pendingRejectTxt}>Rechazar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.pendingAcceptBtn}
                onPress={() => void responderInvitacion(item.id, true)}
                disabled={affActionId === item.id}
              >
                {affActionId === item.id ? <ActivityIndicator color="#fff" /> : <Text style={s.pendingAcceptTxt}>Aceptar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {alertas.map(a => (
          <View key={a.id} style={[s.alertCard, s[`sev_${a.severidad}` as keyof typeof s] as object]}>
            <Text style={s.alertTitle}>{a.titulo}</Text>
            <Text style={s.alertMsg}>{a.mensaje}</Text>
          </View>
        ))}

        <TouchableOpacity style={s.widgetCardFull} activeOpacity={0.92} onPress={openClimaTab}>
          <View style={[s.widgetIcon, { backgroundColor: '#FFFBEB' }]}>
            <Text style={{ fontSize: 22 }}>⛅</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.widgetPlace} numberOfLines={1}>{climaLugar}</Text>
            <Text style={s.widgetVal} numberOfLines={2}>{climaDetalle || 'Obteniendo…'}</Text>
          </View>
          {contarPendientes() > 0 ? (
            <View style={s.syncBadge}>
              <Text style={s.syncBadgeTxt}>{contarPendientes()} pendiente(s)</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          style={s.oppVentaCard}
          onPress={() => setOppVentaDirectaModal(true)}
          activeOpacity={0.92}
          accessibilityLabel="Oportunidades de venta directa"
        >
          <View style={s.oppVentaIconWrap}>
            <Ionicons name="trending-up-outline" size={26} color="#10B981" />
          </View>
          <View style={s.oppVentaTextCol}>
            <Text style={s.oppVentaTitle}>Oportunidades de Venta Directa</Text>
            <Text style={s.oppVentaSub}>Demanda de compradores para cosecha a granel · negocia por chat</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#10B981" />
        </TouchableOpacity>

        <View style={s.secHead}>
          <View style={s.secHeadBar} />
          <Text style={s.secTitle}>Consola Operativa</Text>
        </View>

        <View style={s.toolGrid}>
          {tools.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[s.toolCell, t.disabled && s.toolDisabled]}
              onPress={t.onPress}
              disabled={t.disabled}
              activeOpacity={0.88}
            >
              <View style={[s.toolIconWrap, { backgroundColor: t.bg }]}>
                <Text style={s.toolEmoji}>{t.emoji}</Text>
              </View>
              <Text style={s.toolLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <YieldCalculator
          defaultHectareas={fincas[0]?.hectareas}
          onSolicitarTransporte={(kg, nota) => {
            setFreightPrefill({
              peso: String(kg),
              descripcion: `${nota}\n\nSolicitud desde calculadora de cosecha.`,
            });
            setFreightModal(true);
          }}
          onBuscarComprador={(kg, nota) => {
            navigation.navigate('PublicarCosecha', {
              kgPrefill: String(kg),
              notaProyeccion: nota,
            });
          }}
        />

        <View style={s.lotesHead}>
          <Text style={s.lotesTitle}>Mis Lotes ({fincas.length})</Text>
          <TouchableOpacity style={s.lotesBtn} onPress={() => navigation.navigate('MisFincas')}>
            <Text style={s.lotesBtnTxt}>+ Nuevo Lote</Text>
          </TouchableOpacity>
        </View>

        {fincas.length === 0 ? (
          <View style={s.emptyLotes}>
            <View style={s.emptyIconCircle}>
              <Text style={{ fontSize: 32, opacity: 0.35 }}>🗺️</Text>
            </View>
            <Text style={s.emptyTitle}>Aún no tienes lotes registrados</Text>
            <Text style={s.emptySub}>
              Registra tu primer lote para organizar fincas, cosechas y relaciones operativas con empresas.
            </Text>
          </View>
        ) : (
          fincas.map(f => (
            <View key={f.id} style={s.fincaCard}>
              <Text style={s.fincaNombre}>{f.nombre}</Text>
              <Text style={s.fincaInfo}>
                {f.rubro} · {f.hectareas} ha · {f.municipio}, {f.estado_ve}
                {!f.activa ? ' · Inactiva' : ''}
              </Text>
            </View>
          ))
        )}

        <Text style={s.secTitle2}>Cosechas activas</Text>
        {cosechas.length === 0 ? (
          <Text style={s.emptyTxt}>No tienes cosechas registradas.</Text>
        ) : (
          cosechas.map(c => (
            <View key={c.id} style={s.cosechaCard}>
              <View style={s.cosechaRow}>
                <Text style={s.cosechaRubro}>{c.rubro}</Text>
                <View style={[s.estadoBadge, { backgroundColor: (ESTADO_COLOR[c.estado] ?? COLORS.textDisabled) + '22' }]}>
                  <Text style={[s.estadoTxt, { color: ESTADO_COLOR[c.estado] ?? COLORS.textDisabled }]}>{cosechaEstadoLabel(c.estado)}</Text>
                </View>
              </View>
              <Text style={s.cosechaInfo}>{c.cantidad_kg} kg · {c.municipio} · {c.fecha_disponible}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <SolicitarTransporteModal
        visible={freightModal}
        onClose={() => {
          setFreightModal(false);
          setFreightPrefill(null);
        }}
        perfil={perfil ?? null}
        initialPrefill={freightPrefill}
      />
      <FitosanitarioSosModal
        visible={sosModal}
        onClose={() => setSosModal(false)}
        perfil={perfil ?? null}
        fincas={fincas.map(f => ({
          id: f.id,
          nombre: f.nombre,
          rubro: f.rubro,
          estado_ve: f.estado_ve,
          municipio: f.municipio,
          coordenadas: normalizeFincaCoordenadas(f.coordenadas),
        }))}
      />
      <PlagueRadarModal
        visible={radarModalVisible}
        onClose={() => setRadarModalVisible(false)}
        perfil={perfil ?? null}
        fincas={fincas.map((f) => ({
          id: f.id,
          nombre: f.nombre,
          estado_ve: f.estado_ve,
          municipio: f.municipio,
          coordenadas: normalizeFincaCoordenadas(f.coordenadas),
        }))}
      />
      <OportunidadesDemandaModal
        visible={oppVentaDirectaModal}
        onClose={() => setOppVentaDirectaModal(false)}
        categoriaDestino={CATEGORIA_DESTINO_REQUERIMIENTO.cosechaGranel}
        title="Oportunidades de venta directa"
        subtitle="Compradores buscan volumen de cosecha a granel. Revisa ubicación y fecha límite antes de ofertar."
        variant="producer"
      />
      {perfil?.id ? (
        <HistorialVentasModal
          visible={historialVentasModal}
          onClose={() => setHistorialVentasModal(false)}
          perfilId={perfil.id}
        />
      ) : null}
      <NotificationsCenterModal
        visible={notifModalVisible}
        onClose={() => setNotifModalVisible(false)}
        userId={perfil?.id}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  scrollView: { flex: 1 },
  scroll: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.xl },
  modoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.lg,
    marginTop: 4,
  },
  modoLeft: { flexDirection: 'row', alignItems: 'center' },
  modoBar: { width: 4, height: 18, borderRadius: 4, backgroundColor: FOREST, marginRight: 8 },
  modoTxt: {
    fontSize: 11,
    fontWeight: '900',
    color: SLATE,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  zafraBadge: {
    backgroundColor: FOREST,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    ...SHADOW.sm,
  },
  zafraBadgeTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1.2,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  comandoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: SPACE.md,
  },
  comandoLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 6,
  },
  comandoHola: {
    fontSize: 26,
    fontWeight: '900',
    color: SLATE,
    fontStyle: 'italic',
    letterSpacing: -0.5,
  },
  starBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOW.sm,
  },
  starEmoji: { fontSize: 14, marginRight: 6 },
  starNum: { fontSize: 12, fontWeight: '900', color: SLATE },
  financeCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    ...SHADOW.sm,
  },
  financeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  financeKicker: { fontSize: 10, fontWeight: '900', color: '#047857', letterSpacing: 1.5, textTransform: 'uppercase' },
  financeState: { fontSize: 10, fontWeight: '900', color: '#047857', textTransform: 'uppercase' },
  financeName: { fontSize: 16, fontWeight: '900', color: SLATE, fontStyle: 'italic', marginTop: 6 },
  financeMeta: { fontSize: 12, color: '#065f46', marginTop: 4, fontWeight: '600' },
  financedLotsCard: {
    backgroundColor: '#eef2ff',
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.22)',
    ...SHADOW.sm,
  },
  dailyAssistantCard: {
    backgroundColor: '#fff',
    borderRadius: 30,
    padding: 18,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(15,59,37,0.08)',
    ...SHADOW.md,
  },
  dailyAssistantTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACE.sm },
  dailyAssistantKicker: {
    fontSize: 11,
    fontWeight: '900',
    color: '#065f46',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dailyAssistantStage: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1d4ed8',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    textTransform: 'uppercase',
  },
  dailyAssistantTitle: { marginTop: 10, fontSize: 18, fontWeight: '900', color: SLATE, fontStyle: 'italic' },
  dailyAssistantBody: { marginTop: 8, fontSize: 14, lineHeight: 22, color: '#334155', fontWeight: '600' },
  dailyAssistantHint: { marginTop: 10, fontSize: 12, color: '#065f46', fontWeight: '700', lineHeight: 18 },
  dailyAssistantAi: { marginTop: 10, fontSize: 12, color: '#4338ca', fontWeight: '700', lineHeight: 18 },
  dailySplitRow: { flexDirection: 'row', marginBottom: SPACE.md },
  dailyMiniCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    ...SHADOW.sm,
  },
  dailyMiniCardFirst: { marginRight: 10 },
  dailyMiniKicker: { fontSize: 11, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.7 },
  dailyMiniText: { marginTop: 10, fontSize: 12, lineHeight: 18, color: SLATE, fontWeight: '700' },
  financedLotsTitle: { fontSize: 15, fontWeight: '900', color: SLATE, fontStyle: 'italic', marginTop: 6 },
  financedLotGroup: { paddingTop: 10, marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(99,102,241,0.18)' },
  financedLotName: { fontSize: FONT.sizes.sm, color: SLATE, fontWeight: '800' },
  financedLotMeta: { fontSize: FONT.sizes.sm, color: '#4338ca', marginTop: 4, fontWeight: '600' },
  financedSegmentRow: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.65)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.sm,
  },
  financedSegmentLabel: { flex: 1, fontSize: FONT.sizes.sm, color: SLATE, fontWeight: '700' },
  financedSegmentValue: { fontSize: FONT.sizes.sm, color: '#312e81', fontWeight: '900' },
  financedOwnRow: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  financedOwnLabel: { fontSize: FONT.sizes.sm, color: '#065f46', fontWeight: '800' },
  financedOwnValue: { fontSize: FONT.sizes.sm, color: '#065f46', fontWeight: '900' },
  financedLotsHint: { fontSize: FONT.sizes.xs, color: '#4f46e5', marginTop: 10, fontWeight: '700' },
  pendingFinanceCard: {
    backgroundColor: '#fff7ed',
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: '#fdba74',
    ...SHADOW.sm,
  },
  pendingFinanceTitle: { fontSize: 10, fontWeight: '900', color: '#9a3412', letterSpacing: 1.4, textTransform: 'uppercase' },
  pendingFinanceName: { fontSize: 16, fontWeight: '900', color: SLATE, fontStyle: 'italic', marginTop: 6 },
  pendingFinanceSub: { fontSize: 12, color: '#7c2d12', lineHeight: 18, marginTop: 6, fontWeight: '600' },
  pendingFinanceActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pendingRejectBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#fdba74',
    backgroundColor: '#fff',
  },
  pendingRejectTxt: { color: '#9a3412', fontWeight: '800', textTransform: 'uppercase', fontSize: 11 },
  pendingAcceptBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: '#0f766e',
  },
  pendingAcceptTxt: { color: '#fff', fontWeight: '800', textTransform: 'uppercase', fontSize: 11 },
  alertCard: { borderRadius: RADIUS.md, padding: SPACE.sm, marginBottom: SPACE.sm },
  alertTitle: { fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  alertMsg: { fontSize: FONT.sizes.sm, marginTop: 2 },
  sev_baja: { backgroundColor: '#E8F5E9' },
  sev_media: { backgroundColor: '#FFF3E0' },
  sev_alta: { backgroundColor: '#FFEBEE' },
  sev_critica: { backgroundColor: '#B71C1C22' },
  oppVentaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 26,
    padding: 16,
    marginBottom: SPACE.lg,
    borderWidth: 2,
    borderColor: 'rgba(16,185,129,0.35)',
    ...SHADOW.sm,
    gap: 12,
  },
  oppVentaIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  oppVentaTextCol: { flex: 1, minWidth: 0 },
  oppVentaTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: SLATE,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  oppVentaSub: { marginTop: 6, fontSize: 12, color: '#64748b', fontWeight: '600', lineHeight: 17 },
  widgetCardFull: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: SPACE.lg,
    ...SHADOW.sm,
  },
  syncBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 8,
  },
  syncBadgeTxt: { fontSize: 10, fontWeight: '700', color: '#059669' },
  widgetIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  widgetPlace: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  widgetVal: { fontSize: 13, fontWeight: '900', color: SLATE },
  widgetValOn: { fontSize: 13, fontWeight: '900', color: '#059669' },
  secHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingLeft: 2 },
  secHeadBar: { width: 5, height: 18, borderRadius: 3, backgroundColor: '#059669', marginRight: 8 },
  secTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: SLATE,
    letterSpacing: 0.5,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: SPACE.lg,
    marginTop: 4,
  },
  toolCell: { width: '23%', alignItems: 'center', marginBottom: 18 },
  toolDisabled: { opacity: 0.45 },
  toolIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fff',
    ...SHADOW.sm,
  },
  toolEmoji: { fontSize: 26 },
  toolLabel: {
    marginTop: 8,
    fontSize: 8,
    fontWeight: '900',
    color: '#64748b',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    lineHeight: 11,
  },
  lotesHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  lotesTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: SLATE,
    fontStyle: 'italic',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  lotesBtn: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
  },
  lotesBtnTxt: {
    fontSize: 10,
    fontWeight: '900',
    color: '#047857',
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  emptyLotes: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#E2E8F0',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    marginBottom: SPACE.lg,
    ...SHADOW.sm,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.8,
    fontStyle: 'italic',
  },
  emptySub: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  secTitle2: {
    fontSize: FONT.sizes.lg,
    fontWeight: FONT.weights.bold,
    color: COLORS.text,
    marginBottom: SPACE.sm,
    marginTop: SPACE.md,
  },
  emptyTxt: { color: COLORS.textDisabled, fontSize: FONT.sizes.sm, marginBottom: SPACE.md },
  fincaCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderLeftWidth: 3,
    borderLeftColor: FOREST,
    ...SHADOW.sm,
  },
  fincaNombre: { fontWeight: FONT.weights.semibold, fontSize: FONT.sizes.md, color: COLORS.text },
  fincaInfo: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  inspectionFeedCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  inspectionFeedTitle: { marginTop: 8, color: '#1E3A8A', fontWeight: FONT.weights.semibold, lineHeight: 20 },
  inspectionFeedRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(30,58,138,0.12)' },
  inspectionFeedControl: { fontSize: FONT.sizes.xs, color: '#1D4ED8', fontWeight: FONT.weights.bold },
  inspectionFeedMeta: { marginTop: 4, fontSize: FONT.sizes.sm, color: '#334155', fontWeight: FONT.weights.semibold },
  inspectionFeedBody: { marginTop: 4, fontSize: FONT.sizes.sm, color: '#475569', lineHeight: 18 },
  cosechaCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  cosechaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cosechaRubro: { fontWeight: FONT.weights.semibold, fontSize: FONT.sizes.md, color: COLORS.text },
  cosechaInfo: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  estadoBadge: { borderRadius: RADIUS.full, paddingHorizontal: SPACE.sm, paddingVertical: 2 },
  estadoTxt: { fontSize: FONT.sizes.xs, fontWeight: FONT.weights.semibold },
});
