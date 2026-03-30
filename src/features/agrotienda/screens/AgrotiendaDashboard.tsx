import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/shared/store/AuthContext';
import { authService } from '@/shared/services/authService';
import { WeatherTicker } from '@/shared/components/WeatherTicker';
import { NotificationsCenterModal } from '@/shared/components/NotificationsCenterModal';
import { SolicitarTransporteModal } from '@/shared/components/SolicitarTransporteModal';
import { InsumoChatModal } from '@/shared/components/InsumoChatModal';
import { listarInsumosDisponibles } from '@/shared/services/insumosLocalesService';
import { listarSalasVendedor } from '@/shared/services/insumoChatService';
import type { AgriculturalInput, SalaInsumosChat } from '@/shared/types';
import { COLORS, FONT, SPACE, SHADOW } from '@/shared/utils/theme';
import { InsumoCard } from '@/features/agrotienda/components/InsumoCard';
import { AgregarInsumoModal } from '@/features/agrotienda/components/AgregarInsumoModal';
import { RequerimientosCompradoresModal } from '@/features/agrotienda/components/RequerimientosCompradoresModal';
import { AgrotiendaAnalyticsModal } from '@/features/agrotienda/components/AgrotiendaAnalyticsModal';

const CREAM = '#FDFBF7';
const PURPLE_LIGHT = '#F3E5F5';
const PURPLE = '#7B1FA2';
const SLATE = '#0F172A';
const MUTED = '#64748B';
type TabKey = 'inventario' | 'chats';
const LINEA_OPTIONS = [
  { key: 'todos', label: 'Todo' },
  { key: 'insumos', label: 'Insumos' },
  { key: 'repuestos', label: 'Repuestos' },
] as const;

