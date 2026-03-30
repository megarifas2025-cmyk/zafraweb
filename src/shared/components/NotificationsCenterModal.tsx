import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/shared/lib/supabase';
import { listarNotificacionesFreight, marcarNotificacionesFreightLeidas } from '@/shared/services/freightRequestsService';
import {
  listarNotificacionesChatMercado,
  marcarTodosMensajesMercadoLeidos,
} from '@/shared/services/chatService';
import { useChatUnread } from '@/shared/store/ChatUnreadContext';
import { FONT, SPACE, SHADOW } from '@/shared/utils/theme';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';

type NotificationItem =
  | { kind: 'freight'; id: string; titulo: string; cuerpo: string; creado_en: string; leida: boolean }
  | { kind: 'insp'; id: string; titulo: string; cuerpo: string; creado_en: string; leida: boolean }
  | { kind: 'chat'; id: string; titulo: string; cuerpo: string; creado_en: string; leida: boolean };

type Props = {
  visible: boolean;
  onClose: () => void;
  userId: string | null | undefined;
  companyId?: string | null;
  peritoId?: string | null;
  title?: string;
  subtitle?: string;
};

const NOTIFICATIONS_LOAD_MS = 10_000;

async function withTimeout<T>(promise: Promise<T>, fallback: T, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function NotificationsCenterModal({
  visible,
  onClose,
  userId,
  companyId,
  peritoId,
  title = 'Notificaciones',
  subtitle = 'Alertas ejecutivas, transporte, chats e inspecciones',
}: Props) {
  const insets = useSafeAreaInsets();
  const { refreshMercadoUnread } = useChatUnread();
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();

  const handleViewAll = () => {
    onClose();
    try { navigation.navigate('Notificaciones'); } catch { /* pantalla no disponible en este contexto */ }
  };
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const cargar = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const [fr, chatRows] = await Promise.all([
        withTimeout(
          listarNotificacionesFreight(userId).catch(() => []),
          [] as Array<{ id: string; titulo: string; cuerpo: string; creado_en: string; leida: boolean }>,
          NOTIFICATIONS_LOAD_MS,
        ),
        withTimeout(listarNotificacionesChatMercado(userId, 8).catch(() => []), [], NOTIFICATIONS_LOAD_MS),
      ]);
      const out: NotificationItem[] = (fr as Array<{ id: string; titulo: string; cuerpo: string; creado_en: string; leida: boolean }>).map(
        (n) => ({
          kind: 'freight',
          id: n.id,
          titulo: n.titulo,
          cuerpo: n.cuerpo,
          creado_en: n.creado_en,
          leida: n.leida,
        }),
      );

      for (const c of chatRows) {
        out.push({
          kind: 'chat',
          id: `chat-${c.id}`,
          titulo: c.titulo,
          cuerpo: c.cuerpo,
          creado_en: c.creado_en,
          leida: c.leida,
        });
      }

      if (companyId || peritoId) {
        let query = supabase
          .from('field_inspections')
          .select('id, numero_control, estatus, actualizado_en, productor_id')
          .order('actualizado_en', { ascending: false })
          .limit(15);
        if (companyId) {
          query = query.eq('empresa_id', companyId);
        } else if (peritoId) {
          query = query.eq('perito_id', peritoId);
        }
        const { data: insp } = await withTimeout(
          Promise.resolve(query).then((result) => ({ data: result.data ?? [] })),
          { data: [] as Array<{ id: string; numero_control: string; estatus: string; actualizado_en: string; productor_id: string }> },
          NOTIFICATIONS_LOAD_MS,
        );

        for (const row of insp ?? []) {
          out.push({
            kind: 'insp',
            id: `insp-${row.id}`,
            titulo: `Inspección ${row.numero_control}`,
            cuerpo: `Estatus: ${row.estatus} · productor ${String(row.productor_id).slice(0, 8)}…`,
            creado_en: row.actualizado_en as string,
            leida: true,
          });
        }
      }

      out.sort((a, b) => (b.creado_en > a.creado_en ? 1 : -1));
      setItems(out);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId, companyId, peritoId]);

  useEffect(() => {
    if (visible) void cargar();
  }, [visible, cargar]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await cargar();
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  };

  const markAllRead = async () => {
    if (!userId) return;
    try {
      await marcarNotificacionesFreightLeidas(userId);
      try {
        await marcarTodosMensajesMercadoLeidos(userId);
      } catch {
        /* ignore */
      }
      await refreshMercadoUnread();
      await cargar();
    } catch {
      /* ignore */
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { paddingTop: Math.max(insets.top, SPACE.md), paddingBottom: Math.max(insets.bottom, SPACE.md) + SPACE.sm }]}>
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.title}>{title}</Text>
              <Text style={s.subtitle}>{subtitle}</Text>
            </View>
            <View style={s.headerActions}>
              <TouchableOpacity style={s.readBtn} onPress={() => void markAllRead()} accessibilityLabel="Marcar leidas">
                <Ionicons name="checkmark-done-outline" size={18} color={CEO_COLORS.cyan} />
              </TouchableOpacity>
              <TouchableOpacity style={s.readBtn} onPress={handleViewAll} accessibilityLabel="Ver historial completo">
                <Ionicons name="list-outline" size={18} color={CEO_COLORS.cyan} />
              </TouchableOpacity>
              <TouchableOpacity style={s.closeBtn} onPress={onClose} accessibilityLabel="Cerrar notificaciones">
                <Ionicons name="close-outline" size={22} color={CEO_COLORS.text} />
              </TouchableOpacity>
            </View>
          </View>

          {loading && items.length === 0 ? (
            <ActivityIndicator style={{ marginTop: SPACE.xl }} color={CEO_COLORS.cyan} />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CEO_COLORS.cyan} />}
              contentContainerStyle={s.list}
              ListEmptyComponent={<Text style={s.empty}>Sin notificaciones recientes.</Text>}
              renderItem={({ item }) => (
                <View style={[s.card, !item.leida && s.cardUnread]}>
                  <Text style={s.badge}>
                    {item.kind === 'freight'
                      ? 'Sistema / transporte'
                      : item.kind === 'chat'
                        ? 'Chat · negociación'
                        : 'Inspección'}
                  </Text>
                  <Text style={s.cardTit}>{item.titulo}</Text>
                  <Text style={s.cardBody}>{item.cuerpo}</Text>
                  <Text style={s.date}>{item.creado_en?.slice(0, 16)?.replace('T', ' ') ?? ''}</Text>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.78)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: CEO_COLORS.panelStrong,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '86%',
    borderWidth: 1,
    borderColor: CEO_COLORS.borderStrong,
    ...SHADOW.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.sm,
    borderBottomWidth: 1,
    borderBottomColor: CEO_COLORS.border,
  },
  headerText: { flex: 1, marginRight: SPACE.sm },
  headerActions: { flexDirection: 'row', gap: SPACE.xs },
  title: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, color: CEO_COLORS.text },
  subtitle: { marginTop: 4, fontSize: FONT.sizes.sm, color: CEO_COLORS.textSoft, lineHeight: 20 },
  readBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: CEO_COLORS.panel,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: CEO_COLORS.panel,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  empty: { textAlign: 'center', color: CEO_COLORS.textMute, marginTop: SPACE.xl },
  card: {
    backgroundColor: CEO_COLORS.panel,
    borderRadius: 18,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    ...SHADOW.sm,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: CEO_COLORS.amber },
  badge: { fontSize: FONT.sizes.xs, color: CEO_COLORS.cyan, fontWeight: FONT.weights.bold, marginBottom: 4 },
  cardTit: { fontWeight: FONT.weights.bold, color: CEO_COLORS.text, fontSize: FONT.sizes.md },
  cardBody: { fontSize: FONT.sizes.sm, color: CEO_COLORS.textSoft, marginTop: 4 },
  date: { fontSize: FONT.sizes.xs, color: CEO_COLORS.textMute, marginTop: 8 },
});
