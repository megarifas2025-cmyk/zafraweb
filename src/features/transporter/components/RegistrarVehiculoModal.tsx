/**
 * Alta de vehículo independiente — estética Unicornio Azul (navy / blue, cream, bordes 24+).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import type { PostgrestError } from '@supabase/supabase-js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/shared/lib/supabase';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import { ScrollableListModal } from '@/shared/components/ScrollableListModal';
import { FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const TX = { navy: '#1E3A8A', blue: '#3B82F6', cream: '#FDFBF7', slate: '#0f172a' };

type TipoVehiculoValue = 'camioneta' | 'camion_5t' | 'camion_10t' | 'gandola' | 'mula';
type ModelOption = { label: string; subtitle: string };
type VehicleClass = {
  key: string;
  label: string;
  value: TipoVehiculoValue;
  subtitle: string;
  tonHint: string;
  models: readonly ModelOption[];
};

const CARROCERIAS = [
  'Estacas',
  'Cava seca',
  'Cava refrigerada',
  'Plataforma',
  'Volteo',
  'Cisterna',
  'Portacontenedor',
  'Jaula ganadera',
  'Granelera',
  'Lowboy',
] as const;

const VEHICLE_CLASSES: readonly VehicleClass[] = [
  {
    key: 'camioneta_carga',
    label: 'Camioneta de carga',
    value: 'camioneta',
    subtitle: 'Pickup o estaca liviana para repartos cortos',
    tonHint: '0.8 a 3.5 t',
    models: [
      { label: 'Chevrolet Silverado 3500', subtitle: 'Estacas / carga liviana' },
      { label: 'Ford F-350', subtitle: 'Cava, estacas o plataforma' },
      { label: 'Ford Super Duty F-250', subtitle: 'Carga liviana operativa' },
      { label: 'Toyota Hilux Carga', subtitle: 'Pickup de trabajo' },
      { label: 'Toyota Land Cruiser 79', subtitle: 'Pickup reforzada' },
      { label: 'Mitsubishi L200 Carga', subtitle: 'Liviana / agrícola' },
      { label: 'Nissan Frontier NP300', subtitle: 'Pickup de faena' },
      { label: 'JAC T8 Carga', subtitle: 'Pickup comercial' },
    ],
  },
  {
    key: 'camion_mediano',
    label: 'Camión mediano 3.5T a 8T',
    value: 'camion_5t',
    subtitle: '350, NPR corto, cava, plataforma, volteo mediano',
    tonHint: '3.5 a 8 t',
    models: [
      { label: 'Chevrolet 350', subtitle: 'Camión 5 toneladas clásico' },
      { label: 'Chevrolet NPR', subtitle: 'Cabina frontal mediana' },
      { label: 'Chevrolet NKR', subtitle: 'Reparto urbano' },
      { label: 'Isuzu NPR', subtitle: 'Cava o plataforma' },
      { label: 'Isuzu NKR', subtitle: 'Distribución local' },
      { label: 'Mitsubishi Fuso Canter', subtitle: 'Mediano liviano' },
      { label: 'Hino 300', subtitle: 'Distribución y reparto' },
      { label: 'JAC N-Series', subtitle: 'Camión urbano' },
      { label: 'Hyundai Mighty EX', subtitle: 'Cava / plataforma' },
    ],
  },
  {
    key: 'camion_pesado',
    label: 'Camión pesado 8T a 18T',
    value: 'camion_10t',
    subtitle: 'NPR largo, FVR, FTR, volteo y cava pesada',
    tonHint: '8 a 18 t',
    models: [
      { label: 'Chevrolet FVR', subtitle: 'Carga pesada rígida' },
      { label: 'Chevrolet FTR', subtitle: 'Plataforma o cava' },
      { label: 'Chevrolet FSR', subtitle: 'Distribución pesada' },
      { label: 'Isuzu FVR', subtitle: 'Camión 10-18 toneladas' },
      { label: 'Isuzu FTR', subtitle: 'Carga interurbana' },
      { label: 'Ford Cargo 1721', subtitle: 'Rígido mediano-pesado' },
      { label: 'Ford Cargo 1723', subtitle: 'Operación nacional' },
      { label: 'Iveco Tector', subtitle: 'Rígido de carga' },
      { label: 'Mercedes-Benz Atego 1725', subtitle: 'Carga seca o cava' },
      { label: 'Hino 500', subtitle: 'Camión rígido pesado' },
      { label: 'International DuraStar 4300', subtitle: 'Cava / plataforma' },
    ],
  },
  {
    key: 'gandola',
    label: 'Gandola / tractocamión',
    value: 'gandola',
    subtitle: 'Cabezal con semirremolque para carga nacional',
    tonHint: '20 a 35 t',
    models: [
      { label: 'Freightliner M2', subtitle: 'Carga nacional y regional' },
      { label: 'Freightliner Cascadia', subtitle: 'Larga distancia' },
      { label: 'Mack Granite', subtitle: 'Gandola pesada' },
      { label: 'Mack CH', subtitle: 'Tractocamión clásico' },
      { label: 'Volvo FH', subtitle: 'Larga distancia y contenedor' },
      { label: 'Volvo FM', subtitle: 'Carga mixta' },
      { label: 'Scania R420', subtitle: 'Tractocamión pesado' },
      { label: 'Scania G420', subtitle: 'Ruta nacional' },
      { label: 'Kenworth T800', subtitle: 'Carga pesada' },
      { label: 'International 7600', subtitle: 'Cabezal de gandola' },
      { label: 'Mercedes-Benz Actros 2644', subtitle: 'Tractocamión premium' },
      { label: 'Mercedes-Benz Axor 3340', subtitle: 'Carga industrial' },
    ],
  },
  {
    key: 'mula',
    label: 'Mula / chuto de patio',
    value: 'mula',
    subtitle: 'Arrastre de remolque, contenedor o maniobra de patio',
    tonHint: '15 a 30 t',
    models: [
      { label: 'Freightliner Columbia', subtitle: 'Arrastre y patio' },
      { label: 'Freightliner Century', subtitle: 'Operación portuaria' },
      { label: 'Mack Vision', subtitle: 'Mula de carga pesada' },
      { label: 'Volvo VNL', subtitle: 'Arrastre de contenedor' },
      { label: 'Kenworth T660', subtitle: 'Maniobra y ruta' },
      { label: 'International ProStar', subtitle: 'Cabezal de patio o ruta' },
      { label: 'Scania P360', subtitle: 'Operación de arrastre' },
    ],
  },
] as const;

const PLACA_VE_ACTUAL = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
const PLACA_VE_ANTERIOR = /^[A-Z]{3}\d{3}$/;

function sanitizePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

type Props = {
  visible: boolean;
  onClose: () => void;
  propietarioId: string;
  /** Debe volver a cargar la flota; se espera con await antes de cerrar el modal. */
  onGuardado: () => void | Promise<void>;
};

