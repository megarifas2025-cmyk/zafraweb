import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { insertarInsumoAgrotienda } from '@/shared/services/insumosLocalesService';
import type { CategoriaInsumo, LineaCatalogoAgrotienda } from '@/shared/types';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const LINEAS: { v: LineaCatalogoAgrotienda; label: string }[] = [
  { v: 'insumos', label: 'Insumos' },
  { v: 'repuestos', label: 'Repuestos' },
];

const CATEGORIAS: { v: CategoriaInsumo; label: string }[] = [
  { v: 'quimicos', label: 'Químicos' },
  { v: 'semillas', label: 'Semillas' },
  { v: 'maquinaria', label: 'Maquinaria' },
];

const SUBCATEGORIAS_REPUESTOS = [
  'Motor',
  'Hidráulico',
  'Transmisión',
  'Electricidad',
  'Tren de rodaje',
  'Consumible de taller',
] as const;

export interface AgregarInsumoModalProps {
  visible: boolean;
  onClose: () => void;
  perfilId: string;
  /** Pre-relleno manual */
  initialNombre?: string;
  initialCategoria?: CategoriaInsumo;
  onGuardado: () => void;
  userMunicipio?: string | null;
}

export function AgregarInsumoModal({
  visible,
  onClose,
  perfilId,
  initialNombre = '',
  initialCategoria = 'quimicos',
  onGuardado,
}: AgregarInsumoModalProps) {
  const [nombre, setNombre] = useState('');
  const [lineaCatalogo, setLineaCatalogo] = useState<LineaCatalogoAgrotienda>('insumos');
  const [categoria, setCategoria] = useState<CategoriaInsumo>(initialCategoria);
  const [subcategoria, setSubcategoria] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [disponibilidad, setDisponibilidad] = useState(true);
  const [stock, setStock] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (visible) {
      setNombre(initialNombre);
      setLineaCatalogo('insumos');
      setCategoria(initialCategoria);
      setSubcategoria('');
      setDescripcion('');
      setDisponibilidad(true);
      setStock('');
    }
  }, [visible, initialNombre, initialCategoria]);

  async function guardar() {
    const n = nombre.trim();
    if (!n) {
      Alert.alert('Nombre', 'Indica el nombre del producto.');
      return;
    }
    const normalizedStock = stock.trim().replace(',', '.');
    const stockNum = normalizedStock ? Number.parseFloat(normalizedStock) : null;
    if (stockNum != null && (!Number.isFinite(stockNum) || stockNum < 0 || !Number.isInteger(stockNum))) {
      Alert.alert('Stock', 'Indica un stock válido usando números enteros iguales o mayores a 0.');
      return;
    }
    setGuardando(true);
    try {
      await insertarInsumoAgrotienda({
        perfil_id: perfilId,
        nombre_producto: n,
        linea_catalogo: lineaCatalogo,
        categoria: lineaCatalogo === 'repuestos' ? 'maquinaria' : categoria,
        subcategoria: lineaCatalogo === 'repuestos' ? subcategoria.trim() || 'General' : null,
        descripcion: descripcion.trim() || null,
        precio: null,
        disponibilidad,
        stock_actual: stockNum,
      });
      onGuardado();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar.';
      Alert.alert('Error', msg);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 48 : 0}
      >
        <View style={s.header}>
          <Text style={s.title}>Nuevo insumo</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={s.cerrar}>Cerrar</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>Nombre</Text>
          <TextInput
            style={s.input}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Ej. Urea 46%"
            placeholderTextColor={COLORS.textDisabled}
          />
          <Text style={s.label}>Línea comercial</Text>
          <View style={s.chips}>
            {LINEAS.map((linea) => (
              <TouchableOpacity
                key={linea.v}
                style={[s.chip, lineaCatalogo === linea.v && s.chipActive]}
                onPress={() => setLineaCatalogo(linea.v)}
              >
                <Text style={[s.chipTxt, lineaCatalogo === linea.v && s.chipTxtActive]}>{linea.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.label}>Categoría</Text>
          {lineaCatalogo === 'insumos' ? (
            <View style={s.chips}>
              {CATEGORIAS.map(c => (
                <TouchableOpacity
                  key={c.v}
                  style={[s.chip, categoria === c.v && s.chipActive]}
                  onPress={() => setCategoria(c.v)}
                >
                  <Text style={[s.chipTxt, categoria === c.v && s.chipTxtActive]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <>
              <View style={s.chips}>
                {SUBCATEGORIAS_REPUESTOS.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[s.chip, subcategoria === item && s.chipActive]}
                    onPress={() => setSubcategoria(item)}
                  >
                    <Text style={[s.chipTxt, subcategoria === item && s.chipTxtActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[s.input, s.subcategoriaInput]}
                value={subcategoria}
                onChangeText={setSubcategoria}
                placeholder="Subcategoría o familia de repuesto"
                placeholderTextColor={COLORS.textDisabled}
              />
            </>
          )}
          <Text style={s.label}>Descripción</Text>
          <TextInput
            style={[s.input, s.multiline]}
            value={descripcion}
            onChangeText={setDescripcion}
            placeholder="Presentación, marca, empaque, notas de entrega…"
            placeholderTextColor={COLORS.textDisabled}
            multiline
          />
          <Text style={s.label}>Stock inicial (opcional)</Text>
          <TextInput
            style={s.input}
            value={stock}
            onChangeText={setStock}
            placeholder="Ej. 50  (dejar vacío = sin control de stock)"
            placeholderTextColor={COLORS.textDisabled}
            keyboardType="number-pad"
          />
          <Text style={s.hint}>Si indicas stock, la app lo mostrará a los compradores y lo marcará agotado al llegar a 0.</Text>
          <View style={s.rowSwitch}>
            <Text style={s.labelInline}>Disponible en catálogo</Text>
            <Switch
              value={disponibilidad}
              onValueChange={setDisponibilidad}
              trackColor={{ false: COLORS.border, true: COLORS.roles.agrotienda }}
              thumbColor={COLORS.surface}
            />
          </View>
          <TouchableOpacity style={s.btn} onPress={guardar} disabled={guardando}>
            {guardando ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={s.btnTxt}>Guardar catálogo sin precio público</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  title: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold, color: COLORS.text },
  cerrar: { fontSize: FONT.sizes.md, color: COLORS.roles.agrotienda, fontWeight: FONT.weights.semibold },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.lg },
  label: {
    fontSize: FONT.sizes.sm,
    fontWeight: FONT.weights.semibold,
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: 8,
  },
  labelInline: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold, color: COLORS.text, flex: 1 },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACE.md,
    paddingVertical: 12,
    fontSize: FONT.sizes.md,
    color: COLORS.text,
    ...SHADOW.sm,
  },
  subcategoriaInput: { marginTop: SPACE.sm },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  hint: {
    fontSize: FONT.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: SPACE.xs,
    lineHeight: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: {
    paddingHorizontal: SPACE.md,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: {
    borderColor: COLORS.roles.agrotienda,
    backgroundColor: 'rgba(106, 27, 154, 0.08)',
  },
  chipTxt: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary },
  chipTxtActive: { color: COLORS.roles.agrotienda, fontWeight: FONT.weights.bold },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACE.md,
    marginBottom: SPACE.md,
  },
  btn: {
    marginTop: SPACE.md,
    backgroundColor: COLORS.roles.agrotienda,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACE.md,
    alignItems: 'center',
    ...SHADOW.lg,
  },
  btnTxt: { color: COLORS.textInverse, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md },
});
