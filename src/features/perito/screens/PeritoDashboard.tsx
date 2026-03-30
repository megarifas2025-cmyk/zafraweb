/**
 * PeritoDashboard – Módulo Búnker: órdenes field_inspections offline-first + sync
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@/shared/store/AuthContext';
import { authService } from '@/shared/services/authService';
import { WeatherTicker } from '@/shared/components/WeatherTicker';
import { NotificationsCenterModal } from '@/shared/components/NotificationsCenterModal';
import { localListForPerito } from '@/shared/lib/fieldInspectionLocalDb';
import type { LocalFieldInspectionRow } from '@/shared/lib/fieldInspectionLocalDb';
import {
  FIELD_INSPECTION_SYNC_EVENT,
  syncFieldInspectionsIfOnline,
} from '@/shared/services/fieldInspectionSync';
import type { PeritoStackParamList } from '@/features/perito/navigation/types';
import { COLORS, FONT, SPACE, SHADOW, RADIUS } from '@/shared/utils/theme';

type Nav = NativeStackNavigationProp<PeritoStackParamList, 'PeritoHome'>;

export default function PeritoDashboard() {
  const navigation = useNavigation<Nav>();
  const { perfil } = useAuth();
  const [rows, setRows] = useState<LocalFieldInspectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [notifModalVisible, setNotifModalVisible] = useState(false);

  const recargar = useCallback(async () => {
    if (!perfil?.id) return;
    setLoading(true);
    try {
      const net = await NetInfo.fetch();
      setOnline(!!net.isConnected);
      if (net.isConnected) {
        await syncFieldInspectionsIfOnline(perfil.id).catch((e) => {
          console.warn('[PeritoDashboard] sync remoto falló:', e?.message);
        });
      }
      const list = await localListForPerito(perfil.id);
      setRows(list);
    } catch (e) {
      setRows([]);
      Alert.alert(
        'Error al cargar órdenes',
        e instanceof Error ? e.message : 'No se pudo leer las inspecciones locales. Intenta de nuevo.',
        [{ text: 'Reintentar', onPress: () => void recargar() }, { text: 'Cancelar', style: 'cancel' }],
      );
    } finally {
      setLoading(false);
    }
  }, [perfil?.id]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  useFocusEffect(
    useCallback(() => {
      if (perfil?.id) {
        void localListForPerito(perfil.id).then(setRows).catch(() => undefined);
      }
    }, [perfil?.id]),
  );

  useEffect(() => {
    if (!perfil?.id) return undefined;
    const sub = DeviceEventEmitter.addListener(
      FIELD_INSPECTION_SYNC_EVENT,
      (e: { peritoId: string }) => {
        if (e.peritoId === perfil.id) {
          void localListForPerito(perfil.id).then(setRows).catch(() => undefined);
        }
      },
    );
    return () => sub.remove();
  }, [perfil?.id]);

  const onRefresh = async () => {
    setRefresh(true);
    try {
      await recargar();
    } catch {
      /* recargar ya maneja sus propios errores */
    } finally {
      setRefresh(false);
    }
  };

  const openNotificaciones = () => setNotifModalVisible(true);
  const openClima = () =>
    (navigation as unknown as { getParent: () => { navigate: (n: string) => void } }).getParent()?.navigate('Clima');
  const callFarmer = useCallback(async (phone: string) => {
    const tel = phone.replace(/\s/g, '');
    const url = `tel:${tel}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Contacto', 'No se pudo abrir el marcador telefónico.');
      return;
    }
    await Linking.openURL(url);
  }, []);

  const sections = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const vencidas = rows.filter((row) => row.fecha_programada < today);
    const hoy = rows.filter((row) => row.fecha_programada === today);
    const proximas = rows.filter((row) => row.fecha_programada > today);
    const pendientes = rows.filter((row) => row.dirty === 1);
    return [
      { key: 'hoy', title: 'Hoy', rows: hoy, tone: '#16a34a' },
      { key: 'vencidas', title: 'Vencidas', rows: vencidas, tone: '#dc2626' },
      { key: 'proximas', title: 'Próximas', rows: proximas, tone: '#2563eb' },
      { key: 'pendientes', title: 'Sincronización pendiente', rows: pendientes, tone: '#d97706' },
    ];
  }, [rows]);

  const agendaStats = useMemo(
    () => ({
      hoy: sections.find((s) => s.key === 'hoy')?.rows.length ?? 0,
      vencidas: sections.find((s) => s.key === 'vencidas')?.rows.length ?? 0,
      proximas: sections.find((s) => s.key === 'proximas')?.rows.length ?? 0,
      pendientes: sections.find((s) => s.key === 'pendientes')?.rows.length ?? 0,
    }),
    [sections],
  );

  return (
    <View style={s.root}>
      <WeatherTicker topInset estado_ve={perfil?.estado_ve} onPress={openClima} />
      <View style={s.topBar}>
        <TouchableOpacity style={s.bellBtn} onPress={openNotificaciones} hitSlop={12} accessibilityLabel="Notificaciones">
          <Ionicons name="notifications-outline" size={22} color="#64748b" />
        </TouchableOpacity>
        <TouchableOpacity style={s.bellBtn} onPress={() => void authService.logout()} hitSlop={12} accessibilityLabel="Cerrar sesión">
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>
      <View style={s.banner}>
        <Text style={s.bannerTit}>Agenda técnica del perito</Text>
        <Text style={s.bannerSub}>
          {online === false ? 'Sin conexión · las actas se preparan y firman en el dispositivo' : 'Conectado · agenda sincronizada con empresa'}
        </Text>
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={s.kpiNum}>{agendaStats.hoy}</Text>
            <Text style={s.kpiLabel}>Hoy</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiNum}>{agendaStats.vencidas}</Text>
            <Text style={s.kpiLabel}>Vencidas</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiNum}>{agendaStats.proximas}</Text>
            <Text style={s.kpiLabel}>Próximas</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiNum}>{agendaStats.pendientes}</Text>
            <Text style={s.kpiLabel}>Por sync</Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.formBtn}
          onPress={() => {
            void recargar();
          }}
        >
          <Text style={s.formBtnTxt}>Buscar órdenes asignadas</Text>
        </TouchableOpacity>
      </View>
      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={COLORS.info} />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} />}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        >
          {rows.length === 0 ? (
            <Text style={s.empty}>
              No hay órdenes pendientes locales.{'\n'}Con internet, se descargan las asignadas y el historial del perito.
            </Text>
          ) : null}
          {sections.map((section) => (
            <View key={section.key} style={s.sectionWrap}>
              <View style={s.sectionHead}>
                <View style={[s.sectionDot, { backgroundColor: section.tone }]} />
                <Text style={s.sectionTitle}>{section.title}</Text>
                <Text style={s.sectionCount}>{section.rows.length}</Text>
              </View>
              {section.rows.length ? (
                section.rows.map((item) => (
                  <View key={`${section.key}-${item.id}`} style={s.card}>
                    <TouchableOpacity onPress={() => navigation.navigate('FieldInspectionDetail', { localId: item.id })}>
                      <View style={s.cardTop}>
                        <Text style={s.cardTit}>{item.numero_control ?? item.id.slice(0, 8)}</Text>
                        <Text style={s.badge}>{item.estado_acta ?? item.estatus}</Text>
                      </View>
                      <Text style={s.cardName}>{item.finca_nombre ?? 'Lote sin finca'}</Text>
                      <Text style={s.cardSub}>
                        {item.productor_nombre ?? 'Productor'} · {item.fecha_programada} · {item.tipo_inspeccion ?? 'seguimiento_tecnico'}
                      </Text>
                      {item.resumen_dictamen ? <Text style={s.cardBody} numberOfLines={2}>{item.resumen_dictamen}</Text> : null}
                      {item.dirty === 1 ? <Text style={s.dirty}>● Pendiente de sincronizar</Text> : null}
                    </TouchableOpacity>
                    <View style={s.ctaRow}>
                      <TouchableOpacity style={s.inlineBtn} onPress={() => navigation.navigate('InspectionForm', { localTaskId: item.id })}>
                        <Text style={s.inlineBtnTxt}>Levantar acta</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.inlineBtnGhost} onPress={() => navigation.navigate('FieldInspectionDetail', { localId: item.id })}>
                        <Text style={s.inlineBtnGhostTxt}>Ver historial</Text>
                      </TouchableOpacity>
                      {item.productor_telefono ? (
                        <TouchableOpacity style={s.inlineBtnGhost} onPress={() => void callFarmer(item.productor_telefono ?? '')}>
                          <Text style={s.inlineBtnGhostTxt}>Contactar agricultor</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={s.sectionEmpty}>Sin elementos en esta bandeja.</Text>
              )}
            </View>
          ))}
        </ScrollView>
      )}
      <NotificationsCenterModal
        visible={notifModalVisible}
        onClose={() => setNotifModalVisible(false)}
        userId={perfil?.id}
        peritoId={perfil?.id}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: SPACE.md, paddingBottom: 4 },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  banner: { padding: SPACE.md, backgroundColor: '#E8EAF6' },
  bannerTit: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold, color: COLORS.text },
  bannerSub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: SPACE.md, flexWrap: 'wrap' },
  kpiCard: {
    minWidth: 72,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  kpiNum: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold, color: COLORS.text },
  kpiLabel: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: 2, fontWeight: FONT.weights.semibold },
  formBtn: {
    marginTop: SPACE.sm,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.info,
    paddingVertical: 8,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.sm,
  },
  formBtnTxt: { color: '#FFF', fontWeight: FONT.weights.semibold, fontSize: FONT.sizes.sm },
  list: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  empty: { textAlign: 'center', color: COLORS.textDisabled, marginTop: SPACE.xl, lineHeight: 20 },
  sectionWrap: { marginBottom: SPACE.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionDot: { width: 10, height: 10, borderRadius: 999 },
  sectionTitle: { fontWeight: FONT.weights.bold, color: COLORS.text, fontSize: FONT.sizes.md, flex: 1 },
  sectionCount: { color: COLORS.textSecondary, fontWeight: FONT.weights.semibold },
  sectionEmpty: { color: COLORS.textDisabled, marginBottom: SPACE.sm },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm, borderLeftWidth: 3, borderLeftColor: COLORS.info },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  cardTit: { fontWeight: FONT.weights.bold, color: COLORS.text },
  badge: {
    fontSize: FONT.sizes.xs,
    color: '#92400e',
    backgroundColor: '#fffbeb',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: FONT.weights.semibold,
  },
  cardName: { marginTop: 8, fontSize: FONT.sizes.md, color: COLORS.text, fontWeight: FONT.weights.semibold },
  cardSub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  cardBody: { fontSize: FONT.sizes.sm, color: COLORS.text, marginTop: 8, lineHeight: 18 },
  dirty: { fontSize: FONT.sizes.xs, color: COLORS.warning, marginTop: 6, fontWeight: FONT.weights.semibold },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACE.md },
  inlineBtn: {
    backgroundColor: COLORS.info,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  inlineBtnTxt: { color: '#fff', fontWeight: FONT.weights.semibold, fontSize: FONT.sizes.sm },
  inlineBtnGhost: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  inlineBtnGhostTxt: { color: '#1d4ed8', fontWeight: FONT.weights.semibold, fontSize: FONT.sizes.sm },
});
