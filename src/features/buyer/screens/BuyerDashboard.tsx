/**
 * Mercado comprador — layout `diseños/perfil comprador.txt` (cabecera, capacidad, rubros, tarjetas anchas).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BuyerStackParamList } from '@/features/buyer/navigation/BuyerStackParamList';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/shared/store/AuthContext';
import { authService } from '@/shared/services/authService';
import { chatService, contarMensajesMercadoNoLeidos } from '@/shared/services/chatService';
import { listarAdCampaignsActivos, listarCosechasMercado, listarProveedoresCercanosBuyer, toggleInsumeFavorito, listarInsumosFavoritos, obtenerFavoritosIds } from '@/shared/services/marketBuyerService';
import { listarInsumosDisponibles } from '@/shared/services/insumosLocalesService';
import { WeatherTicker } from '@/shared/components/WeatherTicker';
import { NotificationsCenterModal } from '@/shared/components/NotificationsCenterModal';
import { SolicitarTransporteModal } from '@/shared/components/SolicitarTransporteModal';
import { logWarn, serializeError } from '@/shared/runtime/appLogger';
import { BuyerOfferCard } from '@/features/buyer/components/BuyerOfferCard';
import { BuyerIdentityHeader } from '@/features/buyer/components/BuyerIdentityHeader';
import { SponsoredBanners } from '@/features/buyer/components/SponsoredBanners';
import { MarketFilterModal } from '@/features/buyer/components/MarketFilterModal';
import { MarketMapView } from '@/features/buyer/components/MarketMapView';
import { BuyerInsumoCard } from '@/features/buyer/components/BuyerInsumoCard';
import { CrearRequerimientoModal } from '@/features/buyer/components/CrearRequerimientoModal';
import { MisRequerimientosModal } from '@/features/buyer/components/MisRequerimientosModal';
import { NearbySupplierCard } from '@/features/buyer/components/NearbySupplierCard';
import { InsumoChatModal } from '@/shared/components/InsumoChatModal';
import { iniciarChatInsumo } from '@/shared/services/insumoChatService';
import { BuyerSupplierDetailModal } from '@/features/buyer/components/BuyerSupplierDetailModal';
import { contarNotificacionesFreightNoLeidas } from '@/shared/services/freightRequestsService';
import { CATEGORIA_DESTINO_REQUERIMIENTO } from '@/shared/services/marketDemandService';
import { getCommercialStatusLabel, getRestrictedActionMessage } from '@/shared/lib/accountStatus';
import { FONT, SPACE } from '@/shared/utils/theme';
import { distanceKmKm } from '@/shared/utils/geo';
import { VENEZUELA_DEFAULT_COORD } from '@/shared/utils/venezuelaGeo';
import type { BuyerNearbySupplier, Cosecha } from '@/shared/types';
import type { AgriculturalInput } from '@/shared/types';
import type { ComponentProps } from 'react';

const CREAM = '#FDFBF7';
const SLATE = '#0F172A';
const GREEN = '#0F3B25';
const EMERALD = '#34d399';
const ACCENT = '#1565C0';

const RUBROS_MERCADO: {
  label: string;
  api: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}[] = [
  { label: 'Todos los rubros', api: 'Todos', icon: 'grid-outline' },
  { label: 'Maíz blanco / amarillo', api: 'Maíz', icon: 'nutrition-outline' },
  { label: 'Arroz paddy', api: 'Arroz', icon: 'leaf-outline' },
  { label: 'Frijol y leguminosas', api: 'Frijol', icon: 'ellipse-outline' },
  { label: 'Soya nacional', api: 'Soya', icon: 'flower-outline' },
  { label: 'Sorgo granífero', api: 'Sorgo', icon: 'pulse-outline' },
  { label: 'Caña', api: 'Caña', icon: 'water-outline' },
  { label: 'Plátano', api: 'Plátano', icon: 'nutrition-outline' },
  { label: 'Yuca', api: 'Yuca', icon: 'leaf-outline' },
  { label: 'Tomate', api: 'Tomate', icon: 'sunny-outline' },
  { label: 'Pimentón', api: 'Pimentón', icon: 'flame-outline' },
];

const SUPPLIER_RADII = [
  { label: '10 km', value: 10_000 },
  { label: '25 km', value: 25_000 },
  { label: '50 km', value: 50_000 },
  { label: '100 km', value: 100_000 },
] as const;

type BuyerPriorityMode = 'specific' | 'deal' | 'nearby';

const PRIORITY_OPTIONS: Array<{ key: BuyerPriorityMode; label: string }> = [
  { key: 'specific', label: 'Busco algo específico' },
  { key: 'deal', label: 'Quiero mejor negocio' },
  { key: 'nearby', label: 'Me importa cercanía' },
];

const AGRO_BOARD_LINEAS = [
  { key: 'todos', label: 'Todo' },
  { key: 'insumos', label: 'Insumos' },
  { key: 'repuestos', label: 'Repuestos' },
] as const;

type FlowStepKey = 'explora' | 'negocia' | 'transporta' | 'recibe';
const FLOW_STEPS: Array<{ key: FlowStepKey; title: string; hint: string; icon: string }> = [
  { key: 'explora',    title: 'Explora',     hint: 'Rubros y ofertas',    icon: 'search-outline' },
  { key: 'negocia',   title: 'Negocia',    hint: 'Chat y precio',        icon: 'chatbubble-outline' },
  { key: 'transporta', title: 'Transporta', hint: 'Solicita flete',      icon: 'car-outline' },
  { key: 'recibe',    title: 'Recibe',     hint: 'Seguimiento y avisos', icon: 'checkmark-circle-outline' },
];

export default function BuyerDashboard() {
  const navigation = useNavigation<NativeStackNavigationProp<BuyerStackParamList>>();
  const navigateToParentTab = useCallback(
    (name: string, params?: Record<string, unknown>) => {
      const parent = navigation.getParent();
      if (parent) {
        (parent as unknown as { navigate: (n: string, p?: object) => void }).navigate(name, params);
      } else {
        (navigation as unknown as { navigate: (n: string, p?: object) => void }).navigate(name, params);
      }
    },
    [navigation],
  );
  const insets = useSafeAreaInsets();
  const { perfil, isVerificado } = useAuth();

  const [mercadoTab, setMercadoTab] = useState<'cosechas' | 'insumos' | 'favoritos'>('cosechas');
  const [cosechas, setCosechas] = useState<Cosecha[]>([]);
  const [allRows, setAllRows] = useState<Cosecha[]>([]);
  const [insumos, setInsumos] = useState<AgriculturalInput[]>([]);
  const [ads, setAds] = useState<Awaited<ReturnType<typeof listarAdCampaignsActivos>>>([]);
  const [cargando, setCargando] = useState(false);
  const [cargandoInsumos, setCargandoInsumos] = useState(false);
  const [refresh, setRefresh] = useState(false);
  const [favoritosRefreshing, setFavoritosRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [municipio, setMunicipio] = useState('');
  const [rubro, setRubro] = useState<string>('Todos');
  const [topTrust, setTopTrust] = useState(false);
  const [filterModal, setFilterModal] = useState(false);
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista');
  const [buyerPos, setBuyerPos] = useState<{ lat: number; lng: number } | null>(null);
  const [freightModal, setFreightModal] = useState(false);
  // Chat insumo
  const [insumoChatSalaId, setInsumoChatSalaId] = useState<string | null>(null);
  const [insumoChatOpen, setInsumoChatOpen] = useState(false);
  // Favoritos
  const [favoritosIds, setFavoritosIds] = useState<Set<string>>(new Set());
  const [favoritosInsumos, setFavoritosInsumos] = useState<AgriculturalInput[]>([]);
  const [freightPrefill, setFreightPrefill] = useState<{ peso?: string; descripcion?: string } | null>(null);
  const [reqModalVisible, setReqModalVisible] = useState(false);
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [myReqModalVisible, setMyReqModalVisible] = useState(false);
  const [reqPrefill, setReqPrefill] = useState<{ rubro?: string; categoria?: (typeof CATEGORIA_DESTINO_REQUERIMIENTO)[keyof typeof CATEGORIA_DESTINO_REQUERIMIENTO] } | null>(null);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [agroBoardLinea, setAgroBoardLinea] = useState<(typeof AGRO_BOARD_LINEAS)[number]['key']>('todos');
  const [nearbySuppliers, setNearbySuppliers] = useState<BuyerNearbySupplier[]>([]);
  const [supplierRadiusM, setSupplierRadiusM] = useState<number>(25_000);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<BuyerNearbySupplier | null>(null);
  const [priorityMode, setPriorityMode] = useState<BuyerPriorityMode>('specific');
  const [rubroModalVisible, setRubroModalVisible] = useState(false);
  const [marketErrorMsg, setMarketErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    void listarAdCampaignsActivos()
      .then(setAds)
      .catch((error: unknown) => {
        logWarn('buyer.dashboard.ads', 'No se pudieron cargar las campañas activas.', {
          buyerId: perfil?.id ?? null,
          error: serializeError(error),
        });
      });
  }, [perfil?.id]);

  useEffect(() => {
    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setBuyerPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        /* GPS no disponible o denegado — continúa sin posición */
      }
    })();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setBusqueda(searchInput.trim()), 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

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

  const cargarProveedoresCercanos = useCallback(async () => {
    if (!buyerPos) {
      setNearbySuppliers([]);
      return;
    }
    setLoadingSuppliers(true);
    try {
      const rows = await listarProveedoresCercanosBuyer(buyerPos.lat, buyerPos.lng, supplierRadiusM, 12);
      setNearbySuppliers(rows);
    } catch (error) {
      logWarn('buyer.dashboard.nearby_suppliers', 'No se pudieron cargar proveedores cercanos.', {
        buyerId: perfil?.id ?? null,
        radiusM: supplierRadiusM,
        error: serializeError(error),
      });
      setNearbySuppliers([]);
    } finally {
      setLoadingSuppliers(false);
    }
  }, [buyerPos, supplierRadiusM, perfil?.id]);

  useEffect(() => {
    void cargarProveedoresCercanos();
  }, [cargarProveedoresCercanos]);

  const aplicarMunicipio = useCallback((rows: Cosecha[]) => {
    if (!municipio.trim()) return rows;
    const m = municipio.trim().toLowerCase();
    return rows.filter((r) => (r.municipio ?? '').toLowerCase().includes(m));
  }, [municipio]);

  const cargarTodos = useCallback(async () => {
    try {
      const rows = await listarCosechasMercado({
        ubicacionEstado: estado,
        rubro: 'Todos',
        busqueda,
        topTrustOnly: topTrust,
      });
      setAllRows(aplicarMunicipio(rows));
    } catch (e) {
      logWarn('buyer.dashboard.market_all', 'No se pudieron cargar las cosechas del mercado nacional.', {
        buyerId: perfil?.id ?? null,
        error: serializeError(e),
      });
      setAllRows([]);
    }
  }, [estado, busqueda, topTrust, aplicarMunicipio, perfil?.id]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setMarketErrorMsg(null);
    try {
      const rows = await listarCosechasMercado({
        ubicacionEstado: estado,
        rubro,
        busqueda,
        topTrustOnly: topTrust,
      });
      setCosechas(aplicarMunicipio(rows));
    } catch (e) {
      logWarn('buyer.dashboard.market_filtered', 'No se pudieron cargar las cosechas filtradas.', {
        buyerId: perfil?.id ?? null,
        estado,
        rubro,
        error: serializeError(e),
      });
      setCosechas([]);
      setMarketErrorMsg('No pudimos cargar el mercado en este momento. Desliza para reintentar.');
    } finally {
      setCargando(false);
    }
  }, [estado, rubro, busqueda, topTrust, aplicarMunicipio, perfil?.id]);

  const loadInsumos = useCallback(async () => {
    setCargandoInsumos(true);
    try {
      const rows = await listarInsumosDisponibles(80, { lineaCatalogo: agroBoardLinea });
      setInsumos(rows);
      // Cargar IDs de favoritos en paralelo
      if (perfil?.id) {
        obtenerFavoritosIds(perfil.id).then(setFavoritosIds).catch(() => undefined);
      }
    } catch (e) {
      logWarn('buyer.dashboard.inputs', 'No se pudieron cargar los insumos del tablero.', {
        buyerId: perfil?.id ?? null,
        linea: agroBoardLinea,
        error: serializeError(e),
      });
      setInsumos([]);
    } finally {
      setCargandoInsumos(false);
    }
  }, [agroBoardLinea, perfil?.id]);

  useEffect(() => {
    void cargarTodos();
  }, [cargarTodos]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (mercadoTab === 'insumos') {
      setVista('lista');
      void loadInsumos();
    }
  }, [mercadoTab, loadInsumos]);

  const onRefresh = async () => {
    setRefresh(true);
    try {
      if (mercadoTab === 'insumos') {
        await loadInsumos();
      } else {
        await cargar();
        await cargarTodos();
      }
      setAds(await listarAdCampaignsActivos());
    } finally {
      setRefresh(false);
    }
  };

  const distFor = useCallback(
    (item: Cosecha): number | null => {
      if (!buyerPos) return null;
      const finca = item.finca as { coordenadas?: { lat: number; lng: number } | null } | null | undefined;
      const c = finca?.coordenadas;
      if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') return null;
      return distanceKmKm(buyerPos, c);
    },
    [buyerPos],
  );

  const negotiate = async (item: Cosecha) => {
    if (!perfil) {
      Alert.alert('Cuenta', 'Tu sesión no está lista. Vuelve a entrar e intenta abrir la negociación de nuevo.');
      return;
    }
    const restriction = getRestrictedActionMessage(perfil);
    if (restriction) {
      Alert.alert('Cuenta', restriction);
      return;
    }
    try {
      const sala = await chatService.crearSala(perfil.id, item.agricultor_id, item.id);
      navigateToParentTab('Chat', { openCosechaSalaId: sala.id });
    } catch (e) {
      Alert.alert('Chat', e instanceof Error ? e.message : 'No se pudo abrir la negociación.');
    }
  };

  const mapCenter = useMemo(
    () => buyerPos ?? { lat: VENEZUELA_DEFAULT_COORD.latitude, lng: VENEZUELA_DEFAULT_COORD.longitude },
    [buyerPos],
  );

  const countForApi = (api: string) => {
    if (api === 'Todos') return allRows.length;
    return allRows.filter((c) => c.rubro === api).length;
  };

  const rubroLabelActual = useMemo(() => {
    if (rubro === 'Todos') return 'Todos los rubros';
    const found = RUBROS_MERCADO.find((r) => r.api === rubro);
    return found?.label ?? rubro;
  }, [rubro]);

  const totalTonVisible = useMemo(() => {
    const kg = cosechas.reduce((a, c) => a + Number(c.cantidad_kg || 0), 0);
    return Math.round((kg / 1000) * 10) / 10;
  }, [cosechas]);

  const marketFocusPct = useMemo(() => {
    if (cosechas.length === 0) return 0;
    return Math.max(18, Math.round((Math.min(cosechas.length, 12) / 12) * 100));
  }, [cosechas.length]);

  const todayFocus = useMemo(() => {
    const radioLabel =
      buyerPos != null ? `${supplierRadiusM < 1000 ? supplierRadiusM : supplierRadiusM / 1000} ${supplierRadiusM < 1000 ? 'm' : 'km'}` : 'sin GPS';
    const blocks = [
      nearbySuppliers.length > 0
        ? `${nearbySuppliers.length} proveedor(es) registrados dentro de ${radioLabel}, priorizados dentro de una red nacional.`
        : buyerPos
          ? `Aún no hay proveedores dentro de ${radioLabel}; prueba ampliando el radio sin salir del mercado nacional.`
          : 'Activa tu ubicación para priorizar proveedores cercanos dentro del mercado nacional.',
      cosechas.length > 0
        ? `${cosechas.length} oferta(s) activas en ${estado === 'Todos' ? 'el mercado nacional' : `el filtro ${estado}`}.`
        : `No hay ofertas con los filtros actuales${estado === 'Todos' ? ' a nivel nacional' : ` para ${estado}`}.`,
      hasUnreadNotifications
        ? 'Tienes notificaciones sin revisar.'
        : 'Tu centro de notificaciones está al día.',
    ];
    return blocks;
  }, [nearbySuppliers.length, buyerPos, supplierRadiusM, cosechas.length, hasUnreadNotifications, estado]);

  const recommendationLine = useMemo(() => {
    if (!isVerificado) {
      return getRestrictedActionMessage(perfil) ?? 'Tu cuenta necesita revisión antes de negociar. Mientras tanto puedes seguir explorando el mercado.';
    }
    if (priorityMode === 'specific') {
      return busqueda || rubro !== 'Todos'
        ? 'Estamos enfocando el panel en lo que buscas para ayudarte a decidir más rápido.'
        : 'Usa el buscador, el rubro o una demanda dirigida para encontrar exactamente lo que necesitas dentro del mercado nacional.';
    }
    if (priorityMode === 'deal') {
      return 'Aquí damos prioridad a oportunidades del mercado nacional con mejor combinación de confianza, volumen y condiciones para negociar.';
    }
    return nearbySuppliers.length > 0
      ? 'Estamos poniendo primero lo más cercano, sin perder de vista las oportunidades del mercado nacional.'
      : 'Activa o amplía el radio para priorizar aliados cercanos dentro de la red nacional.';
  }, [isVerificado, nearbySuppliers.length, priorityMode, busqueda, rubro, perfil]);

  const marketScopeChips = useMemo(
    () => [
      estado === 'Todos' ? 'Cobertura nacional' : `Filtro por ${estado}`,
      buyerPos ? 'Cercanía como prioridad' : 'Sin prioridad GPS',
    ],
    [estado, buyerPos],
  );

  const commercialHint = useMemo(() => {
    if (priorityMode === 'deal' && mercadoTab === 'cosechas') {
      return 'En cosechas públicas el precio se acuerda por chat. Aquí priorizamos confianza, volumen y logística.';
    }
    if (priorityMode === 'specific') {
      return 'Ideal cuando ya sabes qué rubro o producto quieres comprar.';
    }
    if (priorityMode === 'nearby') {
      return 'Útil si quieres resolver rápido con menor distancia y coordinación más simple.';
    }
    return 'Compara primero las mejores condiciones y luego cierra tu operación.';
  }, [priorityMode, mercadoTab]);

  const openNotificaciones = () => setNotifModalVisible(true);

  const openClima = () => {
    navigateToParentTab('Clima');
  };

  const openDirectTransport = () => {
    const rubroBase = busqueda || (rubro !== 'Todos' ? rubro : '');
    setFreightPrefill({
      peso: '',
      descripcion: rubroBase
        ? `Necesito transporte para movilizar ${rubroBase}.\n\nIndicar cantidad, origen, destino y fecha de carga.`
        : 'Necesito transporte para movilizar una compra o carga comercial.\n\nIndicar rubro, cantidad, origen, destino y fecha.',
    });
    setFreightModal(true);
  };

  const openTransportForSupplier = (supplier: BuyerNearbySupplier) => {
    setFreightPrefill({
      peso: '',
      descripcion:
        `Necesito transporte para una operación con ${supplier.display_name}.\n\n` +
        `Proveedor sugerido a ${supplier.distance_m < 1000 ? '<1 km' : `${(supplier.distance_m / 1000).toFixed(1)} km`}.\n` +
        `Indicar rubro, cantidad, origen, destino y fecha de carga.`,
    });
    setFreightModal(true);
  };

  const openRequirementForSupplier = (supplier: BuyerNearbySupplier) => {
    const restriction = getRestrictedActionMessage(perfil);
    if (restriction) {
      Alert.alert('Cuenta', restriction);
      return;
    }
    setReqPrefill({
      rubro: busqueda ? busqueda : rubro === 'Todos' ? '' : rubro,
      categoria:
        supplier.kind === 'company'
          ? CATEGORIA_DESTINO_REQUERIMIENTO.volumenProcesadoSilos
          : CATEGORIA_DESTINO_REQUERIMIENTO.insumosMaquinaria,
    });
    setReqModalVisible(true);
  };

  const displayedCosechas = useMemo(() => {
    const rows = [...cosechas];
    if (priorityMode === 'nearby' && buyerPos) {
      rows.sort((a, b) => {
        const ac = (a.finca as { coordenadas?: { lat: number; lng: number } | null } | null | undefined)?.coordenadas;
        const bc = (b.finca as { coordenadas?: { lat: number; lng: number } | null } | null | undefined)?.coordenadas;
        const ad = ac ? distanceKmKm(buyerPos, ac) : Number.POSITIVE_INFINITY;
        const bd = bc ? distanceKmKm(buyerPos, bc) : Number.POSITIVE_INFINITY;
        return ad - bd;
      });
      return rows;
    }
    if (priorityMode === 'deal') {
      rows.sort((a, b) => {
        const ats = (a.perfil as { trust_score?: number } | undefined)?.trust_score ?? 0;
        const bts = (b.perfil as { trust_score?: number } | undefined)?.trust_score ?? 0;
        if (bts !== ats) return bts - ats;
        return Number(b.cantidad_kg ?? 0) - Number(a.cantidad_kg ?? 0);
      });
    }
    return rows;
  }, [cosechas, priorityMode, buyerPos]);

  const displayedInsumos = useMemo(() => {
    const rows = [...insumos];
    if (priorityMode === 'deal') {
      rows.sort((a, b) => {
        const ad = a.disponibilidad ? 1 : 0;
        const bd = b.disponibilidad ? 1 : 0;
        if (bd !== ad) return bd - ad;
        return String(a.nombre_producto ?? '').localeCompare(String(b.nombre_producto ?? ''), 'es');
      });
    }
    return rows;
  }, [insumos, priorityMode]);

  const fabBottom = 20 + insets.bottom;
  const listPadBottom = 100 + insets.bottom;

  const mercadoSegControl = (
    <View style={s.mercadoSeg}>
      <TouchableOpacity
        style={[s.mercadoSegItem, mercadoTab === 'cosechas' && s.mercadoSegItemOn]}
        onPress={() => setMercadoTab('cosechas')}
        activeOpacity={0.92}
      >
        <Text style={[s.mercadoSegTxt, mercadoTab === 'cosechas' && s.mercadoSegTxtOn]}>Cosechas</Text>
        <Text style={[s.mercadoSegSub, mercadoTab === 'cosechas' && s.mercadoSegSubOn]}>Materia prima</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.mercadoSegItem, mercadoTab === 'insumos' && s.mercadoSegItemOn]}
        onPress={() => setMercadoTab('insumos')}
        activeOpacity={0.92}
      >
        <Text style={[s.mercadoSegTxt, mercadoTab === 'insumos' && s.mercadoSegTxtOn]}>Insumos</Text>
        <Text style={[s.mercadoSegSub, mercadoTab === 'insumos' && s.mercadoSegSubOn]}>Agrotiendas</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.mercadoSegItem, mercadoTab === 'favoritos' && s.mercadoSegItemOn]}
        onPress={() => {
          setMercadoTab('favoritos');
          if (perfil?.id) {
            listarInsumosFavoritos(perfil.id).then(setFavoritosInsumos).catch(() => setFavoritosInsumos([]));
          }
        }}
        activeOpacity={0.92}
      >
        <Text style={[s.mercadoSegTxt, mercadoTab === 'favoritos' && s.mercadoSegTxtOn]}>Favoritos</Text>
        <Text style={[s.mercadoSegSub, mercadoTab === 'favoritos' && s.mercadoSegSubOn]}>Guardados</Text>
      </TouchableOpacity>
    </View>
  );

  const sharedHeader = (
    <>
      <WeatherTicker topInset estado_ve={perfil?.estado_ve} onPress={openClima} />
      <BuyerIdentityHeader
        perfil={perfil ?? null}
        isVerificado={isVerificado}
        onBell={openNotificaciones}
        onLogout={() => void authService.logout()}
        showNotificationDot={hasUnreadNotifications}
      />
      {mercadoSegControl}
    </>
  );

  /** Una sola acción rápida: transporte. Filtros = icono junto al buscador; demandas = enlace junto al listado. */
  const accionesRapidas = (
    <View style={s.quickActionsWrap}>
      <TouchableOpacity style={s.quickActionCardSingle} onPress={openDirectTransport} activeOpacity={0.9}>
        <View style={[s.quickIconWrap, { backgroundColor: '#E0F2FE' }]}>
          <Ionicons name="bus-outline" size={20} color={ACCENT} />
        </View>
        <View style={s.quickActionCardSingleText}>
          <Text style={s.quickActionTitle}>Pedir transporte</Text>
          <Text style={s.quickActionSub}>Maíz, arroz u otra compra ya cerrada</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
      </TouchableOpacity>
    </View>
  );

  const buyerTodayPanel = (
    <View style={s.todayPanel}>
      <View style={s.todayPanelTop}>
        <View style={s.todayPanelTopLeft}>
          <Text style={s.todayEyebrow}>Radar comercial</Text>
          <Text style={s.todayTitle} numberOfLines={2}>
            Lo mejor para comprar hoy
          </Text>
        </View>
        <View style={s.todayBadge}>
          <Text style={s.todayBadgeTxt} numberOfLines={2}>
              {isVerificado ? 'Listo para comprar' : getCommercialStatusLabel(perfil)}
          </Text>
        </View>
      </View>
      <Text style={s.todayBody}>{recommendationLine}</Text>
      <View style={s.scopeRow}>
        {marketScopeChips.map((item, idx) => (
          <View key={`scope-${idx}`} style={s.scopeChip}>
            <Text style={s.scopeChipTxt} numberOfLines={2}>
              {item}
            </Text>
          </View>
        ))}
      </View>
      <Text style={s.prioritySectionLabel}>Cómo quieres priorizar</Text>
      <View style={s.priorityColumn}>
        {PRIORITY_OPTIONS.map((item) => {
          const active = priorityMode === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[s.priorityRow, active && s.priorityRowOn]}
              onPress={() => setPriorityMode(item.key)}
              activeOpacity={0.88}
            >
              <View style={s.priorityRowLeft}>
                <View style={[s.priorityDot, active && s.priorityDotOn]} />
                <Text style={[s.priorityRowTxt, active && s.priorityRowTxtOn]} numberOfLines={2}>
                  {item.label}
                </Text>
              </View>
              <Ionicons
                name={active ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={active ? '#fff' : '#cbd5e1'}
              />
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={s.priorityHint}>{commercialHint}</Text>
      {/* Resumen compacto (el detalle de Ton está en «Mercado activo» arriba) */}
      <View style={s.todayMetricsCompact}>
        <View style={s.metricChip}>
          <Text style={s.metricChipLabel}>Aliados</Text>
          <Text style={s.metricChipVal}>{nearbySuppliers.length}</Text>
        </View>
        <View style={s.metricChip}>
          <Text style={s.metricChipLabel}>Ofertas</Text>
          <Text style={s.metricChipVal}>{displayedCosechas.length}</Text>
        </View>
      </View>
      <View style={s.todayChecklist}>
        {todayFocus.map((item, idx) => (
          <View key={`focus-${idx}`} style={s.todayChecklistRow}>
            <Ionicons name="checkmark-circle-outline" size={15} color="#1d4ed8" />
            <Text style={s.todayChecklistTxt}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const proveedoresCercanosSection = buyerPos ? (
    <View style={s.nearbySection}>
      <View style={s.nearbyHead}>
        <View>
          <Text style={s.nearbyTitle}>Aliados cercanos dentro de la red nacional</Text>
          <Text style={s.nearbySub}>La app opera a nivel nacional; aquí te mostramos primero tiendas y proveedores cercanos para comprar más rápido.</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.radiusSelector}>
        {SUPPLIER_RADII.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[s.radiusChip, supplierRadiusM === item.value && s.radiusChipOn]}
            onPress={() => setSupplierRadiusM(item.value)}
            activeOpacity={0.88}
          >
            <Text style={[s.radiusChipTxt, supplierRadiusM === item.value && s.radiusChipTxtOn]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loadingSuppliers ? (
        <ActivityIndicator color={ACCENT} style={{ marginVertical: 16 }} />
      ) : nearbySuppliers.length === 0 ? (
        <Text style={s.nearbyEmpty}>No hay proveedores registrados dentro del radio seleccionado. Puedes ampliarlo y seguir explorando el mercado nacional.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.nearbyCardsRow}>
          {nearbySuppliers.map((item) => (
            <NearbySupplierCard
              key={`${item.kind}-${item.id}`}
              item={item}
              onOpen={setSelectedSupplier}
              onRequest={openRequirementForSupplier}
            />
          ))}
        </ScrollView>
      )}
    </View>
  ) : (
    <View style={s.nearbySection}>
      <Text style={s.nearbyTitle}>Aliados cercanos dentro de la red nacional</Text>
      <Text style={s.nearbyEmpty}>Activa la ubicación para priorizar agrotiendas y empresas cercanas, sin salir del mercado nacional.</Text>
    </View>
  );

  const cosechasHeaderRest = (
    <>
      <View style={s.titleRow}>
        <Text style={s.titleMercado}>Oportunidades para comprar</Text>
        <View style={s.proPill}>
          <Text style={s.proPillTxt}>{isVerificado ? 'COMPRAS PRO' : getCommercialStatusLabel(perfil).toUpperCase()}</Text>
        </View>
      </View>

      <View style={s.searchRow}>
        <TextInput
          style={s.search}
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Buscar por rubro, estado o municipio…"
          placeholderTextColor="#94a3b8"
        />
        <TouchableOpacity
          style={s.filterBtn}
          onPress={() => setFilterModal(true)}
          accessibilityLabel="Filtros: estado y municipio"
        >
          <Ionicons name="options-outline" size={22} color={SLATE} />
        </TouchableOpacity>
      </View>

      {/* Chips de filtros rápidos activos */}
      {(estado !== 'Todos' || municipio || rubro !== 'Todos') ? (
        <View style={s.activeFiltersRow}>
          {estado !== 'Todos' ? (
            <TouchableOpacity style={s.activeChip} onPress={() => setEstado('Todos')}>
              <Ionicons name="location-outline" size={12} color="#1d4ed8" />
              <Text style={s.activeChipTxt}>{estado}</Text>
              <Ionicons name="close" size={12} color="#1d4ed8" />
            </TouchableOpacity>
          ) : null}
          {municipio ? (
            <TouchableOpacity style={s.activeChip} onPress={() => setMunicipio('')}>
              <Ionicons name="map-outline" size={12} color="#1d4ed8" />
              <Text style={s.activeChipTxt}>{municipio}</Text>
              <Ionicons name="close" size={12} color="#1d4ed8" />
            </TouchableOpacity>
          ) : null}
          {rubro !== 'Todos' ? (
            <TouchableOpacity style={s.activeChip} onPress={() => setRubro('Todos')}>
              <Ionicons name="leaf-outline" size={12} color="#065f46" />
              <Text style={[s.activeChipTxt, { color: '#065f46' }]}>{rubro}</Text>
              <Ionicons name="close" size={12} color="#065f46" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={s.clearAllChip} onPress={() => { setEstado('Todos'); setMunicipio(''); setRubro('Todos'); setSearchInput(''); setBusqueda(''); }}>
            <Text style={s.clearAllTxt}>Limpiar todo</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={s.capCard}>
        <View style={s.capDecor}>
          <Ionicons name="cube-outline" size={120} color="rgba(255,255,255,0.06)" />
        </View>
        <View style={s.capInner}>
          <View style={s.capTop}>
            <View style={s.capTopText}>
              <Text style={s.capEyebrow}>Mercado activo</Text>
              <Text style={s.capTon}>
                {totalTonVisible}{' '}
                <Text style={s.capTonUnit}>Ton</Text>
              </Text>
              <Text style={s.capSub}>Volumen disponible para negociar con tus filtros actuales</Text>
            </View>
            <View style={s.capIconBox}>
              <Ionicons name="stats-chart" size={24} color={EMERALD} />
            </View>
          </View>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${marketFocusPct}%` }]} />
          </View>
          <View style={s.barLabels}>
            <Text style={s.barLabel}>Mercado en foco</Text>
            <Text style={s.barLabel}>{cosechas.length} oferta(s)</Text>
          </View>
        </View>
      </View>

      {buyerTodayPanel}
      <SponsoredBanners campaigns={ads} />
      {accionesRapidas}
      {proveedoresCercanosSection}

      <View style={s.flowStripCompact}>
        <Text style={s.flowStripIntro}>Ruta sugerida en la app</Text>
        <Text style={s.flowStripHint} numberOfLines={3}>
          Es el orden típico: ver ofertas → cerrar en chat → pedir transporte → recibir. No es un formulario; solo te orienta.
        </Text>
        {[0, 1].map((row) => (
          <View key={`flow-row-${row}`} style={s.flowGridRow}>
            {FLOW_STEPS.slice(row * 2, row * 2 + 2).map((step, col) => {
              const idx = row * 2 + col;
              const onPress = step.key === 'negocia'
                ? () => navigateToParentTab('Chat')
                : step.key === 'transporta'
                  ? openDirectTransport
                  : step.key === 'recibe'
                    ? openNotificaciones
                    : undefined;
              const Wrapper = onPress ? TouchableOpacity : View;
              return (
                <Wrapper key={step.key} style={s.flowStep} onPress={onPress} activeOpacity={0.75}>
                  <View style={s.flowStepNumCircle}>
                    <Text style={s.flowStepNum}>{idx + 1}</Text>
                  </View>
                  <View style={s.flowStepTexts}>
                    <Text style={s.flowStepTitle} numberOfLines={1}>
                      {step.title}
                    </Text>
                    <Text style={s.flowStepSub} numberOfLines={2}>
                      {step.hint}
                    </Text>
                  </View>
                  {onPress ? <Ionicons name="chevron-forward" size={12} color="#94a3b8" /> : null}
                </Wrapper>
              );
            })}
          </View>
        ))}
      </View>

      <View style={s.rubroSection}>
        <View style={s.rubroHead}>
          <View style={s.rubroHeadText}>
            <Text style={s.rubroTitle}>Mercado por rubro</Text>
            <Text style={s.rubroSummaryLine} numberOfLines={2}>
              {rubroLabelActual}
              {topTrust ? ' · prioridad top productores' : ''}
            </Text>
          </View>
          <View style={s.filtroActivo}>
            <Text style={s.filtroActivoTxt}>{topTrust ? 'Top ON' : estado === 'Todos' ? 'Nacional' : estado}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.explorarRubrosBtn}
          onPress={() => setRubroModalVisible(true)}
          activeOpacity={0.88}
          accessibilityLabel="Explorar por rubros"
          accessibilityRole="button"
        >
          <Ionicons name="layers-outline" size={16} color={GREEN} />
          <Text style={s.explorarRubrosBtnTxt}>Explorar por rubros</Text>
          <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
        </TouchableOpacity>
        <Text style={s.rubroRailHint}>
          {rubro === 'Todos' ? allRows.length : countForApi(rubro)} oportunidad(es) con los filtros actuales
          {topTrust ? ' · orden por confianza' : ''}
        </Text>
      </View>

      <View style={s.resultHead}>
        <Text style={s.resultTitle} numberOfLines={1}>
          Oportunidades abiertas: {rubro === 'Todos' ? 'Todas' : rubro}
        </Text>
        <TouchableOpacity style={s.reqLinkBtn} onPress={() => setMyReqModalVisible(true)} activeOpacity={0.88}>
          <Text style={s.reqLinkTxt}>Mis demandas</Text>
        </TouchableOpacity>
      </View>

      <View style={s.listaMapSeg}>
        <TouchableOpacity style={[s.segBtn, vista === 'lista' && s.segBtnOn]} onPress={() => setVista('lista')}>
          <Text style={[s.segBtnTxt, vista === 'lista' && s.segBtnTxtOn]}>Lista</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.segBtn, vista === 'mapa' && s.segBtnOn]} onPress={() => setVista('mapa')}>
          <Text style={[s.segBtnTxt, vista === 'mapa' && s.segBtnTxtOn]}>Mapa</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const insumosHeader = (
    <View style={s.insumosIntro}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={s.titleMercado}>Pizarra agrotienda</Text>
      </View>
      <Text style={s.insumosSub}>
        Una sola pizarra para comprar insumos o repuestos. Filtra lo que necesitas y negocia condiciones por chat.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.agroLineaRail}>
        {AGRO_BOARD_LINEAS.map((item) => {
          const active = agroBoardLinea === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[s.agroLineaChip, active && s.agroLineaChipOn]}
              onPress={() => setAgroBoardLinea(item.key)}
              activeOpacity={0.92}
            >
              <Text style={[s.agroLineaChipTxt, active && s.agroLineaChipTxtOn]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const openFreightFor = (item: Cosecha) => {
    setFreightPrefill({
      peso: String(Math.round(Number(item.cantidad_kg))),
      descripcion: `Cosecha ${item.rubro} · ${item.municipio} (mercado)`,
    });
    setFreightModal(true);
  };

  const mapaActivo = mercadoTab === 'cosechas' && vista === 'mapa';
  const mapHeader = (
    <View style={s.mapModeCard}>
      <View style={s.mapModeTop}>
        <View>
          <Text style={s.mapModeEyebrow}>Vista geográfica</Text>
          <Text style={s.mapModeTitle}>Mercado sobre el mapa</Text>
        </View>
        <View style={s.mapModeBadge}>
          <Text style={s.mapModeBadgeTxt}>{buyerPos ? 'GPS activo' : 'Nacional'}</Text>
        </View>
      </View>
      <Text style={s.mapModeBody}>
        Usa el mapa para ubicar cosechas, silos y agrotiendas por zona. Si necesitas más detalle comercial, vuelve a la lista.
      </Text>
      <View style={s.listaMapSeg}>
        <TouchableOpacity style={[s.segBtn, vista === 'lista' && s.segBtnOn]} onPress={() => setVista('lista')}>
          <Text style={[s.segBtnTxt, vista === 'lista' && s.segBtnTxtOn]}>Lista</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.segBtn, vista === 'mapa' && s.segBtnOn]} onPress={() => setVista('mapa')}>
          <Text style={[s.segBtnTxt, vista === 'mapa' && s.segBtnTxtOn]}>Mapa</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      {mapaActivo ? (
        <ScrollView
          style={s.root}
          contentContainerStyle={[s.mapScrollContent, { paddingBottom: listPadBottom }]}
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {sharedHeader}
          {mapHeader}
          <MarketMapView initialLat={mapCenter.lat} initialLng={mapCenter.lng} />
        </ScrollView>
      ) : mercadoTab === 'insumos' ? (
        <FlatList
          data={displayedInsumos}
          keyExtractor={(i) => i.id}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={8}
          removeClippedSubviews={Platform.OS === 'android'}
          ListHeaderComponent={
            <>
              {sharedHeader}
              {insumosHeader}
            </>
          }
          contentContainerStyle={[s.listContent, { paddingBottom: listPadBottom }]}
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} />}
          ListEmptyComponent={
            cargandoInsumos ? (
              <ActivityIndicator color={ACCENT} style={{ marginVertical: 24 }} />
            ) : (
              <Text style={s.emptyTxt}>No hay insumos disponibles en este momento.</Text>
            )
          }
          renderItem={({ item }) => (
            <BuyerInsumoCard
              item={item}
              isFavorito={favoritosIds.has(item.id)}
              onToggleFavorito={() => {
                if (!perfil?.id) return;
                void toggleInsumeFavorito(item.id, perfil.id).then((added) => {
                  setFavoritosIds((prev) => {
                    const next = new Set(prev);
                    if (added) next.add(item.id); else next.delete(item.id);
                    return next;
                  });
                });
              }}
              onChat={async (selected) => {
                if (!perfil?.id) return;
                const restriction = getRestrictedActionMessage(perfil);
                if (restriction) {
                  Alert.alert('Cuenta', restriction);
                  return;
                }
                try {
                  const salaId = await iniciarChatInsumo(selected.id);
                  setInsumoChatSalaId(salaId);
                  setInsumoChatOpen(true);
                } catch (e: unknown) {
                  Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo abrir el chat.');
                }
              }}
            />
          )}
        />
      ) : mercadoTab === 'favoritos' ? (
        <FlatList
          data={favoritosInsumos}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={
            <>
              {sharedHeader}
              {mercadoSegControl}
              <View style={s.insumosIntro}>
                <Text style={s.titleMercado}>Mis favoritos</Text>
                <Text style={s.insumosSub}>Los insumos que guardaste como favoritos aparecen aquí para acceder rápidamente.</Text>
              </View>
            </>
          }
          contentContainerStyle={[s.listContent, { paddingBottom: listPadBottom }]}
          refreshControl={
            <RefreshControl
              refreshing={favoritosRefreshing}
              onRefresh={() => {
                if (!perfil?.id) {
                  setFavoritosInsumos([]);
                  return;
                }
                setFavoritosRefreshing(true);
                listarInsumosFavoritos(perfil.id)
                  .then(setFavoritosInsumos)
                  .catch(() => setFavoritosInsumos([]))
                  .finally(() => setFavoritosRefreshing(false));
              }}
            />
          }
          ListEmptyComponent={
            <Text style={s.emptyTxt}>No tienes insumos guardados como favoritos.</Text>
          }
          renderItem={({ item }) => (
            <BuyerInsumoCard
              item={item}
              isFavorito={true}
              onToggleFavorito={() => {
                if (!perfil?.id) return;
                void toggleInsumeFavorito(item.id, perfil.id).then(() => {
                  setFavoritosInsumos((prev) => prev.filter((i) => i.id !== item.id));
                  setFavoritosIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
                });
              }}
              onChat={async (selected) => {
                if (!perfil?.id) return;
                const restriction = getRestrictedActionMessage(perfil);
                if (restriction) {
                  Alert.alert('Cuenta', restriction);
                  return;
                }
                try {
                  const salaId = await iniciarChatInsumo(selected.id);
                  setInsumoChatSalaId(salaId);
                  setInsumoChatOpen(true);
                } catch (e: unknown) {
                  Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo abrir el chat.');
                }
              }}
            />
          )}
        />
      ) : (
        <FlatList
          data={displayedCosechas}
          keyExtractor={(i) => i.id}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={8}
          removeClippedSubviews={Platform.OS === 'android'}
          ListHeaderComponent={
            <>
              {sharedHeader}
              {cosechasHeaderRest}
            </>
          }
          contentContainerStyle={[s.listContent, { paddingBottom: listPadBottom }]}
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} />}
          ListEmptyComponent={
            !cargando ? (
              <Text style={s.emptyTxt}>{marketErrorMsg ?? 'No hay cosechas publicadas con esos filtros.'}</Text>
            ) : (
              <ActivityIndicator color={GREEN} style={{ marginVertical: 24 }} />
            )
          }
          renderItem={({ item }) => (
            <BuyerOfferCard
              item={item}
              distanceKm={distFor(item)}
              onNegotiate={() => void negotiate(item)}
              onFreight={() => openFreightFor(item)}
              onViewProducer={
                item.agricultor_id
                  ? () => {
                      const perfilNombre = (item.perfil as { nombre?: string } | undefined)?.nombre;
                      navigation.navigate('SharedProducerProfile', {
                        producerId: item.agricultor_id,
                        accessContext: 'buyer_view',
                        producerName: perfilNombre ?? item.finca?.nombre,
                      });
                    }
                  : undefined
              }
            />
          )}
        />
      )}

      {!mapaActivo && mercadoTab === 'cosechas' ? (
        <TouchableOpacity
          style={[s.fab, { bottom: fabBottom }]}
          onPress={() => {
            const restriction = getRestrictedActionMessage(perfil);
            if (restriction) {
              Alert.alert('Cuenta', restriction);
              return;
            }
            setReqPrefill(null);
            setReqModalVisible(true);
          }}
          activeOpacity={0.92}
          accessibilityLabel="Crear nueva demanda"
        >
          <Ionicons name="megaphone-outline" size={22} color="#fff" />
          <Text style={s.fabTxt} numberOfLines={1}>
            Nueva demanda
          </Text>
        </TouchableOpacity>
      ) : null}

      <MarketFilterModal
        visible={filterModal}
        onClose={() => setFilterModal(false)}
        estado={estado}
        municipio={municipio}
        onApply={(e, m) => {
          setEstado(e);
          setMunicipio(m);
        }}
      />

      <SolicitarTransporteModal
        visible={freightModal}
        onClose={() => {
          setFreightModal(false);
          setFreightPrefill(null);
        }}
        perfil={perfil ?? null}
        initialPrefill={freightPrefill}
      />

      <CrearRequerimientoModal
        visible={reqModalVisible}
        onClose={() => {
          setReqModalVisible(false);
          setReqPrefill(null);
        }}
        onCreado={() => {
          void onRefresh();
        }}
        initialCategoriaDestino={reqPrefill?.categoria}
        initialRubro={reqPrefill?.rubro}
      />
      <MisRequerimientosModal
        visible={myReqModalVisible}
        onClose={() => setMyReqModalVisible(false)}
        buyerId={perfil?.id}
      />
      <NotificationsCenterModal
        visible={notifModalVisible}
        onClose={() => {
          setNotifModalVisible(false);
          void refreshUnreadNotifications();
        }}
        userId={perfil?.id}
      />
      <InsumoChatModal
        visible={insumoChatOpen}
        onClose={() => { setInsumoChatOpen(false); setInsumoChatSalaId(null); }}
        salaId={insumoChatSalaId}
        perfil={perfil ?? null}
      />
      <BuyerSupplierDetailModal
        visible={selectedSupplier != null}
        onClose={() => setSelectedSupplier(null)}
        supplier={selectedSupplier}
        onRequestRequirement={openRequirementForSupplier}
        onRequestTransport={openTransportForSupplier}
      />

      <Modal
        visible={rubroModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRubroModalVisible(false)}
      >
        <View style={s.rubroModalRoot}>
          <Pressable style={s.rubroModalBackdropTouch} onPress={() => setRubroModalVisible(false)} />
          <View style={[s.rubroModalSheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <View style={s.rubroModalGrab} />
            <View style={s.rubroModalHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.rubroModalEyebrow}>Catálogo</Text>
                <Text style={s.rubroModalTitle}>Rubros del mercado</Text>
              </View>
              <TouchableOpacity onPress={() => setRubroModalVisible(false)} hitSlop={12} accessibilityLabel="Cerrar lista de rubros">
                <Ionicons name="close" size={24} color={SLATE} />
              </TouchableOpacity>
            </View>
            <Text style={s.rubroModalSub}>
              Elige un rubro para filtrar las ofertas. El número a la derecha indica cuántas coinciden con tus filtros actuales.
            </Text>
            <ScrollView
              style={s.rubroModalList}
              contentContainerStyle={s.rubroModalListContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <TouchableOpacity
                style={[s.rubroModalRow, rubro === 'Todos' && s.rubroModalRowOn]}
                onPress={() => {
                  setRubro('Todos');
                  setRubroModalVisible(false);
                }}
                activeOpacity={0.88}
              >
                <View style={[s.rubroModalRowIcon, rubro === 'Todos' && s.rubroModalRowIconOn]}>
                  <Ionicons name="grid-outline" size={20} color={rubro === 'Todos' ? '#fff' : GREEN} />
                </View>
                <View style={s.rubroModalRowBody}>
                  <Text style={[s.rubroModalRowTitle, rubro === 'Todos' && s.rubroModalRowTitleOn]} numberOfLines={2}>
                    Todos los rubros
                  </Text>
                  <Text style={[s.rubroModalRowMeta, rubro === 'Todos' && s.rubroModalRowMetaOn]} numberOfLines={1}>
                    Ver el catálogo completo
                  </Text>
                </View>
                <Text style={[s.rubroModalCountTxt, rubro === 'Todos' && s.rubroModalCountTxtOn]}>{countForApi('Todos')}</Text>
              </TouchableOpacity>
              {RUBROS_MERCADO.map((r) => {
                if (r.api === 'Todos') return null;
                const on = rubro === r.api;
                const n = countForApi(r.api);
                return (
                  <TouchableOpacity
                    key={r.api}
                    style={[s.rubroModalRow, on && s.rubroModalRowOn]}
                    onPress={() => {
                      setRubro(r.api);
                      setRubroModalVisible(false);
                    }}
                    activeOpacity={0.88}
                  >
                    <View style={[s.rubroModalRowIcon, on && s.rubroModalRowIconOn]}>
                      <Ionicons name={r.icon} size={20} color={on ? '#fff' : GREEN} />
                    </View>
                    <View style={s.rubroModalRowBody}>
                      <Text style={[s.rubroModalRowTitle, on && s.rubroModalRowTitleOn]} numberOfLines={2}>
                        {r.label}
                      </Text>
                      <Text style={[s.rubroModalRowMeta, on && s.rubroModalRowMetaOn]} numberOfLines={1}>
                        Clave {r.api}
                      </Text>
                    </View>
                    <Text style={[s.rubroModalCountTxt, on && s.rubroModalCountTxtOn]}>{n}</Text>
                  </TouchableOpacity>
                );
              })}
              <View style={s.rubroModalDivider} />
              <TouchableOpacity
                style={[s.rubroModalRow, topTrust && s.rubroModalRowOn]}
                onPress={() => setTopTrust((t) => !t)}
                activeOpacity={0.88}
              >
                <View style={[s.rubroModalRowIcon, topTrust && s.rubroModalRowIconOn]}>
                  <Ionicons name="star" size={20} color={topTrust ? '#fff' : '#f59e0b'} />
                </View>
                <View style={s.rubroModalRowBody}>
                  <Text style={[s.rubroModalRowTitle, topTrust && s.rubroModalRowTitleOn]} numberOfLines={2}>
                    Priorizar top productores
                  </Text>
                  <Text style={[s.rubroModalRowMeta, topTrust && s.rubroModalRowMetaOn]} numberOfLines={2}>
                    Ordena por confianza y volumen dentro del rubro elegido
                  </Text>
                </View>
                <Ionicons name={topTrust ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={topTrust ? GREEN : '#cbd5e1'} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  listContent: { paddingBottom: SPACE.xxl },
  mapScrollContent: { paddingBottom: SPACE.xxl, backgroundColor: CREAM },
  mapModeCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  mapModeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  mapModeEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: ACCENT,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  mapModeTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '900',
    color: SLATE,
    fontStyle: 'italic',
  },
  mapModeBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  mapModeBadgeTxt: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  mapModeBody: { marginTop: 10, fontSize: 12, lineHeight: 18, color: '#475569', fontWeight: '600' },
  mercadoSeg: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 4,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    gap: 6,
  },
  mercadoSegItem: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignItems: 'center',
  },
  mercadoSegItemOn: { backgroundColor: ACCENT },
  mercadoSegTxt: {
    fontSize: 13,
    fontWeight: '900',
    color: '#64748b',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mercadoSegTxtOn: { color: '#fff' },
  mercadoSegSub: { fontSize: 9, fontWeight: '700', color: '#94a3b8', marginTop: 4, letterSpacing: 0.8 },
  mercadoSegSubOn: { color: 'rgba(255,255,255,0.85)' },
  insumosIntro: { paddingHorizontal: 20, marginBottom: 12, marginTop: 4 },
  agroLineaRail: { gap: 8, paddingTop: 12 },
  agroLineaChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  agroLineaChipOn: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  agroLineaChipTxt: { color: '#64748b', fontWeight: FONT.weights.semibold, fontSize: 12 },
  agroLineaChipTxtOn: { color: ACCENT },
  insumosSub: { fontSize: FONT.sizes.sm, color: '#64748b', marginTop: 8, lineHeight: 20, fontWeight: '600' },
  quickActionsWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  quickActionCardSingle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickActionCardSingleText: { flex: 1, minWidth: 0 },
  todayPanel: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  todayPanelTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  todayPanelTopLeft: { flex: 1, minWidth: 0 },
  todayEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1d4ed8',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  todayTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '900',
    color: SLATE,
    fontStyle: 'italic',
  },
  todayBadge: {
    flexShrink: 0,
    maxWidth: '42%',
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
  },
  todayBadgeTxt: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  todayBody: { marginTop: 10, fontSize: 13, lineHeight: 20, color: '#475569', fontWeight: '600' },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  scopeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  scopeChipTxt: { color: ACCENT, fontSize: 10, fontWeight: '800', letterSpacing: 0.3, flexShrink: 1 },
  prioritySectionLabel: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  priorityColumn: { gap: 8 },
  priorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    gap: 10,
  },
  priorityRowOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  priorityRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#cbd5e1',
  },
  priorityDotOn: { backgroundColor: '#fff' },
  priorityRowTxt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: SLATE,
    lineHeight: 18,
  },
  priorityRowTxtOn: { color: '#fff' },
  priorityHint: { marginTop: 10, fontSize: 11, lineHeight: 17, color: '#64748b', fontWeight: '600' },
  todayMetricsCompact: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 2,
  },
  metricChip: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricChipLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricChipVal: {
    fontSize: 16,
    fontWeight: '900',
    color: SLATE,
  },
  todayChecklist: { marginTop: 14, gap: 8 },
  todayChecklistRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  todayChecklistTxt: { flex: 1, fontSize: 12, color: '#475569', lineHeight: 18, fontWeight: '600' },
  quickIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: SLATE,
    textTransform: 'uppercase',
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },
  quickActionSub: { marginTop: 2, fontSize: 11, color: '#64748b', lineHeight: 15, fontWeight: '600' },
  nearbySection: { marginHorizontal: 16, marginBottom: 18 },
  nearbyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  nearbyTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  nearbySub: { marginTop: 6, fontSize: 12, color: '#64748b', lineHeight: 18, fontWeight: '600' },
  radiusSelector: { paddingVertical: 8, paddingRight: 10 },
  radiusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#fff',
    marginRight: 8,
  },
  radiusChipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  radiusChipTxt: { color: ACCENT, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  radiusChipTxtOn: { color: '#fff' },
  nearbyCardsRow: { paddingTop: 6, paddingRight: 8 },
  nearbyEmpty: { color: '#94a3b8', marginTop: 8, lineHeight: 18, fontWeight: '600' },
  flowStripCompact: {
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  flowStripIntro: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  flowStripHint: {
    fontSize: 11,
    lineHeight: 16,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 8,
  },
  flowGridRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  flowStep: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  flowStepNumCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowStepNum: { color: ACCENT, fontSize: 12, fontWeight: '900' },
  flowStepTexts: { flex: 1, minWidth: 0 },
  flowStepTitle: { fontSize: 11, fontWeight: '900', color: SLATE },
  flowStepSub: { marginTop: 2, fontSize: 10, lineHeight: 13, color: '#64748b', fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 999,
    zIndex: 20,
    maxWidth: '88%',
    shadowColor: '#0c4a6e',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  fabTxt: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontStyle: 'italic',
    flexShrink: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
  },
  titleMercado: {
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    color: SLATE,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  proPill: {
    backgroundColor: GREEN,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  proPillTxt: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  search: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: FONT.sizes.sm,
    color: SLATE,
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e5e4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
  },
  activeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#eff6ff', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  activeChipTxt: {
    fontSize: 11, fontWeight: '600', color: '#1d4ed8',
  },
  clearAllChip: {
    backgroundColor: '#fef2f2', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#fecaca',
  },
  clearAllTxt: {
    fontSize: 11, fontWeight: '600', color: '#dc2626',
  },
  capCard: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: SLATE,
    borderRadius: 32,
    padding: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  capDecor: { position: 'absolute', top: -24, right: -24, opacity: 1 },
  capInner: { position: 'relative', zIndex: 2 },
  capTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  capTopText: { flex: 1, minWidth: 0, paddingRight: 12 },
  capEyebrow: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  capTon: { color: '#fff', fontSize: 36, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1 },
  capTonUnit: { fontSize: 14, fontWeight: '700', color: '#94a3b8', fontStyle: 'normal', textTransform: 'uppercase' },
  capSub: { color: '#64748b', fontSize: 11, fontWeight: '600', marginTop: 6 },
  capIconBox: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: EMERALD,
    maxWidth: '100%',
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  barLabel: { fontSize: 9, fontWeight: '900', color: '#64748b', letterSpacing: 2, textTransform: 'uppercase' },
  rubroSection: { paddingHorizontal: 16, marginBottom: 16 },
  rubroHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  rubroHeadText: { flex: 1, minWidth: 0 },
  rubroTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  rubroSummaryLine: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: SLATE,
    lineHeight: 18,
  },
  filtroActivo: { backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignSelf: 'flex-start' },
  filtroActivoTxt: { fontSize: 9, fontWeight: '800', color: '#047857', textTransform: 'uppercase' },
  explorarRubrosBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 59, 37, 0.35)',
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  explorarRubrosBtnTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: GREEN,
    letterSpacing: 0.2,
  },
  rubroRailHint: { marginTop: 8, paddingHorizontal: 2, fontSize: 10, color: '#94a3b8', fontWeight: '700', letterSpacing: 0.4 },
  rubroModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    justifyContent: 'flex-end',
  },
  rubroModalBackdropTouch: { ...StyleSheet.absoluteFillObject },
  rubroModalSheet: {
    backgroundColor: CREAM,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '82%',
    paddingHorizontal: 18,
    paddingTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rubroModalGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 12,
  },
  rubroModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  rubroModalEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: ACCENT,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  rubroModalTitle: { marginTop: 4, fontSize: 18, fontWeight: '900', color: SLATE, fontStyle: 'italic' },
  rubroModalSub: { fontSize: 12, color: '#64748b', lineHeight: 18, fontWeight: '600', marginBottom: 12 },
  rubroModalList: { flexGrow: 0 },
  rubroModalListContent: { paddingBottom: 8 },
  rubroModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  rubroModalRowOn: { backgroundColor: GREEN, borderColor: GREEN },
  rubroModalRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rubroModalRowIconOn: { backgroundColor: 'rgba(255,255,255,0.2)' },
  rubroModalRowBody: { flex: 1, minWidth: 0 },
  rubroModalRowTitle: { fontSize: 14, fontWeight: '800', color: SLATE },
  rubroModalRowTitleOn: { color: '#fff' },
  rubroModalRowMeta: { marginTop: 2, fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  rubroModalRowMetaOn: { color: 'rgba(255,255,255,0.85)' },
  rubroModalCountTxt: {
    fontSize: 15,
    fontWeight: '900',
    color: ACCENT,
    minWidth: 28,
    textAlign: 'right',
  },
  rubroModalCountTxtOn: { color: '#fff' },
  rubroModalDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 8,
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  resultTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  reqLinkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  reqLinkTxt: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  listaMapSeg: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: '#e7e5e4',
  },
  segBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  segBtnOn: { backgroundColor: GREEN },
  segBtnTxt: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },
  segBtnTxtOn: { color: '#fff' },
  emptyTxt: { color: '#94a3b8', textAlign: 'center', marginTop: 24, paddingHorizontal: 32, fontWeight: '600' },
});
