import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/shared/lib/supabase';
import type { Cosecha } from '@/shared/types';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  perfilId: string;
}

type CosechaVendida = Pick<
  Cosecha,
  'id' | 'rubro' | 'cantidad_kg' | 'estado' | 'municipio' | 'estado_ve'
> & {
  actualizado_en?: string | null;
  cerrado_en?: string | null;
};

export function HistorialVentasModal({ visible, onClose, perfilId }: Props) {
  const insets = useSafeAreaInsets();
  const [cosechas, setCosechas] = useState<CosechaVendida[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('cosechas')
        .select('id, rubro, cantidad_kg, estado, municipio, estado_ve, actualizado_en')
        .eq('agricultor_id', perfilId)
        .eq('estado', 'vendida')
        .order('actualizado_en', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      setCosechas((data ?? []) as CosechaVendida[]);
    } catch (error) {
      setCosechas([]);
      setErrorMsg(error instanceof Error ? error.message : 'No se pudo cargar el historial de ventas.');
    } finally {
      setLoading(false);
    }
  }, [perfilId]);

  useEffect(() => {
    if (visible && perfilId) void cargar();
  }, [visible, perfilId, cargar]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 16 : SPACE.md) }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Text style={s.cerrar}>‹ Volver</Text>
          </TouchableOpacity>
          <View style={s.titleWrap}>
            <Ionicons name="receipt-outline" size={20} color={COLORS.roles.independent_producer} />
            <Text style={s.title}>Mis ventas</Text>
          </View>
          <View style={{ width: 72 }} />
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.roles.independent_producer} style={{ marginTop: 40 }} />
        ) : errorMsg ? (
          <View style={s.empty}>
            <Ionicons name="cloud-offline-outline" size={40} color="#CBD5E1" />
            <Text style={s.emptyTitle}>No pudimos cargar tus ventas</Text>
            <Text style={s.emptyDesc}>{errorMsg}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => void cargar()} activeOpacity={0.88}>
              <Text style={s.retryTxt}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={cosechas}
            keyExtractor={(c) => c.id}
            contentContainerStyle={s.list}
            ListEmptyComponent={
              <View style={s.empty}>
                <Ionicons name="bag-check-outline" size={40} color="#CBD5E1" />
                <Text style={s.emptyTitle}>Sin ventas registradas</Text>
                <Text style={s.emptyDesc}>Tus cosechas que se hayan marcado como vendidas aparecerán aquí.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.iconBox}>
                    <Ionicons name="leaf-outline" size={20} color={COLORS.roles.independent_producer} />
                  </View>
                  <View style={s.cardBody}>
                    <Text style={s.rubro}>{item.rubro}</Text>
                    <Text style={s.meta}>
                      {item.municipio ?? ''}{item.estado_ve ? `, ${item.estado_ve}` : ''} ·{' '}
                      {item.cantidad_kg ? `${Number(item.cantidad_kg).toLocaleString()} kg` : '—'}
                    </Text>
                  </View>
                  <View style={s.badgeWrap}>
                    <Text style={s.badge}>VENDIDA</Text>
                  </View>
                </View>
                {item.actualizado_en ? (
                  <Text style={s.fecha}>
                    Cerrado el{' '}
                    {new Date(item.actualizado_en).toLocaleDateString('es-VE', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </Text>
                ) : null}
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const GREEN = COLORS.roles.independent_producer;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.sm,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  cerrar: { color: GREEN, fontWeight: FONT.weights.semibold, fontSize: FONT.sizes.md, minWidth: 72 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold, color: COLORS.text },
  list: { padding: SPACE.md, gap: SPACE.sm },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconBox: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  rubro: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text },
  meta: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  precio: { fontSize: FONT.sizes.sm, color: GREEN, fontWeight: FONT.weights.semibold, marginTop: 4 },
  badgeWrap: {
    backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999, alignSelf: 'flex-start',
  },
  badge: { fontSize: 10, fontWeight: FONT.weights.bold, color: '#15803D', letterSpacing: 0.5 },
  fecha: { fontSize: FONT.sizes.xs, color: COLORS.textDisabled, marginTop: 8 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: SPACE.xl },
  emptyTitle: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text, marginTop: 12 },
  emptyDesc: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, textAlign: 'center', marginTop: 6 },
  retryBtn: {
    marginTop: SPACE.md,
    backgroundColor: GREEN,
    paddingHorizontal: SPACE.md,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
  },
  retryTxt: { color: '#FFF', fontWeight: FONT.weights.bold },
});
