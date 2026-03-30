import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Perfil } from '@/shared/types';
import { agronomoService } from '@/shared/services/agronomoService';
import { storageService } from '@/shared/services/storageService';
import { crearEarlyWarning } from '@/shared/services/earlyWarningService';
import { reportPlagueAlert } from '@/features/producer/services/plagueRadarService';
import { trackUiEvent } from '@/shared/runtime/uiEventTracker';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  perfil: Perfil | null;
  fincas: { id: string; nombre: string; rubro?: string | null; estado_ve?: string; municipio?: string; coordenadas?: { lat: number; lng: number } | null }[];
}

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

export function FitosanitarioSosModal({ visible, onClose, perfil, fincas }: Props) {
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(null);
  const [dxText, setDxText] = useState('');
  const [userDesc, setUserDesc] = useState('');
  const [fincaId, setFincaId] = useState('');
  const [busy, setBusy] = useState(false);
  const fincaSeleccionada = fincas.find((item) => item.id === fincaId) ?? null;

  useEffect(() => {
    if (!visible) return;
    if (fincas.length === 0) {
      setFincaId('');
      return;
    }
    setFincaId((prev) => (prev && fincas.some((x) => x.id === prev) ? prev : fincas[0].id));
  }, [visible, fincas]);

  const reset = useCallback(() => {
    setUri(null);
    setDxText('');
    setUserDesc('');
    setFincaId(fincas.length === 0 ? '' : fincas[0].id);
  }, [fincas]);

  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  async function tomarFotoYDiagnosticar() {
    if (!perfil) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso', 'Necesitamos la cámara.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (r.canceled || !r.assets[0]) return;
    const u = r.assets[0].uri;
    setUri(u);
    setBusy(true);
    try {
      const dx = await agronomoService.diagnosticar(
        u,
        fincaSeleccionada?.rubro ?? undefined,
        fincaSeleccionada?.estado_ve ?? perfil.estado_ve,
        userDesc.trim() || undefined,
      );
      const line = `${dx.problema} (${dx.severidad}). ${dx.descripcion}. Recomendación: ${dx.acciones[0] ?? ''}`;
      setDxText(line);
      trackUiEvent({
        eventType: 'submit',
        eventName: 'phytosanitary_ai_diagnosis_success',
        screen: 'FitosanitarioSosModal',
        module: 'sos',
        targetType: 'finca',
        targetId: fincaSeleccionada?.id ?? fincaId,
        status: 'success',
        metadata: {
          rubro: fincaSeleccionada?.rubro ?? null,
          severidad: dx.severidad,
        },
      });
    } catch (error: unknown) {
      // IA no disponible — el agricultor puede igual describir y enviar la alerta manualmente
      setDxText('');
      trackUiEvent({
        eventType: 'error_ui',
        eventName: 'phytosanitary_ai_diagnosis_failed',
        screen: 'FitosanitarioSosModal',
        module: 'sos',
        targetType: 'finca',
        targetId: fincaSeleccionada?.id ?? fincaId,
        status: 'error',
      });
      Alert.alert(
        'Diagnóstico IA no disponible',
        `${error instanceof Error ? error.message : 'El servicio de análisis automático no está disponible en este momento.'} Puedes describir el problema en el campo de texto y enviar la alerta igualmente.`,
        [{ text: 'Entendido' }],
      );
    } finally {
      setBusy(false);
    }
  }

  async function enviar() {
    if (!perfil || !fincaId) {
      Alert.alert('Finca', 'Selecciona la finca afectada.');
      return;
    }
    if (!uri) {
      Alert.alert('Foto', 'Toma una foto del síntoma primero.');
      return;
    }
    setBusy(true);
    try {
      const path = `${perfil.id}/${Date.now()}.jpg`;
      const fotoUrl = await storageService.subir('early-warnings', path, uri, true);
      await crearEarlyWarning({
        productorId: perfil.id,
        fincaId,
        fotoUrl,
        diagnosticoIa: dxText || null,
        descripcionUsuario: userDesc.trim() || null,
      });
      trackUiEvent({
        eventType: 'submit',
        eventName: 'phytosanitary_sos_sent',
        screen: 'FitosanitarioSosModal',
        module: 'sos',
        targetType: 'finca',
        targetId: fincaId,
        status: 'success',
      });
      Alert.alert('Enviado', 'Tu alerta S.O.S llegó a tu empresa y peritos vinculados en el búnker.');
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo enviar. ¿Existe el bucket early-warnings en Storage?';
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  }

  function inferSeverityFromDx(text: string): 'baja' | 'media' | 'alta' | 'critica' {
    const raw = text.toLowerCase();
    if (raw.includes('critica')) return 'critica';
    if (raw.includes('severa')) return 'alta';
    if (raw.includes('moderada')) return 'media';
    return 'baja';
  }

  async function enviarRadar() {
    if (!perfil || !fincaId) {
      Alert.alert('Finca', 'Selecciona la finca afectada.');
      return;
    }
    const finca = fincas.find((item) => item.id === fincaId);
    if (!finca?.estado_ve || !finca?.municipio) {
      Alert.alert('Radar comunitario', 'La finca debe tener estado y municipio (edita en «Mis fincas»).');
      return;
    }
    let lat = finca.coordenadas?.lat;
    let lng = finca.coordenadas?.lng;
    if (lat == null || lng == null) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Radar comunitario',
          'Sin GPS en la finca: concede permiso de ubicación para usar tu posición al avisar a agricultores cercanos.',
        );
        return;
      }
      const loc = await withTimeout(
        Location.getCurrentPositionAsync({}),
        null as Awaited<ReturnType<typeof Location.getCurrentPositionAsync>> | null,
        LOCATION_TIMEOUT_MS,
      );
      if (!loc) {
        Alert.alert(
          'Radar comunitario',
          'No se pudo obtener tu ubicación a tiempo. Intenta de nuevo o guarda GPS directamente en la finca.',
        );
        return;
      }
      lat = loc.coords.latitude;
      lng = loc.coords.longitude;
    }
    setBusy(true);
    try {
      const result = await reportPlagueAlert({
        perfilId: perfil.id,
        fincaId,
        titulo: dxText ? dxText.split('. ')[0] : 'Alerta fitosanitaria comunitaria',
        descripcion: userDesc.trim() || dxText || null,
        severidad: inferSeverityFromDx(dxText),
        estado_ve: finca.estado_ve,
        municipio: finca.municipio,
        lat,
        lng,
        localPhotoUri: uri,
        offlineFallback: true,
      });
      trackUiEvent({
        eventType: 'submit',
        eventName: 'phytosanitary_radar_sent',
        screen: 'FitosanitarioSosModal',
        module: 'radar',
        targetType: 'finca',
        targetId: fincaId,
        status: result.queuedOffline ? 'offline_queued' : 'success',
      });
      Alert.alert(
        'Radar comunitario',
        result.queuedOffline
          ? 'El reporte quedó pendiente sin conexión y se enviará al recuperar señal.'
          : 'El reporte quedó en validación comunitaria. Otros agricultores cercanos podrán confirmarlo.',
      );
      onClose();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'No se pudo enviar al radar comunitario.';
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  }

  if (!perfil) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.back}>
        <View style={s.sheet}>
          <View style={[s.head, { paddingTop: Math.max(insets.top, SPACE.md) }]}>
            <Text style={s.title}>S.O.S fitosanitario</Text>
            <TouchableOpacity onPress={onClose}><Text style={s.cerrar}>Cerrar</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={s.sub}>Foto + diagnóstico IA. Puedes enviarlo como alerta privada al perito o como reporte comunitario pendiente de validación.</Text>
            <TouchableOpacity style={s.btnCam} onPress={tomarFotoYDiagnosticar} disabled={busy}>
              {busy && !uri ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnCamTxt}>📷 Cámara y diagnóstico IA</Text>}
            </TouchableOpacity>
            {uri ? <Image source={{ uri }} style={s.img} /> : null}
            {dxText ? <Text style={s.dx}>{dxText}</Text> : null}

            <Text style={s.label}>Finca</Text>
            {fincas.length === 0 ? (
              <Text style={s.emptyFinca}>No hay fincas. Regístralas en «Mis fincas».</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {fincas.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[s.chip, fincaId === f.id && s.chipOn]}
                    onPress={() => setFincaId(f.id)}
                  >
                    <Text style={[s.chipTxt, fincaId === f.id && s.chipTxtOn]} numberOfLines={1}>{f.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Text style={s.label}>Tu descripción (opcional)</Text>
            <TextInput style={s.input} value={userDesc} onChangeText={setUserDesc} multiline placeholder="Síntomas, cultivo, fecha inicio…" placeholderTextColor={COLORS.textDisabled} />

            <TouchableOpacity style={s.enviar} onPress={enviar} disabled={busy}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.enviarTxt}>Enviar a mi perito</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.radarBtn} onPress={enviarRadar} disabled={busy}>
              {busy ? <ActivityIndicator color={COLORS.primary} /> : <Text style={s.radarBtnTxt}>Enviar al radar comunitario</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.background, maxHeight: '92%', borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, ...SHADOW.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.md, borderBottomWidth: 1, borderColor: COLORS.border },
  title: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold },
  cerrar: { color: COLORS.primary, fontWeight: FONT.weights.semibold },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  sub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACE.md },
  btnCam: { backgroundColor: COLORS.danger, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center' },
  btnCamTxt: { color: '#FFF', fontWeight: FONT.weights.bold },
  img: { alignSelf: 'stretch', width: '100%', height: 180, borderRadius: RADIUS.md, marginTop: SPACE.md },
  dx: { marginTop: SPACE.sm, fontSize: FONT.sizes.sm, color: COLORS.text, lineHeight: 20 },
  label: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: SPACE.md },
  emptyFinca: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACE.sm },
  chip: { paddingHorizontal: SPACE.sm, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, marginRight: 6, maxWidth: 160 },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipTxt: { fontSize: FONT.sizes.xs, color: COLORS.text },
  chipTxtOn: { color: '#FFF', fontWeight: FONT.weights.semibold },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACE.sm, minHeight: 72, textAlignVertical: 'top', marginTop: 4, color: COLORS.text },
  enviar: { marginTop: SPACE.lg, backgroundColor: COLORS.success, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center' },
  enviarTxt: { color: '#FFF', fontWeight: FONT.weights.bold },
  radarBtn: { marginTop: SPACE.sm, backgroundColor: '#EFF6FF', padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1, borderColor: '#BFDBFE' },
  radarBtnTxt: { color: '#1D4ED8', fontWeight: FONT.weights.bold },
});
