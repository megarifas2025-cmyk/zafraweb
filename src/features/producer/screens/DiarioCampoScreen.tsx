import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/shared/store/AuthContext';
import { supabase } from '@/shared/lib/supabase';
import {
  guardarDiarioLocal,
  eliminarDiarioLocal,
  listarDiarioLocal,
  useOfflineSync,
  randomUuidV4,
  type FieldLogTipoDb,
} from '@/hooks/useOfflineSync';
import { weatherService } from '@/shared/services/weatherService';
import { SmartWeatherAlertModal } from '@/shared/components/SmartWeatherAlertModal';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import { normalizeFincaCoordenadas } from '@/shared/utils/geo';

type FincaChip = { id: string; nombre: string; coordenadas: { lat: number; lng: number } | null };

const OPCIONES: { key: string; label: string; evento: FieldLogTipoDb }[] = [
  { key: 'siembra', label: 'Siembra', evento: 'SIEMBRA' },
  { key: 'quimica', label: 'Aplicación química', evento: 'APLICACION_QUIMICA' },
  { key: 'fertilizacion', label: 'Fertilización', evento: 'FERTILIZACION' },
  { key: 'cosecha', label: 'Cosecha', evento: 'OTRO' },
  { key: 'riego', label: 'Riego', evento: 'OTRO' },
  { key: 'otro', label: 'Otro', evento: 'OTRO' },
];

function eventoDeKey(key: string): FieldLogTipoDb {
  return OPCIONES.find(o => o.key === key)?.evento ?? 'OTRO';
}

function labelDeKey(key: string): string {
  return OPCIONES.find(o => o.key === key)?.label ?? 'Otro';
}

function riesgoLavado(evento: FieldLogTipoDb): boolean {
  return evento === 'APLICACION_QUIMICA' || evento === 'FERTILIZACION';
}

type SavePayload = {
  id: string;
  finca_id: string;
  autor_id: string;
  fecha: string;
  tipo: string;
  tipo_evento: FieldLogTipoDb;
  descripcion?: string;
};

