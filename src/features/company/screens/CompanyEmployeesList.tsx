import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { supabase } from '@/shared/lib/supabase';
import { useCompany } from '../hooks/useCompany';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

type Row = {
  id: string;
  perfil_id: string;
  activo: boolean;
  perfiles: { nombre: string; telefono: string | null; municipio: string | null } | null;
};

export default function CompanyEmployeesList() {
  const { company, loadError } = useCompany();
  const [rows, setRows] = useState<Row[]>([]);
  const [refresh, setRefresh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!company?.id) {
      setRows([]);
      setErrorMsg(loadError);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('company_employees')
      .select('id, perfil_id, activo, perfiles ( nombre, telefono, municipio )')
      .eq('company_id', company.id)
      .order('creado_en', { ascending: false })
      .limit(300);
    if (error) {
      setRows([]);
      setErrorMsg(error.message);
    } else {
      setRows((data as unknown as Row[]) ?? []);
      setErrorMsg(null);
    }
    setLoading(false);
  }, [company?.id, loadError]);

  useEffect(() => {
    setLoading(true);
    void cargar();
  }, [cargar]);

  const onRefresh = async () => {
    setRefresh(true);
    try {
      await cargar();
    } catch {
      /* ignore */
    } finally {
      setRefresh(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      contentContainerStyle={s.list}
      ListHeaderComponent={errorMsg ? <Text style={s.error}>{errorMsg}</Text> : null}
      ListEmptyComponent={
        <Text style={s.empty}>
          {company
            ? 'No hay peritos asignados aún. El equipo administrativo de ZafraClic crea y habilita estos perfiles para tu empresa.'
            : 'Primero completa el perfil de empresa para poder ver las asignaciones de peritos.'}
        </Text>
      }
      renderItem={({ item }) => (
        <View style={s.card}>
          <Text style={s.nombre}>{item.perfiles?.nombre ?? item.perfil_id.slice(0, 8)}</Text>
          <Text style={s.meta}>{item.perfiles?.municipio ?? '—'} · {item.activo ? 'Activo' : 'Inactivo'}</Text>
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: COLORS.background },
  list: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  error: { color: COLORS.danger, textAlign: 'center', marginBottom: SPACE.md, lineHeight: 20 },
  empty: { color: COLORS.textDisabled, textAlign: 'center', marginTop: SPACE.xl },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  nombre: { fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md, color: COLORS.text },
  meta: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
});
