import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BuyerInsumoCard } from '@/features/buyer/components/BuyerInsumoCard';
import { getRestrictedActionMessage } from '@/shared/lib/accountStatus';
import { listarInsumosDisponibles } from '@/shared/services/insumosLocalesService';
import { iniciarChatInsumo } from '@/shared/services/insumoChatService';
import { InsumoChatModal } from '@/shared/components/InsumoChatModal';
import { trackUiEvent } from '@/shared/runtime/uiEventTracker';
import { useAuth } from '@/shared/store/AuthContext';
import type { AgriculturalInput } from '@/shared/types';
import { FONT, SPACE } from '@/shared/utils/theme';

const FOREST = '#0F3B25';
const CREAM = '#FDFBF7';

const LINEAS = [
  { key: 'todos', label: 'Todo' },
  { key: 'insumos', label: 'Insumos' },
  { key: 'repuestos', label: 'Repuestos' },
] as const;

export default function AgrotiendaMarketScreen() {
  const { perfil } = useAuth();
  const [rows, setRows] = useState<AgriculturalInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [linea, setLinea] = useState<(typeof LINEAS)[number]['key']>('todos');
  const [search, setSearch] = useState('');
  const [chatSalaId, setChatSalaId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listarInsumosDisponibles(80, { lineaCatalogo: linea });
      setRows(data);
    } catch (error) {
      console.warn('No se pudo cargar el catálogo agrotienda:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [linea]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefresh(true);
    await load();
    setRefresh(false);
  }, [load]);

  async function abrirChat(item: AgriculturalInput) {
    if (!perfil?.id) return;
    const restriction = getRestrictedActionMessage(perfil);
    if (restriction) {
      Alert.alert('Cuenta', restriction);
      return;
    }
    setAbriendo(true);
    try {
      const salaId = await iniciarChatInsumo(item.id);
      setChatSalaId(salaId);
      setChatOpen(true);
      trackUiEvent({
        eventType: 'tap',
        eventName: 'agrotienda_chat_opened',
        screen: 'AgrotiendaMarket',
        module: 'agrotienda',
        targetType: 'insumo',
        targetId: item.id,
        status: 'success',
        metadata: {
          linea_catalogo: item.linea_catalogo ?? null,
          nombre_producto: item.nombre_producto,
        },
      });
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo abrir el chat. Intenta de nuevo.');
    } finally {
      setAbriendo(false);
    }
  }

  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((item) =>
      [item.nombre_producto, item.subcategoria, item.descripcion].some((value) =>
        (value ?? '').toLowerCase().includes(term),
      ),
    );
  }, [rows, search]);

  return (
    <View style={s.root}>
      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={FOREST} />}
        ListHeaderComponent={
          <View style={s.header}>
            <Text style={s.eyebrow}>Compras independientes</Text>
            <Text style={s.title}>Catálogo agrotienda</Text>
            <Text style={s.subtitle}>
              Revisa insumos o repuestos sin sobrecargar tu panel principal. Si algo te interesa, publica tu solicitud y negocia por chat.
            </Text>
            <View style={s.searchWrap}>
              <Ionicons name="search-outline" size={18} color="#64748b" />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar producto, repuesto o familia"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={s.chipsRow}>
              {LINEAS.map((item) => {
                const active = item.key === linea;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[s.chip, active && s.chipOn]}
                    onPress={() => setLinea(item.key)}
                    activeOpacity={0.92}
                  >
                    <Text style={[s.chipTxt, active && s.chipTxtOn]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={s.loader} color={FOREST} />
          ) : (
            <Text style={s.empty}>No hay publicaciones agrotienda con este filtro ahora mismo.</Text>
          )
        }
        renderItem={({ item }) => (
          <BuyerInsumoCard
            item={item}
            onRequest={(selected) => void abrirChat(selected)}
          />
        )}
      />

      {abriendo && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator color={FOREST} size="large" />
          <Text style={s.loadingTxt}>Abriendo chat…</Text>
        </View>
      )}

      <InsumoChatModal
        visible={chatOpen}
        onClose={() => { setChatOpen(false); setChatSalaId(null); }}
        salaId={chatSalaId}
        perfil={perfil}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  content: { paddingBottom: SPACE.xxl },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingTxt: { color: FOREST, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  eyebrow: {
    color: FOREST,
    fontSize: 11,
    fontWeight: FONT.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  title: { marginTop: 8, color: '#0f172a', fontSize: 24, fontWeight: FONT.weights.heavy },
  subtitle: { marginTop: 8, color: '#64748b', lineHeight: 20, fontSize: FONT.sizes.sm },
  searchWrap: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: '#0f172a', fontSize: 14 },
  chipsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbe3ea',
  },
  chipOn: { backgroundColor: '#ecfdf5', borderColor: '#86efac' },
  chipTxt: { color: '#64748b', fontWeight: FONT.weights.semibold, fontSize: 12 },
  chipTxtOn: { color: FOREST },
  loader: { marginTop: 28 },
  empty: { marginHorizontal: 16, marginTop: 24, color: '#64748b', lineHeight: 20 },
});
