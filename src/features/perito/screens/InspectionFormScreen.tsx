import React, { useCallback, useEffect, useState } from 'react';
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/shared/store/AuthContext';
import { enqueueInspectionReport, localApplyQueuedInspection, localGetById, localSaveDraft } from '@/shared/lib/fieldInspectionLocalDb';
import type { PeritoStackParamList } from '@/features/perito/navigation/types';
import type {
  FieldInspectionEstatus,
  InspectionPhotoEvidence,
  InspectionSignatureRecord,
  InspectionTipo,
  InsumoRecomendado,
} from '@/shared/types';
import type { InspectionQueuePayload } from '@/shared/services/inspectionQueueSync';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import { InspectionSignaturePad } from '../components/InspectionSignaturePad';

type Props = NativeStackScreenProps<PeritoStackParamList, 'InspectionForm'>;

const TIPOS: Array<{ key: InspectionTipo; label: string; minPhotos: number }> = [
  { key: 'estimacion_precosecha', label: 'Precosecha', minPhotos: 2 },
  { key: 'evaluacion_danos', label: 'Daños', minPhotos: 3 },
  { key: 'auditoria_insumos', label: 'Auditoría', minPhotos: 2 },
  { key: 'certificacion_calidad', label: 'Calidad', minPhotos: 2 },
  { key: 'seguimiento_tecnico', label: 'Seguimiento', minPhotos: 2 },
];
const FASES = ['Germinación', 'Emergencia', 'Floración', 'Llenado de grano', 'Maduración', 'Cosecha'];
const MALEZAS = ['Sin malezas relevantes', 'Presencia baja', 'Media', 'Alta', 'Crítica'];
const PLAGAS = ['No observadas', 'Leve', 'Moderada', 'Severa'];

function newQueueId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function parseInsumos(json: string): InsumoRecomendado[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as InsumoRecomendado[]) : [];
  } catch {
    return [];
  }
}

function linesToInsumos(text: string): InsumoRecomendado[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split('|').map((p) => p.trim());
      return {
        nombre: parts[0] ?? 'Insumo',
        dosis: parts[1] || null,
        notas: parts[2] || null,
      };
    });
}

