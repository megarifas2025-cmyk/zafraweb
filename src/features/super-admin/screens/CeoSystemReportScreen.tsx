import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchCeoMetricsFull, type RoleCountRow } from '@/features/super-admin/services/ceoAdminService';
import { FONT, SHADOW, SPACE } from '@/shared/utils/theme';
import { CeoBackdrop } from '@/features/super-admin/components/CeoBackdrop';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';

type Metrics = {
  totalUsers: number; pendingKyc: number; blockedUsers: number;
  companies: number; peritos: number; activeFreight: number; agrotiendas: number;
};

function roleLabel(value: RoleCountRow['rol']) {
  switch (value) {
    case 'zafra_ceo':
      return 'Zafra CEO';
    case 'independent_producer':
      return 'Productores';
    case 'company':
      return 'Empresas';
    case 'perito':
      return 'Peritos';
    case 'buyer':
      return 'Compradores';
    case 'transporter':
      return 'Transportistas';
    case 'agrotienda':
      return 'Agrotiendas';
    default:
      return value;
  }
}

export default function CeoSystemReportScreen() {
  const insets = useSafeAreaInsets();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [roleCounts, setRoleCounts] = useState<RoleCountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const full = await fetchCeoMetricsFull();
      setMetrics(full);
      setRoleCounts(full.roleCounts ?? []);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudieron cargar las métricas. Desliza para reintentar.');
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
      <ScrollView
        style={s.root}
        contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, SPACE.md) }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={CEO_COLORS.cyan} />}
      >
        <View style={s.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Reporte del sistema</Text>
            <Text style={s.subtitle}>Analítica agregada del ecosistema, separación por rol y capas críticas de plataforma.</Text>
          </View>
          {loading ? <ActivityIndicator color={CEO_COLORS.cyan} size="small" /> : null}
        </View>
        {errorMsg ? (
          <TouchableOpacity style={s.errorBanner} onPress={() => void load()}>
            <Ionicons name="alert-circle-outline" size={15} color={CEO_COLORS.amber} />
            <Text style={s.errorTxt}>{errorMsg}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={s.summaryCard}>
          <Text style={s.summaryEyebrow}>Total ecosistema</Text>
          <View style={s.summaryRow}>
            <Text style={s.summaryValue}>{metrics?.totalUsers ?? 0}</Text>
            <Text style={s.summaryLabel}>Usuarios</Text>
          </View>
          <View style={s.summaryGrid}>
            <View>
              <Text style={s.summaryMiniLabel}>Activos</Text>
              <Text style={[s.summaryMiniValue, { color: CEO_COLORS.emerald }]}>
                {Math.max((metrics?.totalUsers ?? 0) - (metrics?.blockedUsers ?? 0), 0)}
              </Text>
            </View>
            <View>
              <Text style={s.summaryMiniLabel}>Pendientes</Text>
              <Text style={[s.summaryMiniValue, { color: CEO_COLORS.amber }]}>{metrics?.pendingKyc ?? 0}</Text>
            </View>
            <View>
              <Text style={s.summaryMiniLabel}>Bloqueados</Text>
              <Text style={[s.summaryMiniValue, { color: CEO_COLORS.red }]}>{metrics?.blockedUsers ?? 0}</Text>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Distribución por rol</Text>
          {roleCounts.map((item) => (
            <View key={item.rol} style={s.roleRow}>
              <View style={s.roleLeft}>
                <View style={s.roleIcon}>
                  <Ionicons name="pie-chart-outline" size={14} color={CEO_COLORS.cyan} />
                </View>
                <Text style={s.roleLabel}>{roleLabel(item.rol)}</Text>
              </View>
              <Text style={s.roleTotal}>{item.total}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Capas críticas</Text>
          <View style={s.criticalRow}>
            <Ionicons name="business-outline" size={16} color={CEO_COLORS.purple} />
            <Text style={s.bullet}>Empresas activas: {metrics?.companies ?? 0}</Text>
          </View>
          <View style={s.criticalRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color={CEO_COLORS.blue} />
            <Text style={s.bullet}>Peritos activos: {metrics?.peritos ?? 0}</Text>
          </View>
          <View style={s.criticalRow}>
            <Ionicons name="leaf-outline" size={16} color={CEO_COLORS.emerald} />
            <Text style={s.bullet}>Agrotiendas registradas: {metrics?.agrotiendas ?? 0}</Text>
          </View>
          <View style={s.criticalRow}>
            <Ionicons name="pulse-outline" size={16} color={CEO_COLORS.cyan} />
            <Text style={s.bullet}>Cargas activas: {metrics?.activeFreight ?? 0}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CEO_COLORS.bg },
  content: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 24, fontWeight: FONT.weights.bold, color: CEO_COLORS.text },
  subtitle: { marginTop: 6, color: CEO_COLORS.textSoft, lineHeight: 20, fontSize: FONT.sizes.sm },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACE.sm,
    padding: SPACE.sm,
    backgroundColor: 'rgba(180,83,9,0.15)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  errorTxt: { flex: 1, color: CEO_COLORS.amber, fontSize: FONT.sizes.sm },
  summaryCard: {
    marginTop: SPACE.md,
    padding: SPACE.lg,
    borderRadius: 30,
    backgroundColor: 'rgba(8,47,73,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.25)',
    ...SHADOW.lg,
  },
  summaryEyebrow: { color: CEO_COLORS.cyan, fontSize: FONT.sizes.xs, fontWeight: FONT.weights.bold, textTransform: 'uppercase', letterSpacing: 1.6 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(34,211,238,0.15)' },
  summaryValue: { fontSize: 44, color: CEO_COLORS.text, fontWeight: FONT.weights.regular },
  summaryLabel: { color: CEO_COLORS.cyan, fontWeight: FONT.weights.bold, marginBottom: 8 },
  summaryGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  summaryMiniLabel: { color: CEO_COLORS.textMute, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: FONT.weights.bold },
  summaryMiniValue: { marginTop: 4, fontSize: 20, fontWeight: FONT.weights.bold },
  section: {
    marginTop: SPACE.lg,
    backgroundColor: CEO_COLORS.panel,
    borderRadius: 24,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    ...SHADOW.sm,
  },
  sectionTitle: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: CEO_COLORS.text, marginBottom: SPACE.sm },
  roleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CEO_COLORS.border, alignItems: 'center' },
  roleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roleIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CEO_COLORS.cyanSoft,
  },
  roleLabel: { color: CEO_COLORS.text },
  roleTotal: { color: CEO_COLORS.cyan, fontWeight: FONT.weights.bold },
  criticalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  bullet: { color: CEO_COLORS.textSoft, lineHeight: 20 },
});
