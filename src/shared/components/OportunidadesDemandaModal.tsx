import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/shared/store/AuthContext';
import { chatService } from '@/shared/services/chatService';
import {
  CATEGORIA_DESTINO_REQUERIMIENTO,
  listarRequerimientosCompra,
  type RequerimientoCompra,
} from '@/shared/services/marketDemandService';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const EMERALD = '#10B981';
const SLATE = '#0F172A';
const CREAM = '#FDFBF7';

export type OportunidadesDemandaVariant = 'producer' | 'company' | 'agrotienda';

/** Cualquier valor de enrutamiento `categoria_destino`. */
export type OportunidadesDemandaCategoria =
  (typeof CATEGORIA_DESTINO_REQUERIMIENTO)[keyof typeof CATEGORIA_DESTINO_REQUERIMIENTO];

type AlcanceGeo = 'nacional' | 'mi_estado';

type Props = {
  visible: boolean;
  onClose: () => void;
  categoriaDestino: OportunidadesDemandaCategoria;
  title: string;
  subtitle?: string;
  variant: OportunidadesDemandaVariant;
};

function accentForVariant(v: OportunidadesDemandaVariant): string {
  switch (v) {
    case 'producer':
      return EMERALD;
    case 'company':
      return SLATE;
    case 'agrotienda':
      return COLORS.roles.agrotienda;
    default:
      return SLATE;
  }
}

