/**
 * Pantalla completa de notificaciones — misma lógica que NotificationsCenterModal:
 * freight + chat mercado + inspecciones de campo.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/shared/store/AuthContext';
import { useCompany } from '@/features/company/hooks/useCompany';
import { supabase } from '@/shared/lib/supabase';
import {
  listarNotificacionesFreight,
  marcarNotificacionesFreightLeidas,
} from '@/shared/services/freightRequestsService';
import {
  listarNotificacionesChatMercado,
  marcarTodosMensajesMercadoLeidos,
} from '@/shared/services/chatService';
import { useChatUnread } from '@/shared/store/ChatUnreadContext';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

type NotifKind = 'freight' | 'chat' | 'insp';

type Row = {
  kind: NotifKind;
  id: string;
  titulo: string;
  cuerpo: string;
  creado_en: string;
  leida: boolean;
};

const BADGE_LABEL: Record<NotifKind, string> = {
  freight: 'Transporte / sistema',
  chat: 'Chat · negociación',
  insp: 'Inspección de campo',
};

const BADGE_COLOR: Record<NotifKind, string> = {
  freight: COLORS.primary,
  chat: COLORS.info,
  insp: COLORS.warning,
};

const TIMEOUT_MS = 10_000;

async function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), TIMEOUT_MS); });
  try { return await Promise.race([promise, timeout]); }
  finally { if (timer) clearTimeout(timer); }
}

export default function NotificacionesUsuarioScreen() {
  const insets = useSafeAreaInsets();
  const { perfil } = useAuth();
  const { company } = useCompany();
  const { refreshMercadoUnread } = useChatUnread();

  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [peritoId, setPeritoId] = useState<string | null>(null);

  // Carga perito_id si el rol es perito
  useEffect(() => {
    if (perfil?.rol !== 'perito') return;
    let cancelled = false;
    void       void Promise.resolve(
        supabase
          .from('peritos')
          .select('id')
          .eq('perfil_id', perfil.id)
          .maybeSingle()
          .then(({ data, error }) => { if (!cancelled && !error && data?.id) setPeritoId(data.id as string); })
      ).catch(() => undefined);
    return () => { cancelled = true; };
  }, [perfil?.id, perfil?.rol]);

  const cargar = useCallback(async () => {
    if (!perfil?.id) { setItems([]); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const [frRows, chatRows] = await Promise.all([
        withTimeout(listarNotificacionesFreight(perfil.id).catch(() => []), []),
        withTimeout(listarNotificacionesChatMercado(perfil.id, 20).catch(() => []), []),
      ]);

      const out: Row[] = (frRows as Row[]).map(n => ({
        kind: 'freight',
        id: n.id,
        titulo: n.titulo,
        cuerpo: n.cuerpo,
        creado_en: n.creado_en,
        leida: n.leida,
      }));

      for (const c of chatRows as Row[]) {
        out.push({ kind: 'chat', id: `chat-${c.id}`, titulo: c.titulo, cuerpo: c.cuerpo, creado_en: c.creado_en, leida: c.leida });
      }

      // Inspecciones para empresa o perito
      const filterCompany = company?.id ?? null;
      const filterPerito  = peritoId ?? null;
      if (filterCompany || filterPerito) {
        let q = supabase
          .from('field_inspections')
          .select('id, numero_control, estatus, actualizado_en')
          .order('actualizado_en', { ascending: false })
          .limit(20);
        if (filterCompany) q = q.eq('empresa_id', filterCompany);
        else if (filterPerito) q = q.eq('perito_id', filterPerito);

        const { data: insp } = await withTimeout(
          Promise.resolve(q).then(r => ({ data: r.error ? [] : (r.data ?? []) })),
          { data: [] as Array<{ id: string; numero_control: string; estatus: string; actualizado_en: string }> },
        );
        for (const row of insp ?? []) {
          out.push({
            kind: 'insp',
            id: `insp-${row.id}`,
            titulo: `Inspección ${row.numero_control}`,
            cuerpo: `Estatus: ${row.estatus}`,
            creado_en: row.actualizado_en,
            leida: true,
          });
        }
      }

      out.sort((a, b) => (b.creado_en > a.creado_en ? 1 : -1));
      setItems(out);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Error al cargar notificaciones.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [perfil?.id, company?.id, peritoId]);

  useEffect(() => { void cargar(); }, [cargar]);

  const onRefresh = async () => { setRefreshing(true); await cargar(); setRefreshing(false); };

  const marcarTodasLeidas = async () => {
    if (!perfil?.id) return;
    try {
      await marcarNotificacionesFreightLeidas(perfil.id);
      await marcarTodosMensajesMercadoLeidos(perfil.id).catch(() => null);
      await refreshMercadoUnread();
      await cargar();
    } catch { /* silencioso */ }
  };

  const unreadCount = items.filter(i => !i.leida).length;

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.titulo}>Notificaciones</Text>
            <Text style={s.sub}>Transporte, chats e inspecciones de campo</Text>
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity style={s.markBtn} onPress={() => void marcarTodasLeidas()}>
              <Ionicons name="checkmark-done-outline" size={16} color="#FFF" />
              <Text style={s.markBtnTxt}>Leer todas</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading && items.length === 0 ? (
        <ActivityIndicator style={{ marginTop: SPACE.xl }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              {loadError
                ? <Text style={s.errorTxt}>{loadError}</Text>
                : <>
                    <Ionicons name="notifications-off-outline" size={40} color={COLORS.textDisabled} />
                    <Text style={s.emptyTxt}>Sin notificaciones recientes.</Text>
                  </>
              }
            </View>
          }
          renderItem={({ item }) => (
            <View style={[s.card, !item.leida && s.cardUnread]}>
              <Text style={[s.badge, { color: BADGE_COLOR[item.kind] }]}>
                {BADGE_LABEL[item.kind]}
              </Text>
              <Text style={s.cardTit}>{item.titulo}</Text>
              <Text style={s.cardBody}>{item.cuerpo}</Text>
              <Text style={s.date}>{item.creado_en?.slice(0, 16)?.replace('T', ' ') ?? ''}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.md, backgroundColor: COLORS.primary },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { color: '#FFF', fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: FONT.sizes.sm, marginTop: 4 },
  markBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 6,
  },
  markBtnTxt: { color: '#FFF', fontSize: FONT.sizes.xs, fontWeight: FONT.weights.semibold },
  list: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  emptyBox: { alignItems: 'center', marginTop: SPACE.xxl, gap: SPACE.sm },
  emptyTxt: { color: COLORS.textDisabled, fontSize: FONT.sizes.sm },
  errorTxt: { color: COLORS.danger, fontSize: FONT.sizes.sm, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    ...SHADOW.sm,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: COLORS.warning },
  badge: { fontSize: FONT.sizes.xs, fontWeight: FONT.weights.bold, marginBottom: 4 },
  cardTit: { fontWeight: FONT.weights.bold, color: COLORS.text, fontSize: FONT.sizes.md },
  cardBody: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  date: { fontSize: FONT.sizes.xs, color: COLORS.textDisabled, marginTop: 8 },
});