export default function DiarioCampoScreen() {
  const { intentarSync } = useOfflineSync();
  const nav = useNavigation();
  const { perfil } = useAuth();
  const [fincas, setFincas] = useState<FincaChip[]>([]);
  const [fincasLoading, setFincasLoading] = useState(true);
  const [fincaId, setFincaId] = useState('');
  const [tipoKey, setTipoKey] = useState('otro');
  const [descripcion, setDescripcion] = useState('');
  const [entradas, setEntradas] = useState<ReturnType<typeof listarDiarioLocal>>([]);
  const [refresh, setRefresh] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [weatherMm, setWeatherMm] = useState(0);
  const [saving, setSaving] = useState(false);
  const pendingSave = useRef<SavePayload | null>(null);

  const recargar = useCallback(() => {
    if (!perfil) return;
    setEntradas(listarDiarioLocal(perfil.id));
  }, [perfil]);

  const cargarFincas = useCallback(async () => {
    if (!perfil) { setFincasLoading(false); return; }
    setFincasLoading(true);
    const { data, error: fincasErr } = await supabase
      .from('fincas')
      .select('id,nombre,coordenadas')
      .eq('propietario_id', perfil.id);
    setFincasLoading(false);
    if (fincasErr) {
      Alert.alert('Error', 'No se pudieron cargar tus fincas. Verifica la conexión e intenta de nuevo.');
      return;
    }
    const raw = (data as { id: string; nombre: string; coordenadas: unknown }[]) ?? [];
    const list: FincaChip[] = raw.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      coordenadas: normalizeFincaCoordenadas(row.coordenadas),
    }));
    setFincas(list);
    if (list.length === 0) setFincaId('');
    else setFincaId((prev) => (prev && list.some((x) => x.id === prev) ? prev : list[0].id));
  }, [perfil]);

  useFocusEffect(
    useCallback(() => {
      cargarFincas();
      recargar();
    }, [cargarFincas, recargar]),
  );

  const onRefresh = async () => {
    setRefresh(true);
    await cargarFincas();
    recargar();
    setRefresh(false);
  };

  function commitSave(payload: SavePayload) {
    guardarDiarioLocal({
      id: payload.id,
      finca_id: payload.finca_id,
      autor_id: payload.autor_id,
      fecha: payload.fecha,
      tipo: payload.tipo,
      tipo_evento: payload.tipo_evento,
      descripcion: payload.descripcion,
    });
    void intentarSync();
    setDescripcion('');
    recargar();
    Alert.alert('Guardado', 'Entrada en tu dispositivo; se subirá cuando haya señal.');
  }

  function confirmarEliminacion(entryId: string) {
    Alert.alert('Eliminar entrada', 'Esta entrada se quitará del dispositivo y de la cola pendiente si aún no ha sincronizado.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          eliminarDiarioLocal(entryId);
          recargar();
        },
      },
    ]);
  }

  async function guardar() {
    if (!perfil) return;
    if (!fincaId) {
      Alert.alert('Finca', 'Selecciona una finca o créala en «Mis fincas».');
      return;
    }
    const ev = eventoDeKey(tipoKey);
    const fecha = new Date().toISOString().slice(0, 10);
    const payload: SavePayload = {
      id: randomUuidV4(),
      finca_id: fincaId,
      autor_id: perfil.id,
      fecha,
      tipo: labelDeKey(tipoKey),
      tipo_evento: ev,
      descripcion: descripcion.trim() || undefined,
    };

    if (!riesgoLavado(ev)) {
      commitSave(payload);
      return;
    }

    const finca = fincas.find(f => f.id === fincaId);
    const c = finca?.coordenadas;
    if (!c) {
      commitSave(payload);
      return;
    }

    setSaving(true);
    try {
      const { alerta, mm, sinApi } = await weatherService.riesgoLavadoPluvial(c.lat, c.lng);
      if (sinApi || !alerta) {
        commitSave(payload);
        return;
      }
      pendingSave.current = payload;
      setWeatherMm(mm);
      setWeatherOpen(true);
    } catch {
      // Si el servicio de clima falla, guardamos igualmente sin alerta
      commitSave(payload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      <SmartWeatherAlertModal
        visible={weatherOpen}
        mm={weatherMm}
        onCancel={() => {
          setWeatherOpen(false);
          pendingSave.current = null;
        }}
        onContinueAnyway={() => {
          setWeatherOpen(false);
          const p = pendingSave.current;
          pendingSave.current = null;
          if (p) commitSave(p);
        }}
      />

      <TouchableOpacity style={styles.back} onPress={() => nav.goBack()}>
        <Text style={styles.backTxt}>← Volver al panel</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nueva entrada (bitácora)</Text>
        <Text style={styles.syncHint}>Se guarda offline y sincroniza a field_logs con señal.</Text>
        <Text style={styles.label}>Finca</Text>
        {fincasLoading ? (
          <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 6 }} />
        ) : fincas.length === 0 ? (
          <Text style={styles.emptyFinca}>No hay fincas. Créalas en «Mis fincas».</Text>
        ) : (
          <View style={styles.chips}>
            {fincas.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.chip, fincaId === f.id && styles.chipOn]}
                onPress={() => setFincaId(f.id)}
              >
                <Text style={[styles.chipTxt, fincaId === f.id && styles.chipTxtOn]} numberOfLines={1}>
                  {f.nombre}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Text style={styles.label}>Tipo</Text>
        <View style={styles.chips}>
          {OPCIONES.map(o => (
            <TouchableOpacity
              key={o.key}
              style={[styles.chip, tipoKey === o.key && styles.chipOn]}
              onPress={() => setTipoKey(o.key)}
            >
              <Text style={[styles.chipTxt, tipoKey === o.key && styles.chipTxtOn]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Descripción</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder="Qué hiciste, observaciones…"
          placeholderTextColor={COLORS.textDisabled}
          multiline
        />
        <TouchableOpacity style={styles.btnPri} onPress={guardar} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.btnPriTxt}>Guardar en diario local</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.sec}>Historial ({entradas.length})</Text>
      {entradas.length === 0 ? (
        <Text style={styles.empty}>Sin entradas todavía.</Text>
      ) : (
        entradas.map(e => (
          <View key={e.id} style={styles.item}>
            <View style={styles.itemHead}>
              <Text style={styles.itemTipo}>
                {e.tipo} · {e.fecha}
                {e.sincronizado ? ' · ☁️' : ' · 📴'}
              </Text>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmarEliminacion(e.id)}>
                <Text style={styles.deleteTxt}>Eliminar</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.itemFinca}>{fincas.find(f => f.id === e.finca_id)?.nombre ?? e.finca_id.slice(0, 8)}</Text>
            {e.descripcion ? <Text style={styles.itemDesc}>{e.descripcion}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  back: { marginBottom: SPACE.sm },
  backTxt: { color: COLORS.primary, fontWeight: '600', fontSize: FONT.sizes.sm },
  card: { backgroundColor: COLORS.surface, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.lg, ...SHADOW.sm },
  cardTitle: { fontSize: FONT.sizes.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACE.xs },
  syncHint: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginBottom: SPACE.sm },
  label: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: SPACE.sm, marginBottom: 4 },
  emptyFinca: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACE.xs },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACE.sm, fontSize: FONT.sizes.md, color: COLORS.text },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  chipOn: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  chipTxt: { fontSize: FONT.sizes.xs, color: COLORS.text },
  chipTxtOn: { fontWeight: '700', color: COLORS.primary },
  btnPri: { backgroundColor: COLORS.primary, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACE.md },
  btnPriTxt: { color: '#FFF', fontWeight: '700' },
  sec: { fontSize: FONT.sizes.md, fontWeight: '700', color: COLORS.text, marginBottom: SPACE.sm },
  empty: { color: COLORS.textDisabled },
  item: { backgroundColor: COLORS.surface, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm },
  itemTipo: { fontWeight: '700', color: COLORS.text },
  deleteBtn: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    backgroundColor: '#FEF2F2',
  },
  deleteTxt: { color: COLORS.danger, fontSize: FONT.sizes.xs, fontWeight: '700' },
  itemFinca: { fontSize: FONT.sizes.xs, color: COLORS.primary, marginTop: 2 },
  itemDesc: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 6 },
});
