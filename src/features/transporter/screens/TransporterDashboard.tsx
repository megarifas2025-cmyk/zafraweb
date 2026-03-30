/**
 * Flota / pizarra de fletes — no importar `marketDemandService` (demandas de bienes);
 * la logística se gestiona solo con freightRequestsService y postulaciones.
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  LayoutChangeEvent,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/shared/store/AuthContext';
import { authService } from '@/shared/services/authService';
import { getRestrictedActionMessage } from '@/shared/lib/accountStatus';
import { supabase } from '@/shared/lib/supabase';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import { logWarn } from '@/shared/runtime/appLogger';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import {
  contarNotificacionesFreightNoLeidas,
  freightTrackingStatusLabel,
  listarPizarraFreight,
  iniciarChatTransporte,
  listarMisSalasLogistica,
  listarFreightAsignadosAlTransportista,
  trackingModeLabel,
} from '@/shared/services/freightRequestsService';
import { contarMensajesMercadoNoLeidos } from '@/shared/services/chatService';
import { LogisticsChatModal } from '@/shared/components/LogisticsChatModal';
import { NotificationsCenterModal } from '@/shared/components/NotificationsCenterModal';
import { RadarGPS } from '@/shared/components/RadarGPS';
import { RegistrarVehiculoModal } from '@/features/transporter/components/RegistrarVehiculoModal';
import { AsignarChoferServicioModal } from '@/features/transporter/components/AsignarChoferServicioModal';
import { getCurrentTransporterCompanyContext } from '@/shared/services/transporterCompanyLinkService';
import type { Vehiculo, FreightRequest, LogisticsSala, TransporterCompanyLink } from '@/shared/types';

/** Zafraclic V2 — identidad transporte (diseño maestro). */
const TX = {
  navy: '#1E3A8A',
  blue: '#3B82F6',
  blueSoft: '#DBEAFE',
  cream: '#FDFBF7',
  slate900: '#0f172a',
  slate400: '#94a3b8',
};

const ROLE_SOL: Record<string, string> = {
  independent_producer: 'Productor',
  company: 'Empresa',
  buyer: 'Comprador',
  agrotienda: 'Agrotienda',
};

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Ahora';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `Hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days}d`;
}

function solicitanteLine(req: FreightRequest): string {
  const raw = req.perfiles?.nombre?.trim();
  if (raw) return raw;
  return ROLE_SOL[req.requester_role] ?? 'Solicitante';
}

function tituloCarga(req: FreightRequest): string {
  const p = req.peso_estimado_kg;
  const ton = p != null && p > 0 ? ` • ${(p / 1000).toFixed(0)} Ton` : '';
  return `${req.tipo_servicio}${ton}`;
}

function destinoTexto(req: FreightRequest): string {
  if (req.destino_municipio?.trim()) {
    return [req.destino_municipio, req.destino_estado].filter(Boolean).join(', ');
  }
  return 'Sin destino fijo';
}