export function OportunidadesDemandaModal({
  visible,
  onClose,
  categoriaDestino,
  title,
  subtitle,
  variant,
}: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { perfil } = useAuth();
  const [rows, setRows] = useState<RequerimientoCompra[]>([]);
  const [loading, setLoading] = useState(false);
  const [alcanceGeo, setAlcanceGeo] = useState<AlcanceGeo>('nacional');
  const [loadError, setLoadError] = useState<string | null>(null);

  const accent = accentForVariant(variant);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (alcanceGeo === 'mi_estado' && !perfil?.estado_ve?.trim()) {
        setRows([]);
        return;
      }
      const params: Parameters<typeof listarRequerimientosCompra>[0] = {
        limit: 80,
        categoriaDestino,
      };
      if (alcanceGeo === 'mi_estado' && perfil?.estado_ve?.trim()) {
        params.ubicacionEstado = perfil.estado_ve.trim();
      }
      const r = await listarRequerimientosCompra(params);
      setRows(r);
    } catch (error: unknown) {
      setRows([]);
      setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las oportunidades ahora mismo.');
    } finally {
      setLoading(false);
    }
  }, [categoriaDestino, alcanceGeo, perfil?.estado_ve]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  useEffect(() => {
    if (!visible) setAlcanceGeo('nacional');
  }, [visible]);

  const abrirChat = async (item: RequerimientoCompra) => {
    if (!perfil) return;
    try {
      const sala = await chatService.crearSala(item.comprador_id, perfil.id, undefined);
      onClose();
      const parentNav = (navigation as unknown as { getParent?: () => { navigate: (n: string, p?: object) => void } | undefined }).getParent?.();
      const targetNav = parentNav ?? (navigation as unknown as { navigate: (n: string, p?: object) => void });
      targetNav.navigate('Chat', {
        openCosechaSalaId: sala.id,
      });
    } catch (e) {
      Alert.alert('Chat', e instanceof Error ? e.message : 'No se pudo abrir la conversación.');
    }
  };

  const headerBg = accent;
  const headerSubColor = variant === 'producer' ? 'rgba(255,255,255,0.9)' : '#94a3b8';
  const sinEstadoPerfil = alcanceGeo === 'mi_estado' && !perfil?.estado_ve?.trim();

  const btnChatStyle =
    variant === 'producer' ? s.btnChatProd : variant === 'company' ? s.btnChatCorp : s.btnChatAgro;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.root}>
        <View style={[s.header, { backgroundColor: headerBg, paddingTop: Math.max(insets.top, SPACE.md) }]}>
          <View style={s.headerTop}>
            <Text style={s.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Cerrar">
              <Text style={s.cerrar}>Cerrar</Text>
            </TouchableOpacity>
          </View>
          {subtitle ? <Text style={[s.headerSub, { color: headerSubColor }]}>{subtitle}</Text> : null}
          <View style={s.headerBadge}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#fff" />
            <Text style={s.headerBadgeTxt}>Solo demandas compatibles con tu rubro y alcance</Text>
          </View>
        </View>

        <View style={s.geoStrip}>
          <Text style={s.geoStripLabel}>Alcance geográfico</Text>
          <View style={s.segmentTrack}>
            <TouchableOpacity
              style={[s.segmentBtn, alcanceGeo === 'mi_estado' && { backgroundColor: accent }]}
              onPress={() => setAlcanceGeo('mi_estado')}
              activeOpacity={0.88}
              accessibilityLabel="Filtrar por mi estado"
            >
              <Text style={[s.segmentTxt, alcanceGeo === 'mi_estado' && s.segmentTxtOn]}>Mi Estado</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.segmentBtn, alcanceGeo === 'nacional' && { backgroundColor: accent }]}
              onPress={() => setAlcanceGeo('nacional')}
              activeOpacity={0.88}
              accessibilityLabel="Ver a nivel nacional"
            >
              <Text style={[s.segmentTxt, alcanceGeo === 'nacional' && s.segmentTxtOn]}>Nacional</Text>
            </TouchableOpacity>
          </View>
          {alcanceGeo === 'mi_estado' && perfil?.estado_ve?.trim() ? (
            <Text style={s.geoHint}>
              <Text style={s.geoHintStrong}>Filtrando: </Text>
              {perfil.estado_ve.trim()}
            </Text>
          ) : null}
          {sinEstadoPerfil ? (
            <Text style={s.geoWarn}>Configura tu estado (Venezuela) en el perfil para filtrar por región.</Text>
          ) : null}
        </View>

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={accent} />
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(it) => it.id}
            contentContainerStyle={s.listPad}
            ListEmptyComponent={
              <View>
                {loadError ? <Text style={s.empty}>{loadError}</Text> : null}
                <Text style={s.empty}>
                  {sinEstadoPerfil
                    ? 'Añade tu estado en el perfil para ver demandas de tu región.'
                    : 'No hay oportunidades con este criterio ahora, o tu sesión no tiene permiso para verlas.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={s.card}>
                <Text style={s.rubro}>{item.rubro}</Text>
                <Text style={s.line}>
                  Cantidad solicitada: <Text style={s.lineStrong}>{item.cantidad}</Text>
                  {' · '}Condiciones a negociar por chat
                </Text>

                <View style={s.pillRow}>
                  <Ionicons name="location-outline" size={18} color={accent} />
                  <View style={s.pillTextCol}>
                    <Text style={s.pillLabel}>Ubicación solicitada</Text>
                    <Text style={s.pillVal}>{item.ubicacion_estado}</Text>
                  </View>
                </View>

                <View style={s.pillRow}>
                  <Ionicons name="calendar-outline" size={18} color={accent} />
                  <View style={s.pillTextCol}>
                    <Text style={s.pillLabel}>Fecha límite de compra</Text>
                    <Text style={s.pillVal}>{item.fecha_limite}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[s.btnChat, btnChatStyle]}
                  onPress={() => void abrirChat(item)}
                  activeOpacity={0.9}
                >
                  <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
                  <Text style={s.btnChatTxt}>Negociar con el comprador</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  header: {
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.md,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    ...SHADOW.md,
  },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerTitle: {
    flex: 1,
    fontSize: FONT.sizes.xl,
    fontWeight: FONT.weights.heavy,
    color: '#fff',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  headerSub: { marginTop: 8, fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold, lineHeight: 20 },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  headerBadgeTxt: { fontSize: 11, fontWeight: FONT.weights.bold, color: '#fff' },
  cerrar: { fontSize: FONT.sizes.md, color: '#fff', fontWeight: FONT.weights.semibold },
  geoStrip: {
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.sm,
    backgroundColor: CREAM,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e5e4',
  },
  geoStripLabel: {
    fontSize: 10,
    fontWeight: FONT.weights.bold,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    padding: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: RADIUS.sm,
  },
  segmentTxt: { fontSize: 13, fontWeight: FONT.weights.bold, color: '#64748b' },
  segmentTxtOn: { color: '#fff' },
  geoHint: { marginTop: 10, fontSize: FONT.sizes.sm, color: '#475569', fontWeight: FONT.weights.medium },
  geoHintStrong: { fontWeight: FONT.weights.bold, color: SLATE },
  geoWarn: {
    marginTop: 10,
    fontSize: FONT.sizes.sm,
    color: '#b45309',
    fontWeight: FONT.weights.semibold,
    lineHeight: 20,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listPad: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  card: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    ...SHADOW.md,
  },
  rubro: {
    fontSize: FONT.sizes.lg,
    fontWeight: FONT.weights.heavy,
    color: SLATE,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  line: { marginTop: 8, fontSize: FONT.sizes.sm, color: '#64748b', fontWeight: FONT.weights.medium },
  lineStrong: { color: SLATE, fontWeight: FONT.weights.bold },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pillTextCol: { flex: 1, minWidth: 0 },
  pillLabel: {
    fontSize: 10,
    fontWeight: FONT.weights.bold,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  pillVal: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.heavy, color: SLATE },
  btnChat: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
  },
  btnChatProd: { backgroundColor: EMERALD },
  btnChatCorp: { backgroundColor: SLATE },
  btnChatAgro: { backgroundColor: COLORS.roles.agrotienda },
  btnChatTxt: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: SPACE.xl, paddingHorizontal: SPACE.lg, lineHeight: 22 },
});
