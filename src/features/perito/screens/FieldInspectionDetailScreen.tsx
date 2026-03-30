import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import type { PeritoStackParamList } from '@/features/perito/navigation/types';
import { useAuth } from '@/shared/store/AuthContext';
import {
  localGetById,
  localSaveDraft,
} from '@/shared/lib/fieldInspectionLocalDb';
import type { FieldInspection, InsumoRecomendado, FieldInspectionEstatus } from '@/shared/types';
import { pushDirtyFieldInspections } from '@/shared/services/fieldInspectionSync';
import { generateAndShareFieldInspectionPdf } from '@/shared/services/pdfGeneratorService';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import { listFieldInspectionHistory } from '@/shared/services/fieldInspectionTimelineService';

type Props = NativeStackScreenProps<PeritoStackParamList, 'FieldInspectionDetail'>;

function parseInsumos(json: string): InsumoRecomendado[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as InsumoRecomendado[]) : [];
  } catch {
    return [];
  }
}

function parseJsonArray(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function FieldInspectionDetailScreen({ route, navigation }: Props) {
  const { perfil } = useAuth();
  const { localId } = route.params;
  const [rowState, setRowState] = useState<Awaited<ReturnType<typeof localGetById>>>(null);
  const [, setEstatus] = useState<FieldInspectionEstatus>('pending');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [meta, setMeta] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [history, setHistory] = useState<FieldInspection[]>([]);

  const load = useCallback(async () => {
    try {
    const row = await localGetById(localId);
    if (!row) {
      Alert.alert('Error', 'No se encontró la orden en almacenamiento local.');
      navigation.goBack();
      return;
    }
    setRowState(row);
    setEstatus(row.estatus as FieldInspectionEstatus);
    setLat(row.lat);
    setLng(row.lng);
    setMeta(`${row.numero_control ?? ''} · ${row.fecha_programada}`);
    try {
      const remoteHistory = await listFieldInspectionHistory({
        fincaId: row.finca_id,
        productorId: row.productor_id,
        excludeId: row.server_id ?? row.id,
        limit: 4,
      });
      setHistory(remoteHistory);
    } catch {
      setHistory([]);
    }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cargar la inspección.');
    } finally {
      setLoading(false);
    }
  }, [localId, navigation]);

  useEffect(() => {
    load();
  }, [load]);

  const insumos = parseInsumos(rowState?.insumos_json ?? '');

  async function capturarGps() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('GPS', 'Se necesita permiso de ubicación.');
      return;
    }
    const p = await Location.getCurrentPositionAsync({});
    setLat(p.coords.latitude);
    setLng(p.coords.longitude);
    Alert.alert('Ubicación', `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`);
  }

  async function guardarLocal(nextStatus: FieldInspectionEstatus) {
    if (!rowState) return;
    await localSaveDraft({
      id: localId,
      observaciones_tecnicas: rowState.observaciones_tecnicas,
      resumen_dictamen: rowState.resumen_dictamen,
      insumos,
      estatus: nextStatus,
      lat,
      lng,
      precision_gps_m: rowState.precision_gps_m,
      tipo_inspeccion: rowState.tipo_inspeccion,
      estado_acta: rowState.estado_acta,
      porcentaje_dano: rowState.porcentaje_dano,
      estimacion_rendimiento_ton: rowState.estimacion_rendimiento_ton,
      area_verificada_ha: rowState.area_verificada_ha,
      fuera_de_lote: rowState.fuera_de_lote === 1,
      fase_fenologica: rowState.fase_fenologica,
      malezas_reportadas: rowState.malezas_reportadas,
      plagas_reportadas: rowState.plagas_reportadas,
      recomendacion_insumos: rowState.recomendacion_insumos,
      evidencias_fotos_json: rowState.evidencias_fotos_json,
      firma_perito_json: rowState.firma_perito_json,
      firma_productor_json: rowState.firma_productor_json,
      firmado_en: rowState.firmado_en,
    });
    setEstatus(nextStatus);
    Alert.alert('Guardado', nextStatus === 'in_progress' ? 'Borrador en dispositivo (offline OK).' : 'Listo para sincronizar.');
  }

  async function sincronizar() {
    if (!perfil?.id) return;
    setSyncing(true);
    try {
      const { ok, errors } = await pushDirtyFieldInspections(perfil.id);
      if (errors.length) Alert.alert('Sync', `${ok} enviados. Errores: ${errors.join('; ')}`);
      else Alert.alert('Sync', `${ok} inspección(es) enviadas al búnker.`);
      await load();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Sync falló');
    } finally {
      setSyncing(false);
    }
  }

  async function pdf() {
    setPdfBusy(true);
    try {
      await generateAndShareFieldInspectionPdf(localId);
    } catch (e: unknown) {
      Alert.alert('PDF', e instanceof Error ? e.message : 'No se pudo generar');
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={COLORS.info} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <Text style={s.meta}>{meta}</Text>
      <View style={s.heroCard}>
        <Text style={s.heroTitle}>{rowState?.finca_nombre ?? 'Lote sin finca'}</Text>
        <Text style={s.heroSub}>
          {rowState?.productor_nombre ?? 'Productor'} · {rowState?.tipo_inspeccion ?? 'seguimiento_tecnico'} · {rowState?.estado_acta ?? rowState?.estatus}
        </Text>
        {rowState?.resumen_dictamen ? <Text style={s.heroBody}>{rowState.resumen_dictamen}</Text> : null}
      </View>
      <Text style={s.label}>Coordenadas GPS</Text>
      <Text style={s.gpsTxt}>
        {lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'Sin capturar · funciona offline'}
      </Text>
      <TouchableOpacity style={s.btnGps} onPress={() => void capturarGps()}>
        <Text style={s.btnGpsTxt}>📍 Capturar GPS ahora</Text>
      </TouchableOpacity>

      <View style={s.card}>
        <Text style={s.cardTitle}>Acta y evidencia</Text>
        <Text style={s.infoLine}>Daño estimado: {rowState?.porcentaje_dano != null ? `${rowState.porcentaje_dano}%` : '—'}</Text>
        <Text style={s.infoLine}>
          Rendimiento precosecha: {rowState?.estimacion_rendimiento_ton != null ? `${rowState.estimacion_rendimiento_ton} ton` : '—'}
        </Text>
        <Text style={s.infoLine}>Area verificada: {rowState?.area_verificada_ha != null ? `${rowState.area_verificada_ha} ha` : '—'}</Text>
        <Text style={s.infoLine}>Fase: {rowState?.fase_fenologica ?? '—'}</Text>
        <Text style={s.infoLine}>Plagas: {rowState?.plagas_reportadas ?? '—'}</Text>
        <Text style={s.infoLine}>Malezas: {rowState?.malezas_reportadas ?? '—'}</Text>
        <Text style={s.infoLine}>Fotos: {parseJsonArray(rowState?.evidencias_fotos_json).length}</Text>
        <Text style={s.infoLine}>Firma perito: {rowState?.firma_perito_json ? 'registrada' : 'pendiente'}</Text>
        <Text style={s.infoLine}>Firma productor: {rowState?.firma_productor_json ? 'registrada' : 'pendiente'}</Text>
        {rowState?.observaciones_tecnicas ? <Text style={s.longText}>{rowState.observaciones_tecnicas}</Text> : null}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Insumos recomendados</Text>
        {insumos.length ? (
          insumos.map((item, index) => (
            <Text key={`${item.nombre}-${index}`} style={s.infoLine}>
              {item.nombre}{item.dosis ? ` · ${item.dosis}` : ''}{item.notas ? ` · ${item.notas}` : ''}
            </Text>
          ))
        ) : (
          <Text style={s.infoLine}>Sin insumos registrados aún.</Text>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Contacto operativo</Text>
        <Text style={s.infoLine}>Agricultor: {rowState?.productor_nombre ?? '—'}</Text>
        <Text style={s.infoLine}>Teléfono: {rowState?.productor_telefono ?? '—'}</Text>
        {rowState?.productor_telefono ? (
          <TouchableOpacity
            style={s.contactBtn}
            onPress={async () => {
              const phone = rowState?.productor_telefono;
              if (!phone) {
                Alert.alert('Contacto', 'No hay teléfono disponible para este agricultor.');
                return;
              }
              const tel = phone.replace(/\s/g, '');
              const url = `tel:${tel}`;
              const canOpen = await Linking.canOpenURL(url);
              if (!canOpen) {
                Alert.alert('Contacto', 'No se pudo abrir el marcador telefónico.');
                return;
              }
              await Linking.openURL(url);
            }}
          >
            <Text style={s.contactBtnTxt}>Llamar agricultor</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Historial del lote</Text>
        {history.length ? (
          history.map((item) => (
            <View key={item.id} style={s.historyRow}>
              <Text style={s.historyControl}>{item.numero_control}</Text>
              <Text style={s.historyMeta}>
                {item.fecha_programada} · {item.tipo_inspeccion ?? 'seguimiento_tecnico'} · {item.estado_acta ?? item.estatus}
              </Text>
              <Text style={s.historyBody} numberOfLines={2}>
                {item.resumen_dictamen ?? item.observaciones_tecnicas ?? 'Sin resumen.'}
              </Text>
            </View>
          ))
        ) : (
          <Text style={s.infoLine}>Aún no hay otras visitas relacionadas con este lote o productor.</Text>
        )}
      </View>

      <TouchableOpacity style={s.btn} onPress={() => void guardarLocal('in_progress')}>
        <Text style={s.btnTxt}>Guardar borrador (offline)</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[s.btn, s.btnActa]} onPress={() => navigation.navigate('InspectionForm', { localTaskId: localId })}>
        <Text style={s.btnTxt}>Levantar / completar acta</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[s.btn, s.btnSync]} onPress={sincronizar} disabled={syncing}>
        {syncing ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnTxt}>↑ Sincronizar con Supabase</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={[s.btn, s.btnPdf]} onPress={pdf} disabled={pdfBusy}>
        {pdfBusy ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnTxt}>📄 Descargar / compartir informe PDF</Text>}
      </TouchableOpacity>
      <Text style={s.hint}>El PDF usa datos fiscales de la empresa vinculada. Requiere conexión y permisos RLS.</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  meta: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text, marginBottom: SPACE.md },
  heroCard: {
    backgroundColor: '#eff6ff',
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  heroTitle: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold, color: '#1e3a8a' },
  heroSub: { marginTop: 6, fontSize: FONT.sizes.sm, color: '#334155', fontWeight: FONT.weights.semibold },
  heroBody: { marginTop: 8, color: COLORS.text, lineHeight: 20 },
  label: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: SPACE.sm },
  gpsTxt: { fontSize: FONT.sizes.sm, color: COLORS.text, marginTop: 4 },
  btnGps: { marginTop: SPACE.sm, backgroundColor: '#E3F2FD', padding: SPACE.sm, borderRadius: RADIUS.md, alignItems: 'center' },
  btnGpsTxt: { color: COLORS.primary, fontWeight: FONT.weights.semibold },
  card: { marginTop: SPACE.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, ...SHADOW.sm },
  cardTitle: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text, marginBottom: 8 },
  infoLine: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4, lineHeight: 18 },
  longText: { marginTop: 8, color: COLORS.text, lineHeight: 20 },
  contactBtn: {
    marginTop: SPACE.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACE.md,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: '#eff6ff',
  },
  contactBtnTxt: { color: '#1d4ed8', fontWeight: FONT.weights.semibold },
  historyRow: { paddingTop: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  historyControl: { fontSize: FONT.sizes.xs, color: COLORS.info, fontWeight: FONT.weights.bold },
  historyMeta: { marginTop: 4, color: COLORS.textSecondary, fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold },
  historyBody: { marginTop: 4, color: COLORS.text, fontSize: FONT.sizes.sm, lineHeight: 18 },
  btn: { marginTop: SPACE.md, backgroundColor: COLORS.info, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center', ...SHADOW.sm },
  btnActa: { backgroundColor: COLORS.primary },
  btnSync: { backgroundColor: COLORS.success },
  btnPdf: { backgroundColor: COLORS.primary },
  btnTxt: { color: '#FFF', fontWeight: FONT.weights.bold },
  hint: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: SPACE.sm, lineHeight: 16 },
});