export default function AgrotiendaDashboard() {
  const { perfil } = useAuth();
  const navigation = useNavigation();
  const [freightModal, setFreightModal] = useState(false);
  const [reqModal, setReqModal] = useState(false);
  const [altaModal, setAltaModal] = useState(false);
  const [altaNombreInicial, setAltaNombreInicial] = useState('');
  const [analyticsModal, setAnalyticsModal] = useState(false);
  const [items, setItems] = useState<AgriculturalInput[]>([]);
  const [lineaFiltro, setLineaFiltro] = useState<(typeof LINEA_OPTIONS)[number]['key']>('todos');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [mainTab, setMainTab] = useState<TabKey>('inventario');
  const [chatSubTab, setChatSubTab] = useState<'activas' | 'historial'>('activas');
  const [salas, setSalas] = useState<SalaInsumosChat[]>([]);
  const [loadingSalas, setLoadingSalas] = useState(false);
  const [chatSalaId, setChatSalaId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const openNotificaciones = () => setNotifModalVisible(true);
  const openClima = () => (navigation as unknown as { navigate: (n: string) => void }).navigate('Clima');

  const loadCatalogo = useCallback(async () => {
    if (!perfil?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await listarInsumosDisponibles(120, {
        perfilPropietarioId: perfil.id,
        lineaCatalogo: lineaFiltro,
      });
      setItems(rows);
    } catch (e) {
      setItems([]);
      Alert.alert(
        'Error al cargar catálogo',
        e instanceof Error ? e.message : 'No se pudo cargar el inventario. Verifica tu conexión e intenta de nuevo.',
        [{ text: 'Reintentar', onPress: () => void loadCatalogo() }, { text: 'Cancelar', style: 'cancel' }],
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [perfil?.id, lineaFiltro]);

  useEffect(() => {
    setLoading(true);
    void loadCatalogo();
  }, [loadCatalogo]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadCatalogo();
    if (mainTab === 'chats' && perfil?.id) {
      setLoadingSalas(true);
      void listarSalasVendedor(perfil.id)
        .then(setSalas)
        .catch(() => {})
        .finally(() => setLoadingSalas(false));
    }
  }, [loadCatalogo, mainTab, perfil?.id]);

  useEffect(() => {
    if (!perfil?.id || mainTab !== 'chats') return;
    setLoadingSalas(true);
    listarSalasVendedor(perfil.id)
      .then(setSalas)
      .catch(() => setSalas([]))
      .finally(() => setLoadingSalas(false));
  }, [perfil?.id, mainTab]);

  const abrirAltaManual = () => {
    setAltaNombreInicial('');
    setAltaModal(true);
  };

  const listHeader = (
    <>
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.headerLeft}>
            <View style={s.iconBox}>
              <Ionicons name="storefront" size={22} color={COLORS.roles.agrotienda} />
            </View>
            <View style={s.headerTitles}>
              <Text style={s.storeName} numberOfLines={1}>
                {perfil?.nombre ?? 'Mi agrotienda'}
              </Text>
              <Text style={s.storeSub} numberOfLines={2}>
                Inventario privado para insumos y repuestos. La negociación se cierra por chat.
              </Text>
            </View>
          </View>
          <TouchableOpacity style={s.actionBtn} onPress={() => void authService.logout()} accessibilityLabel="Cerrar sesión">
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
        <View style={s.headerActions}>
          <View style={s.statsBadge}>
            <Ionicons name="cube-outline" size={12} color={COLORS.roles.agrotienda} />
            <Text style={s.statsText}>
              {items.length} {items.length === 1 ? 'Producto' : 'Productos'}
            </Text>
          </View>
          <View style={s.actionBtnsRow}>
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => setAnalyticsModal(true)}
              accessibilityLabel="Analíticas"
            >
              <Ionicons name="bar-chart-outline" size={20} color={MUTED} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => setFreightModal(true)}
              accessibilityLabel="Solicitar transporte"
            >
              <Ionicons name="car-outline" size={20} color={MUTED} />
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={openNotificaciones} accessibilityLabel="Notificaciones">
              <Ionicons name="notifications-outline" size={20} color={MUTED} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Tabs principales: Inventario | Chats */}
      <View style={s.mainTabs}>
        <TouchableOpacity
          style={[s.mainTab, mainTab === 'inventario' && s.mainTabOn]}
          onPress={() => setMainTab('inventario')}
          activeOpacity={0.88}
        >
          <Ionicons name="cube-outline" size={16} color={mainTab === 'inventario' ? PURPLE : MUTED} />
          <Text style={[s.mainTabTxt, mainTab === 'inventario' && s.mainTabTxtOn]}>Inventario</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.mainTab, mainTab === 'chats' && s.mainTabOn]}
          onPress={() => setMainTab('chats')}
          activeOpacity={0.88}
        >
          <Ionicons name="chatbubbles-outline" size={16} color={mainTab === 'chats' ? PURPLE : MUTED} />
          <Text style={[s.mainTabTxt, mainTab === 'chats' && s.mainTabTxtOn]}>
            Chats {salas.filter(s2 => !s2.venta_confirmada).length > 0 ? `(${salas.filter(s2 => !s2.venta_confirmada).length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.demandBanner} onPress={() => setReqModal(true)} activeOpacity={0.9}>
        <View style={s.demandLeft}>
          <View style={s.megaIcon}>
            <Ionicons name="megaphone-outline" size={22} color={COLORS.roles.agrotienda} />
          </View>
          <View>
            <Text style={s.demandSub}>Oportunidades</Text>
            <Text style={s.demandTitle}>Demandas de compradores</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={22} color={COLORS.roles.agrotienda} />
      </TouchableOpacity>

      {mainTab === 'inventario' ? (
        <>
          <View style={s.inventoryHeader}>
            <View style={s.invTitleRow}>
              <View style={s.indicator} />
              <Text style={s.invTitle}>Mi inventario</Text>
            </View>
            <View style={s.invActions}>
              <TouchableOpacity style={s.btnAdd} onPress={abrirAltaManual} activeOpacity={0.9}>
                <Ionicons name="add" size={16} color="#FFF" />
                <Text style={s.btnAddText}>Añadir</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.lineaRail}>
            {LINEA_OPTIONS.map((item) => {
              const active = lineaFiltro === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[s.lineaChip, active && s.lineaChipOn]}
                  onPress={() => setLineaFiltro(item.key)}
                  activeOpacity={0.9}
                >
                  <Text style={[s.lineaChipTxt, active && s.lineaChipTxtOn]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      ) : null}
    </>
  );

  const emptyW = Dimensions.get('window').width - SPACE.lg * 2;

  const emptyComponent = () => {
    if (loading) {
      return <ActivityIndicator style={s.listSpinner} size="large" color={COLORS.roles.agrotienda} />;
    }
    return (
      <View style={[s.emptyState, { width: emptyW, alignSelf: 'center' }]}>
        <View style={s.emptyIcon}>
          <Ionicons name="cube-outline" size={36} color="#CBD5E1" />
        </View>
        <Text style={s.emptyTitle}>Catálogo vacío</Text>
        <Text style={s.emptyDesc}>
          Aún no hay productos. Usa <Text style={s.emptyBold}>Añadir</Text> para cargar tu primer insumo y negociar
          condiciones directamente con cada comprador.
        </Text>
        <TouchableOpacity style={s.emptyActionBtn} onPress={abrirAltaManual} activeOpacity={0.88}>
          <Text style={s.emptyActionTxt}>Cargar primer producto</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <>
      <WeatherTicker topInset estado_ve={perfil?.estado_ve} onPress={openClima} />

      {mainTab === 'chats' ? (
        <FlatList
          style={s.root}
          contentContainerStyle={s.scroll}
          data={salas.filter(s2 => chatSubTab === 'activas' ? !s2.venta_confirmada : s2.venta_confirmada)}
          keyExtractor={it => it.id}
          ListHeaderComponent={
            <>
              {listHeader}
              {/* Sub-tabs */}
              <View style={s.chatSubTabs}>
                <TouchableOpacity
                  style={[s.chatSubTab, chatSubTab === 'activas' && s.chatSubTabOn]}
                  onPress={() => setChatSubTab('activas')}
                >
                  <Text style={[s.chatSubTabTxt, chatSubTab === 'activas' && s.chatSubTabTxtOn]}>
                    Activas ({salas.filter(s2 => !s2.venta_confirmada).length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.chatSubTab, chatSubTab === 'historial' && s.chatSubTabOn]}
                  onPress={() => setChatSubTab('historial')}
                >
                  <Text style={[s.chatSubTabTxt, chatSubTab === 'historial' && s.chatSubTabTxtOn]}>
                    Vendidos ({salas.filter(s2 => s2.venta_confirmada).length})
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          }
          refreshControl={
            <RefreshControl refreshing={loadingSalas} onRefresh={onRefresh} tintColor={COLORS.roles.agrotienda} />
          }
          ListEmptyComponent={
            loadingSalas ? (
              <ActivityIndicator style={{ marginTop: 24 }} color={PURPLE} />
            ) : (
              <View style={s.emptyState}>
                <Ionicons name="chatbubbles-outline" size={36} color="#CBD5E1" />
                <Text style={s.emptyTitle}>Sin consultas aún</Text>
                <Text style={s.emptyDesc}>Cuando compradores inicien una consulta sobre tus productos aparecerán aquí.</Text>
                <TouchableOpacity style={s.emptyActionBtn} onPress={() => setReqModal(true)} activeOpacity={0.88}>
                  <Text style={s.emptyActionTxt}>Ver demandas activas</Text>
                </TouchableOpacity>
              </View>
            )
          }
          renderItem={({ item: sala }) => {
            const isPending = !sala.venta_confirmada;
            return (
              <TouchableOpacity
                style={[s.salaCard, !isPending && s.salaCardConfirmada]}
                onPress={() => { setChatSalaId(sala.id); setChatOpen(true); }}
                activeOpacity={0.88}
              >
                <View style={s.salaTop}>
                  <View style={s.salaIcon}>
                    <Ionicons name="person-outline" size={18} color={PURPLE} />
                  </View>
                  <View style={s.salaTexts}>
                    <Text style={s.salaBuyer} numberOfLines={1}>
                      {sala.buyer_nombre ?? 'Comprador'}
                    </Text>
                    <Text style={s.salaInsumo} numberOfLines={1}>
                      {sala.insumo?.nombre_producto ?? 'Producto'}
                    </Text>
                    {sala.ultimo_mensaje ? (
                      <Text style={s.salaUltimoMsg} numberOfLines={1}>{sala.ultimo_mensaje}</Text>
                    ) : null}
                  </View>
                  {isPending ? (
                    <View style={s.badgeNueva}>
                      <Text style={s.badgeNuevaTxt}>PENDIENTE</Text>
                    </View>
                  ) : (
                    <View style={s.badgeConfirmada}>
                      <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                      <Text style={s.badgeConfirmadaTxt}>VENDIDO</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <FlatList
          style={s.root}
          contentContainerStyle={s.scroll}
          data={items}
          keyExtractor={it => it.id}
          numColumns={items.length === 0 ? 1 : 2}
          key={items.length === 0 ? 'empty' : 'grid'}
          ListHeaderComponent={listHeader}
          columnWrapperStyle={items.length > 1 ? s.columnWrap : undefined}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.roles.agrotienda} />
          }
          renderItem={({ item }) => (
            <View style={s.gridCell}>
              <InsumoCard item={item} variant="grid" />
            </View>
          )}
          ListEmptyComponent={emptyComponent}
        />
      )}

      <SolicitarTransporteModal visible={freightModal} onClose={() => setFreightModal(false)} perfil={perfil ?? null} />
      <RequerimientosCompradoresModal visible={reqModal} onClose={() => setReqModal(false)} />
      <AgrotiendaAnalyticsModal
        visible={analyticsModal}
        onClose={() => setAnalyticsModal(false)}
        vendedorId={perfil?.id}
      />
      {perfil?.id ? (
        <AgregarInsumoModal
          key={`${altaModal ? 'open' : 'closed'}-${altaNombreInicial}`}
          visible={altaModal}
          onClose={() => setAltaModal(false)}
          perfilId={perfil.id}
          initialNombre={altaNombreInicial}
          userMunicipio={perfil.municipio}
          onGuardado={loadCatalogo}
        />
      ) : null}
      <NotificationsCenterModal
        visible={notifModalVisible}
        onClose={() => setNotifModalVisible(false)}
        userId={perfil?.id}
      />
      <InsumoChatModal
        visible={chatOpen}
        onClose={() => { setChatOpen(false); setChatSalaId(null); }}
        salaId={chatSalaId}
        perfil={perfil ?? null}
        onVentaConfirmada={() => {
          if (perfil?.id) {
            listarSalasVendedor(perfil.id).then(setSalas).catch(() => {});
          }
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  scroll: {
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.xxl,
    paddingTop: SPACE.sm,
    backgroundColor: CREAM,
  },
  header: {
    marginBottom: SPACE.sm,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    ...SHADOW.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACE.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: SPACE.sm },
  headerTitles: { flex: 1, minWidth: 0 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionBtnsRow: { flexDirection: 'row', gap: 8 },
  iconBox: {
    backgroundColor: PURPLE_LIGHT,
    padding: 10,
    borderRadius: 16,
    marginRight: 12,
  },
  storeName: {
    fontSize: 18,
    fontWeight: FONT.weights.heavy,
    color: SLATE,
    fontStyle: 'italic',
  },
  storeSub: { marginTop: 6, fontSize: 11, color: MUTED, lineHeight: 17, fontWeight: '600' },
  statsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
    gap: 4,
  },
  statsText: {
    fontSize: 9,
    fontWeight: FONT.weights.heavy,
    color: COLORS.roles.agrotienda,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  actionBtn: {
    padding: 10,
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOW.sm,
  },
  demandBanner: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 24,
    padding: SPACE.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.lg,
    borderWidth: 1,
    borderColor: 'rgba(106,27,154,0.12)',
    ...SHADOW.sm,
  },
  demandLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  megaIcon: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 14,
    ...SHADOW.sm,
  },
  demandSub: {
    fontSize: 9,
    fontWeight: FONT.weights.heavy,
    color: '#9C27B0',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  demandTitle: {
    fontSize: 13,
    fontWeight: FONT.weights.heavy,
    color: '#4A148C',
    marginTop: 2,
  },
  inventoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.md,
  },
  invTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  indicator: { width: 4, height: 16, backgroundColor: COLORS.roles.agrotienda, borderRadius: 2 },
  invTitle: {
    fontSize: 15,
    fontWeight: FONT.weights.heavy,
    color: SLATE,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  invActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineaRail: { gap: 8, paddingBottom: SPACE.md },
  lineaChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  lineaChipOn: { backgroundColor: PURPLE_LIGHT, borderColor: 'rgba(106,27,154,0.3)' },
  lineaChipTxt: { color: MUTED, fontWeight: FONT.weights.semibold, fontSize: 12 },
  lineaChipTxtOn: { color: COLORS.roles.agrotienda },
  btnAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.roles.agrotienda,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
    ...SHADOW.sm,
  },
  btnAddText: {
    fontSize: 10,
    fontWeight: FONT.weights.heavy,
    color: '#FFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  columnWrap: {
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  gridCell: {
    width: '48%',
  },
  listSpinner: { marginVertical: SPACE.xl },
  emptyState: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    borderRadius: 32,
    padding: SPACE.xl,
    alignItems: 'center',
    marginTop: SPACE.md,
    marginHorizontal: 0,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: FONT.weights.heavy,
    color: MUTED,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: SPACE.sm,
  },
  emptyBold: { fontWeight: FONT.weights.bold, color: COLORS.roles.agrotienda },
  emptyActionBtn: {
    marginTop: SPACE.md,
    backgroundColor: COLORS.roles.agrotienda,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyActionTxt: { color: '#FFF', fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold },
  mainTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACE.md,
  },
  mainTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 14,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
  },
  mainTabOn: { backgroundColor: PURPLE_LIGHT, borderColor: 'rgba(123,31,162,0.3)' },
  mainTabTxt: { fontSize: FONT.sizes.sm, color: MUTED, fontWeight: FONT.weights.semibold },
  mainTabTxtOn: { color: PURPLE, fontWeight: FONT.weights.bold },
  salaCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: SPACE.md,
    marginBottom: SPACE.sm, borderWidth: 1, borderColor: '#E2E8F0', ...SHADOW.sm,
  },
  salaCardConfirmada: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  salaTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  salaIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: PURPLE_LIGHT, alignItems: 'center', justifyContent: 'center',
  },
  salaTexts: { flex: 1 },
  salaBuyer: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold, color: SLATE },
  salaInsumo: { fontSize: FONT.sizes.xs, color: PURPLE, marginTop: 2 },
  salaUltimoMsg: { fontSize: FONT.sizes.xs, color: MUTED, marginTop: 2 },
  badgeNueva: {
    backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1, borderColor: '#FDE68A',
  },
  badgeNuevaTxt: { fontSize: 9, fontWeight: FONT.weights.bold, color: '#92400E', letterSpacing: 0.5 },
  badgeConfirmada: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999,
  },
  badgeConfirmadaTxt: { fontSize: 9, fontWeight: FONT.weights.bold, color: '#15803D' },
  chatSubTabs: {
    flexDirection: 'row', gap: 8, marginHorizontal: 0, marginBottom: SPACE.sm,
  },
  chatSubTab: {
    flex: 1, paddingVertical: 8, borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
  },
  chatSubTabOn: { backgroundColor: PURPLE_LIGHT, borderColor: 'rgba(123,31,162,0.3)' },
  chatSubTabTxt: { fontSize: FONT.sizes.sm, color: MUTED, fontWeight: FONT.weights.semibold },
  chatSubTabTxtOn: { color: PURPLE, fontWeight: FONT.weights.bold },
});
