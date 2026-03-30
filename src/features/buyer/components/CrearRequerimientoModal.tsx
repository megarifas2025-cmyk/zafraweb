import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Switch,
  Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { PostgrestError } from '@supabase/supabase-js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CATEGORIA_DESTINO_REQUERIMIENTO,
  crearRequerimientoCompra,
} from '@/shared/services/marketDemandService';
import type { CategoriaDestinoRequerimiento } from '@/shared/types';
import { ESTADOS_REGISTRO } from '@/shared/data/venezuelaMunicipios';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const ACCENT = '#1565C0';
const CREAM = '#FDFBF7';
const SLATE = '#0F172A';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreado: () => void;
  initialCategoriaDestino?: CategoriaDestinoRequerimiento;
  initialRubro?: string;
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const OPCIONES_DESTINO: {
  value: CategoriaDestinoRequerimiento;
  label: string;
  audience: string;
}[] = [
  {
    value: CATEGORIA_DESTINO_REQUERIMIENTO.insumosMaquinaria,
    label: 'Insumos, repuestos y maquinaria',
    audience: 'Agrotiendas',
  },
  {
    value: CATEGORIA_DESTINO_REQUERIMIENTO.cosechaGranel,
    label: 'Cosecha a Granel',
    audience: 'Productores independientes',
  },
  {
    value: CATEGORIA_DESTINO_REQUERIMIENTO.volumenProcesadoSilos,
    label: 'Volumen Procesado / Silos',
    audience: 'Empresas',
  },
];

function audienceLabel(value: CategoriaDestinoRequerimiento): string {
  return OPCIONES_DESTINO.find((item) => item.value === value)?.audience ?? 'proveedores compatibles';
}

