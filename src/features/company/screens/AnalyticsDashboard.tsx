import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, TouchableOpacity, Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PieChart, BarChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/shared/lib/supabase';
import { useCompany } from '../hooks/useCompany';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const CHART_COLORS = ['#1B4332', '#40916C', '#74C69D', '#95D5B2', '#D8F3DC', '#52B788'];

export default function AnalyticsDashboard() {
  const { company, loading: loadingCo } = useCompany();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inspByStatus, setInspByStatus] = useState<{ name: string; count: number }[]>([]);
  const [harvestByRubro, setHarvestByRubro] = useState<{ rubro: string; count: number }[]>([]);

  const chartW = Math.min(Dimensions.get('window').width - SPACE.md * 2, 360);

  const cargar = useCallback(async () => {
    if (!company?.id) {
      setInspByStatus([]);
      setHarvestByRubro([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
    const { data: inspections, error: inspErr } = await supabase
      .from('field_inspections')
      .select('estatus')
      .eq('empresa_id', company.id)
      .limit(500);
    if (inspErr) {
      setErrorMsg('No se pudieron cargar los datos de inspecciones.');
      return;
    }

    const mapInsp = new Map<string, number>();
    for (const row of inspections ?? []) {
      const st = String((row as { estatus: string }).estatus ?? '—');
      mapInsp.set(st, (mapInsp.get(st) ?? 0) + 1);
    }
    setInspByStatus(
      [...mapInsp.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    );

    const { data: cf, error: cfErr } = await supabase
      .from('company_farmers')
      .select('producer_id')
      .eq('company_id', company.id)
      .eq('activo', true)
      .limit(500);
    if (cfErr) {
      setErrorMsg('No se pudieron cargar los productores afiliados.');
      return;
    }
    const producerIds = (cf ?? []).map((r) => r.producer_id as string);
    if (producerIds.length === 0) {
      setHarvestByRubro([]);
      return;
    }
    const { data: harvests, error: harvErr } = await supabase
      .from('active_harvests')
      .select('rubro')
      .in('agricultor_id', producerIds)
      .limit(500);
    if (harvErr) {
      setErrorMsg('No se pudieron cargar las cosechas activas.');
      return;
    }
    const mapH = new Map<string, number>();
    for (const row of harvests ?? []) {
      const rubro = String((row as { rubro: string }).rubro ?? '—');
      mapH.set(rubro, (mapH.get(rubro) ?? 0) + 1);
    }
    setHarvestByRubro(
      [...mapH.entries()].map(([rubro, count]) => ({ rubro, count })).sort((a, b) => b.count - a.count),
    );
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al cargar analíticas.');
    } finally {
      setLoading(false);
    }
  }, [company?.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const exportarCSV = useCallback(async () => {
    if (!inspByStatus.length && !harvestByRubro.length) {
      Alert.alert('Sin datos', 'No hay datos para exportar en este momento.'); return;
    }
    try {
      const lines: string[] = [];
      lines.push('REPORTE ANALÍTICAS — ZafraClic');
      lines.push(`Empresa: ${company?.razon_social ?? 'N/A'}`);
      lines.push(`Fecha: ${new Date().toLocaleDateString('es-VE')}`);
      lines.push('');
      lines.push('=== Inspecciones por estado ===');
      lines.push('Estado,Cantidad');
      inspByStatus.forEach(r => lines.push(`"${r.name}",${r.count}`));
      lines.push('');
      lines.push('=== Cosechas por rubro ===');
      lines.push('Rubro,Cantidad');
      harvestByRubro.forEach(r => lines.push(`"${r.rubro}",${r.count}`));

      const csv = lines.join('\n');
      const fileName = `zafraclic_analiticas_${new Date().toISOString().slice(0, 10)}.csv`;
      const file = new File(Paths.cache, fileName);
      file.write(csv);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Exportar CSV' });
      } else {
        Alert.alert('Exportado', `Archivo guardado en: ${file.uri}`);
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo exportar.');
    }
  }, [inspByStatus, harvestByRubro, company?.razon_social]);

  const chartConfig = {
    backgroundGradientFrom: COLORS.surface,
    backgroundGradientTo: COLORS.surface,
    color: (opacity = 1) => `rgba(27, 67, 50, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    decimalPlaces: 0,
  };

  if (loadingCo || loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (!company) {
    return (
      <View style={s.center}>
        <Text style={s.muted}>No se encontró la empresa.</Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={s.center}>
        <Text style={s.errorTxt}>{errorMsg}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => void cargar()} activeOpacity={0.88}>
          <Text style={s.retryTxt}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pieData =
    inspByStatus.length > 0
      ? inspByStatus.map((x, i) => ({
          name: x.name,
          population: x.count,
          color: CHART_COLORS[i % CHART_COLORS.length]!,
          legendFontColor: '#333',
          legendFontSize: 12,
        }))
      : [];

  const barData = {
    labels: harvestByRubro.map((x) => (x.rubro.length > 10 ? `${x.rubro.slice(0, 9)}…` : x.rubro)),
    datasets: [{ data: harvestByRubro.map((x) => x.count) }],
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll}>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Reportes y estadísticas</Text>
          <Text style={s.sub}>Inspecciones de campo y cosechas activas de tu cartera (datos reales).</Text>
        </View>
        <TouchableOpacity style={s.exportBtn} onPress={() => void exportarCSV()} activeOpacity={0.88}>
          <Ionicons name="download-outline" size={16} color="#FFF" />
          <Text style={s.exportTxt}>CSV</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.sec}>Inspecciones por estatus</Text>
      <View style={s.card}>
        {pieData.length === 0 ? (
          <Text style={s.muted}>Sin registros en field_inspections para esta empresa.</Text>
        ) : (
          <PieChart
            data={pieData}
            width={chartW}
            height={200}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="0"
            absolute
          />
        )}
      </View>

      <Text style={s.sec}>Cosechas activas por rubro</Text>
      <View style={s.card}>
        {harvestByRubro.length === 0 ? (
          <Text style={s.muted}>Sin cosechas activas vinculadas a productores de la empresa.</Text>
        ) : (
          <BarChart
            data={barData}
            width={chartW}
            height={260}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={chartConfig}
            verticalLabelRotation={30}
            fromZero
            style={{ borderRadius: RADIUS.md }}
          />
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  title: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, color: COLORS.text },
  sub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: SPACE.sm, lineHeight: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: SPACE.md },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, paddingHorizontal: SPACE.md, paddingVertical: 10,
    borderRadius: RADIUS.sm, marginTop: 4, ...SHADOW.sm,
  },
  exportTxt: { color: '#FFF', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  sec: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold, color: COLORS.text, marginTop: SPACE.lg },
  card: {
    marginTop: SPACE.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    alignItems: 'center',
    ...SHADOW.sm,
  },
  muted: { color: COLORS.textDisabled, fontSize: FONT.sizes.sm, textAlign: 'center', padding: SPACE.md },
  errorTxt: { color: COLORS.danger, fontSize: FONT.sizes.sm, textAlign: 'center', padding: SPACE.md },
  retryBtn: {
    marginTop: SPACE.sm,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACE.md,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
  },
  retryTxt: { color: '#FFF', fontWeight: FONT.weights.bold },
});
