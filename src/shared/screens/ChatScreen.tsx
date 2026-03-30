import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/shared/store/AuthContext';
import { chatService, contarMensajesNoLeidosPorSala } from '@/shared/services/chatService';
import { useChatUnread } from '@/shared/store/ChatUnreadContext';
import { listarMisSalasLogistica } from '@/shared/services/freightRequestsService';
import { listarSalasComprador } from '@/shared/services/insumoChatService';
import { LogisticsChatModal } from '@/shared/components/LogisticsChatModal';
import { CosechaChatModal } from '@/shared/components/CosechaChatModal';
import { InsumoChatModal } from '@/shared/components/InsumoChatModal';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import type { SalaChat, LogisticsSala, SalaInsumosChat } from '@/shared/types';

type ChatRow =
  | { tipo: 'cosecha'; sala: SalaChat }
  | { tipo: 'logistica'; sala: LogisticsSala }
  | { tipo: 'insumo'; sala: SalaInsumosChat };

type ChatSec = { title: string; data: ChatRow[] };
const CHAT_LOAD_MS = 4_000;

type TimeoutResult<T> = {
  value: T;
  timedOut: boolean;
};

async function withTimeout<T>(promise: Promise<T>, fallback: T, ms: number): Promise<TimeoutResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<TimeoutResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ value: fallback, timedOut: true }), ms);
  });
  try {
    return await Promise.race([
      promise.then((value) => ({ value, timedOut: false })),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const { perfil } = useAuth();
  const { refreshMercadoUnread } = useChatUnread();
  const [unreadBySala, setUnreadBySala] = useState<Record<string, number>>({});
  const openCosechaSalaId = (route.params as { openCosechaSalaId?: string } | undefined)?.openCosechaSalaId;
  const [salasCosecha, setSalasCosecha] = useState<SalaChat[]>([]);
  const [salasLog, setSalasLog] = useState<LogisticsSala[]>([]);
  const [salasInsumo, setSalasInsumo] = useState<SalaInsumosChat[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const [cosechaModalOpen, setCosechaModalOpen] = useState(false);
  const [salaCosechaActiva, setSalaCosechaActiva] = useState<SalaChat | null>(null);

  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logSalaId, setLogSalaId] = useState<string | null>(null);
  const [logSubtitle, setLogSubtitle] = useState<string | null>(null);

  const [insumoModalOpen, setInsumoModalOpen] = useState(false);
  const [insumoSalaId, setInsumoSalaId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!perfil) {
      setSalasCosecha([]);
      setSalasLog([]);
      setSalasInsumo([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    setLoadWarning(null);
    try {
      const [c, l, i] = await Promise.all([
        withTimeout(chatService.obtenerSalas(perfil.id).catch(() => [] as SalaChat[]), [] as SalaChat[], CHAT_LOAD_MS),
        withTimeout(listarMisSalasLogistica(perfil.id).catch(() => [] as LogisticsSala[]), [] as LogisticsSala[], CHAT_LOAD_MS),
        withTimeout(listarSalasComprador(perfil.id).catch(() => [] as SalaInsumosChat[]), [] as SalaInsumosChat[], CHAT_LOAD_MS),
      ]);
      setSalasCosecha(c.value);
      setSalasLog(l.value);
      setSalasInsumo(i.value);
      if (c.timedOut || l.timedOut || i.timedOut) {
        setLoadWarning('Algunas conversaciones tardaron demasiado en cargar. Desliza para reintentar si notas información incompleta.');
      }
      const map = await contarMensajesNoLeidosPorSala(perfil.id).catch(() => ({}));
      setUnreadBySala(map);
      void refreshMercadoUnread();
    } catch {
      setSalasCosecha([]);
      setSalasLog([]);
      setSalasInsumo([]);
      setLoadWarning('No pudimos cargar tus conversaciones en este momento.');
    } finally {
      setCargando(false);
    }
  }, [perfil, refreshMercadoUnread]);

  useFocusEffect(
    useCallback(() => {
      if (!perfil?.id) return undefined;
      let alive = true;
      void contarMensajesNoLeidosPorSala(perfil.id).then((map) => {
        if (alive) setUnreadBySala(map);
      });
      return () => {
        alive = false;
      };
    }, [perfil?.id]),
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  useFocusEffect(
    useCallback(() => {
      if (!openCosechaSalaId || !perfil) return undefined;
      let alive = true;
      void (async () => {
        await cargar();
        if (!alive) return;
        let salas = await chatService.obtenerSalas(perfil.id);
        let found = salas.find((x) => x.id === openCosechaSalaId);
        if (!found && alive) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          salas = await chatService.obtenerSalas(perfil.id);
          found = salas.find((x) => x.id === openCosechaSalaId);
        }
        if (found && alive) {
          setSalaCosechaActiva(found);
          setCosechaModalOpen(true);
        } else if (alive) {
          setLoadWarning('La negociación se creó, pero aún no pudimos abrirla aquí. Desliza para refrescar tus chats.');
        }
        navigation.setParams({ openCosechaSalaId: undefined } as never);
      })();
      return () => {
        alive = false;
      };
    }, [openCosechaSalaId, perfil, cargar, navigation]),
  );

  const onRefresh = async () => {
    setRefresh(true);
    await cargar();
    setRefresh(false);
  };

  const sections = useMemo((): ChatSec[] => {
    const out: ChatSec[] = [];
    if (salasCosecha.length) {
      out.push({
        title: 'Negociaciones de cosecha',
        data: salasCosecha.map((sala) => ({ tipo: 'cosecha' as const, sala })),
      });
    }
    if (salasLog.length) {
      out.push({
        title: 'Coordinación de transporte',
        data: salasLog.map((sala) => ({ tipo: 'logistica' as const, sala })),
      });
    }
    if (salasInsumo.length) {
      out.push({
        title: 'Consultas agrotienda',
        data: salasInsumo.map((sala) => ({ tipo: 'insumo' as const, sala })),
      });
    }
    return out;
  }, [salasCosecha, salasLog, salasInsumo]);

  const vacioTotal = !cargando && sections.length === 0;
  const esCeo = perfil?.rol === 'zafra_ceo';

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: Math.max(insets.top, SPACE.md) }]}>
        <Text style={s.titulo}>💬 Chats</Text>
        <Text style={s.subHeader}>{esCeo ? 'Comunicaciones supervisadas' : 'Cosechas, transporte y agrotienda'}</Text>
      </View>

      {loadWarning ? (
        <View style={s.warningBanner}>
          <Text style={s.warningText}>{loadWarning}</Text>
        </View>
      ) : null}

      {cargando && sections.length === 0 ? (
        <ActivityIndicator style={{ marginTop: SPACE.xl }} color={COLORS.primary} />
      ) : vacioTotal ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>{esCeo ? '🛡️' : '💬'}</Text>
          <Text style={s.emptyTxt}>
            {esCeo ? 'Sin conversaciones directas' : 'Sin conversaciones activas'}
          </Text>
          <Text style={s.emptyHint}>
            {esCeo
              ? 'Como CEO no participas en chats comerciales directos. Para supervisar comunicaciones, accede a "Incidentes de chat" desde el panel CEO.'
              : 'Las negociaciones del mercado, los chats de fletes asignados y las consultas de agrotienda aparecerán aquí.'}
          </Text>
        </View>
      ) : (
        <SectionList<ChatRow, ChatSec>
          sections={sections}
          keyExtractor={(item) => item.sala.id}
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          contentContainerStyle={s.lista}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section: sec }) => (
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>{sec.title}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            if (item.tipo === 'cosecha') {
              const sc = item.sala;
              const peer =
                sc.comprador_id === perfil?.id
                  ? sc.agricultor?.nombre ?? 'Productor'
                  : sc.comprador?.nombre ?? 'Comprador';
              const unreadN = unreadBySala[sc.id] ?? 0;
              return (
                <TouchableOpacity
                  style={s.card}
                  onPress={() => {
                    setSalaCosechaActiva(sc);
                    setCosechaModalOpen(true);
                  }}
                >
                  <View style={s.cardTopRow}>
                    <View style={s.badgeCosecha}>
                      <Text style={s.badgeTxt}>Cosecha</Text>
                    </View>
                    {unreadN > 0 ? <View style={s.unreadDot} accessibilityLabel={`${unreadN} sin leer`} /> : null}
                  </View>
                  <Text style={s.nombre}>{peer}</Text>
                  <Text style={s.rubro}>
                    {sc.cosecha?.rubro ?? 'Negociación'}
                    {sc.cosecha?.estado_ve ? ` · ${sc.cosecha.estado_ve}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            }
            if (item.tipo === 'insumo') {
              const si = item.sala;
              const nombreProd = (si.insumo as { nombre_producto?: string } | null)?.nombre_producto ?? 'Producto';
              return (
                <TouchableOpacity
                  style={s.card}
                  onPress={() => {
                    setInsumoSalaId(si.id);
                    setInsumoModalOpen(true);
                  }}
                >
                  <View style={s.cardTopRow}>
                    <View style={[s.badgeCosecha, { backgroundColor: '#7B1FA2' }]}>
                      <Text style={s.badgeTxt}>Agrotienda</Text>
                    </View>
                    {si.venta_confirmada ? (
                      <View style={[s.badgeCosecha, { backgroundColor: '#16a34a' }]}>
                        <Text style={s.badgeTxt}>Trato cerrado</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={s.nombre} numberOfLines={1}>{nombreProd}</Text>
                  <Text style={s.rubro}>
                    {si.venta_confirmada ? 'Venta confirmada' : 'Negociación en curso'}
                  </Text>
                </TouchableOpacity>
              );
            }
            const sl = item.sala;
            const frRaw = sl.freight_requests;
            const fr = Array.isArray(frRaw) ? frRaw[0] : frRaw;
            const line = fr
              ? `${fr.tipo_servicio} · ${fr.origen_municipio}, ${fr.origen_estado}`
              : 'Coordinación de flete';
            return (
              <TouchableOpacity
                style={s.card}
                onPress={() => {
                  setLogSalaId(sl.id);
                  setLogSubtitle(line);
                  setLogModalOpen(true);
                }}
              >
                <View style={s.badgeLog}>
                  <Text style={s.badgeTxt}>Transporte</Text>
                </View>
                <Text style={s.nombre} numberOfLines={2}>
                  {line}
                </Text>
                <Text style={s.rubro}>Fecha necesaria: {fr?.fecha_necesaria ?? '—'}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <CosechaChatModal
        visible={cosechaModalOpen}
        onClose={() => {
          setCosechaModalOpen(false);
          setSalaCosechaActiva(null);
          void cargar();
        }}
        sala={salaCosechaActiva}
        perfil={perfil ?? null}
      />
      <LogisticsChatModal
        visible={logModalOpen}
        onClose={() => {
          setLogModalOpen(false);
          setLogSalaId(null);
          setLogSubtitle(null);
        }}
        salaId={logSalaId}
        perfil={perfil ?? null}
        subtitle={logSubtitle}
      />
      <InsumoChatModal
        visible={insumoModalOpen}
        onClose={() => {
          setInsumoModalOpen(false);
          setInsumoSalaId(null);
          void cargar();
        }}
        salaId={insumoSalaId}
        perfil={perfil ?? null}
        onVentaConfirmada={() => void cargar()}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: SPACE.md, backgroundColor: COLORS.primary, paddingBottom: SPACE.sm },
  titulo: { color: '#FFF', fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold },
  subHeader: { color: 'rgba(255,255,255,0.9)', fontSize: FONT.sizes.sm, marginTop: 4 },
  warningBanner: {
    marginHorizontal: SPACE.md,
    marginTop: SPACE.sm,
    padding: SPACE.sm,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  warningText: { color: '#9A3412', fontSize: FONT.sizes.sm, lineHeight: 18, fontWeight: FONT.weights.semibold },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACE.lg },
  emptyIcon: { fontSize: 48 },
  emptyTxt: { color: COLORS.text, fontWeight: FONT.weights.semibold, marginTop: SPACE.md },
  emptyHint: { color: COLORS.textSecondary, marginTop: SPACE.sm, textAlign: 'center', lineHeight: 20 },
  lista: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  sectionHead: {
    backgroundColor: COLORS.background,
    paddingVertical: SPACE.sm,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionTitle: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold, color: COLORS.textSecondary, letterSpacing: 0.3 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    ...SHADOW.sm,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  badgeCosecha: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  badgeLog: {
    alignSelf: 'flex-start',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    marginBottom: 6,
  },
  badgeTxt: { fontSize: FONT.sizes.xs, fontWeight: FONT.weights.bold, color: COLORS.primary },
  nombre: { fontWeight: FONT.weights.semibold, color: COLORS.text, fontSize: FONT.sizes.md },
  rubro: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
});
