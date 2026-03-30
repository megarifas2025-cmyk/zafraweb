import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listAdminAuditLogs } from '@/features/super-admin/services/ceoAdminService';
import type { AdminAuditLogEntry } from '@/shared/types';
import { FONT, SHADOW, SPACE } from '@/shared/utils/theme';
import { CeoBackdrop } from '@/features/super-admin/components/CeoBackdrop';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';

export default function CeoAuditTrailScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<AdminAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      setRows(await listAdminAuditLogs());
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo cargar la bitácora ejecutiva.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefresh(true);
    await load();
    setRefresh(false);
  }, [load]);

  return (
    <View style={s.root}>
      <CeoBackdrop />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, SPACE.md) }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={CEO_COLORS.blue} />}
        ListHeaderComponent={
          <View style={s.header}>
            <Text style={s.title}>Bitácora ejecutiva</Text>
            <Text style={s.subtitle}>
              Rastro administrativo y decisiones sensibles del rol CEO.
            </Text>
            {errorMsg ? (
              <TouchableOpacity style={s.errorBanner} onPress={() => void load()}>
                <Ionicons name="alert-circle-outline" size={16} color={CEO_COLORS.red} />
                <Text style={s.errorTxt}>{errorMsg} · Toca para reintentar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: SPACE.xl }} color={CEO_COLORS.blue} />
          ) : (
            <Text style={s.empty}>Aún no hay eventos administrativos registrados.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardTop}>
              <Text style={s.time}>{new Date(item.created_at).toLocaleString('es-VE')}</Text>
              <View style={s.actionTag}>
                <Ionicons name="terminal-outline" size={12} color={CEO_COLORS.blue} />
                <Text style={s.action}>{item.action}</Text>
              </View>
            </View>
            <Text style={s.target}>
              {item.target_table ?? 'sistema'}
              {item.target_label ? ` · ${item.target_label}` : ''}
            </Text>
            {item.reason ? <Text style={s.reason}>Motivo: {item.reason}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CEO_COLORS.bg },
  content: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  header: { marginBottom: SPACE.md },
  title: { fontSize: 24, fontWeight: FONT.weights.bold, color: CEO_COLORS.text },
  subtitle: { marginTop: 6, color: CEO_COLORS.textSoft, lineHeight: 20, fontSize: FONT.sizes.sm },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACE.sm,
    padding: SPACE.sm,
    backgroundColor: 'rgba(220,38,38,0.12)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.3)',
  },
  errorTxt: { flex: 1, color: CEO_COLORS.red, fontSize: FONT.sizes.sm },
  card: {
    backgroundColor: 'rgba(2,6,23,0.86)',
    borderRadius: 24,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    ...SHADOW.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: CEO_COLORS.blueSoft,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.35)',
  },
  action: { color: CEO_COLORS.blue, fontWeight: FONT.weights.bold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7 },
  target: { marginTop: 12, color: CEO_COLORS.text, fontSize: FONT.sizes.sm },
  reason: { marginTop: 8, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.sm, lineHeight: 18 },
  time: { color: CEO_COLORS.textMute, fontSize: FONT.sizes.xs, fontFamily: 'monospace' },
  empty: { marginTop: SPACE.xl, color: CEO_COLORS.textSoft },
});