function parseJsonObject<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export default function InspectionFormScreen({ route, navigation }: Props) {
  const { perfil } = useAuth();
  const localTaskId = route.params?.localTaskId;
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState('');
  const [serverId, setServerId] = useState<string | null>(null);
  const [localRowId, setLocalRowId] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [inspectionType, setInspectionType] = useState<InspectionTipo>('estimacion_precosecha');
  const [fase, setFase] = useState(FASES[0]!);
  const [maleza, setMaleza] = useState(MALEZAS[0]!);
  const [plaga, setPlaga] = useState(PLAGAS[0]!);
  const [damagePct, setDamagePct] = useState('');
  const [yieldTon, setYieldTon] = useState('');
  const [areaHa, setAreaHa] = useState('');
  const [outsideLot, setOutsideLot] = useState(false);
  const [dictamen, setDictamen] = useState('');
  const [recomInsumos, setRecomInsumos] = useState('');
  const [insumoLines, setInsumoLines] = useState('');
  const [obs, setObs] = useState('');
  const [photos, setPhotos] = useState<InspectionPhotoEvidence[]>([]);
  const [peritoSignerName, setPeritoSignerName] = useState(perfil?.nombre ?? '');
  const [peritoSignerDoc, setPeritoSignerDoc] = useState('');
  const [peritoSignaturePath, setPeritoSignaturePath] = useState('');
  const [productorSignerName, setProductorSignerName] = useState('');
  const [productorSignerDoc, setProductorSignerDoc] = useState('');
  const [productorSignaturePath, setProductorSignaturePath] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!localTaskId) {
      setLoading(false);
      return;
    }
    try {
    const row = await localGetById(localTaskId);
    if (!row) {
      Alert.alert('Orden', 'No hay tarea local con ese id.');
      navigation.goBack();
      return;
    }
    setLocalRowId(row.id);
    setServerId(row.server_id ?? row.id);
    setMeta(`${row.numero_control ?? ''} · ${row.fecha_programada}`);
    const ins = parseInsumos(row.insumos_json);
    setInsumoLines(
      ins.map((i) => [i.nombre, i.dosis ?? '', i.notas ?? ''].filter(Boolean).join(' | ')).join('\n'),
    );
    setObs(row.observaciones_tecnicas ?? '');
    setLat(row.lat);
    setLng(row.lng);
    setAccuracyM(row.precision_gps_m);
    setInspectionType((row.tipo_inspeccion as InspectionTipo | null) ?? 'estimacion_precosecha');
    setDamagePct(row.porcentaje_dano != null ? String(row.porcentaje_dano) : '');
    setYieldTon(row.estimacion_rendimiento_ton != null ? String(row.estimacion_rendimiento_ton) : '');
    setAreaHa(row.area_verificada_ha != null ? String(row.area_verificada_ha) : '');
    setOutsideLot(row.fuera_de_lote === 1);
    setDictamen(row.resumen_dictamen ?? '');
    setFase(row.fase_fenologica ?? FASES[0]!);
    setMaleza(row.malezas_reportadas ?? MALEZAS[0]!);
    setPlaga(row.plagas_reportadas ?? PLAGAS[0]!);
    setRecomInsumos(row.recomendacion_insumos ?? '');
    setPhotos(parseJsonArray<InspectionPhotoEvidence>(row.evidencias_fotos_json));
    const peritoSig = parseJsonObject<InspectionSignatureRecord>(row.firma_perito_json);
    const productorSig = parseJsonObject<InspectionSignatureRecord>(row.firma_productor_json);
    setPeritoSignerName(peritoSig?.nombre ?? perfil?.nombre ?? '');
    setPeritoSignerDoc(peritoSig?.documento ?? '');
    setPeritoSignaturePath(peritoSig?.svg_path ?? '');
    setProductorSignerName(productorSig?.nombre ?? row.productor_nombre ?? '');
    setProductorSignerDoc(productorSig?.documento ?? '');
    setProductorSignaturePath(productorSig?.svg_path ?? '');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cargar la orden de inspección.');
    } finally {
      setLoading(false);
    }
  }, [localTaskId, navigation, perfil?.nombre]);

  useEffect(() => {
    void load();
  }, [load]);

  async function capturarGps() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('GPS', 'Se necesita permiso de ubicación.');
      return;
    }
    const p = await Location.getCurrentPositionAsync({});
    setLat(p.coords.latitude);
    setLng(p.coords.longitude);
    setAccuracyM(typeof p.coords.accuracy === 'number' ? p.coords.accuracy : null);
  }

  async function tomarFoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Cámara', 'Se necesita permiso para usar la cámara.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]?.uri) {
      setPhotos((prev) => [
        ...prev,
        {
          path: r.assets[0]!.uri,
          captured_at: new Date().toISOString(),
          lat,
          lng,
          accuracy_m: accuracyM,
          kind: inspectionType,
        },
      ]);
    }
  }

  function CycleField<T extends string>({
    label,
    value,
    opts,
    onChange,
  }: {
    label: string;
    value: T;
    opts: readonly T[];
    onChange: (v: T) => void;
  }) {
    return (
      <View style={s.block}>
        <Text style={s.lbl}>{label}</Text>
        <TouchableOpacity
          style={s.chip}
          onPress={() => {
            const i = opts.indexOf(value);
            onChange(opts[(i + 1) % opts.length]!);
          }}
        >
          <Text style={s.chipTxt}>{value}</Text>
          <Text style={s.chipHint}>Toca para cambiar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function guardarBorrador() {
    if (!localRowId) return;
    try {
      await localSaveDraft({
        id: localRowId,
        observaciones_tecnicas: obs.trim() || null,
        resumen_dictamen: dictamen.trim() || null,
        insumos: linesToInsumos(insumoLines),
        estatus: 'in_progress',
        lat,
        lng,
        precision_gps_m: accuracyM,
        tipo_inspeccion: inspectionType,
        estado_acta: 'levantada_en_campo',
        porcentaje_dano: damagePct.trim() && !Number.isNaN(Number(damagePct)) ? Math.min(100, Math.max(0, Number(damagePct))) : null,
        estimacion_rendimiento_ton: yieldTon.trim() ? Number(yieldTon) : null,
        area_verificada_ha: areaHa.trim() ? Number(areaHa) : null,
        fuera_de_lote: outsideLot,
        fase_fenologica: fase,
        malezas_reportadas: maleza,
        plagas_reportadas: plaga,
        recomendacion_insumos: recomInsumos.trim() || null,
        evidencias_fotos_json: JSON.stringify(photos),
        firma_perito_json: peritoSignaturePath
          ? JSON.stringify({
              nombre: peritoSignerName.trim() || perfil?.nombre || 'Perito',
              documento: peritoSignerDoc.trim() || null,
              signed_at: new Date().toISOString(),
              lat,
              lng,
              accuracy_m: accuracyM,
              svg_path: peritoSignaturePath,
            } satisfies InspectionSignatureRecord)
          : null,
        firma_productor_json: productorSignaturePath
          ? JSON.stringify({
              nombre: productorSignerName.trim() || 'Productor',
              documento: productorSignerDoc.trim() || null,
              signed_at: new Date().toISOString(),
              lat,
              lng,
              accuracy_m: accuracyM,
              svg_path: productorSignaturePath,
            } satisfies InspectionSignatureRecord)
          : null,
        firmado_en: new Date().toISOString(),
      });
      Alert.alert('Borrador guardado', 'El acta quedó preparada en el dispositivo para seguirla completando offline.');
    } catch (error: unknown) {
      Alert.alert('Error', error instanceof Error ? error.message : String(error));
    }
  }

  async function guardarCola() {
    if (!perfil?.id || !serverId || !localRowId) {
      Alert.alert('Datos', 'Abre el formulario desde una orden descargada (sync_tasks).');
      return;
    }
    const minPhotos = TIPOS.find((item) => item.key === inspectionType)?.minPhotos ?? 2;
    if (lat == null || lng == null) {
      Alert.alert('GPS requerido', 'Captura la ubicación antes de cerrar el acta.');
      return;
    }
    if (photos.length < minPhotos) {
      Alert.alert('Evidencia mínima', `Esta visita requiere al menos ${minPhotos} foto(s) para cerrar el acta.`);
      return;
    }
    if (!dictamen.trim()) {
      Alert.alert('Dictamen', 'Escribe un resumen claro del hallazgo técnico.');
      return;
    }
    if (!peritoSignaturePath || !productorSignaturePath) {
      Alert.alert('Firmas', 'Debes registrar la firma del perito y del productor para cerrar el acta.');
      return;
    }
    setSaving(true);
    try {
      const insumos = linesToInsumos(insumoLines);
      const observaciones = [obs, `Fase: ${fase}`, `Maleza: ${maleza}`, `Plagas: ${plaga}`, recomInsumos ? `Recom. insumos: ${recomInsumos}` : '']
        .filter(Boolean)
        .join('\n');
      const peritoSignature: InspectionSignatureRecord = {
        nombre: peritoSignerName.trim() || perfil.nombre || 'Perito',
        documento: peritoSignerDoc.trim() || null,
        signed_at: new Date().toISOString(),
        lat,
        lng,
        accuracy_m: accuracyM,
        svg_path: peritoSignaturePath,
      };
      const productorSignature: InspectionSignatureRecord = {
        nombre: productorSignerName.trim() || 'Productor',
        documento: productorSignerDoc.trim() || null,
        signed_at: new Date().toISOString(),
        lat,
        lng,
        accuracy_m: accuracyM,
        svg_path: productorSignaturePath,
      };
      const payload: InspectionQueuePayload = {
        op: 'update_inspection',
        server_id: serverId,
        local_task_id: localRowId,
        observaciones_tecnicas: observaciones || null,
        insumos_recomendados: insumos,
        estatus: 'synced' as FieldInspectionEstatus,
        lat,
        lng,
        precision_gps_m: accuracyM,
        tipo_inspeccion: inspectionType,
        estado_acta: 'completa',
        resumen_dictamen: dictamen.trim(),
        porcentaje_dano: damagePct.trim() && !Number.isNaN(Number(damagePct)) ? Math.min(100, Math.max(0, Number(damagePct))) : null,
        estimacion_rendimiento_ton: yieldTon.trim() ? Number(yieldTon) : null,
        area_verificada_ha: areaHa.trim() ? Number(areaHa) : null,
        fuera_de_lote: outsideLot,
        fase_fenologica: fase,
        malezas_reportadas: maleza,
        plagas_reportadas: plaga,
        recomendacion_insumos: recomInsumos.trim() || null,
        evidencias_fotos: photos,
        firma_perito: peritoSignature,
        firma_productor: productorSignature,
        firmado_en: new Date().toISOString(),
      };
      await localApplyQueuedInspection({
        id: localRowId,
        observaciones_tecnicas: observaciones || null,
        resumen_dictamen: dictamen.trim(),
        insumos,
        estatus: 'synced',
        lat,
        lng,
        precision_gps_m: accuracyM,
        tipo_inspeccion: inspectionType,
        estado_acta: 'completa',
        porcentaje_dano: damagePct.trim() && !Number.isNaN(Number(damagePct)) ? Math.min(100, Math.max(0, Number(damagePct))) : null,
        estimacion_rendimiento_ton: yieldTon.trim() ? Number(yieldTon) : null,
        area_verificada_ha: areaHa.trim() ? Number(areaHa) : null,
        fuera_de_lote: outsideLot,
        fase_fenologica: fase,
        malezas_reportadas: maleza,
        plagas_reportadas: plaga,
        recomendacion_insumos: recomInsumos.trim() || null,
        evidencias_fotos_json: JSON.stringify(photos),
        firma_perito_json: JSON.stringify(peritoSignature),
        firma_productor_json: JSON.stringify(productorSignature),
        firmado_en: payload.firmado_en,
      });
      const qid = newQueueId();
      await enqueueInspectionReport({
        id: qid,
        payloadJson: JSON.stringify(payload),
        photoUris: photos.map((item) => item.path),
      });
      Alert.alert('Guardado', 'Reporte preparado en el dispositivo. Se enviará al servidor cuando haya conexión.');
      navigation.goBack();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={COLORS.info} />
      </View>
    );
  }

  if (!localTaskId) {
    return (
      <View style={s.center}>
        <Text style={s.help}>Selecciona una orden en la lista y usa «Formulario extendido», o el botón superior si hay tareas.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <Text style={s.tit}>Acta técnica de campo</Text>
      <Text style={s.meta}>{meta}</Text>

      <View style={s.block}>
        <Text style={s.lbl}>Tipo de inspección</Text>
        <View style={s.chipsRow}>
          {TIPOS.map((item) => {
            const active = inspectionType === item.key;
            return (
              <TouchableOpacity key={item.key} style={[s.typeChip, active && s.typeChipOn]} onPress={() => setInspectionType(item.key)}>
                <Text style={[s.typeChipTxt, active && s.typeChipTxtOn]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity style={s.btn} onPress={() => void capturarGps()}>
        <Text style={s.btnTxt}>Capturar GPS</Text>
      </TouchableOpacity>
      {lat != null && lng != null ? (
        <Text style={s.coord}>
          {lat.toFixed(5)}, {lng.toFixed(5)}
          {accuracyM != null ? ` · ±${Math.round(accuracyM)} m` : ''}
        </Text>
      ) : null}

      <TouchableOpacity style={[s.flagBtn, outsideLot && s.flagBtnOn]} onPress={() => setOutsideLot((prev) => !prev)}>
        <Text style={[s.flagBtnTxt, outsideLot && s.flagBtnTxtOn]}>
          {outsideLot ? 'Marcado: levantada fuera del lote' : 'Marcar si la visita fue fuera del lote'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.btn} onPress={() => void tomarFoto()}>
        <Text style={s.btnTxt}>Añadir foto (cámara)</Text>
      </TouchableOpacity>
      <View style={s.thumbs}>
        {photos.map((item) => (
          <Image key={item.path} source={{ uri: item.path }} style={s.thumb} />
        ))}
      </View>

      <CycleField label="Fase fenológica" value={fase} opts={FASES} onChange={setFase} />
      <CycleField label="Maleza" value={maleza} opts={MALEZAS} onChange={setMaleza} />
      <CycleField label="Plagas" value={plaga} opts={PLAGAS} onChange={setPlaga} />

      <Text style={s.lbl}>Resumen del dictamen</Text>
      <TextInput
        style={s.area}
        value={dictamen}
        onChangeText={setDictamen}
        placeholder="Ej. Se observa daño moderado en bordes del lote y vigor desigual en el tercio norte."
        multiline
      />

      <View style={s.metricsRow}>
        <View style={s.metricBox}>
          <Text style={s.lbl}>Daño %</Text>
          <TextInput style={s.metricInput} value={damagePct} onChangeText={setDamagePct} keyboardType="numeric" placeholder="0" />
        </View>
        <View style={s.metricBox}>
          <Text style={s.lbl}>Rend. ton</Text>
          <TextInput style={s.metricInput} value={yieldTon} onChangeText={setYieldTon} keyboardType="numeric" placeholder="0" />
        </View>
        <View style={s.metricBox}>
          <Text style={s.lbl}>Area ha</Text>
          <TextInput style={s.metricInput} value={areaHa} onChangeText={setAreaHa} keyboardType="numeric" placeholder="0" />
        </View>
      </View>

      <Text style={s.lbl}>Recomendación de insumos (PDF futuro)</Text>
      <TextInput
        style={s.area}
        value={recomInsumos}
        onChangeText={setRecomInsumos}
        placeholder="Texto libre para el informe / PDF"
        multiline
      />

      <Text style={s.lbl}>Observaciones técnicas</Text>
      <TextInput style={s.area} value={obs} onChangeText={setObs} multiline placeholder="Notas de campo" />

      <Text style={s.lbl}>Insumos (líneas: nombre | dosis | notas)</Text>
      <TextInput style={s.area} value={insumoLines} onChangeText={setInsumoLines} multiline />

      <View style={s.signerCard}>
        <Text style={s.signerTitle}>Firma del perito</Text>
        <TextInput style={s.input} value={peritoSignerName} onChangeText={setPeritoSignerName} placeholder="Nombre del perito" />
        <TextInput style={s.input} value={peritoSignerDoc} onChangeText={setPeritoSignerDoc} placeholder="Documento" />
        <InspectionSignaturePad title="Firma perito" value={peritoSignaturePath} onChange={setPeritoSignaturePath} />
      </View>

      <View style={s.signerCard}>
        <Text style={s.signerTitle}>Firma del productor</Text>
        <TextInput style={s.input} value={productorSignerName} onChangeText={setProductorSignerName} placeholder="Nombre del productor" />
        <TextInput style={s.input} value={productorSignerDoc} onChangeText={setProductorSignerDoc} placeholder="Documento" />
        <InspectionSignaturePad title="Firma productor" value={productorSignaturePath} onChange={setProductorSignaturePath} />
      </View>

      <TouchableOpacity style={s.draftBtn} onPress={() => void guardarBorrador()}>
        <Text style={s.draftBtnTxt}>Guardar borrador local</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.save} onPress={() => void guardarCola()} disabled={saving}>
        {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveTxt}>Cerrar acta y enviar a cola</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  center: { flex: 1, justifyContent: 'center', padding: SPACE.lg, backgroundColor: COLORS.background },
  help: { textAlign: 'center', color: COLORS.textSecondary, lineHeight: 22 },
  tit: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, color: COLORS.text },
  meta: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  btn: {
    marginTop: SPACE.md,
    backgroundColor: COLORS.info,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  btnTxt: { color: '#FFF', fontWeight: FONT.weights.semibold },
  coord: { marginTop: 6, fontSize: FONT.sizes.sm, color: COLORS.text },
  flagBtn: {
    marginTop: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACE.md,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
  },
  flagBtnOn: { backgroundColor: '#fff7ed', borderColor: '#fb923c' },
  flagBtnTxt: { color: COLORS.textSecondary, fontWeight: FONT.weights.semibold },
  flagBtnTxtOn: { color: '#c2410c' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACE.sm },
  thumb: { width: 72, height: 72, borderRadius: RADIUS.sm },
  block: { marginTop: SPACE.md },
  lbl: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold, color: COLORS.textSecondary },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeChipOn: { backgroundColor: '#dbeafe', borderColor: '#60a5fa' },
  typeChipTxt: { color: COLORS.text, fontWeight: FONT.weights.semibold, fontSize: FONT.sizes.sm },
  typeChipTxtOn: { color: '#1d4ed8' },
  chip: {
    marginTop: 6,
    backgroundColor: COLORS.surface,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  chipTxt: { fontSize: FONT.sizes.md, color: COLORS.text, fontWeight: FONT.weights.medium },
  chipHint: { fontSize: FONT.sizes.xs, color: COLORS.textDisabled, marginTop: 4 },
  metricsRow: { flexDirection: 'row', gap: 10, marginTop: SPACE.md },
  metricBox: { flex: 1 },
  metricInput: {
    marginTop: 6,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
  },
  area: {
    marginTop: 6,
    minHeight: 80,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlignVertical: 'top',
    fontSize: FONT.sizes.md,
    color: COLORS.text,
  },
  signerCard: {
    marginTop: SPACE.lg,
    backgroundColor: '#f8fafc',
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  signerTitle: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text, marginBottom: 8 },
  input: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
  },
  draftBtn: {
    marginTop: SPACE.xl,
    backgroundColor: '#0f172a',
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  draftBtnTxt: { color: '#fff', fontWeight: FONT.weights.semibold },
  save: {
    marginTop: SPACE.md,
    backgroundColor: COLORS.primary,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    ...SHADOW.md,
  },
  saveTxt: { color: '#FFF', fontWeight: FONT.weights.bold },
});