export function RegistrarVehiculoModal({ visible, onClose, propietarioId, onGuardado }: Props) {
  const insets = useSafeAreaInsets();
  const [placa, setPlaca] = useState('');
  const [marcaModelo, setMarcaModelo] = useState('');
  const [tipoIdx, setTipoIdx] = useState(0);
  const [ton, setTon] = useState('');
  const [anio, setAnio] = useState('');
  const [color, setColor] = useState('');
  const [ejes, setEjes] = useState('');
  const [carroceria, setCarroceria] = useState('');
  const [driverHasGpsPhone, setDriverHasGpsPhone] = useState(true);
  const [driverAppReady, setDriverAppReady] = useState(true);
  const [deviceNotes, setDeviceNotes] = useState('');
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [bodyPickerVisible, setBodyPickerVisible] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const tipoActual = VEHICLE_CLASSES[tipoIdx]!;
  const modelosDisponibles = useMemo(() => tipoActual.models, [tipoActual]);

  function reset() {
    setPlaca('');
    setMarcaModelo('');
    setTipoIdx(0);
    setTon('');
    setAnio('');
    setColor('');
    setEjes('');
    setCarroceria('');
    setDriverHasGpsPhone(true);
    setDriverAppReady(true);
    setDeviceNotes('');
  }

  // Limpiar estado al cerrar el modal
  useEffect(() => {
    if (!visible) reset();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  async function guardar() {
    const p = sanitizePlate(placa.trim());
    if (!p) {
      Alert.alert('Placa', 'Indica la placa del vehículo.');
      return;
    }
    if (!PLACA_VE_ACTUAL.test(p) && !PLACA_VE_ANTERIOR.test(p)) {
      Alert.alert(
        'Placa inválida',
        'Usa un formato venezolano válido. Ejemplos: AB123CD (actual) o ABC123 (anterior).',
      );
      return;
    }
    const t = Number.parseFloat(ton.replace(',', '.'));
    const capacidadKg = ton.trim() && !Number.isNaN(t) && t > 0 ? t * 1000 : null;
    const year = Number.parseInt(anio, 10);
    const ejesNum = Number.parseInt(ejes, 10);
    const mm = marcaModelo.trim();
    let marca: string | null = mm;
    let modelo: string | null = null;
    if (mm.includes('/')) {
      const parts = mm.split('/').map((s) => s.trim());
      marca = parts[0] || null;
      modelo = parts[1] || null;
    } else if (mm.includes(' ')) {
      const sp = mm.indexOf(' ');
      marca = mm.slice(0, sp).trim() || null;
      modelo = mm.slice(sp + 1).trim() || null;
    }

    setGuardando(true);
    try {
      const { data: existingVehicle, error: existingVehicleError } = await supabase
        .from('vehiculos')
        .select('id, propietario_id, activo')
        .eq('placa', p)
        .eq('activo', true)
        .limit(1)
        .maybeSingle();
      if (existingVehicleError) {
        throw new Error(existingVehicleError.message || 'No se pudo validar la placa.');
      }
      if (existingVehicle) {
        const sameOwner = existingVehicle.propietario_id === propietarioId;
        Alert.alert(
          'Placa ya registrada',
          sameOwner
            ? 'Esa placa ya está registrada en tu flota.'
            : 'Esa placa ya pertenece a otra cuenta activa. No se puede repetir entre usuarios.',
        );
        return;
      }

      const tipo = tipoActual.value;
      const { error } = await supabase.from('vehiculos').insert({
        propietario_id: propietarioId,
        tipo,
        placa: p,
        marca,
        modelo,
        anio: Number.isFinite(year) ? year : null,
        color: color.trim() || null,
        carroceria: carroceria.trim() || null,
        ejes: Number.isFinite(ejesNum) && ejesNum > 0 ? ejesNum : null,
        driver_has_gps_phone: driverHasGpsPhone,
        driver_app_ready: driverAppReady,
        device_notes: deviceNotes.trim() || null,
        capacidad_kg: capacidadKg,
        activo: true,
        company_id: null,
      });
      if (error) {
        console.warn('[vehiculos.insert]', error);
        if (error.code === '23505') {
          throw new Error('Esa placa ya está registrada en otra flota activa.');
        }
        throw new Error(error.message || error.code || 'No se pudo guardar el vehículo.');
      }
      reset();
      await Promise.resolve(onGuardado());
      onClose();
      Alert.alert('Listo', 'Vehículo registrado en tu flota.');
    } catch (e: unknown) {
      const hint =
        e && typeof e === 'object' && 'code' in e
          ? `\n\nSi es un bloqueo RLS, ejecuta database/delta-fix-insert-rls-base.sql en Supabase.`
          : '';
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message?: string }).message)
          : e instanceof Error
            ? e.message
            : 'No se pudo guardar.';
      const detailed =
        e && typeof e === 'object' && 'code' in e
          ? mensajeSupabaseConPista(e as PostgrestError)
          : msg;
      Alert.alert('Error', `${detailed}${hint}`);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={m.backdrop}>
        <View style={[m.sheet, { paddingBottom: Math.max(insets.bottom, SPACE.md) + SPACE.lg }]}>
          <Text style={m.title}>Registrar vehículo</Text>
          <Text style={m.sub}>Flota independiente · datos visibles solo para tu operación.</Text>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={m.label}>Placa</Text>
            <TextInput
              style={m.input}
              value={placa}
              onChangeText={(text) => setPlaca(sanitizePlate(text))}
              placeholder="AA000AA"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              maxLength={7}
            />
            <Text style={m.helper}>Regla práctica Venezuela: formato actual `AB123CD`. También se admite `ABC123` para unidades antiguas.</Text>

            <Text style={m.label}>Clase de unidad</Text>
            <TouchableOpacity style={m.selector} onPress={() => setTypePickerVisible(true)} activeOpacity={0.9}>
              <Text style={m.selectorTxt}>{tipoActual.label}</Text>
              <Text style={m.selectorSub}>{tipoActual.subtitle} · capacidad típica {tipoActual.tonHint}</Text>
            </TouchableOpacity>

            <Text style={m.label}>Modelo sugerido</Text>
            <TouchableOpacity style={m.selector} onPress={() => setModelPickerVisible(true)} activeOpacity={0.9}>
              <Text style={m.selectorTxt}>{marcaModelo || 'Elegir de la lista'}</Text>
              <Text style={m.selectorSub}>Toca para ver modelos comunes de camiones, gandolas y vehículos de carga.</Text>
            </TouchableOpacity>

            <Text style={m.label}>Marca / modelo manual</Text>
            <TextInput
              style={m.input}
              value={marcaModelo}
              onChangeText={setMarcaModelo}
              placeholder="Ej. Freightliner / M2"
              placeholderTextColor="#94a3b8"
            />
            <Text style={m.helper}>Puedes elegir un modelo de la lista o escribirlo manualmente si tu unidad no aparece.</Text>

            <Text style={m.label}>Capacidad (toneladas)</Text>
            <TextInput
              style={m.input}
              value={ton}
              onChangeText={setTon}
              placeholder="Ej. 25"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
            />

            <Text style={m.label}>Año</Text>
            <TextInput
              style={m.input}
              value={anio}
              onChangeText={setAnio}
              placeholder="Ej. 2018"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              maxLength={4}
            />

            <Text style={m.label}>Color</Text>
            <TextInput
              style={m.input}
              value={color}
              onChangeText={setColor}
              placeholder="Ej. Blanco"
              placeholderTextColor="#94a3b8"
            />

            <Text style={m.label}>Carrocería</Text>
            <TouchableOpacity style={m.selector} onPress={() => setBodyPickerVisible(true)} activeOpacity={0.9}>
              <Text style={m.selectorTxt}>{carroceria || 'Elegir tipo de carrocería'}</Text>
              <Text style={m.selectorSub}>Cava, estacas, plataforma, volteo, cisterna, contenedor y más.</Text>
            </TouchableOpacity>

            <Text style={m.label}>Número de ejes</Text>
            <TextInput
              style={m.input}
              value={ejes}
              onChangeText={setEjes}
              placeholder="Ej. 2, 3, 4"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              maxLength={2}
            />

            <Text style={m.label}>Capacidad operativa del chofer</Text>
            <View style={m.toggleRow}>
              <TouchableOpacity style={[m.toggle, driverHasGpsPhone && m.toggleOn]} onPress={() => setDriverHasGpsPhone((v) => !v)} activeOpacity={0.88}>
                <Text style={[m.toggleTxt, driverHasGpsPhone && m.toggleTxtOn]}>Teléfono con GPS</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[m.toggle, driverAppReady && m.toggleOn]} onPress={() => setDriverAppReady((v) => !v)} activeOpacity={0.88}>
                <Text style={[m.toggleTxt, driverAppReady && m.toggleTxtOn]}>App operativa</Text>
              </TouchableOpacity>
            </View>
            <Text style={m.helper}>
              Esto describe si la unidad suele trabajar con un chofer y dispositivo aptos para tracking real. En cada viaje podrás cambiar el chofer concreto.
            </Text>

            <Text style={m.label}>Notas del dispositivo (opcional)</Text>
            <TextInput
              style={[m.input, m.inputNotes]}
              value={deviceNotes}
              onChangeText={setDeviceNotes}
              placeholder="Marca del teléfono, soporte GPS, observaciones..."
              placeholderTextColor="#94a3b8"
              multiline
            />
          </ScrollView>

          <View style={m.actions}>
            <TouchableOpacity style={m.btnGhost} onPress={onClose} disabled={guardando}>
              <Text style={m.btnGhostTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={m.btnPri} onPress={() => void guardar()} disabled={guardando}>
              {guardando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={m.btnPriTxt}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      <ScrollableListModal
        visible={typePickerVisible}
        title="Clase de vehículo"
        data={VEHICLE_CLASSES}
        keyExtractor={(item) => item.key}
        label={(item) => item.label}
        subtitle={(item) => `${item.subtitle} · ${item.tonHint}`}
        onSelect={(item) => {
          const idx = VEHICLE_CLASSES.findIndex((x) => x.key === item.key);
          setTipoIdx(Math.max(idx, 0));
          setMarcaModelo('');
        }}
        onClose={() => setTypePickerVisible(false)}
        emptyPlaceholder="No hay clases disponibles."
        footerCloseLabel="Cerrar"
      />
      <ScrollableListModal
        visible={modelPickerVisible}
        title={`Modelos · ${tipoActual.label}`}
        data={modelosDisponibles}
        keyExtractor={(item) => item.label}
        label={(item) => item.label}
        subtitle={(item) => item.subtitle}
        onSelect={(item) => setMarcaModelo(item.label)}
        onClose={() => setModelPickerVisible(false)}
        emptyPlaceholder="No hay modelos sugeridos para esta clase."
        footerCloseLabel="Cerrar"
      />
      <ScrollableListModal
        visible={bodyPickerVisible}
        title="Tipo de carrocería"
        data={CARROCERIAS}
        keyExtractor={(item) => item}
        label={(item) => item}
        onSelect={(item) => setCarroceria(item)}
        onClose={() => setBodyPickerVisible(false)}
        emptyPlaceholder="No hay carrocerías disponibles."
        footerCloseLabel="Cerrar"
      />
    </Modal>
  );
}

const m = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: TX.cream,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.xl,
    maxHeight: '82%',
    ...SHADOW.lg,
  },
  title: {
    fontSize: FONT.sizes.xl,
    fontWeight: FONT.weights.heavy,
    color: TX.slate,
    fontStyle: 'italic',
  },
  sub: { fontSize: FONT.sizes.sm, color: '#64748b', marginTop: 6, marginBottom: SPACE.md },
  label: { fontSize: FONT.sizes.xs, fontWeight: FONT.weights.bold, color: TX.navy, marginBottom: 6, marginTop: SPACE.sm },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(30,58,138,0.2)',
    borderRadius: 16,
    padding: SPACE.md,
    fontSize: FONT.sizes.md,
    color: TX.slate,
    backgroundColor: '#fff',
  },
  helper: { fontSize: FONT.sizes.xs, color: '#64748b', marginTop: 6, lineHeight: 18 },
  toggleRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  toggle: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(30,58,138,0.2)',
    borderRadius: 16,
    minHeight: 52,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.sm,
  },
  toggleOn: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: 'rgba(59,130,246,0.45)',
  },
  toggleTxt: { fontSize: FONT.sizes.sm, color: '#64748b', fontWeight: FONT.weights.semibold, textAlign: 'center' },
  toggleTxtOn: { color: TX.navy, fontWeight: FONT.weights.bold },
  inputNotes: { minHeight: 88, textAlignVertical: 'top' },
  selector: {
    borderWidth: 1,
    borderColor: 'rgba(30,58,138,0.2)',
    borderRadius: 16,
    padding: SPACE.md,
    backgroundColor: '#fff',
  },
  selectorTxt: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: TX.slate },
  selectorSub: { fontSize: FONT.sizes.sm, color: '#64748b', marginTop: 4, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACE.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
    backgroundColor: '#fff',
  },
  chipOn: { borderColor: TX.blue, backgroundColor: 'rgba(59,130,246,0.12)' },
  chipTxt: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold, color: '#64748b' },
  chipTxtOn: { color: TX.navy, fontWeight: FONT.weights.bold },
  actions: { flexDirection: 'row', gap: 12, marginTop: SPACE.lg },
  btnGhost: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(30,58,138,0.25)',
  },
  btnGhostTxt: { color: TX.navy, fontWeight: FONT.weights.bold },
  btnPri: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: TX.navy,
  },
  btnPriTxt: { color: '#fff', fontWeight: FONT.weights.heavy, fontSize: FONT.sizes.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
});
