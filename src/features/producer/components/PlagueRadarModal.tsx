import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { reportPlagueAlert, listNearbyPlagueAlerts, confirmPlagueAlert, deletePlagueAlert, takeRadarPhoto, type NearbyPlagueAlert } from '@/features/producer/services/plagueRadarService';
import type { Perfil } from '@/shared/types';
import { listarConfirmacionesPlagaLocales, listarReportesPlagaLocales, useOfflineSync, type PlagueLocalSeverity } from '@/hooks/useOfflineSync';
import { trackUiEvent } from '@/shared/runtime/uiEventTracker';
import { VENEZUELA_DEFAULT_COORD } from '@/shared/utils/venezuelaGeo';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

type FincaOption = {
  id: string;
  nombre: string;
  estado_ve: string;
  municipio: string;
  coordenadas: { lat: number; lng: number } | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  perfil: Perfil | null;
  fincas: FincaOption[];
};

/**
 * Prioridad: coordenadas de la finca → GPS del dispositivo → centro de Venezuela.
 * Nunca devuelve null para que el agricultor pueda reportar sin bloqueos.
 */
async function coordsParaFinca(f: FincaOption | null): Promise<{ lat: number; lng: number }> {
  if (f?.coordenadas) return f.coordenadas;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    }
  } catch {
    /* GPS no disponible — usar fallback */
  }
  return { lat: VENEZUELA_DEFAULT_COORD.latitude, lng: VENEZUELA_DEFAULT_COORD.longitude };
}

const SEVERITIES: Array<{ key: PlagueLocalSeverity; label: string }> = [
  { key: 'baja', label: 'Baja' },
  { key: 'media', label: 'Media' },
  { key: 'alta', label: 'Alta' },
  { key: 'critica', label: 'Crítica' },
];

