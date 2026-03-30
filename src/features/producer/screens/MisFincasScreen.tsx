import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
import * as Location from 'expo-location';
import { useAuth } from '@/shared/store/AuthContext';
import { supabase } from '@/shared/lib/supabase';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import type { Finca } from '@/shared/types';
import { normalizeFincaCoordenadas } from '@/shared/utils/geo';
import { ESTADOS_REGISTRO, municipiosPorEstado } from '@/shared/data/venezuelaMunicipios';
import { ScrollableListModal } from '@/shared/components/ScrollableListModal';

export default function MisFincasScreen() {
  const nav = useNavigation();
  const { perfil } = useAuth();
  const [fincas, setFincas] = useState<Finca[]>([]);
  const [refresh, setRefresh] = useState(false);
  const [nombre, setNombre] = useState('');
  const [estadoVe, setEstadoVe] = useState(() =>
    perfil?.estado_ve && ESTADOS_REGISTRO.includes(perfil.estado_ve as (typeof ESTADOS_REGISTRO)[number])
      ? perfil.estado_ve
      : ESTADOS_REGISTRO[0]!,
  );
  const [municipio, setMunicipio] = useState('');
  const [modalEstado, setModalEstado] = useState(false);
  const [modalMuni, setModalMuni] = useState(false);
  const [rubro, setRubro] = useState('');
  const [hectareas, setHectareas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [coordsForm, setCoordsForm] = useState<{ lat: number; lng: number } | null>(null);
  const [capturandoGps, setCapturandoGps] = useState(false);

  const municipiosList = useMemo(() => municipiosPorEstado(estadoVe), [estadoVe]);

  useEffect(() => {
    if (perfil?.estado_ve && ESTADOS_REGISTRO.includes(perfil.estado_ve as (typeof ESTADOS_REGISTRO)[number])) {
      setEstadoVe(perfil.estado_ve);
    }
  }, [perfil?.estado_ve]);

  useEffect(() => {
    if (!municipiosList.length) return;
    setMunicipio(m => (m && municipiosList.includes(m) ? m : municipiosList[0]!));
  }, [estadoVe, municipiosList]);

  useEffect(() => {
    if (!mostrarForm || municipio || !municipiosList.length) return;
    setMunicipio(municipiosList[0]!);
  }, [mostrarForm, municipio, municipiosList]);

  const cargar = useCallback(async () => {
    if (!perfil) return;
    const { data, error } = await supabase
      .from('fincas')
      .select('*')
      .eq('propietario_id', perfil.id)
      .order('creado_en', { ascending: false });
    if (error) Alert.alert('Error', error.message);
    else {
      const rows = ((data as Finca[]) ?? []).map((item) => ({
        ...item,
        coordenadas: normalizeFincaCoordenadas(item.coordenadas),
      }));
      setFincas(rows);
    }
  }, [perfil]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const onRefresh = async () => {
    setRefresh(true);
    await cargar();
    setRefresh(false);
  };

  async function capturarGps() {
    setCapturandoGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso al GPS para guardar la ubicación.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoordsForm({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      Alert.alert('GPS', 'No se pudo obtener la ubicación. Intenta de nuevo.');
    } finally {
      setCapturandoGps(false);
    }
  }

  async function agregarFinca() {
    if (!perfil) return;
    const missingFields = [
      !nombre.trim() ? 'nombre' : null,
      !municipio.trim() ? 'municipio' : null,
      !rubro.trim() ? 'rubro principal' : null,
      !hectareas.trim() ? 'hectáreas' : null,
    ].filter(Boolean);
    if (missingFields.length) {
      Alert.alert('Datos', `Completa: ${missingFields.join(', ')}.`);
      return;
    }
    const ha = Number.parseFloat(hectareas.replace(',', '.'));
    if (!Number.isFinite(ha) || ha <= 0) {
      Alert.alert('Hectáreas', 'Introduce un número válido mayor que 0.');
      return;
    }
    setGuardando(true);
    try {
      const payload: Record<string, unknown> = {
        propietario_id: perfil.id,
        nombre: nombre.trim(),
        estado_ve: estadoVe.trim(),
        municipio: municipio.trim(),
        rubro: rubro.trim(),
        hectareas: ha,
        activa: true,
        company_id: null,
      };
      if (coordsForm) {
        // PostGIS GEOGRAPHY(POINT) expects WKT: SRID=4326;POINT(lng lat)
        payload.coordenadas = `SRID=4326;POINT(${coordsForm.lng} ${coordsForm.lat})`;
      }
      const { error } = await supabase.from('fincas').insert(payload);
      if (error) throw error;
      setNombre('');
      setMunicipio('');
      setRubro('');
      setHectareas('');
      setCoordsForm(null);
      setMostrarForm(false);
      await cargar();
      Alert.alert('Finca creada', 'Ya puedes usarla al publicar cosechas.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '¿Existe la tabla fincas en Supabase?';
      Alert.alert('Error', msg);
    } finally {
      setGuardando(false);
    }
  }

  async function desactivarFinca(fincaId: string, nombre: string) {
    Alert.alert(
      'Desactivar finca',
      `¿Seguro que quieres desactivar "${nombre}"? Los datos se conservan pero no aparecerá en reportes ni cosechas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('desactivar_finca', { p_finca_id: fincaId });
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              Alert.alert('Finca desactivada', 'La finca fue desactivada correctamente.');
              await cargar();
            }
          },
        },
      ],
    );
  }

  async function guardarGpsFinca(fincaId: string) {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso al GPS.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      // Intentar guardar via RPC primero (evita problemas de formato WKT en REST)
      const { error: rpcError } = await supabase.rpc('guardar_gps_finca', {
        p_finca_id: fincaId,
        p_lat: lat,
        p_lng: lng,
      });

      if (rpcError) {
        // Fallback: update directo con WKT
        const wkt = `SRID=4326;POINT(${lng} ${lat})`;
        const { data: updated, error: updateError } = await supabase
          .from('fincas')
          .update({ coordenadas: wkt })
          .eq('id', fincaId)
          .select('id')
          .single();
        if (updateError) throw updateError;
        if (!updated) throw new Error('No se actualizó (puede ser un problema de permisos).');
      }

      // Actualización optimista: marcar en el estado local que esta finca ya tiene GPS
      setFincas((prev) =>
        prev.map((f) =>
          f.id === fincaId ? { ...f, coordenadas: { lat, lng } } : f,
        ),
      );

      Alert.alert('GPS guardado', `Lat ${lat.toFixed(5)}, Lon ${lng.toFixed(5)}`);
      await cargar();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar el GPS.');
    }
  }

  return (
    <>
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      <TouchableOpacity style={styles.back} onPress={() => nav.goBack()}>
        <Text style={styles.backTxt}>← Volver al panel</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.addToggle} onPress={() => setMostrarForm(m => !m)}>
        <Text style={styles.addToggleTxt}>{mostrarForm ? 'Ocultar formulario' : '+ Registrar nueva finca'}</Text>
      </TouchableOpacity>

      {mostrarForm && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nueva finca</Text>
          <Text style={styles.label}>Nombre</Text>
          <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="La Esperanza" placeholderTextColor={COLORS.textDisabled} />
          <Text style={styles.label}>Estado (VE)</Text>
          <TouchableOpacity style={styles.picker} onPress={() => setModalEstado(true)} activeOpacity={0.85}>
            <Text style={styles.pickerTxt}>{estadoVe}</Text>
          </TouchableOpacity>
          <Text style={styles.label}>Municipio</Text>
          <TouchableOpacity style={styles.picker} onPress={() => setModalMuni(true)} activeOpacity={0.85}>
            <Text style={styles.pickerTxt}>{municipio || 'Selecciona municipio'}</Text>
          </TouchableOpacity>
          <Text style={styles.label}>Rubro principal</Text>
          <TextInput style={styles.input} value={rubro} onChangeText={setRubro} placeholder="Maíz, café…" placeholderTextColor={COLORS.textDisabled} />
          <Text style={styles.label}>Hectáreas</Text>
          <TextInput style={styles.input} value={hectareas} onChangeText={setHectareas} keyboardType="decimal-pad" placeholder="10.5" placeholderTextColor={COLORS.textDisabled} />
          <Text style={styles.label}>Ubicación GPS (opcional)</Text>
          <TouchableOpacity style={styles.btnGps} onPress={capturarGps} disabled={capturandoGps}>
            {capturandoGps
              ? <ActivityIndicator color={COLORS.primary} />
              : <Text style={styles.btnGpsTxt}>
                  {coordsForm
                    ? `📍 ${coordsForm.lat.toFixed(5)}, ${coordsForm.lng.toFixed(5)}`
                    : '📡 Capturar ubicación GPS'}
                </Text>
            }
          </TouchableOpacity>
          {coordsForm && (
            <TouchableOpacity onPress={() => setCoordsForm(null)}>
              <Text style={styles.gpsRemove}>✕ Quitar coordenadas</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.btnPri} onPress={agregarFinca} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPriTxt}>Guardar finca</Text>}
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sec}>{fincas.length} finca(s)</Text>
      {fincas.length === 0 ? (
        <Text style={styles.empty}>Aún no hay fincas. Usa el formulario de arriba.</Text>
      ) : (
        fincas.map(f => {
          const coords = normalizeFincaCoordenadas(f.coordenadas);
          return (
            <View key={f.id} style={styles.fincaRow}>
              <Text style={styles.fincaNombre}>{f.nombre}</Text>
              <Text style={styles.fincaSub}>{f.rubro} · {f.hectareas} ha · {f.municipio}, {f.estado_ve}</Text>
              <View style={styles.fincaFooter}>
                <Text style={[styles.fincaAct, !f.activa && styles.fincaActInactiva]}>
                  {f.activa ? 'Activa' : 'Inactiva'}
                </Text>
                {coords
                  ? <Text style={styles.fincaGps}>📍 GPS guardado</Text>
                  : <TouchableOpacity onPress={() => guardarGpsFinca(f.id)}>
                      <Text style={styles.fincaGpsMissing}>📡 Sin GPS — toca para capturar</Text>
                    </TouchableOpacity>
                }
              </View>
              {f.activa && (
                <TouchableOpacity onPress={() => desactivarFinca(f.id, f.nombre)} style={styles.btnDesactivar}>
                  <Text style={styles.btnDesactivarTxt}>Desactivar finca</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}
    </ScrollView>

    <ScrollableListModal
      visible={modalEstado}
      title="Estado (Venezuela)"
      data={ESTADOS_REGISTRO}
      keyExtractor={item => item}
      label={item => item}
      onSelect={setEstadoVe}
      onClose={() => setModalEstado(false)}
    />

    <ScrollableListModal
      visible={modalMuni}
      title={estadoVe}
      data={municipiosList}
      keyExtractor={item => item}
      label={item => item}
      onSelect={setMunicipio}
      onClose={() => setModalMuni(false)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  back: { marginBottom: SPACE.sm },
  backTxt: { color: COLORS.primary, fontWeight: '600', fontSize: FONT.sizes.sm },
  addToggle: { backgroundColor: COLORS.primary, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.md },
  addToggleTxt: { color: '#FFF', fontWeight: '700', textAlign: 'center' },
  card: { backgroundColor: COLORS.surface, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.lg, ...SHADOW.sm },
  cardTitle: { fontSize: FONT.sizes.lg, fontWeight: '700', marginBottom: SPACE.sm, color: COLORS.text },
  label: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: SPACE.sm, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACE.sm,
    fontSize: FONT.sizes.md,
    color: COLORS.text,
  },
  picker: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACE.sm,
    backgroundColor: COLORS.surface,
  },
  pickerTxt: { fontSize: FONT.sizes.md, color: COLORS.text },
  btnPri: { backgroundColor: COLORS.primary, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACE.md },
  btnPriTxt: { color: '#FFF', fontWeight: '700' },
  sec: { fontSize: FONT.sizes.md, fontWeight: '700', color: COLORS.text, marginBottom: SPACE.sm },
  empty: { color: COLORS.textDisabled, fontSize: FONT.sizes.sm },
  fincaRow: { backgroundColor: COLORS.surface, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm, borderLeftWidth: 3, borderLeftColor: COLORS.primary, ...SHADOW.sm },
  fincaNombre: { fontWeight: '700', fontSize: FONT.sizes.md, color: COLORS.text },
  fincaSub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  fincaFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  fincaAct: { fontSize: FONT.sizes.xs, color: COLORS.success },
  fincaActInactiva: { color: COLORS.textDisabled },
  btnDesactivar: { marginTop: SPACE.sm, borderWidth: 1, borderColor: COLORS.error ?? '#EF4444', borderRadius: RADIUS.sm, padding: SPACE.xs, alignItems: 'center' },
  btnDesactivarTxt: { color: COLORS.error ?? '#EF4444', fontSize: FONT.sizes.xs, fontWeight: '600' },
  fincaGps: { fontSize: FONT.sizes.xs, color: COLORS.primary },
  fincaGpsMissing: { fontSize: FONT.sizes.xs, color: COLORS.warning ?? '#F59E0B' },
  btnGps: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    padding: SPACE.sm,
    alignItems: 'center',
    marginTop: 4,
  },
  btnGpsTxt: { color: COLORS.primary, fontWeight: '600', fontSize: FONT.sizes.sm },
  gpsRemove: { color: COLORS.error ?? '#EF4444', fontSize: FONT.sizes.xs, marginTop: 4, textAlign: 'right' },
});
