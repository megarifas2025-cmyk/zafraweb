import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getVentasPorMes,
  getProductosMasConsultados,
  type VentasMes,
  type ProductoConsultado,
} from '@/shared/services/agrotiendaAnalyticsService';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const PURPLE = COLORS.roles.agrotienda;

interface Props {
  visible: boolean;
  onClose: () => void;
  vendedorId: string | null | undefined;
}

const MES_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
};

function mesLabel(yyyyMM: string) {
  const parts = yyyyMM.split('-');
  if (parts.length !== 2) return yyyyMM;
  return `${MES_LABELS[parts[1]] ?? parts[1]} ${parts[0].slice(2)}`;
}

export function AgrotiendaAnalyticsModal({ visible, onClose, vendedorId }: Props) {
  const insets = useSafeAreaInsets();
  const [cargando, setCargando] = useState(false);
  const [ventas, setVentas] = useState<VentasMes[]>([]);
  const [productos, setProductos] = useState<ProductoConsultado[]>([]);

  const cargar = useCallback(async () => {
    if (!vendedorId) return;
    setCargando(true);
    try {
      const [v, p] = await Promise.all([
        getVentasPorMes(vendedorId),
        getProductosMasConsultados(vendedorId, 5),
      ]);
      setVentas(v);
      setProductos(p);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudieron cargar las analíticas');
    } finally {
      setCargando(false);
    }
  }, [vendedorId]);

  useEffect(() => {
    if (visible) void cargar();
  }, [visible, cargar]);

  const maxVentas = Math.max(...ventas.map(v => v.total), 1);
  const totalVentas = ventas.reduce((acc, v) => acc + v.total, 0);
  const totalConsultas = productos.reduce((acc, p) => acc + p.total_consultas, 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.root, { paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Analíticas</Text>
            <Text style={s.headerSub}>Resumen de tu tienda</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={s.closeBtn}>
            <Ionicons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        {cargando ? (
          <ActivityIndicator color={PURPLE} size="large" style={{ marginTop: 60 }} />
        ) : (
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {/* KPIs */}
            <View style={s.kpiRow}>
              <View style={[s.kpiCard, { borderTopColor: PURPLE }]}>
                <Text style={s.kpiNum}>{totalVentas}</Text>
                <Text style={s.kpiLabel}>Ventas confirmadas</Text>
                <Text style={s.kpiSub}>Últimos 12 meses</Text>
              </View>
              <View style={[s.kpiCard, { borderTopColor: '#0284c7' }]}>
                <Text style={[s.kpiNum, { color: '#0284c7' }]}>{totalConsultas}</Text>
                <Text style={s.kpiLabel}>Consultas totales</Text>
                <Text style={s.kpiSub}>Chats iniciados</Text>
              </View>
            </View>

            {/* Gráfica ventas por mes */}
            <Text style={s.sectionTitle}>Ventas por mes</Text>
            {ventas.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyTxt}>Sin ventas confirmadas en los últimos 12 meses.</Text>
              </View>
            ) : (
              <View style={s.barChart}>
                {ventas.map((v) => {
                  const h = Math.round((v.total / maxVentas) * 80);
                  return (
                    <View key={v.mes} style={s.barCol}>
                      <Text style={s.barValue}>{v.total}</Text>
                      <View style={[s.barFill, { height: Math.max(h, 6), backgroundColor: PURPLE }]} />
                      <Text style={s.barLabel}>{mesLabel(v.mes)}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Top 5 productos más consultados */}
            <Text style={s.sectionTitle}>Productos más consultados</Text>
            {productos.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyTxt}>Todavía no hay consultas en tu catálogo.</Text>
              </View>
            ) : (
              productos.map((p, i) => (
                <View key={p.insumo_id} style={s.prodRow}>
                  <View style={[s.rank, { backgroundColor: i < 3 ? PURPLE : '#94a3b8' }]}>
                    <Text style={s.rankTxt}>{i + 1}</Text>
                  </View>
                  <View style={s.prodInfo}>
                    <Text style={s.prodNombre} numberOfLines={1}>{p.nombre_producto}</Text>
                    <Text style={s.prodMeta}>{p.categoria}</Text>
                  </View>
                  <View style={s.prodStats}>
                    <Text style={s.prodConsultas}>{p.total_consultas} consultas</Text>
                    {p.ventas > 0 ? (
                      <View style={s.ventasBadge}>
                        <Text style={s.ventasBadgeTxt}>{p.ventas} ✓</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            )}

            <Text style={s.footer}>
              Los datos se actualizan en tiempo real según las negociaciones registradas en la plataforma.
            </Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: PURPLE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.lg,
  },
  headerTitle: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, color: '#FFF' },
  headerSub: { fontSize: FONT.sizes.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: SPACE.lg, paddingBottom: SPACE.xxl },
  kpiRow: { flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.lg },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    borderTopWidth: 3,
    ...SHADOW.sm,
  },
  kpiNum: { fontSize: 28, fontWeight: FONT.weights.bold, color: PURPLE },
  kpiLabel: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold, color: '#374151', marginTop: 2 },
  kpiSub: { fontSize: FONT.sizes.xs, color: '#94a3b8', marginTop: 2 },
  sectionTitle: {
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.bold,
    color: '#1e293b',
    marginBottom: SPACE.md,
    marginTop: SPACE.sm,
  },
  emptyBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: RADIUS.md,
    padding: SPACE.lg,
    alignItems: 'center',
    marginBottom: SPACE.lg,
  },
  emptyTxt: { color: '#94a3b8', fontSize: FONT.sizes.sm },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: '#FFF',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.lg,
    ...SHADOW.sm,
    height: 140,
  },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%' },
  barFill: { width: '70%', borderRadius: 4, minHeight: 6 },
  barValue: { fontSize: 10, fontWeight: '700', color: PURPLE },
  barLabel: { fontSize: 9, color: '#94a3b8', fontWeight: '600', marginTop: 2 },
  prodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    gap: SPACE.sm,
    ...SHADOW.sm,
  },
  rank: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  rankTxt: { color: '#FFF', fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold },
  prodInfo: { flex: 1 },
  prodNombre: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold, color: '#1e293b' },
  prodMeta: { fontSize: FONT.sizes.xs, color: '#94a3b8', marginTop: 2 },
  prodStats: { alignItems: 'flex-end', gap: 4 },
  prodConsultas: { fontSize: FONT.sizes.xs, color: '#64748b' },
  ventasBadge: {
    backgroundColor: '#dcfce7', borderRadius: 99,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  ventasBadgeTxt: { fontSize: FONT.sizes.xs, color: '#16a34a', fontWeight: '700' },
  footer: {
    fontSize: FONT.sizes.xs,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: SPACE.lg,
    lineHeight: 18,
  },
});
