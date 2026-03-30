import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/shared/lib/supabase';
import type { Cosecha } from '@/shared/types';
import { useAuth } from '@/shared/store/AuthContext';
import { useCompany } from '../hooks/useCompany';
import { SolicitarTransporteModal } from '@/shared/components/SolicitarTransporteModal';
import { AsignarPeritoModal } from '../components/AsignarPeritoModal';
import type { CompanyStackParamList } from '../navigation/types';
import { FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const SLATE = '#0F172A';
const GOLD = '#FBBF24';
const CREAM = '#FDFBF7';

type Row = Cosecha & {
  finca?: { nombre: string } | null;
  productor?: { nombre: string } | null;
};

type Nav = NativeStackNavigationProp<CompanyStackParamList>;

function daysSince(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function progressHarvest(c: Cosecha): number {
  const byState: Record<string, number> = {
    borrador: 0.12,
    publicada: 0.38,
    negociando: 0.62,
    vendida: 1,
    cancelada: 0,
  };
  const base = byState[c.estado] ?? 0.25;
  const d = daysSince(c.creado_en);
  const cycle = Math.min(1, d / 130);
  return Math.min(0.98, base * 0.65 + cycle * 0.35);
}

function showProgramarFlete(c: Cosecha): boolean {
  if (c.estado === 'vendida' || c.estado === 'cancelada') return false;
  if (c.estado === 'negociando') return true;
  const fd = new Date(c.fecha_disponible);
  if (Number.isNaN(fd.getTime())) return c.estado === 'publicada';
  const days = (fd.getTime() - Date.now()) / 86400000;
  return days <= 21 || c.estado === 'publicada';
}

export default function ActiveHarvestsList() {
  const navigation = useNavigation<Nav>();
  const { perfil } = useAuth();
  const { company } = useCompany();
  const [rows, setRows] = useState<Row[]>([]);
  const [refresh, setRefresh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [freightOpen, setFreightOpen] = useState(false);
  const [freightPrefill, setFreightPrefill] = useState<{ peso?: string; descripcion?: string } | null>(null);
  const [peritoOpen, setPeritoOpen] = useState(false);
  const [peritoCtx, setPeritoCtx] = useState('');
  const [peritoProductorId, setPeritoProductorId] = useState<string | null>(null);
  const [peritoFincaId, setPeritoFincaId] = useState<string | null>(null);
  const [peritoFecha, setPeritoFecha] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!company?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
    const { data: cf, error: cfErr } = await supabase
      .from('company_farmers')
      .select('producer_id')
      .eq('company_id', company.id)
      .eq('activo', true)
      .limit(500);
    if (cfErr) {
      setRows([]);
      return;
    }
    const ids = (cf ?? []).map((r) => r.producer_id as string);
    if (!ids.length) {
      setRows([]);
      return;
    }
    const { data, error } = await supabase
      .from('active_harvests')
      .select(
        `
        *,
        finca:fincas(nombre),
        productor:perfiles!cosechas_agricultor_id_fkey(nombre)
      `,
      )
      .in('agricultor_id', ids)
      .order('creado_en', { ascending: false })
      .limit(200);
    if (error) {
      const { data: plain, error: plainErr } = await supabase
        .from('active_harvests')
        .select('*')
        .in('agricultor_id', ids)
        .order('creado_en', { ascending: false })
        .limit(200);
      if (plainErr) {
        setRows([]);
      } else {
        setRows((plain as Row[]) ?? []);
      }
    } else {
      setRows((data as Row[]) ?? []);
    }
    } catch (e: unknown) {
      setRows([]);
      console.warn('[ActiveHarvestsList] cargar error:', e instanceof Error ? e.message : e);
    } finally {
      setLoading(false);
    }
  }, [company?.id]);

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

  const abrirPerito = (item: Row) => {
    const fincaNombre = item.finca?.nombre ?? 'Finca';
    const prod = item.productor?.nombre ?? 'Productor';
    setPeritoCtx(`${item.rubro} · ${fincaNombre} · ${prod}`);
    setPeritoProductorId(item.agricultor_id);
    setPeritoFincaId(item.finca_id);
    setPeritoFecha(item.fecha_disponible);
    setPeritoOpen(true);
  };

  const abrirFlete = (item: Row) => {
    const ton = (Number(item.cantidad_kg) / 1000).toFixed(1);
    setFreightPrefill({
      peso: String(Math.round(Number(item.cantidad_kg))),
      descripcion: `Programación cosecha ${item.rubro} · ${item.municipio}, ${item.estado_ve}. Lote financiado · ${ton} t ref.`,
    });
    setFreightOpen(true);
  };

  const headerIntro = useMemo(
    () => (
      <View style={s.intro}>
        <Text style={s.introTitle}>Embudo de materia prima</Text>
        <Text style={s.introSub}>
          Seguimiento de lotes vinculados a tu cartera. Aquí solo gestionas peritaje y transporte externo de la cosecha; la flota propia se administra aparte.
        </Text>
        <TouchableOpacity style={s.linkTrans} onPress={() => navigation.navigate('AffiliatedTransportersList')} activeOpacity={0.88}>
          <Ionicons name="people-circle-outline" size={18} color={GOLD} />
          <Text style={s.linkTransTxt}>Red de transportistas aliados</Text>
          <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
        </TouchableOpacity>
      </View>
    ),
    [navigation],
  );

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={headerIntro}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={SLATE} />}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <Text style={s.empty}>Sin cosechas activas en cartera o ejecuta el SQL de vistas empresa.</Text>
        }
        renderItem={({ item }) => {
          const pct = Math.round(progressHarvest(item) * 100);
          const ton = (Number(item.cantidad_kg) / 1000).toFixed(1);
          const prod = item.productor?.nombre ?? '—';
          const finca = item.finca?.nombre ?? '—';
          return (
            <View style={s.card}>
              <View style={s.cardTop}>
                <View style={s.pillRubro}>
                  <Text style={s.pillRubroTxt}>{item.rubro}</Text>
                </View>
                <Text style={s.estadoTxt}>{item.estado}</Text>
              </View>
              <Text style={s.prodName}>{prod}</Text>
              <Text style={s.fincaName}>
                <Ionicons name="location-outline" size={14} color={GOLD} /> {finca}
              </Text>
              <Text style={s.tonLine}>
                Rendimiento ref. <Text style={s.tonStrong}>{ton} t</Text> · {item.municipio}
              </Text>
              <View style={s.progressBlock}>
                <View style={s.progressLabels}>
                  <Text style={s.progressLab}>Avance estimado</Text>
                  <Text style={s.progressPct}>{pct}%</Text>
                </View>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${pct}%` }]} />
                </View>
                <Text style={s.progressHint}>
                  Referencia visual según estado actual y días transcurridos · Disponible {item.fecha_disponible}
                </Text>
              </View>
              <View style={s.actions}>
                <TouchableOpacity style={s.btnSecondary} onPress={() => abrirPerito(item)} activeOpacity={0.88}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={GOLD} />
                  <Text style={s.btnSecondaryTxt}>Coordinar perito</Text>
                </TouchableOpacity>
                {showProgramarFlete(item) ? (
                  <TouchableOpacity style={s.btnPrimary} onPress={() => abrirFlete(item)} activeOpacity={0.88}>
                    <Ionicons name="bus-outline" size={18} color={SLATE} />
                    <Text style={s.btnPrimaryTxt}>Transporte externo</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        }}
      />
      <SolicitarTransporteModal
        visible={freightOpen}
        onClose={() => {
          setFreightOpen(false);
          setFreightPrefill(null);
        }}
        perfil={perfil ?? null}
        initialPrefill={freightPrefill}
        initialMode="pizarra"
        lockMode
        title="Solicitar transporte externo"
      />
      {company?.id && peritoProductorId ? (
        <AsignarPeritoModal
          visible={peritoOpen}
          onClose={() => {
            setPeritoOpen(false);
            setPeritoProductorId(null);
            setPeritoFincaId(null);
            setPeritoFecha(null);
          }}
          companyId={company.id}
          productorId={peritoProductorId}
          fincaId={peritoFincaId}
          fechaProgramada={peritoFecha}
          contexto={peritoCtx}
          inspectionType="estimacion_precosecha"
          onCreated={() => void cargar()}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM },
  list: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  intro: { marginBottom: SPACE.lg },
  introTitle: {
    fontSize: FONT.sizes.lg,
    fontWeight: FONT.weights.heavy,
    color: SLATE,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  introSub: { marginTop: 8, fontSize: FONT.sizes.sm, color: '#64748b', lineHeight: 20, fontWeight: '600' },
  linkTrans: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: SLATE,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
  },
  linkTransTxt: { flex: 1, color: '#e2e8f0', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: SPACE.xl, lineHeight: 20 },
  card: {
    backgroundColor: SLATE,
    borderRadius: 24,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    ...SHADOW.md,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pillRubro: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  pillRubroTxt: { color: GOLD, fontWeight: FONT.weights.heavy, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  estadoTxt: { fontSize: 10, color: '#94a3b8', fontWeight: FONT.weights.bold, textTransform: 'uppercase' },
  prodName: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.heavy, color: '#fff' },
  fincaName: { marginTop: 6, fontSize: FONT.sizes.sm, color: '#cbd5e1', fontWeight: '600' },
  tonLine: { marginTop: 8, fontSize: FONT.sizes.sm, color: '#94a3b8' },
  tonStrong: { color: GOLD, fontWeight: FONT.weights.bold },
  progressBlock: { marginTop: 16 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLab: { fontSize: 9, color: '#94a3b8', fontWeight: FONT.weights.bold, letterSpacing: 1, textTransform: 'uppercase' },
  progressPct: { fontSize: 12, fontWeight: FONT.weights.heavy, color: GOLD },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: GOLD,
    maxWidth: '100%',
  },
  progressHint: { marginTop: 8, fontSize: 10, color: '#64748b', fontStyle: 'italic' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.45)',
    backgroundColor: 'transparent',
  },
  btnSecondaryTxt: { color: GOLD, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    backgroundColor: GOLD,
  },
  btnPrimaryTxt: { color: SLATE, fontWeight: FONT.weights.heavy, fontSize: FONT.sizes.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
});
