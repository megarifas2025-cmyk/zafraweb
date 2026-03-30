import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getChatAuditMessages } from '@/shared/services/chatGovernanceService';
import type { SuperAdminStackParamList } from '@/features/super-admin/navigation/types';
import type { ChatAuditMessage } from '@/shared/types';
import { FONT, SHADOW, SPACE } from '@/shared/utils/theme';
import { CeoBackdrop } from '@/features/super-admin/components/CeoBackdrop';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';

type AuditRoute = RouteProp<SuperAdminStackParamList, 'CeoChatAudit'>;

export default function CeoChatAuditScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<AuditRoute>();
  const { incidentId, incidentTitle } = route.params;
  const [rows, setRows] = useState<ChatAuditMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const primaryAuthorId = rows[0]?.author_id ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setErrorText(null);
      setRows(await getChatAuditMessages(incidentId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo abrir la conversación auditada.';
      setRows([]);
      setErrorText(message);
      Alert.alert('Modo auditor', message);
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={s.root}>
      <CeoBackdrop />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CEO_COLORS.amber} />}
        contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, SPACE.md) }]}
        ListHeaderComponent={
          <View style={s.header}>
            <Text style={s.title}>Conversación auditada</Text>
            <View style={s.banner}>
              <Ionicons name="shield-checkmark-outline" size={18} color={CEO_COLORS.amber} />
              <Text style={s.subtitle}>
                {incidentTitle ? `${incidentTitle}. ` : ''}
                Acceso de alta seguridad registrado. Esta apertura queda en la bitácora ejecutiva y en el historial de auditoría.
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: SPACE.xl }} color={CEO_COLORS.amber} />
          ) : (
            <Text style={s.empty}>{errorText ?? 'No hay mensajes disponibles para este incidente o no cumple el nivel de auditoría.'}</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={[s.wrap, primaryAuthorId && item.author_id !== primaryAuthorId ? s.wrapRight : s.wrapLeft]}>
            <View style={s.card}>
              <Text style={s.badge}>{item.author_name ?? 'Usuario'} • {new Date(item.created_at).toLocaleString('es-VE')}</Text>
              {item.tipo === 'imagen' && item.media_url ? <Image source={{ uri: item.media_url }} style={s.chatImage} resizeMode="cover" /> : null}
              {item.contenido ? <Text style={s.body}>{item.contenido}</Text> : <Text style={s.placeholder}>Mensaje sin texto adjunto.</Text>}
            </View>
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
  title: { fontSize: 24, fontWeight: FONT.weights.bold, color: CEO_COLORS.text, marginBottom: SPACE.sm },
  banner: {
    flexDirection: 'row',
    gap: 10,
    padding: SPACE.md,
    borderRadius: 20,
    backgroundColor: 'rgba(120,53,15,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  subtitle: { flex: 1, fontSize: FONT.sizes.sm, color: '#fde68a', lineHeight: 20 },
  wrap: { marginBottom: SPACE.md, maxWidth: '88%' },
  wrapLeft: { alignSelf: 'flex-start' },
  wrapRight: { alignSelf: 'flex-end' },
  card: {
    backgroundColor: 'rgba(15,23,42,0.86)',
    borderRadius: 24,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    ...SHADOW.sm,
  },
  badge: { color: CEO_COLORS.textMute, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.xs, marginBottom: 4, textTransform: 'uppercase' },
  body: { marginTop: 8, color: CEO_COLORS.text, lineHeight: 21, fontSize: FONT.sizes.md },
  placeholder: { marginTop: 8, color: CEO_COLORS.textMute, fontStyle: 'italic' },
  chatImage: { width: '100%', height: 220, borderRadius: 16, marginTop: SPACE.sm, backgroundColor: '#dbeafe' },
  empty: { marginTop: SPACE.xl, color: CEO_COLORS.textSoft, textAlign: 'center' },
});
