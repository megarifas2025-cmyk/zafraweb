import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listChatIncidentsForCeo, updateChatIncidentStatus } from '@/shared/services/chatGovernanceService';
import { logAdminAuditAction } from '@/features/super-admin/services/ceoAdminService';
import { useAuth } from '@/shared/store/AuthContext';
import type { SuperAdminStackParamList } from '@/features/super-admin/navigation/types';
import type { ChatIncident } from '@/shared/types';
import { FONT, RADIUS, SHADOW, SPACE } from '@/shared/utils/theme';
import { CeoBackdrop } from '@/features/super-admin/components/CeoBackdrop';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';

type Nav = NativeStackNavigationProp<SuperAdminStackParamList, 'CeoChatIncidents'>;

function incidentStatusLabel(status: ChatIncident['status']) {
  switch (status) {
    case 'reviewing':
      return 'En revisión';
    case 'resolved':
      return 'Resuelto';
    case 'dismissed':
      return 'Descartado';
    default:
      return status;
  }
}

export default function CeoChatIncidentsScreen() {
  const insets = useSafeAreaInsets();
  const { perfil } = useAuth();
  const navigation = useNavigation<Nav>();
  const [rows, setRows] = useState<ChatIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      setRows(await listChatIncidentsForCeo());
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo cargar los incidentes de chat.');
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

  const resolveIncident = async (item: ChatIncident, status: 'reviewing' | 'resolved' | 'dismissed') => {
    if (!perfil?.id) return;
    const actionLabels: Record<string, string> = {
      reviewing: 'En revisión',
      resolved: 'Resuelto',
      dismissed: 'Descartado',
    };
    Alert.alert(
      'Actualizar incidente',
      `¿Marcar este incidente como "${actionLabels[status] ?? status}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              await updateChatIncidentStatus(item.id, perfil.id, status);
              await logAdminAuditAction({
                actorId: perfil.id,
                action: 'review_chat_incident',
                targetTable: 'chat_incidents',
                targetId: item.id,
                targetLabel: item.category,
                reason: `Incidente marcado como: ${actionLabels[status] ?? status}`,
                details: { source: item.source, severity: item.severity },
              });
              await load();
            } catch (e) {
              Alert.alert('Incidente', e instanceof Error ? e.message : 'No se pudo actualizar el incidente. Intenta de nuevo.');
            }
          },
        },
      ],
    );
  };

  const canAudit = (item: ChatIncident) => item.severity === 'alta' || item.severity === 'critica';
  const severityTone = (severity: ChatIncident['severity']) =>
    severity === 'critica' ? CEO_COLORS.red : severity === 'alta' ? CEO_COLORS.amber : CEO_COLORS.blue;

  return (
    <View style={s.root}>
      <CeoBackdrop />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, SPACE.md) }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={CEO_COLORS.red} />}
        ListHeaderComponent={
          <View style={s.header}>
            <Text style={s.title}>Incidentes de chat</Text>
            <Text style={s.subtitle}>Seguridad y cumplimiento en comunicaciones.</Text>
            {errorMsg ? (
              <View style={s.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={CEO_COLORS.red} />
                <Text style={s.errorTxt}>{errorMsg}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: SPACE.xl }} color={CEO_COLORS.red} />
          ) : (
            <Text style={s.empty}>No hay incidentes de chat registrados por ahora.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={[s.card, { borderColor: `${severityTone(item.severity)}55` }]}>
            <View style={s.badgeRow}>
              <View style={[s.badge, { backgroundColor: `${severityTone(item.severity)}20`, borderColor: `${severityTone(item.severity)}44` }]}>
                <Ionicons name="warning-outline" size={11} color={severityTone(item.severity)} />
                <Text style={[s.badgeTxt, { color: severityTone(item.severity) }]}>{item.severity.toUpperCase()}</Text>
              </View>
              <Text style={s.time}>{new Date(item.created_at).toLocaleString('es-VE')}</Text>
            </View>

            <Text style={s.sourceLabel}>{item.source === 'market' ? 'Chat comercial' : 'Chat logístico'}</Text>
            <Text style={s.titleCard}>{item.category}</Text>
            {item.reason ? <Text style={s.reason}>{item.reason}</Text> : null}
            {item.message_excerpt ? <Text style={s.excerpt}>{item.message_excerpt}</Text> : null}
            <Text style={s.meta}>Estado: {incidentStatusLabel(item.status)}</Text>
            <View style={s.actions}>
              {canAudit(item) ? (
                <TouchableOpacity
                  style={[s.btn, s.btnAudit]}
                  onPress={() =>
                    navigation.navigate('CeoChatAudit', {
                      incidentId: item.id,
                      incidentTitle: `${item.source === 'market' ? 'Chat comercial' : 'Chat logístico'} · ${item.category}`,
                    })
                  }
                >
                  <Ionicons name="eye-outline" size={14} color="#fff" />
                  <Text style={s.btnTxt}>Abrir chat</Text>
                </TouchableOpacity>
              ) : null}
              {item.status !== 'reviewing' ? (
                <TouchableOpacity style={[s.btn, s.btnSoft]} onPress={() => void resolveIncident(item, 'reviewing')}>
                  <Text style={s.btnSoftTxt}>Revisar</Text>
                </TouchableOpacity>
              ) : null}
              {item.status !== 'resolved' ? (
                <TouchableOpacity style={[s.btn, s.btnSafe]} onPress={() => void resolveIncident(item, 'resolved')}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
                  <Text style={s.btnTxt}>Resolver</Text>
                </TouchableOpacity>
              ) : null}
              {item.status !== 'dismissed' ? (
                <TouchableOpacity style={[s.btn, s.btnDismiss]} onPress={() => void resolveIncident(item, 'dismissed')}>
                  <Ionicons name="trash-outline" size={14} color={CEO_COLORS.textMute} />
                  <Text style={s.btnSoftTxt}>Descartar</Text>
                </TouchableOpacity>
              ) : null}
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
  title: { fontSize: 24, fontWeight: FONT.weights.bold, color: CEO_COLORS.text },
  subtitle: { marginTop: 6, fontSize: FONT.sizes.sm, color: CEO_COLORS.textSoft, lineHeight: 20 },
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
    backgroundColor: CEO_COLORS.panel,
    borderRadius: 24,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    ...SHADOW.sm,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeTxt: { fontWeight: FONT.weights.bold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  sourceLabel: { marginTop: 14, color: CEO_COLORS.textSoft, fontSize: FONT.sizes.xs, fontWeight: FONT.weights.bold, textTransform: 'uppercase', letterSpacing: 1.2 },
  titleCard: { marginTop: 8, color: CEO_COLORS.text, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.lg },
  reason: { marginTop: 8, color: CEO_COLORS.textSoft, lineHeight: 20 },
  excerpt: {
    marginTop: 12,
    padding: SPACE.sm,
    backgroundColor: 'rgba(2,6,23,0.5)',
    borderRadius: 14,
    color: CEO_COLORS.red,
    fontStyle: 'italic',
  },
  meta: { marginTop: 12, color: CEO_COLORS.amber, fontSize: FONT.sizes.xs, fontWeight: FONT.weights.bold },
  time: { color: CEO_COLORS.textMute, fontSize: FONT.sizes.xs },
  actions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.md, flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnAudit: { backgroundColor: 'rgba(220,38,38,0.92)' },
  btnSoft:    { backgroundColor: 'rgba(30,41,59,0.92)', borderWidth: 1, borderColor: CEO_COLORS.borderStrong },
  btnSafe:    { backgroundColor: 'rgba(5,150,105,0.92)' },
  btnDismiss: { backgroundColor: 'rgba(30,41,59,0.55)', borderWidth: 1, borderColor: CEO_COLORS.border },
  btnTxt: { color: '#fff', fontWeight: FONT.weights.bold },
  btnSoftTxt: { color: CEO_COLORS.text, fontWeight: FONT.weights.bold },
  empty: { marginTop: SPACE.xl, color: CEO_COLORS.textSoft },
});
