/**
 * Solo alertas meteorológicas / campo (tabla alertas_clima). Separado de notificaciones de app.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/shared/store/AuthContext';
import { supabase } from '@/shared/lib/supabase';
import { COLORS, FONT, SPACE, SHADOW } from '@/shared/utils/theme';

export default function ClimaScreen() {
  const insets = useSafeAreaInsets();
  const { perfil } = useAuth();
  const [alertas, setAlertas] = useState<{ id: string; titulo: string; mensaje: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!perfil) { setLoading(false); return; }
    setErrorMsg(null);
    const { data, error } = await supabase
      .from('alertas_clima')
      .select('*')
      .eq('perfil_id', perfil.id)
      .order('creado_en', { ascending: false })
      .limit(30);
    if (error) {
      setErrorMsg('No se pudieron cargar las alertas de clima.');
    } else {
      setAlertas((data ?? []) as { id: string; titulo: string; mensaje: string }[]);
    }
    setLoading(false);
  }, [perfil]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const onRefresh = async () => {
    setRefresh(true);
    await cargar();
    setRefresh(false);
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <Text style={s.titulo}>⛅ Clima y campo</Text>
        <Text style={s.sub}>Alertas generadas desde tu zona y el servicio meteorológico</Text>
      </View>
      <FlatList
        data={alertas}
        keyExtractor={i => i.id}
        contentContainerStyle={s.lista}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={s.empty}>
            {loading
              ? <ActivityIndicator color={COLORS.primary} />
              : errorMsg
                ? <Text style={s.errorTxt}>{errorMsg}</Text>
                : <Text style={s.emptyTxt}>Sin alertas de clima recientes</Text>
            }
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.tituloCard}>{item.titulo}</Text>
            <Text style={s.msg}>{item.mensaje}</Text>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.md, backgroundColor: '#0D9488' },
  titulo: { color: '#FFF', fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold },
  sub: { color: 'rgba(255,255,255,0.92)', fontSize: FONT.sizes.sm, marginTop: 6, lineHeight: 20 },
  lista: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  empty: { alignItems: 'center', marginTop: SPACE.xxl },
  emptyTxt: { color: COLORS.textSecondary },
  errorTxt: { color: COLORS.danger, fontSize: FONT.sizes.sm, textAlign: 'center' },
  card: { backgroundColor: COLORS.surface, borderRadius: 12, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  tituloCard: { fontWeight: FONT.weights.bold },
  msg: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
});