export function CrearRequerimientoModal({
  visible,
  onClose,
  onCreado,
  initialCategoriaDestino = CATEGORIA_DESTINO_REQUERIMIENTO.insumosMaquinaria,
  initialRubro = '',
}: Props) {
  const insets = useSafeAreaInsets();
  const [categoriaDestino, setCategoriaDestino] = useState<CategoriaDestinoRequerimiento>(
    initialCategoriaDestino,
  );
  const [rubro, setRubro] = useState(initialRubro);
  const [cantidadTxt, setCantidadTxt] = useState('');
  const [nacional, setNacional] = useState(true);
  const [estadoVe, setEstadoVe] = useState('');
  const [fechaLimite, setFechaLimite] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() + 14);
    return t;
  });
  const [showDate, setShowDate] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [pickerEstado, setPickerEstado] = useState(false);

  const reset = () => {
    setCategoriaDestino(initialCategoriaDestino);
    setRubro(initialRubro);
    setCantidadTxt('');
    setNacional(true);
    setEstadoVe('');
    const t = new Date();
    t.setDate(t.getDate() + 14);
    setFechaLimite(t);
  };

  const cerrar = () => {
    reset();
    onClose();
  };

  useEffect(() => {
    if (!visible) return;
    setCategoriaDestino(initialCategoriaDestino);
    setRubro(initialRubro);
  }, [visible, initialCategoriaDestino, initialRubro]);

  async function guardar() {
    const r = rubro.trim();
    if (!r) {
      Alert.alert('Rubro', 'Indica el producto o rubro que buscas.');
      return;
    }
    const c = parseFloat(cantidadTxt.replace(',', '.'));
    if (!Number.isFinite(c) || c <= 0) {
      Alert.alert('Cantidad', 'Indica una cantidad válida (toneladas o unidades).');
      return;
    }
    if (!nacional && !estadoVe.trim()) {
      Alert.alert('Estado', 'Selecciona el estado donde quieres concentrar la demanda.');
      return;
    }
    setGuardando(true);
    try {
      await crearRequerimientoCompra({
        rubro: r,
        cantidad: c,
        precio_estimado: null,
        ubicacion_estado: nacional ? 'Nacional' : estadoVe,
        fecha_limite: toYmd(fechaLimite),
        categoria_destino: categoriaDestino,
      });
      Alert.alert('Listo', 'Tu requerimiento quedó publicado en el mercado.');
      onCreado();
      cerrar();
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'code' in e
          ? mensajeSupabaseConPista(e as PostgrestError)
          : e instanceof Error
            ? e.message
            : 'No se pudo publicar.';
      Alert.alert('Error', msg);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={cerrar}>
      <KeyboardAvoidingView
        style={m.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={m.dim} onPress={cerrar} />
        <View style={[m.sheet, { paddingBottom: Math.max(insets.bottom, SPACE.sm) + SPACE.sm }]}>
          <View style={m.handle} />
          <Text style={m.title}>Publicar requerimiento</Text>
          <Text style={m.sub}>Demanda visible para {audienceLabel(categoriaDestino).toLowerCase()} verificados.</Text>

          <ScrollView
            style={m.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[m.label, m.labelFirst]}>¿A quién va dirigido?</Text>
            <View style={m.destinoSeg}>
              {OPCIONES_DESTINO.map((op) => {
                const on = categoriaDestino === op.value;
                return (
                  <TouchableOpacity
                    key={op.value}
                    style={[m.destinoRow, on && m.destinoRowOn]}
                    onPress={() => setCategoriaDestino(op.value)}
                    activeOpacity={0.88}
                  >
                    <Text style={[m.destinoLabel, on && m.destinoLabelOn]}>{op.label}</Text>
                    <Text style={[m.destinoAudience, on && m.destinoAudienceOn]}>{op.audience}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={m.label}>Rubro / producto</Text>
            <TextInput
              style={m.input}
              value={rubro}
              onChangeText={setRubro}
              placeholder="Ej. Maíz, Urea 46%, Arroz paddy…"
              placeholderTextColor="#94a3b8"
            />

            <Text style={m.label}>Cantidad (toneladas o sacos — número)</Text>
            <TextInput
              style={m.input}
              value={cantidadTxt}
              onChangeText={setCantidadTxt}
              placeholder="Ej. 120"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
            />

            <View style={m.blindPriceCard}>
              <Text style={m.blindPriceTitle}>Negociación sin precio público</Text>
              <Text style={m.blindPriceBody}>
                Tu requerimiento se publica sin precio visible. Las condiciones se acuerdan directamente dentro del chat.
              </Text>
            </View>

            <View style={m.rowSwitch}>
              <Text style={m.labelInline}>Alcance nacional</Text>
              <Switch
                value={nacional}
                onValueChange={setNacional}
                trackColor={{ false: COLORS.border, true: ACCENT }}
                thumbColor="#fff"
              />
            </View>
            {!nacional ? (
              <>
                <Text style={m.label}>Estado</Text>
                <TouchableOpacity style={m.input} onPress={() => setPickerEstado(true)}>
                  <Text style={[m.pickerTxt, !estadoVe && m.placeholderTxt]}>{estadoVe || 'Selecciona estado'}</Text>
                </TouchableOpacity>
              </>
            ) : null}

            <Text style={m.label}>Fecha límite de compra</Text>
            <TouchableOpacity style={m.input} onPress={() => setShowDate(true)}>
              <Text style={m.pickerTxt}>{toYmd(fechaLimite)}</Text>
            </TouchableOpacity>
            {showDate ? (
              <DateTimePicker
                value={fechaLimite}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={(ev, d) => {
                  if (Platform.OS === 'android') setShowDate(false);
                  if (ev.type === 'dismissed') return;
                  if (d) setFechaLimite(d);
                }}
              />
            ) : null}
            {Platform.OS === 'ios' && showDate ? (
              <TouchableOpacity style={m.iosOk} onPress={() => setShowDate(false)}>
                <Text style={m.iosOkTxt}>Listo</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={m.btn} onPress={() => void guardar()} disabled={guardando}>
              {guardando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={m.btnTxt}>Confirmar y publicar</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>

        {pickerEstado ? (
          <Pressable style={m.pickerOverlay} onPress={() => setPickerEstado(false)}>
            <View style={m.pickerSheet}>
              <Text style={m.pickerTitle}>Estado</Text>
              <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                {ESTADOS_REGISTRO.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={m.pickerRow}
                    onPress={() => {
                      setEstadoVe(e);
                      setPickerEstado(false);
                    }}
                  >
                    <Text style={m.pickerRowTxt}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const m = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)', zIndex: 1 },
  sheet: {
    zIndex: 2,
    backgroundColor: CREAM,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    maxHeight: '92%',
    ...SHADOW.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: SPACE.sm,
  },
  title: {
    fontSize: FONT.sizes.xl,
    fontWeight: FONT.weights.heavy,
    color: SLATE,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sub: { fontSize: FONT.sizes.sm, color: '#64748b', marginTop: 6, marginBottom: SPACE.md },
  scroll: { maxHeight: 560 },
  labelFirst: { marginTop: 0 },
  destinoSeg: { gap: 8, marginBottom: SPACE.sm },
  destinoRow: {
    borderWidth: 2,
    borderColor: '#e7e5e4',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  destinoRowOn: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(21,101,192,0.07)',
  },
  destinoLabel: {
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.heavy,
    color: SLATE,
  },
  destinoLabelOn: { color: ACCENT },
  destinoAudience: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: FONT.weights.bold,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  destinoAudienceOn: { color: '#64748b' },
  label: {
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.bold,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
    marginTop: SPACE.sm,
  },
  labelInline: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold, color: SLATE, flex: 1 },
  input: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    paddingHorizontal: SPACE.md,
    paddingVertical: 14,
    fontSize: FONT.sizes.md,
    color: SLATE,
  },
  pickerTxt: { fontSize: FONT.sizes.md, color: SLATE, fontWeight: FONT.weights.medium },
  placeholderTxt: { color: '#94a3b8', fontWeight: FONT.weights.regular },
  blindPriceCard: {
    marginTop: SPACE.sm,
    backgroundColor: '#eff6ff',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  blindPriceTitle: {
    fontSize: FONT.sizes.sm,
    fontWeight: FONT.weights.bold,
    color: ACCENT,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  blindPriceBody: {
    marginTop: 6,
    fontSize: FONT.sizes.sm,
    color: '#475569',
    lineHeight: 20,
  },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACE.md,
    marginBottom: SPACE.xs,
  },
  btn: {
    marginTop: SPACE.lg,
    marginBottom: SPACE.xl,
    backgroundColor: ACCENT,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACE.md,
    alignItems: 'center',
    ...SHADOW.lg,
  },
  btnTxt: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md },
  iosOk: {
    alignSelf: 'center',
    marginTop: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    backgroundColor: ACCENT,
    borderRadius: RADIUS.md,
  },
  iosOkTxt: { color: '#fff', fontWeight: FONT.weights.bold },
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
    padding: SPACE.md,
    zIndex: 100,
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    paddingBottom: SPACE.sm,
  },
  pickerTitle: {
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.xs,
    fontWeight: FONT.weights.bold,
    color: SLATE,
    fontSize: FONT.sizes.md,
  },
  pickerRow: { paddingVertical: 14, paddingHorizontal: SPACE.md, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pickerRowTxt: { fontSize: FONT.sizes.md, color: SLATE },
});
