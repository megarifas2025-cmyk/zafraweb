import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/shared/store/AuthContext';
import { listarInsumosAprobadosAgregados, type InsumoAgregado } from '@/shared/services/producerInsumosService';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

export default function MisInsumosScreen() {
  const nav = useNavigation();
  const { perfil } = useAuth();
  const [items, setItems] = useState<InsumoAgregado[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!perfil?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const rows = await listarInsumosAprobadosAgregados(perfil.id);
      setItems(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar insumos.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [perfil?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void cargar();
    }, [cargar]),
  );

  const onRefresh = async () => {
    setRefresh(true);
    await cargar();
    setRefresh(false);
  };

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.scroll}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      <TouchableOpacity style={s.back} onPress={() => nav.goBack()}>
        <Text style={s.backTxt}>← Volver</Text>
      </TouchableOpacity>

      <Text style={s.lead}>
        Resumen de insumos recomendados en inspecciones de campo ya validadas y sincronizadas (ledger de zafra).
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={COLORS.primary} />
      ) : error ? (
        <Text style={s.err}>{error}</Text>
      ) : items.length === 0 ? (
        <Text style={s.empty}>Aún no hay insumos validados en tus inspecciones.</Text>
      ) : (
        items.map(it => (
          <View key={it.nombre} style={s.card}>
            <Text style={s.nombre}>{it.nombre}</Text>
            <Text style={s.meta}>Registrado en {it.veces} lineamiento(s)</Text>
            {it.detalle_dosis.length > 0 ? (
              <Text style={s.dosis}>Dosis: {it.detalle_dosis.join(' · ')}</Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  back: { marginBottom: SPACE.sm },
  backTxt: { color: COLORS.primary, fontWeight: '600', fontSize: FONT.sizes.sm },
  lead: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACE.md, lineHeight: 20 },
  err: { color: COLORS.danger, fontSize: FONT.sizes.sm },
  empty: { color: COLORS.textDisabled, fontSize: FONT.sizes.sm, marginTop: SPACE.md },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    ...SHADOW.sm,
  },
  nombre: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text },
  meta: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: 4 },
  dosis: { fontSize: FONT.sizes.sm, color: COLORS.text, marginTop: SPACE.sm },
});
