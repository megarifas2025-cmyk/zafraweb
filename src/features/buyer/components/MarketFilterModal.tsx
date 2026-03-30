import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ESTADOS_REGISTRO, municipiosPorEstado } from '@/shared/data/venezuelaMunicipios';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import { getScrollableModalListMaxHeight } from '@/shared/utils/modalListHeight';

export interface MarketFilterModalProps {
  visible: boolean;
  onClose: () => void;
  estado: string;
  municipio: string;
  onApply: (estado: string, municipio: string) => void;
}

type Step = 'main' | 'estado' | 'municipio';

const ESTADO_ROWS = [{ id: '__todos', name: 'Todos' }, ...ESTADOS_REGISTRO.map(e => ({ id: e, name: e }))];

export function MarketFilterModal({ visible, onClose, estado, municipio, onApply }: MarketFilterModalProps) {
  const [e, setE] = useState(estado);
  const [m, setM] = useState(municipio);
  const [step, setStep] = useState<Step>('main');

  const munis = useMemo(() => (e === 'Todos' ? [] : municipiosPorEstado(e)), [e]);
  const muniRows = useMemo(
    () => [{ id: '__all', name: '' }, ...munis.map(mu => ({ id: mu, name: mu }))],
    [munis],
  );
  const listMaxH = getScrollableModalListMaxHeight(0.60, 500);

  React.useEffect(() => {
    if (visible) {
      setE(estado);
      setM(municipio);
      setStep('main');
    }
  }, [visible, estado, municipio]);

  const selectEstado = (est: string) => {
    setE(est === '__todos' ? 'Todos' : est);
    setM('');
    setStep('main');
  };

  const selectMuni = (name: string) => {
    setM(name);
    setStep('main');
  };

  if (step === 'estado') {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setStep('main')}>
        <TouchableWithoutFeedback onPress={() => setStep('main')}>
          <View style={s.backdrop} />
        </TouchableWithoutFeedback>
        <View style={s.sheet}>
          <View style={s.listHeader}>
            <TouchableOpacity onPress={() => setStep('main')} hitSlop={12}>
              <Ionicons name="arrow-back" size={20} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={s.listHeaderTxt}>Seleccionar estado</Text>
          </View>
          <FlatList
            data={ESTADO_ROWS}
            keyExtractor={item => item.id}
            style={[s.listScroll, { maxHeight: listMaxH }]}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            removeClippedSubviews={Platform.OS === 'android'}
            renderItem={({ item }) => {
              const isOn = item.name === 'Todos' ? e === 'Todos' : e === item.name;
              return (
                <TouchableOpacity
                  style={[s.listRow, isOn && s.listRowOn]}
                  onPress={() => selectEstado(item.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.listRowTxt, isOn && s.listRowTxtOn]}>{item.name}</Text>
                  {isOn ? <Ionicons name="checkmark" size={16} color={COLORS.roles.buyer} /> : null}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    );
  }

  if (step === 'municipio') {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setStep('main')}>
        <TouchableWithoutFeedback onPress={() => setStep('main')}>
          <View style={s.backdrop} />
        </TouchableWithoutFeedback>
        <View style={s.sheet}>
          <View style={s.listHeader}>
            <TouchableOpacity onPress={() => setStep('main')} hitSlop={12}>
              <Ionicons name="arrow-back" size={20} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={s.listHeaderTxt}>Municipio — {e}</Text>
          </View>
          <FlatList
            data={muniRows}
            keyExtractor={item => item.id}
            style={[s.listScroll, { maxHeight: listMaxH }]}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            removeClippedSubviews={Platform.OS === 'android'}
            renderItem={({ item }) => {
              const isOn = item.name === '' ? m === '' : m === item.name;
              return (
                <TouchableOpacity
                  style={[s.listRow, isOn && s.listRowOn]}
                  onPress={() => selectMuni(item.name)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.listRowTxt, isOn && s.listRowTxtOn]}>
                    {item.name === '' ? 'Todos los municipios' : item.name}
                  </Text>
                  {isOn ? <Ionicons name="checkmark" size={16} color={COLORS.roles.buyer} /> : null}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.backdrop} />
      </TouchableWithoutFeedback>
      <View style={s.sheet}>
        <Text style={s.title}>Ajustes de filtro</Text>

        <Text style={s.label}>Estado</Text>
        <TouchableOpacity style={s.picker} onPress={() => setStep('estado')} activeOpacity={0.85}>
          <Text style={s.pickerTxt}>{e || 'Todos'}</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <Text style={[s.label, { marginTop: SPACE.md }]}>
          Municipio {e === 'Todos' ? '(elige un estado primero)' : `(${e})`}
        </Text>
        <TouchableOpacity
          style={[s.picker, e === 'Todos' && s.pickerDisabled]}
          onPress={() => {
            if (e === 'Todos') return;
            setStep('municipio');
          }}
          activeOpacity={0.85}
        >
          <Text style={[s.pickerTxt, !m && s.pickerPlaceholder]}>
            {m || 'Todos los municipios'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={e === 'Todos' ? COLORS.textDisabled : COLORS.textSecondary} />
        </TouchableOpacity>

        <View style={s.footer}>
          <TouchableOpacity style={s.btnGhost} onPress={onClose}>
            <Text style={s.btnGhostTxt}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btn}
            onPress={() => {
              onApply(e === 'Todos' ? 'Todos' : e, e === 'Todos' ? '' : m);
              onClose();
            }}
          >
            <Text style={s.btnTxt}>Aplicar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACE.md,
    ...SHADOW.md,
  },
  title: { fontSize: FONT.sizes.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACE.md },
  label: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACE.xs },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
    marginBottom: 4,
  },
  pickerDisabled: { backgroundColor: '#f8f9fa', borderColor: '#e9ecef' },
  pickerTxt: { fontSize: FONT.sizes.md, color: COLORS.text, fontWeight: '500' },
  pickerPlaceholder: { color: COLORS.textDisabled },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingBottom: SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: SPACE.sm,
  },
  listHeaderTxt: { fontSize: FONT.sizes.md, fontWeight: '700', color: COLORS.text },
  listScroll: { marginBottom: SPACE.sm },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.sm,
  },
  listRowOn: { backgroundColor: '#E3F2FD' },
  listRowTxt: { fontSize: FONT.sizes.md, color: COLORS.text },
  listRowTxtOn: { color: COLORS.roles.buyer, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  btnGhost: { flex: 1, padding: SPACE.md, alignItems: 'center' },
  btnGhostTxt: { color: COLORS.textSecondary, fontWeight: '600' },
  btn: { flex: 1, backgroundColor: COLORS.roles.buyer, borderRadius: RADIUS.md, padding: SPACE.md, alignItems: 'center' },
  btnTxt: { color: '#FFF', fontWeight: '700' },
});
