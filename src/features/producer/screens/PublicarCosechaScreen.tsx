import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { PostgrestError } from '@supabase/supabase-js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import type { ProducerStackParamList } from '@/features/producer/navigation/types';
import { useAuth } from '@/shared/store/AuthContext';
import { getRestrictedActionMessage } from '@/shared/lib/accountStatus';
import { supabase } from '@/shared/lib/supabase';
import { trackUiEvent } from '@/shared/runtime/uiEventTracker';
import { storageService } from '@/shared/services/storageService';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import { COLORS, FONT, SPACE, RADIUS } from '@/shared/utils/theme';

type FincaOption = {
  id: string;
  nombre: string;
};

type FincasLoadResult = {
  data: FincaOption[];
  error: PostgrestError | null;
  timedOut: boolean;
};

const FINCAS_LOAD_MS = 4_000;

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

export default function PublicarCosechaScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<ProducerStackParamList, 'PublicarCosecha'>>();
  const { perfil } = useAuth();
  const insets = useSafeAreaInsets();
  const [fincas, setFincas] = useState<FincaOption[]>([]);
  const [fincaId, setFincaId] = useState<string>('');
  const [rubro, setRubro] = useState('');
  const [kg, setKg] = useState('');
  const [municipio, setMunicipio] = useState(perfil?.municipio ?? '');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [listaCarg, setListaCarg] = useState(true);
  const [fincasLoadIssue, setFincasLoadIssue] = useState<string | null>(null);

  function isValidIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  const elegirFoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso', 'Necesitamos acceso a tu galería para adjuntar fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setFotoUri(result.assets[0].uri);
    }
  };

  const cargarFincas = useCallback(async () => {
    if (!perfil) {
      setFincas([]);
      setFincaId('');
      setListaCarg(false);
      setFincasLoadIssue(null);
      return;
    }
    setListaCarg(true);
    setFincasLoadIssue(null);
    const result = await withTimeout(
      supabase
        .from('fincas')
        .select('id, nombre')
        .eq('propietario_id', perfil.id)
        .eq('activa', true)
        .then(({ data, error }) => ({ data: (data as FincaOption[] | null) ?? [], error, timedOut: false })),
      { data: [] as FincaOption[], error: null as PostgrestError | null, timedOut: true } as FincasLoadResult,
      FINCAS_LOAD_MS,
    ) as FincasLoadResult;
    if (result.error) {
      Alert.alert('Error', result.error.message);
      setFincas([]);
      setFincasLoadIssue('No pudimos cargar tus fincas en este momento.');
    } else if (result.timedOut) {
      setFincas([]);
      setFincasLoadIssue('La carga de fincas está tardando más de lo normal. Desliza para reintentar o vuelve en unos segundos.');
    } else {
      setFincas(result.data);
      if (result.data.length === 1) setFincaId(result.data[0].id);
    }
    setListaCarg(false);
  }, [perfil]);

  useEffect(() => {
    cargarFincas();
  }, [cargarFincas]);

  useEffect(() => {
    const p = route.params;
    if (!p) return;
    if (p.kgPrefill) setKg(p.kgPrefill);
    if (p.notaProyeccion) {
      setDescripcion(prev => (prev.trim() ? `${prev.trim()}\n\n${p.notaProyeccion}` : p.notaProyeccion!));
    }
  }, [route.params]);

  async function publicar(estado: 'borrador' | 'publicada') {
    if (!perfil) return;
    if (estado === 'publicada') {
      const restriction = getRestrictedActionMessage(perfil);
      if (restriction) {
        Alert.alert('Cuenta', restriction);
        return;
      }
    }
    if (!fincaId) {
      Alert.alert('Finca', 'Selecciona una finca o crea una en «Mis fincas».');
      return;
    }
    if (!rubro.trim() || !kg.trim() || !municipio.trim()) {
      Alert.alert('Datos', 'Completa rubro, cantidad (kg) y municipio.');
      return;
    }
    const cant = Number.parseFloat(kg.replace(',', '.'));
    if (!Number.isFinite(cant) || cant <= 0) {
      Alert.alert('Cantidad', 'Introduce kg válidos.');
      return;
    }
    if (!isValidIsoDate(fecha)) {
      Alert.alert('Fecha', 'Usa una fecha valida en formato AAAA-MM-DD.');
      return;
    }
    setCargando(true);
    try {
      const { data: inserted, error } = await supabase
        .from('cosechas')
        .insert({
          agricultor_id: perfil.id,
          finca_id: fincaId,
          rubro: rubro.trim(),
          cantidad_kg: cant,
          condicion: 'Cosecha de Campo',
          fecha_disponible: fecha,
          estado,
          estado_ve: perfil.estado_ve,
          municipio: municipio.trim(),
          descripcion: descripcion.trim() || null,
          ubicacion_estado: perfil.estado_ve,
        })
        .select('id')
        .single();
      if (error) throw error;

      // Subir foto si el usuario seleccionó una
      let photoUploadWarning = false;
      if (fotoUri && inserted?.id) {
        try {
          const fotoUrl = await storageService.subirCosechaFoto(perfil.id, inserted.id as string, fotoUri);
          const { error: fotoErr } = await supabase.from('cosechas').update({ foto_url: fotoUrl }).eq('id', inserted.id);
          if (fotoErr) throw fotoErr;
        } catch {
          photoUploadWarning = true;
        }
      }

      trackUiEvent({
        eventType: 'submit',
        eventName: estado === 'publicada' ? 'harvest_published' : 'harvest_draft_saved',
        screen: 'PublicarCosecha',
        module: 'mercado',
        targetType: 'cosecha',
        targetId: inserted?.id ?? null,
        status: 'success',
        metadata: {
          finca_id: fincaId,
          rubro: rubro.trim(),
          cantidad_kg: cant,
        },
      });

      Alert.alert(
        'Listo',
        estado === 'publicada'
          ? photoUploadWarning
            ? 'Cosecha publicada en el mercado. La foto no se pudo adjuntar esta vez.'
            : 'Cosecha publicada en el mercado.'
          : photoUploadWarning
            ? 'Borrador guardado. La foto no se pudo adjuntar esta vez.'
            : 'Borrador guardado.',
        [
        { text: 'OK', onPress: () => nav.goBack() },
        ],
      );
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'code' in e
          ? `${mensajeSupabaseConPista(e as PostgrestError)}\n\nRevisa permisos de la cuenta, estado KYC y políticas RLS antes de intentar de nuevo.`
          : e instanceof Error
            ? e.message
            : 'No se pudo guardar la cosecha. Revisa tu conexión e inténtalo de nuevo.';
      Alert.alert('Error', msg);
    } finally {
      setCargando(false);
    }
  }

  if (listaCarg) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, SPACE.md) }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>Finca</Text>
      {fincas.length === 0 ? (
        <Text style={styles.hint}>{fincasLoadIssue ?? 'No tienes fincas. Ve a «Mis fincas» y registra una.'}</Text>
      ) : (
        <View style={styles.chips}>
          {fincas.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[styles.chip, fincaId === f.id && styles.chipOn]}
              onPress={() => setFincaId(f.id)}
            >
              <Text style={[styles.chipTxt, fincaId === f.id && styles.chipTxtOn]}>{f.nombre}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.label}>Rubro</Text>
      <TextInput style={styles.input} value={rubro} onChangeText={setRubro} placeholder="Ej. Maíz" placeholderTextColor={COLORS.textDisabled} />

      <Text style={styles.label}>Cantidad (kg)</Text>
      <TextInput style={styles.input} value={kg} onChangeText={setKg} placeholder="5000" keyboardType="decimal-pad" placeholderTextColor={COLORS.textDisabled} />

      <Text style={styles.label}>Municipio</Text>
      <TextInput style={styles.input} value={municipio} onChangeText={setMunicipio} placeholder="Municipio" placeholderTextColor={COLORS.textDisabled} />

      <Text style={styles.label}>Fecha disponible (AAAA-MM-DD)</Text>
      <TextInput style={styles.input} value={fecha} onChangeText={setFecha} placeholder="2026-03-20" placeholderTextColor={COLORS.textDisabled} />

      <Text style={styles.label}>Notas (opcional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={descripcion}
        onChangeText={setDescripcion}
        placeholder="Calidad, humedad, observaciones…"
        placeholderTextColor={COLORS.textDisabled}
        multiline
      />

      <Text style={styles.label}>Foto de la cosecha (opcional)</Text>
      {fotoUri ? (
        <View style={styles.fotoBox}>
          <Image source={{ uri: fotoUri }} style={styles.fotoPreview} resizeMode="cover" />
          <TouchableOpacity style={styles.fotoRemove} onPress={() => setFotoUri(null)}>
            <Text style={styles.fotoRemoveTxt}>✕ Quitar foto</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.fotoBtn} onPress={() => void elegirFoto()}>
          <Text style={styles.fotoBtnTxt}>📷 Agregar foto desde galería</Text>
        </TouchableOpacity>
      )}

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, styles.btnSec]}
          onPress={() => publicar('borrador')}
          disabled={cargando}
        >
          {cargando ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.btnSecTxt}>Guardar borrador</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnPri]}
          onPress={() => publicar('publicada')}
          disabled={cargando}
        >
          <Text style={styles.btnPriTxt}>Publicar</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  label: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginBottom: 4, marginTop: SPACE.sm },
  hint: { color: COLORS.warning, marginBottom: SPACE.sm, fontSize: FONT.sizes.sm },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACE.sm,
    fontSize: FONT.sizes.md,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACE.sm },
  chip: { paddingHorizontal: SPACE.sm, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.surface },
  chipOn: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  chipTxt: { fontSize: FONT.sizes.sm, color: COLORS.text },
  chipTxtOn: { fontWeight: '700', color: COLORS.primary },
  fotoBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    borderStyle: 'dashed',
    padding: SPACE.md,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  fotoBtnTxt: { color: COLORS.primary, fontSize: FONT.sizes.sm },
  fotoBox: { marginBottom: SPACE.sm },
  fotoPreview: { width: '100%', height: 180, borderRadius: RADIUS.sm },
  fotoRemove: { alignItems: 'center', marginTop: SPACE.xs, padding: SPACE.xs },
  fotoRemoveTxt: { color: COLORS.danger, fontSize: FONT.sizes.xs },
  row: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  btn: { flex: 1, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center' },
  btnSec: { borderWidth: 1, borderColor: COLORS.primary },
  btnSecTxt: { color: COLORS.primary, fontWeight: '600' },
  btnPri: { backgroundColor: COLORS.primary },
  btnPriTxt: { color: '#FFF', fontWeight: '700' },
});
