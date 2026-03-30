import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  listarRequerimientosCompra,
  eliminarRequerimientoCompra,
  type RequerimientoCompra,
} from '@/shared/services/marketDemandService';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  buyerId: string | null | undefined;
};

function categoriaDestinoLabel(value: string | null | undefined): string {
  if (!value) return 'Sin categoría';
  switch (value) {
    case 'Insumos y Maquinaria':
      return 'Agrotiendas';
    case 'Cosecha a Granel':
      return 'Productores';
    case 'Volumen Procesado / Silos':
      return 'Empresas';
    default:
      return value;
  }
}

export function MisRequerimientosModal({ visible, onClose, buyerId }: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<RequerimientoCompra[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!buyerId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listarRequerimientosCompra({ compradorId: buyerId, limit: 50 });
      setItems(rows);
    } catch (error: unknown) {
      Alert.alert('Requerimientos', error instanceof Error ? error.message : 'No se pudieron cargar tus requerimientos.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [buyerId]);

  useEffect(() => {
    if (visible) void cargar();
  }, [visible, cargar]);

  const onRefresh = async () => {
    setRefreshing(true);
    await cargar();
    setRefreshing(false);
  };

  const eliminar = (id: string) => {
    Alert.alert('Eliminar requerimiento', 'Esta acción retirará tu demanda del mercado.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setDeletingId(id);
            try {
              await eliminarRequerimientoCompra(id);
              await cargar();
            } catch (error: unknown) {
              Alert.alert('Requerimientos', error instanceof Error ? error.message : 'No se pudo eliminar el requerimiento.');
            } finally {
              setDeletingId(null);
            }
          })();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { paddingTop: Math.max(insets.top, SPACE.md), paddingBottom: Math.max(insets.bottom, SPACE.md) + SPACE.sm }]}>
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.title}>Mis requerimientos</Text>
              <Text style={s.subtitle}>Aquí puedes revisar y retirar tus demandas activas del mercado.</Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} accessibilityLabel="Cerrar">
              <Ionicons name="close-outline" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {loading && items.length === 0 ? (
            <ActivityIndicator style={{ marginTop: SPACE.xl }} color={COLORS.roles.buyer} />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerStyle={s.list}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.roles.buyer} />}
              ListEmptyComponent={
                <Text style={s.empty}>
                  {buyerId ? 'Aún no has publicado requerimientos.' : 'No pudimos identificar tu cuenta para cargar requerimientos.'}
                </Text>
              }
              renderItem={({ item }) => (
                <View style={s.card}>
                  <View style={s.top}>
                    <Text style={s.cardTitle}>{item.rubro}</Text>
                    <Text style={s.badge}>{categoriaDestinoLabel(item.categoria_destino)}</Text>
                  </View>
                  <Text style={s.meta}>Cantidad: {item.cantidad}</Text>
                  <Text style={s.meta}>Zona: {item.ubicacion_estado}</Text>
                  <Text style={s.meta}>Vence: {item.fecha_limite}</Text>
                  <Text style={s.meta}>Condiciones: se negocian de forma privada en el chat.</Text>
                  <View style={s.actions}>
                    <TouchableOpacity
                      style={[s.deleteBtn, deletingId === item.id && s.disabledBtn]}
                      onPress={() => eliminar(item.id)}
                      disabled={deletingId === item.id}
                      activeOpacity={0.88}
                    >
                      {deletingId === item.id ? <ActivityIndicator color="#b91c1c" /> : <Text style={s.deleteTxt}>Retirar del mercado</Text>}
                    </TouchableOpacity>
                  </View>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '86%',
    ...SHADOW.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerText: { flex: 1, marginRight: SPACE.sm },
  title: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, color: COLORS.text },
  subtitle: { marginTop: 4, fontSize: FONT.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  empty: { textAlign: 'center', color: COLORS.textDisabled, marginTop: SPACE.xl },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  top: { gap: SPACE.xs },
  cardTitle: { fontWeight: FONT.weights.bold, color: COLORS.text, fontSize: FONT.sizes.md },
  badge: { fontSize: FONT.sizes.xs, color: COLORS.roles.buyer, fontWeight: FONT.weights.bold, textTransform: 'uppercase' },
  meta: { marginTop: 6, fontSize: FONT.sizes.sm, color: COLORS.textSecondary },
  actions: { marginTop: SPACE.md },
  deleteBtn: {
    minHeight: 42,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.7 },
  deleteTxt: { color: '#b91c1c', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
});