export function PlagueRadarModal({ visible, onClose, perfil, fincas }: Props) {
  const { intentarSync } = useOfflineSync();
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<NearbyPlagueAlert[]>([]);
  const [fincaId, setFincaId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<PlagueLocalSeverity>('media');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [localReports, setLocalReports] = useState(0);
  const [localConfirmations, setLocalConfirmations] = useState(0);

  const selectedFinca = useMemo(() => fincas.find((item) => item.id === fincaId) ?? null, [fincaId, fincas]);

  const cargar = useCallback(async () => {
    if (!perfil?.id || !visible) return;
    const fallbackFinca = selectedFinca ?? fincas.find((item) => item.coordenadas) ?? fincas[0] ?? null;
    if (!fallbackFinca) {
      setAlerts([]);
      setLocalReports(listarReportesPlagaLocales(perfil.id).filter((item) => item.sincronizado === 0).length);
      setLocalConfirmations(listarConfirmacionesPlagaLocales(perfil.id).filter((item) => item.sincronizado === 0).length);
      return;
    }
    const point = await coordsParaFinca(fallbackFinca);
    setLoading(true);
    try {
      const rows = await listNearbyPlagueAlerts({
        lat: point.lat,
        lng: point.lng,
      });
      setAlerts(rows);
    } catch (error: unknown) {
      Alert.alert('Radar', error instanceof Error ? error.message : 'No se pudo cargar el radar comunitario.');
      setAlerts([]);
    } finally {
      setLoading(false);
      setLocalReports(listarReportesPlagaLocales(perfil.id).filter((item) => item.sincronizado === 0).length);
      setLocalConfirmations(listarConfirmacionesPlagaLocales(perfil.id).filter((item) => item.sincronizado === 0).length);
    }
  }, [perfil?.id, selectedFinca, fincas, visible]);

  useEffect(() => {
    if (!visible) return;
    if (fincas.length === 0) {
      setFincaId('');
      return;
    }
    setFincaId((prev) => (prev && fincas.some((x) => x.id === prev) ? prev : fincas[0].id));
  }, [visible, fincas]);

  useEffect(() => {
    if (!visible) return;
    void cargar();
  }, [visible, fincaId, cargar]);

  async function tomarFoto() {
    try {
      const uri = await takeRadarPhoto();
      if (uri) setPhotoUri(uri);
    } catch (error: unknown) {
      Alert.alert('Radar', error instanceof Error ? error.message : 'No se pudo abrir la cámara.');
    }
  }

  async function enviarReporte() {
    if (savingRef.current) return;
    if (!perfil?.id || !selectedFinca) {
      Alert.alert('Radar', 'Selecciona una finca.');
      return;
    }
    const point = await coordsParaFinca(selectedFinca);
    if (!title.trim()) {
      Alert.alert('Radar', 'Describe el tipo de plaga o incidencia reportada.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await reportPlagueAlert({
        perfilId: perfil.id,
        fincaId: selectedFinca.id,
        titulo: title,
        descripcion: description,
        severidad: severity,
        estado_ve: selectedFinca.estado_ve,
        municipio: selectedFinca.municipio,
        lat: point.lat,
        lng: point.lng,
        localPhotoUri: photoUri,
        offlineFallback: true,
      });
      setTitle('');
      setDescription('');
      setSeverity('media');
      setPhotoUri(null);
      await intentarSync();
      Alert.alert(
        'Radar comunitario',
        result.queuedOffline
          ? 'Tu reporte quedó guardado sin conexión y se enviará cuando vuelva la señal.'
          : 'Tu reporte quedó registrado. Otros agricultores cercanos podrán validarlo.',
      );
      trackUiEvent({
        eventType: 'submit',
        eventName: 'plague_alert_created',
        screen: 'PlagueRadarModal',
        module: 'radar',
        targetType: 'finca',
        targetId: selectedFinca.id,
        status: result.queuedOffline ? 'offline_queued' : 'success',
        metadata: {
          severidad: severity,
          estado_ve: selectedFinca.estado_ve,
          municipio: selectedFinca.municipio,
        },
      });
      await cargar();
    } catch (error: unknown) {
      Alert.alert('Radar', error instanceof Error ? error.message : 'No se pudo registrar la alerta comunitaria.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function eliminarReporte(alertId: string) {
    if (!perfil?.id) return;
    Alert.alert(
      'Eliminar reporte',
      '¿Seguro que deseas eliminar este reporte? No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePlagueAlert(alertId);
              setAlerts((prev) => prev.filter((a) => a.id !== alertId));
              trackUiEvent({
                eventType: 'submit',
                eventName: 'plague_alert_deleted',
                screen: 'PlagueRadarModal',
                module: 'radar',
                targetType: 'plague_alert',
                targetId: alertId,
                status: 'success',
              });
              await cargar();
              Alert.alert('Radar', 'El reporte fue eliminado correctamente.');
            } catch (error: unknown) {
              Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo eliminar el reporte.');
            }
          },
        },
      ],
    );
  }

  async function confirmar(alertId: string) {
    if (!perfil?.id) return;
    try {
      const result = await confirmPlagueAlert(alertId, perfil.id, true);
      await intentarSync();
      Alert.alert(
        'Confirmación enviada',
        result.queuedOffline
          ? 'Tu confirmación quedó pendiente de sincronizar.'
          : 'Tu confirmación ayuda a validar la alerta para otros agricultores.',
      );
      trackUiEvent({
        eventType: 'submit',
        eventName: 'plague_alert_confirmed',
        screen: 'PlagueRadarModal',
        module: 'radar',
        targetType: 'plague_alert',
        targetId: alertId,
        status: result.queuedOffline ? 'offline_queued' : 'success',
      });
      await cargar();
    } catch (error: unknown) {
      Alert.alert('Confirmación', error instanceof Error ? error.message : 'No se pudo confirmar la alerta.');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Radar comunitario de plagas</Text>
              <Text style={s.subtitle}>Los reportes solo escalan cuando otros agricultores cercanos los confirman.</Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} accessibilityLabel="Cerrar">
              <Ionicons name="close-outline" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.pendingBox}>
              <Text style={s.pendingTxt}>Pendientes offline: {localReports} reporte(s) y {localConfirmations} confirmación(es)</Text>
            </View>

            <Text style={s.sectionTitle}>Reportar plaga</Text>
            <Text style={s.fieldLabel}>Finca</Text>
            {fincas.length === 0 ? (
              <Text style={s.emptyFinca}>
                No tienes fincas registradas. Ve a «Mis fincas» en el menú, crea una y vuelve aquí.
              </Text>
            ) : (
              <View style={s.fincaRow}>
                {fincas.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[s.chip, fincaId === item.id && s.chipOn]}
                    onPress={() => setFincaId(item.id)}
                    activeOpacity={0.88}
                  >
                    <Text style={[s.chipTxt, fincaId === item.id && s.chipTxtOn]} numberOfLines={1}>
                      {item.nombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {fincas.length > 0 && selectedFinca && !selectedFinca.coordenadas ? (
              <Text style={s.gpsHint}>
                Sin GPS en la finca: al enviar se usará tu ubicación actual (pide permiso si hace falta).
              </Text>
            ) : null}
            <TextInput
              style={s.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Ej. Mancha foliar, gusano cogollero..."
              placeholderTextColor={COLORS.textDisabled}
            />
            <TextInput
              style={[s.input, s.inputMultiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Qué observaste, desde cuándo y cómo se ve el lote"
              placeholderTextColor={COLORS.textDisabled}
              multiline
            />
            <View style={s.severityRow}>
              {SEVERITIES.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[s.severityChip, severity === item.key && s.severityChipOn]}
                  onPress={() => setSeverity(item.key)}
                  activeOpacity={0.88}
                >
                  <Text style={[s.severityTxt, severity === item.key && s.severityTxtOn]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.photoBtn} onPress={() => void tomarFoto()} activeOpacity={0.88}>
              <Text style={s.photoBtnTxt}>{photoUri ? 'Actualizar foto' : 'Tomar foto opcional'}</Text>
            </TouchableOpacity>
            {photoUri ? <Image source={{ uri: photoUri }} style={s.photoPreview} resizeMode="cover" /> : null}
            <TouchableOpacity style={s.reportBtn} onPress={() => void enviarReporte()} disabled={saving} activeOpacity={0.9}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.reportBtnTxt}>Guardar reporte comunitario</Text>}
            </TouchableOpacity>

            <Text style={s.sectionTitle}>Alertas cercanas (100 km)</Text>
            {loading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACE.md }} />
            ) : alerts.length === 0 ? (
              <Text style={s.empty}>No hay alertas comunitarias cercanas por ahora.</Text>
            ) : (
              alerts.map((item) => (
                <View key={item.id} style={s.alertCard}>
                  <View style={s.alertTop}>
                    <Text style={s.alertTitle}>{item.titulo}</Text>
                    <Text style={s.alertState}>{item.estado === 'verificada' ? 'Verificada' : 'Pendiente'}</Text>
                  </View>
                  <Text style={s.alertMeta}>
                    {item.reporter_name ?? 'Agricultor'} · {Math.round(item.distance_m ?? 0)} m · {item.municipio}, {item.estado_ve}
                  </Text>
                  {item.descripcion ? <Text style={s.alertDesc}>{item.descripcion}</Text> : null}
                  <Text style={s.alertMeta}>Confirmaciones: {item.confirmaciones}</Text>
                  {!item.is_owner && !item.confirmed_by_me ? (
                    <TouchableOpacity style={s.confirmBtn} onPress={() => void confirmar(item.id)} activeOpacity={0.88}>
                      <Text style={s.confirmBtnTxt}>Confirmar alerta</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.ownerRow}>
                      <Text style={s.confirmedHint}>
                        {item.is_owner ? 'Este reporte fue creado por ti.' : 'Ya confirmaste esta alerta.'}
                      </Text>
                      {item.is_owner ? (
                        <TouchableOpacity style={s.deleteBtn} onPress={() => void eliminarReporte(item.id)} activeOpacity={0.88}>
                          <Text style={s.deleteBtnTxt}>Eliminar</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    ...SHADOW.lg,
  },
  header: {
    flexDirection: 'row',
    gap: SPACE.sm,
    padding: SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold, color: COLORS.text },
  subtitle: { marginTop: 4, fontSize: FONT.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  pendingBox: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: RADIUS.md,
    padding: SPACE.sm,
  },
  pendingTxt: { fontSize: FONT.sizes.sm, color: '#1e3a8a', fontWeight: FONT.weights.semibold },
  sectionTitle: { marginTop: SPACE.md, marginBottom: SPACE.sm, fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text },
  fieldLabel: {
    fontSize: FONT.sizes.sm,
    fontWeight: FONT.weights.semibold,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  emptyFinca: {
    fontSize: FONT.sizes.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACE.sm,
    lineHeight: 20,
  },
  gpsHint: {
    fontSize: FONT.sizes.xs,
    color: '#1d4ed8',
    marginBottom: SPACE.sm,
    lineHeight: 18,
  },
  fincaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: SPACE.sm },
  chip: { paddingHorizontal: SPACE.sm, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  chipOn: { backgroundColor: '#e8f5e9', borderColor: '#86efac' },
  chipTxt: { fontSize: FONT.sizes.xs, color: COLORS.text },
  chipTxtOn: { color: COLORS.primary, fontWeight: FONT.weights.bold },
  input: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    color: COLORS.text,
    marginBottom: SPACE.sm,
  },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  severityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: SPACE.sm },
  severityChip: { paddingHorizontal: SPACE.sm, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border },
  severityChipOn: { backgroundColor: '#fff7ed', borderColor: '#fb923c' },
  severityTxt: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary },
  severityTxtOn: { color: '#c2410c', fontWeight: FONT.weights.bold },
  photoBtn: {
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.sm,
  },
  photoBtnTxt: { color: '#1e3a8a', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  photoPreview: { width: '100%', height: 180, borderRadius: RADIUS.md, marginBottom: SPACE.sm },
  reportBtn: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportBtnTxt: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  empty: { color: COLORS.textDisabled, textAlign: 'center', marginTop: SPACE.md },
  alertCard: { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  alertTop: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.sm },
  alertTitle: { flex: 1, fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text },
  alertState: { fontSize: FONT.sizes.xs, color: COLORS.primary, fontWeight: FONT.weights.bold, textTransform: 'uppercase' },
  alertMeta: { marginTop: 4, fontSize: FONT.sizes.sm, color: COLORS.textSecondary },
  alertDesc: { marginTop: 8, fontSize: FONT.sizes.sm, color: COLORS.text, lineHeight: 20 },
  confirmBtn: {
    marginTop: SPACE.sm,
    minHeight: 42,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnTxt: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  confirmedHint: { marginTop: SPACE.sm, fontSize: FONT.sizes.xs, color: COLORS.textSecondary, fontWeight: FONT.weights.semibold },
  ownerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.sm, gap: SPACE.sm },
  deleteBtn: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#f87171',
    backgroundColor: '#fef2f2',
  },
  deleteBtnTxt: { color: '#dc2626', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.xs },
});
