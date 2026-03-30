import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import * as Location from 'expo-location';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/shared/store/AuthContext';
import { MachineryNegotiationModal } from '@/features/producer/components/MachineryNegotiationModal';
import {
  listarMaquinariaDisponible,
  listarMiMaquinaria,
  publicarMaquinaria,
  textoRangoDisponibilidad,
  ordenarFiltrarPorCercania,
  mensajeErrorMaquinaria,
  type MachineryRentalRow,
  type MachineryTipo,
} from '@/shared/services/machineryService';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const TIPOS: MachineryTipo[] = ['Tractor', 'Cosechadora', 'Rastra', 'Sembradora', 'Otro'];

const TIPO_LABEL = (t: MachineryTipo) => t;
const RADIO_CERCANO_KM = 100;
const LOCATION_TIMEOUT_MS = 3_000;

async function withTimeout<T>(promise: PromiseLike<T>, fallback: T, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function MaquinariaScreen() {
  const nav = useNavigation();
  const { perfil } = useAuth();
  const [tab, setTab] = useState<'explorar' | 'publicar' | 'mias'>('explorar');
  const [lista, setLista] = useState<MachineryRentalRow[]>([]);
  const [mis, setMis] = useState<MachineryRentalRow[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<MachineryTipo | 'todas'>('todas');
  const [carg, setCarg] = useState(false);
  const [refresh, setRefresh] = useState(false);

  const [pubTipo, setPubTipo] = useState<MachineryTipo>('Tractor');
  const [pubMarca, setPubMarca] = useState('');
  const [pubIni, setPubIni] = useState(() => new Date().toISOString().slice(0, 10));
  const [pubFin, setPubFin] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [pubBusy, setPubBusy] = useState(false);
  const [soloCercanos, setSoloCercanos] = useState(false);
  const [miUbicacion, setMiUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [negotiationItem, setNegotiationItem] = useState<MachineryRentalRow | null>(null);

  const cargar = useCallback(async () => {
    if (!perfil?.id) return;
    setCarg(true);
    try {
      const [all, m] = await Promise.all([listarMaquinariaDisponible(), listarMiMaquinaria(perfil.id)]);
      setLista(all);
      setMis(m);
    } catch (e: unknown) {
      Alert.alert('Maquinaria', mensajeErrorMaquinaria(e));
    } finally {
      setCarg(false);
    }
  }, [perfil?.id]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const onRefresh = async () => {
    setRefresh(true);
    await cargar();
    setRefresh(false);
  };

  async function publicar() {
    if (!perfil?.id) return;
    if (!pubMarca.trim()) {
      Alert.alert('Datos', 'Marca/modelo es obligatorio.');
      return;
    }
    setPubBusy(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await withTimeout(
            Location.getCurrentPositionAsync({}),
            null as Awaited<ReturnType<typeof Location.getCurrentPositionAsync>> | null,
            LOCATION_TIMEOUT_MS,
          );
          if (loc) {
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
          }
        }
      } catch {
        // La publicación debe seguir aunque el GPS del dispositivo no responda.
      }
      await publicarMaquinaria({
        ownerId: perfil.id,
        tipo: pubTipo,
        marcaModelo: pubMarca,
        inicio: pubIni,
        fin: pubFin,
        lat,
        lng,
      });
      Alert.alert('Listo', 'Tu equipo quedó publicado como disponible.');
      setPubMarca('');
      setTab('mias');
      await cargar();
    } catch (e: unknown) {
      Alert.alert('Error', mensajeErrorMaquinaria(e));
    } finally {
      setPubBusy(false);
    }
  }

  async function activarFiltroCercano() {
    if (soloCercanos) {
      setSoloCercanos(false);
      setMiUbicacion(null);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ubicación', 'Activa el permiso para ordenar equipos cercanos.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setMiUbicacion({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    setSoloCercanos(true);
  }

  const filasVista = useMemo(() => {
    const mostrar = tab === 'explorar' ? lista : mis;
    let base = filtroTipo === 'todas' ? mostrar : mostrar.filter(r => r.tipo_maquina === filtroTipo);
    if (tab !== 'explorar' || !soloCercanos || !miUbicacion) {
      return base.map(row => ({ row, km: undefined as number | undefined }));
    }
    return ordenarFiltrarPorCercania(base, miUbicacion, RADIO_CERCANO_KM).map(({ row, km }) => ({ row, km }));
  }, [tab, lista, mis, filtroTipo, soloCercanos, miUbicacion]);

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.scroll}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      <TouchableOpacity style={s.back} onPress={() => nav.goBack()}>
        <Text style={s.backTxt}>← Volver</Text>
      </TouchableOpacity>

      <View style={s.tabs}>
        {(['explorar', 'publicar', 'mias'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabOn]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab === t && s.tabTxtOn]}>
              {t === 'explorar' ? 'Buscar' : t === 'publicar' ? 'Publicar' : 'Mis anuncios'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab !== 'publicar' ? (
        <>
          <Text style={s.label}>Filtrar tipo</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.h}>
            <TouchableOpacity
              style={[s.chip, filtroTipo === 'todas' && s.chipOn]}
              onPress={() => setFiltroTipo('todas')}
            >
              <Text style={[s.chipTxt, filtroTipo === 'todas' && s.chipTxtOn]}>Todas</Text>
            </TouchableOpacity>
            {TIPOS.map(t => (
              <TouchableOpacity
                key={t}
                style={[s.chip, filtroTipo === t && s.chipOn]}
                onPress={() => setFiltroTipo(t)}
              >
                <Text style={[s.chipTxt, filtroTipo === t && s.chipTxtOn]}>{TIPO_LABEL(t)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {tab === 'explorar' ? (
            <TouchableOpacity
              style={[s.cercanosChip, soloCercanos && s.chipOn]}
              onPress={() => void activarFiltroCercano()}
            >
              <Text style={[s.chipTxt, soloCercanos && s.chipTxtOn]}>
                📍 Cercanos (~{RADIO_CERCANO_KM} km)
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}

      {carg && lista.length === 0 && mis.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={COLORS.primary} />
      ) : null}

      {tab === 'publicar' ? (
        <View style={s.card}>
          <Text style={s.cardTit}>Publicar equipo disponible</Text>
          <Text style={s.hint}>
            Solo productores verificados pueden publicar y ver este panel. No se muestran precios públicos: toda negociación se hace en privado.
          </Text>
          <Text style={s.label}>Tipo</Text>
          <View style={s.chipRow}>
            {TIPOS.map(t => (
              <TouchableOpacity key={t} style={[s.chip, pubTipo === t && s.chipOn]} onPress={() => setPubTipo(t)}>
                <Text style={[s.chipTxt, pubTipo === t && s.chipTxtOn]} numberOfLines={1}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.label}>Marca / modelo</Text>
          <TextInput
            style={s.input}
            value={pubMarca}
            onChangeText={setPubMarca}
            placeholder="Ej. John Deere 5075E"
            placeholderTextColor={COLORS.textDisabled}
          />
          <Text style={s.label}>Disponible desde (AAAA-MM-DD)</Text>
          <TextInput style={s.input} value={pubIni} onChangeText={setPubIni} placeholderTextColor={COLORS.textDisabled} />
          <Text style={s.label}>Disponible hasta</Text>
          <TextInput style={s.input} value={pubFin} onChangeText={setPubFin} placeholderTextColor={COLORS.textDisabled} />
          <TouchableOpacity style={s.btn} onPress={publicar} disabled={pubBusy}>
            {pubBusy ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnTxt}>Publicar disponibilidad</Text>}
          </TouchableOpacity>
        </View>
      ) : filasVista.length === 0 ? (
        <Text style={s.empty}>{tab === 'mias' ? 'No tienes anuncios.' : 'No hay equipos con ese filtro.'}</Text>
      ) : (
        filasVista.map(({ row, km }) => (
          <View key={row.id} style={s.card}>
            <Text style={s.rowTit}>
              {TIPO_LABEL(row.tipo_maquina)} · {row.marca_modelo}
            </Text>
            <Text style={s.rowSub}>
              {textoRangoDisponibilidad(row)} · {row.estatus}
            </Text>
            {km != null ? <Text style={s.dist}>≈ {km.toFixed(0)} km</Text> : null}
            {tab === 'explorar' ? (
              <>
                <Text style={s.rowHint}>
                  Publicar con GPS permite que otros te encuentren en «Cercanos». Las condiciones se acuerdan por chat privado.
                </Text>
                {row.owner_id !== perfil?.id ? (
                  <TouchableOpacity
                    style={s.privateBtn}
                    onPress={() => setNegotiationItem(row)}
                    activeOpacity={0.9}
                  >
                    <Text style={s.privateBtnTxt}>Negociar en privado</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={s.mineHint}>Este equipo es tuyo.</Text>
                )}
              </>
            ) : null}
          </View>
        ))
      )}
      <MachineryNegotiationModal
        visible={negotiationItem != null}
        perfil={perfil ?? null}
        listing={negotiationItem}
        onClose={() => setNegotiationItem(null)}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  back: { marginBottom: SPACE.sm },
  backTxt: { color: COLORS.primary, fontWeight: '600', fontSize: FONT.sizes.sm },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: SPACE.md },
  tab: { flex: 1, padding: SPACE.sm, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  tabOn: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  tabTxt: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary },
  tabTxtOn: { fontWeight: '700', color: COLORS.primary },
  label: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: SPACE.sm, marginBottom: 4 },
  h: { marginBottom: SPACE.sm },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, marginRight: 6, backgroundColor: COLORS.surface },
  chipOn: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  chipTxt: { fontSize: FONT.sizes.xs, color: COLORS.text },
  chipTxtOn: { fontWeight: '700', color: COLORS.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  cardTit: { fontSize: FONT.sizes.md, fontWeight: '700', color: COLORS.text, marginBottom: SPACE.xs },
  hint: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginBottom: SPACE.sm, lineHeight: 18 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACE.sm, fontSize: FONT.sizes.md, color: COLORS.text, marginTop: 4 },
  btn: { backgroundColor: COLORS.primary, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACE.md },
  btnTxt: { color: '#FFF', fontWeight: '700' },
  empty: { color: COLORS.textDisabled, marginTop: SPACE.md },
  rowTit: { fontWeight: '700', color: COLORS.text, fontSize: FONT.sizes.sm },
  rowSub: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: 4 },
  dist: { fontSize: FONT.sizes.sm, fontWeight: '700', color: COLORS.primary, marginTop: 4 },
  cercanosChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginBottom: SPACE.sm,
  },
  rowHint: { fontSize: FONT.sizes.xs, color: COLORS.primary, marginTop: 6 },
  mineHint: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: 8 },
  privateBtn: {
    marginTop: SPACE.sm,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  privateBtnTxt: { color: '#FFF', fontWeight: '700', fontSize: FONT.sizes.sm },
});