export default function TransporterDashboard() {
  const { perfil, refreshPerfil } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const skipNextFlotaFocusRef = useRef(true);

  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [historialFreight, setHistorialFreight] = useState<FreightRequest[]>([]);
  const [pizarra, setPizarra] = useState<FreightRequest[]>([]);
  const [salasLog, setSalasLog] = useState<LogisticsSala[]>([]);
  const [logChatOpen, setLogChatOpen] = useState(false);
  const [logChatSalaId, setLogChatSalaId] = useState<string | null>(null);
  const [logChatSubtitle, setLogChatSubtitle] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(false);
  const [modalVeh, setModalVeh] = useState(false);
  const [guardandoDisp, setGuardandoDisp] = useState(false);
  const [pizarraY, setPizarraY] = useState(0);
  const [historialY, setHistorialY] = useState(0);
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [companyLink, setCompanyLink] = useState<TransporterCompanyLink | null>(null);
  const [prepModalOpen, setPrepModalOpen] = useState(false);
  const [selectedFreight, setSelectedFreight] = useState<FreightRequest | null>(null);
  const [buscandoCargaLocal, setBuscandoCargaLocal] = useState(false);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);

  const buscandoCarga = buscandoCargaLocal;

  useEffect(() => {
    setBuscandoCargaLocal(perfil?.disponibilidad_flete === true);
  }, [perfil?.disponibilidad_flete]);

  const refreshUnreadNotifications = useCallback(async () => {
    if (!perfil?.id) {
      setHasUnreadNotifications(false);
      return;
    }
    try {
      const [fr, chatN] = await Promise.all([
        contarNotificacionesFreightNoLeidas(perfil.id),
        contarMensajesMercadoNoLeidos(perfil.id),
      ]);
      setHasUnreadNotifications(fr > 0 || chatN > 0);
    } catch {
      setHasUnreadNotifications(false);
    }
  }, [perfil?.id]);

  useEffect(() => {
    void refreshUnreadNotifications();
  }, [refreshUnreadNotifications, notifModalVisible]);

  const pizarraOrdenada = useMemo(
    () =>
      [...pizarra].sort((a, b) => {
        const ta = a.creado_en ? new Date(a.creado_en).getTime() : 0;
        const tb = b.creado_en ? new Date(b.creado_en).getTime() : 0;
        return tb - ta;
      }),
    [pizarra],
  );

  const salasActivas = useMemo(() => {
    if (!perfil?.id) return [];
    return salasLog.filter(sala => {
      if (sala.transportista_id !== perfil.id) return false;
      const frRaw = sala.freight_requests;
      const fr = Array.isArray(frRaw) ? frRaw[0] : frRaw;
      if (!fr || typeof fr !== 'object') return false;
      const e = (fr as { estado?: string }).estado;
      return e === 'asignada' || e === 'completada';
    });
  }, [salasLog, perfil?.id]);

  const rep = perfil?.reputacion != null ? perfil.reputacion.toFixed(1) : 'N/D';
  const activeRoutes = useMemo(
    () => historialFreight.filter((item) => item.estado === 'asignada'),
    [historialFreight],
  );
  const activeRoute = activeRoutes[0] ?? null;

  const openNotificaciones = () => setNotifModalVisible(true);

  const cargar = useCallback(async () => {
    if (!perfil) return;
    const [v, hist, board, salas, link] = await Promise.all([
      supabase.from('vehiculos').select('*').eq('propietario_id', perfil.id).eq('activo', true),
      listarFreightAsignadosAlTransportista(perfil.id).catch((e) => {
        logWarn('transporter.dashboard.freight_asignados', 'No se pudo cargar fletes asignados.', { msg: String(e?.message) });
        return [] as FreightRequest[];
      }),
      listarPizarraFreight().catch((e) => {
        logWarn('transporter.dashboard.pizarra', 'No se pudo cargar la pizarra de fletes.', { msg: String(e?.message) });
        return [] as FreightRequest[];
      }),
      listarMisSalasLogistica(perfil.id).catch((e) => {
        logWarn('transporter.dashboard.salas', 'No se pudo cargar salas logísticas.', { msg: String(e?.message) });
        return [] as LogisticsSala[];
      }),
      getCurrentTransporterCompanyContext(perfil.id).catch(() => null),
    ]);
    if (v.error) {
      logWarn('transporter.dashboard.vehicles', 'No se pudo cargar la flota activa del transportista.', {
        transporterId: perfil.id,
        message: v.error.message,
        code: v.error.code ?? null,
      });
    }
    if (v.data) setVehiculos(v.data as Vehiculo[]);
    else if (!v.error) setVehiculos([]);
    setHistorialFreight(hist);
    setPizarra(board);
    setSalasLog(salas);
    setCompanyLink(link);
  }, [perfil]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useFocusEffect(
    useCallback(() => {
      if (skipNextFlotaFocusRef.current) {
        skipNextFlotaFocusRef.current = false;
        return;
      }
      void cargar();
      void refreshUnreadNotifications();
    }, [cargar, refreshUnreadNotifications]),
  );

  const scrollPizarra = (route.params as { scrollPizarra?: boolean } | undefined)?.scrollPizarra;

  useEffect(() => {
    if (!scrollPizarra) return;
    const t = setTimeout(() => {
      if (pizarraY > 0) {
        scrollRef.current?.scrollTo({ y: Math.max(0, pizarraY - 8), animated: true });
      }
      navigation.setParams({ scrollPizarra: undefined } as never);
    }, 300);
    return () => clearTimeout(t);
  }, [scrollPizarra, pizarraY, navigation]);

  const onRefresh = async () => {
    setRefresh(true);
    try {
      await cargar();
    } catch {
      /* ignore */
    } finally {
      setRefresh(false);
    }
  };

  const onPizarraLayout = (e: LayoutChangeEvent) => {
    setPizarraY(e.nativeEvent.layout.y);
  };

  const onHistorialLayout = (e: LayoutChangeEvent) => {
    setHistorialY(e.nativeEvent.layout.y);
  };

  function contactarSolicitante(req: FreightRequest) {
    const restriction = getRestrictedActionMessage(perfil);
    if (restriction) {
      Alert.alert('Cuenta', restriction);
      return;
    }
    Alert.alert(
      'Contactar solicitante',
      `¿Abrir chat con el solicitante de: ${req.tipo_servicio}?\nPodrás negociar los detalles antes de que te confirmen.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Abrir chat',
          onPress: async () => {
            try {
              const salaId = await iniciarChatTransporte(req.id);
              const sub = `${req.tipo_servicio} · ${req.origen_municipio}, ${req.origen_estado}`;
              setLogChatSalaId(salaId);
              setLogChatSubtitle(sub);
              setLogChatOpen(true);
              await cargar();
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'No se pudo abrir el chat.';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  }

  function eliminarVehiculo(vehiculo: Vehiculo) {
    if (!perfil?.id) return;
    if (activeRoute?.vehiculo_id === vehiculo.id) {
      Alert.alert(
        'Unidad en servicio',
        'No puedes eliminar esta unidad mientras esté asignada a un viaje activo.',
      );
      return;
    }
    Alert.alert(
      'Eliminar unidad',
      `La placa ${vehiculo.placa} saldrá de tu flota activa. Podrás registrarla de nuevo más adelante si hace falta.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('vehiculos')
                .update({ activo: false })
                .eq('id', vehiculo.id)
                .eq('propietario_id', perfil.id);
              if (error) throw new Error(mensajeSupabaseConPista(error));
              await cargar();
              Alert.alert('Unidad eliminada', 'La unidad ya no aparece en tu flota activa.');
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo eliminar la unidad.');
            }
          },
        },
      ],
    );
  }

  async function toggleDisponibilidadFlete() {
    if (!perfil?.id) return;
    const next = !buscandoCarga;
    setGuardandoDisp(true);
    try {
      const { error } = await supabase.from('perfiles').update({ disponibilidad_flete: next }).eq('id', perfil.id);
      if (error) throw new Error(mensajeSupabaseConPista(error));
      setBuscandoCargaLocal(next);
      await refreshPerfil();
      Alert.alert(
        'Disponibilidad actualizada',
        next
          ? 'Ahora apareces como disponible en la pizarra de carga.'
          : 'Ya no apareces como disponible en la pizarra de carga.',
      );
    } catch (e: unknown) {
      setBuscandoCargaLocal(!next);
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('disponibilidad_flete') || msg.includes('column') || msg.includes('42703')) {
        Alert.alert(
          'Disponibilidad',
          'No pudimos actualizar tu disponibilidad de carga en este momento. Intenta de nuevo en unos minutos o revisa la configuración con el equipo técnico.',
        );
      } else {
        Alert.alert('Error', msg || 'No se pudo actualizar.');
      }
    } finally {
      setGuardandoDisp(false);
    }
  }

  function scrollAHistorial() {
    if (historialY > 0) {
      scrollRef.current?.scrollTo({ y: Math.max(0, historialY - 8), animated: true });
    }
  }

  const ESTADO_FREIGHT: Record<string, string> = {
    asignada: COLORS.warning,
    completada: COLORS.success,
  };

  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={s.root}
        contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top, 12), paddingBottom: 40 + Math.max(insets.bottom, 0) }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={TX.blue} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.headerRow}>
          <View>
            <Text style={s.kicker}>Comando de Flota</Text>
            <Text style={s.heroTitle}>Mi Flota 🚛</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity onPress={openNotificaciones} style={s.notifBtn} hitSlop={12} accessibilityLabel="Notificaciones">
              <View>
                <Ionicons name="notifications-outline" size={22} color={TX.navy} />
                {hasUnreadNotifications ? <View style={s.notifDot} /> : null}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void authService.logout()} style={s.notifBtn} hitSlop={12} accessibilityLabel="Cerrar sesión">
              <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
            <View style={s.repPill}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={s.repTxt}>{rep}</Text>
            </View>
          </View>
        </View>

        {companyLink ? (
          <View style={s.companyLinkCard}>
            <Text style={s.companyLinkKicker}>Modo de operación</Text>
            <Text style={s.companyLinkTitle}>
              {companyLink.status === 'approved'
                ? `Aliado de ${companyLink.company?.razon_social ?? 'empresa'}`
                : `Solicitud enviada a ${companyLink.company?.razon_social ?? 'empresa'}`}
            </Text>
            <Text style={s.companyLinkSub}>
              {companyLink.status === 'approved'
                ? 'Ya operas como transportista vinculado a esa empresa.'
                : 'Mientras esté pendiente sigues operando como cuenta propia, hasta recibir aprobación.'}
            </Text>
          </View>
        ) : (
          <View style={s.companyLinkCard}>
            <Text style={s.companyLinkKicker}>Modo de operación</Text>
            <Text style={s.companyLinkTitle}>Transportista particular</Text>
            <Text style={s.companyLinkSub}>No tienes vínculo empresarial aprobado. Operas de forma independiente.</Text>
          </View>
        )}

        <View style={s.radarSection}>
          <View style={s.radarSectionHead}>
            <Ionicons name="navigate" size={16} color={TX.blue} />
            <Text style={s.radarSectionTit}>Radar GPS</Text>
          </View>
          <Text style={s.radarSectionSub}>
            {activeRoute
              ? activeRoutes.length > 1
                ? `Tienes ${activeRoutes.length} rutas activas. Aquí mostramos la más reciente; entra a la pestaña Rutas para gestionarlas todas, reportar salida y confirmar llegada.`
                : 'Tienes una ruta activa. Entra a la pestaña Rutas para reportar salida, compartir posición y confirmar llegada.'
              : 'Mapa en vivo con tu ubicación actual. Cuando tengas un servicio asignado, aquí verás el punto de destino real y el estado operativo del viaje.'}
          </Text>
          {activeRoute ? (
            <View style={s.activeRouteCard}>
              <View style={s.activeRouteIcon}>
                <Ionicons name="paper-plane-outline" size={20} color={TX.navy} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.activeRouteTitle}>{activeRoute.tipo_servicio}</Text>
                <Text style={s.activeRouteSub}>
                  {activeRoute.origen_municipio}, {activeRoute.origen_estado}
                  {activeRoute.destino_municipio ? ` -> ${activeRoute.destino_municipio}` : ''}
                </Text>
                <Text style={s.activeRouteMeta}>
                  {activeRoute.driver_name
                    ? `${activeRoute.driver_name} · ${activeRoute.vehiculo_id ? 'vehículo asignado' : 'vehículo pendiente'} · ${trackingModeLabel(activeRoute)}`
                    : 'Falta preparar vehículo y chofer del viaje'}
                </Text>
                <Text style={s.activeRouteMeta}>Estado operativo: {freightTrackingStatusLabel(activeRoute.tracking_status)}</Text>
                {activeRoutes.length > 1 ? (
                  <Text style={s.activeRouteMeta}>Hay {activeRoutes.length - 1} servicio(s) adicional(es) en curso desde la pestaña Rutas.</Text>
                ) : null}
              </View>
              <View style={s.activeRouteActions}>
                <TouchableOpacity
                  style={s.activeRoutePrep}
                  onPress={() => {
                    setSelectedFreight(activeRoute);
                    setPrepModalOpen(true);
                  }}
                  activeOpacity={0.88}
                >
                  <Text style={s.activeRoutePrepTxt}>{activeRoute.driver_name ? 'Editar' : 'Preparar'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.activeRouteGo} onPress={() => navigation.navigate('Rutas' as never)} activeOpacity={0.88}>
                  <Text style={s.activeRouteGoTxt}>Abrir ruta</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <RadarGPS
              role="transporte"
              routeStatusLabel={
                buscandoCarga ? 'Buscando carga · GPS activo' : 'Fuera de servicio · GPS activo'
              }
              mapHeight={176}
            />
          )}
        </View>

        <View style={s.availWrap}>
          <View style={s.availDeco}>
            <Ionicons name="radio" size={88} color="rgba(255,255,255,0.1)" />
          </View>
          <TouchableOpacity
            style={s.availMain}
            onPress={() => void toggleDisponibilidadFlete()}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="Alternar disponibilidad"
            disabled={guardandoDisp}
          >
            <View style={s.availIconBox}>
              {guardandoDisp ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="radio" size={28} color="#FFF" />
              )}
            </View>
            <View style={s.availTextBox}>
              <Text style={s.availKicker}>Disponibilidad en pizarra · guardado en tu perfil</Text>
              <Text style={s.availTitle}>{buscandoCarga ? 'Buscando carga' : 'Fuera de servicio'}</Text>
              <Text style={s.availSub}>
                {buscandoCarga
                  ? 'Estás visible para nuevas solicitudes.'
                  : 'No estás visible para nuevas solicitudes.'}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={s.availChevron} onPress={() => scrollRef.current?.scrollTo({ y: Math.max(0, pizarraY - 8), animated: true })} hitSlop={12}>
            <Ionicons name="chevron-forward" size={22} color={TX.navy} />
          </TouchableOpacity>
        </View>

        <View style={s.fleetSection}>
          <View style={s.secHead}>
            <View style={s.secBar} />
            <Text style={s.secTitle}>Mi flota ({vehiculos.length})</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fleetRow}>
            <TouchableOpacity style={s.fleetAddH} onPress={() => setModalVeh(true)} activeOpacity={0.9}>
              <View style={s.fleetAddCircle}>
                <Ionicons name="add" size={26} color={TX.blue} />
              </View>
              <Text style={s.fleetAddLbl}>+ Vehículo</Text>
            </TouchableOpacity>
            {vehiculos.map(v => (
              <View key={v.id} style={s.fleetCardH}>
                <Text style={s.fleetCardTipo}>{v.tipo.replace(/_/g, ' ').toUpperCase()}</Text>
                <Text style={s.fleetCardPlaca}>{v.placa}</Text>
                <Text style={s.fleetCardMeta} numberOfLines={2}>
                  {[v.marca, v.modelo].filter(Boolean).join(' ') || '—'}
                </Text>
                <Text style={s.fleetCardMeta} numberOfLines={2}>
                  {[v.carroceria, v.color, v.ejes ? `${v.ejes} ejes` : null, v.anio ? String(v.anio) : null].filter(Boolean).join(' · ') || 'Datos técnicos pendientes'}
                </Text>
                <Text style={s.fleetCardMeta} numberOfLines={2}>
                  {[
                    v.driver_has_gps_phone ? 'GPS listo' : 'GPS no confirmado',
                    v.driver_app_ready ? 'App lista' : 'App no lista',
                    v.device_notes,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {v.capacidad_kg ? (
                  <Text style={s.fleetCardCap}>{(v.capacidad_kg / 1000).toFixed(1)} t</Text>
                ) : null}
                <TouchableOpacity
                  style={s.fleetDeleteBtn}
                  onPress={() => eliminarVehiculo(v)}
                  activeOpacity={0.88}
                >
                  <Ionicons name="trash-outline" size={14} color="#b91c1c" />
                  <Text style={s.fleetDeleteTxt}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          {vehiculos.length === 0 ? (
            <Text style={s.fleetHint}>Añade tu primer vehículo para operar con claridad ante los generadores de carga.</Text>
          ) : null}
        </View>

        <View onLayout={onPizarraLayout}>
          <View style={s.secHead}>
            <View style={s.secBar} />
            <Text style={s.secTitle}>
              Pizarra de solicitudes ({pizarra.length})
            </Text>
          </View>

          {pizarraOrdenada.length === 0 ? (
            <Text style={s.emptyPizarra}>No hay solicitudes abiertas en este momento.</Text>
          ) : (
            pizarraOrdenada.map(req => {
              const recent = req.creado_en && Date.now() - new Date(req.creado_en).getTime() < 3_600_000;
              const ocupada = req.estado === 'asignada';
              return (
                <View key={req.id} style={[s.fleteCard, ocupada && s.fleteCardOcupada]}>
                  <View style={s.fleteTop}>
                    <View style={s.fleteLeft}>
                      <View style={[s.iconBox, { backgroundColor: ocupada ? '#f1f5f9' : recent ? '#ECFDF5' : '#FFFBEB' }]}>
                        <Ionicons name="cube-outline" size={20} color={ocupada ? '#94a3b8' : recent ? '#059669' : '#D97706'} />
                      </View>
                      <View style={s.fleteTitBox}>
                        <Text style={[s.fleteTit, ocupada && s.fleteTitOcupada]} numberOfLines={2}>
                          {tituloCarga(req)}
                        </Text>
                        <Text style={s.fleteSub} numberOfLines={1}>
                          {solicitanteLine(req)}
                        </Text>
                      </View>
                    </View>
                    {ocupada ? (
                      <View style={s.ocupadaChip}>
                        <Text style={s.ocupadaChipTxt}>OCUPADA</Text>
                      </View>
                    ) : (
                      <View style={[s.timeChip, recent ? s.timeChipHot : s.timeChipCold]}>
                        <Text style={[s.timeChipTxt, recent ? s.timeChipTxtHot : s.timeChipTxtCold]}>{formatRelativeTime(req.creado_en)}</Text>
                      </View>
                    )}
                  </View>

                  <View style={s.rutaBox}>
                    <Ionicons name="location-outline" size={14} color={TX.slate400} />
                    <Text style={s.rutaOrig} numberOfLines={2}>
                      Origen: <Text style={s.rutaBold}>{req.origen_municipio}</Text>
                    </Text>
                    <Ionicons name="arrow-forward" size={12} color="#CBD5E1" />
                    <Text style={s.rutaDest} numberOfLines={2}>
                      Destino: <Text style={s.rutaBold}>{destinoTexto(req)}</Text>
                    </Text>
                  </View>

                  {req.descripcion ? (
                    <Text style={s.desc} numberOfLines={2}>
                      {req.descripcion}
                    </Text>
                  ) : null}

                  {ocupada ? (
                    <View style={s.ocupadaInfo}>
                      <Ionicons name="lock-closed-outline" size={14} color="#94a3b8" />
                      <Text style={s.ocupadaInfoTxt}>El solicitante ya eligió un transportista. Desaparecerá en breve.</Text>
                    </View>
                  ) : (
                    <TouchableOpacity style={s.postularBtn} onPress={() => contactarSolicitante(req)} activeOpacity={0.9}>
                      <Text style={s.postularTxt}>💬 Contactar y negociar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>

        {salasActivas.length > 0 ? (
          <>
            <Text style={s.coordinacionTit}>Coordinación</Text>
            {salasActivas.map(sala => {
              const frRaw = sala.freight_requests;
              const fr = Array.isArray(frRaw) ? frRaw[0] : frRaw;
              const sub = fr ? `${fr.tipo_servicio} · ${fr.origen_municipio}, ${fr.origen_estado}` : 'Coordinación de flete';
              return (
                <TouchableOpacity
                  key={sala.id}
                  style={s.chatRow}
                  onPress={() => {
                    setLogChatSalaId(sala.id);
                    setLogChatSubtitle(sub);
                    setLogChatOpen(true);
                  }}
                  activeOpacity={0.88}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={20} color={TX.navy} />
                  <View style={s.chatRowTxt}>
                    <Text style={s.chatRowTit} numberOfLines={2}>
                      {sub}
                    </Text>
                    <Text style={s.chatRowMeta}>Fecha necesaria: {fr?.fecha_necesaria ?? '—'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                </TouchableOpacity>
              );
            })}
          </>
        ) : null}

        <TouchableOpacity style={s.histMenu} onPress={scrollAHistorial} activeOpacity={0.88}>
          <View style={s.histIconWrap}>
            <Ionicons name="time-outline" size={20} color={TX.slate900} />
          </View>
          <View style={s.histMenuTxt}>
            <Text style={s.histMenuTit}>Historial de fletes</Text>
            <Text style={s.histMenuSub}>Viajes y estados recientes</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </TouchableOpacity>

        <View onLayout={onHistorialLayout}>
          <Text style={s.histListTit}>Historial logístico (pizarra)</Text>
          {historialFreight.length === 0 ? (
            <Text style={s.emptyHist}>Aún no tienes fletes asignados vía pizarra. Contacta y negocia desde la pizarra; cuando te confirmen, aparecerán aquí.</Text>
          ) : (
            historialFreight.map(item => (
              <View key={item.id} style={s.histCard}>
                <View style={s.histCardHead}>
                  <Text style={s.histRuta} numberOfLines={2}>
                    {item.tipo_servicio}
                  </Text>
                  <View style={[s.estadoBadge, { backgroundColor: (ESTADO_FREIGHT[item.estado] ?? '#64748B') + '22' }]}>
                    <Text style={[s.estadoTxt, { color: ESTADO_FREIGHT[item.estado] ?? '#64748B' }]}>{item.estado}</Text>
                  </View>
                </View>
                <Text style={s.histMeta}>
                  {item.origen_municipio}, {item.origen_estado}
                  {item.destino_municipio ? ` → ${item.destino_municipio}` : ''}
                </Text>
                <Text style={s.histMetaSmall}>Fecha necesaria: {item.fecha_necesaria}</Text>
                <Text style={s.histMetaSmall}>
                  {item.driver_name ? `Chofer: ${item.driver_name} · ${trackingModeLabel(item)}` : 'Chofer del viaje pendiente'}
                </Text>
                <Text style={s.histMetaSmall}>Estado operativo: {freightTrackingStatusLabel(item.tracking_status)}</Text>
                <Text style={s.histMetaSmall}>{item.vehiculo_id ? 'Vehículo operativo asignado' : 'Vehículo operativo pendiente'}</Text>
                {item.estado === 'asignada' ? (
                  <TouchableOpacity
                    style={s.prepareBtn}
                    onPress={() => {
                      setSelectedFreight(item);
                      setPrepModalOpen(true);
                    }}
                    activeOpacity={0.88}
                  >
                    <Text style={s.prepareBtnTxt}>{item.driver_name ? 'Actualizar chofer/vehículo' : 'Preparar servicio'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </View>

        <View style={{ height: SPACE.xxl }} />
      </ScrollView>

      <LogisticsChatModal
        visible={logChatOpen}
        onClose={() => {
          setLogChatOpen(false);
          setLogChatSalaId(null);
          setLogChatSubtitle(null);
        }}
        salaId={logChatSalaId}
        perfil={perfil ?? null}
        subtitle={logChatSubtitle}
        onTratoCerrado={() => void cargar()}
      />

      {perfil?.id ? (
        <RegistrarVehiculoModal
          visible={modalVeh}
          onClose={() => setModalVeh(false)}
          propietarioId={perfil.id}
          onGuardado={async () => {
            await cargar();
          }}
        />
      ) : null}
      <AsignarChoferServicioModal
        visible={prepModalOpen}
        onClose={() => {
          setPrepModalOpen(false);
          setSelectedFreight(null);
        }}
        freight={selectedFreight}
        vehiculos={vehiculos}
        onSaved={async () => {
          await cargar();
        }}
      />
      <NotificationsCenterModal
        visible={notifModalVisible}
        onClose={() => {
          setNotifModalVisible(false);
          void refreshUnreadNotifications();
        }}
        userId={perfil?.id}
      />
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: TX.cream },
  scroll: { padding: SPACE.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: SPACE.md },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  notifDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: '#fff',
  },
  kicker: { fontSize: 10, fontWeight: '900', color: TX.blue, letterSpacing: 2, textTransform: 'uppercase' },
  heroTitle: { fontSize: 22, fontWeight: '900', color: TX.slate900, fontStyle: 'italic', marginTop: 2, letterSpacing: -0.5 },
  repPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    ...SHADOW.sm,
  },
  repTxt: { fontSize: 11, fontWeight: '900', color: TX.slate900 },
  companyLinkCard: {
    marginBottom: SPACE.md,
    borderRadius: 20,
    padding: SPACE.md,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    ...SHADOW.sm,
  },
  companyLinkKicker: { fontSize: 10, fontWeight: '900', color: TX.blue, letterSpacing: 1.2, textTransform: 'uppercase' },
  companyLinkTitle: { marginTop: 4, fontSize: FONT.sizes.lg, fontWeight: '900', color: TX.slate900 },
  companyLinkSub: { marginTop: 6, fontSize: FONT.sizes.sm, color: '#475569', lineHeight: 20, fontWeight: '600' },

  radarSection: { marginBottom: SPACE.md, backgroundColor: '#fff', borderRadius: 24, padding: SPACE.md, borderWidth: 1, borderColor: 'rgba(30,58,138,0.08)', ...SHADOW.lg },
  radarSectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' },
  radarSectionTit: {
    fontSize: 15,
    fontWeight: '900',
    color: TX.slate900,
    fontStyle: 'italic',
    marginLeft: 6,
  },
  radarSimPill: {
    backgroundColor: TX.blueSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  radarSimPillTxt: { fontSize: 9, fontWeight: '900', color: TX.blue, letterSpacing: 0.5 },
  radarSectionSub: { fontSize: 11, color: TX.slate400, marginBottom: 10, lineHeight: 16 },
  activeRouteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 18,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  activeRouteIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activeRouteTitle: { fontSize: FONT.sizes.md, fontWeight: '900', color: TX.slate900 },
  activeRouteSub: { fontSize: FONT.sizes.sm, color: '#475569', marginTop: 4, lineHeight: 18, fontWeight: '600' },
  activeRouteMeta: { fontSize: FONT.sizes.xs, color: '#64748b', marginTop: 6, lineHeight: 18, fontWeight: '700' },
  activeRouteActions: { alignItems: 'center', gap: 8 },
  activeRoutePrep: {
    minWidth: 76,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#dbeafe',
  },
  activeRoutePrepTxt: { color: TX.navy, fontSize: FONT.sizes.xs, fontWeight: '900' },
  activeRouteGo: {
    minWidth: 76,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0f172a',
  },
  activeRouteGoTxt: { color: '#fff', fontSize: FONT.sizes.xs, fontWeight: '900', textAlign: 'center' },

  availWrap: {
    backgroundColor: TX.blue,
    borderRadius: 24,
    padding: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACE.md,
    overflow: 'hidden',
    ...SHADOW.lg,
  },
  availDeco: { position: 'absolute', right: -16, bottom: -16 },
  availMain: { flex: 1, flexDirection: 'row', alignItems: 'center', zIndex: 2 },
  availIconBox: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 14, borderRadius: 16, marginRight: 14 },
  availTextBox: { flex: 1 },
  availKicker: { fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.85)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  availTitle: { fontSize: 17, fontWeight: '900', color: '#FFF', fontStyle: 'italic' },
  availSub: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  availChevron: {
    backgroundColor: '#FFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    ...SHADOW.md,
  },

  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACE.md, paddingHorizontal: 2 },
  secBar: { width: 4, height: 16, backgroundColor: TX.blue, borderRadius: 4 },
  secTitle: { fontSize: 13, fontWeight: '900', color: TX.slate900, fontStyle: 'italic', letterSpacing: -0.3 },
  emptyPizarra: { fontSize: FONT.sizes.sm, color: COLORS.textDisabled, marginBottom: SPACE.lg },

  fleteCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    padding: SPACE.md + 2,
    marginBottom: SPACE.md,
    ...SHADOW.lg,
  },
  fleteTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACE.md },
  fleteLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, marginRight: 8 },
  iconBox: { padding: 10, borderRadius: 14, marginRight: 10 },
  fleteTitBox: { flex: 1 },
  fleteTit: { fontSize: FONT.sizes.sm, fontWeight: '900', color: TX.slate900 },
  fleteSub: { fontSize: 10, fontWeight: '700', color: TX.slate400, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 4 },
  timeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  timeChipHot: { backgroundColor: TX.blueSoft },
  timeChipCold: { backgroundColor: '#F1F5F9' },
  timeChipTxt: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  timeChipTxtHot: { color: TX.blue },
  timeChipTxtCold: { color: TX.slate400 },
  rutaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    marginBottom: SPACE.sm,
  },
  rutaOrig: { flex: 1, fontSize: 10, fontWeight: '700', color: TX.slate400, textTransform: 'uppercase' },
  rutaDest: { flex: 1, fontSize: 10, fontWeight: '700', color: TX.slate400, textTransform: 'uppercase', textAlign: 'right' },
  rutaBold: { color: TX.slate900, fontWeight: '900', textTransform: 'none' },
  desc: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACE.sm },
  postularBtn: { backgroundColor: TX.slate900, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  postularTxt: { color: '#FFF', fontWeight: '900', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  fleteCardOcupada: { opacity: 0.7, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  fleteTitOcupada: { color: '#94a3b8' },
  ocupadaChip: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  ocupadaChipTxt: { fontSize: 9, fontWeight: '900' as const, color: '#b91c1c', letterSpacing: 1, textTransform: 'uppercase' as const },
  ocupadaInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  ocupadaInfoTxt: { fontSize: 11, color: '#94a3b8', flex: 1, fontStyle: 'italic' as const },

  fleetSection: { marginBottom: SPACE.lg },
  fleetRow: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 4, paddingRight: SPACE.md, gap: 12 },
  fleetAddH: {
    width: 112,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(59,130,246,0.45)',
    backgroundColor: 'rgba(59,130,246,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.md,
    ...SHADOW.sm,
  },
  fleetAddCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
    marginBottom: 6,
  },
  fleetAddLbl: { fontSize: 10, fontWeight: '900', color: TX.navy, letterSpacing: 1 },
  fleetCardH: {
    width: 200,
    borderRadius: 24,
    padding: SPACE.md,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(30,58,138,0.12)',
    ...SHADOW.lg,
  },
  fleetCardTipo: { fontSize: 9, fontWeight: '900', color: TX.blue, letterSpacing: 1.2, textTransform: 'uppercase' },
  fleetCardPlaca: { fontSize: FONT.sizes.md, fontWeight: '900', color: TX.slate900, marginTop: 4 },
  fleetCardMeta: { fontSize: FONT.sizes.xs, color: TX.slate400, marginTop: 6, lineHeight: 16 },
  fleetCardCap: { fontSize: FONT.sizes.sm, fontWeight: '700', color: TX.navy, marginTop: 8 },
  fleetDeleteBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  fleetDeleteTxt: { fontSize: FONT.sizes.xs, fontWeight: '900', color: '#b91c1c' },
  fleetHint: { fontSize: FONT.sizes.xs, color: TX.slate400, marginTop: SPACE.sm, paddingHorizontal: 4, lineHeight: 16 },

  coordinacionTit: { fontSize: FONT.sizes.sm, fontWeight: '900', color: TX.slate900, marginTop: SPACE.md, marginBottom: SPACE.sm },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    borderColor: 'rgba(30,58,138,0.12)',
    gap: 10,
    ...SHADOW.sm,
  },
  chatRowTxt: { flex: 1 },
  chatRowTit: { fontSize: FONT.sizes.sm, fontWeight: '700', color: TX.slate900 },
  chatRowMeta: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: 4 },

  histMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: SPACE.md + 2,
    marginTop: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    ...SHADOW.sm,
  },
  histIconWrap: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(15,23,42,0.05)', marginRight: 12 },
  histMenuTxt: { flex: 1 },
  histMenuTit: { fontSize: 12, fontWeight: '900', color: TX.slate900, textTransform: 'uppercase' },
  histMenuSub: { fontSize: 10, color: TX.slate400, fontWeight: '600', marginTop: 2 },

  histListTit: { fontSize: FONT.sizes.md, fontWeight: '900', color: TX.slate900, marginTop: SPACE.lg, marginBottom: SPACE.sm },
  emptyHist: { fontSize: FONT.sizes.sm, color: COLORS.textDisabled, marginBottom: SPACE.md },
  histCard: { backgroundColor: '#FFF', borderRadius: 24, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.lg, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  histCardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  histRuta: { fontSize: FONT.sizes.md, fontWeight: '700', color: TX.slate900, flex: 1 },
  histMeta: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  histMetaSmall: { fontSize: FONT.sizes.xs, color: TX.slate400, marginTop: 4 },
  prepareBtn: {
    marginTop: SPACE.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  prepareBtnTxt: { color: TX.navy, fontSize: FONT.sizes.sm, fontWeight: '900' },
  estadoBadge: { borderRadius: RADIUS.full, paddingHorizontal: SPACE.sm, paddingVertical: 2 },
  estadoTxt: { fontSize: FONT.sizes.xs, fontWeight: '800' },

});
