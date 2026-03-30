import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScrollableListModal } from '@/shared/components/ScrollableListModal';
import { asignarOperacionFreight } from '@/shared/services/freightRequestsService';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import type { FreightRequest, Vehiculo } from '@/shared/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  freight: FreightRequest | null;
  vehiculos: Vehiculo[];
  onSaved?: () => Promise<void> | void;
};

export function AsignarChoferServicioModal({ visible, onClose, freight, vehiculos, onSaved }: Props) {
  const [vehiculoId, setVehiculoId] = useState<string | null>(null);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverDocument, setDriverDocument] = useState('');
  const [driverNotes, setDriverNotes] = useState('');
  const [driverHasApp, setDriverHasApp] = useState(true);
  const [driverHasGps, setDriverHasGps] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vehiclePicker, setVehiclePicker] = useState(false);

  useEffect(() => {
    if (!visible || !freight) return;
    setVehiculoId(freight.vehiculo_id ?? null);
    setDriverName(freight.driver_name ?? '');
    setDriverPhone(freight.driver_phone ?? '');
    setDriverDocument(freight.driver_document ?? '');
    setDriverNotes(freight.driver_notes ?? '');
    setDriverHasApp(freight.driver_has_app ?? true);
    setDriverHasGps(freight.driver_has_gps ?? true);
  }, [visible, freight]);

  const selectedVehicle = useMemo(
    () => vehiculos.find((item) => item.id === vehiculoId) ?? null,
    [vehiculoId, vehiculos],
  );

  async function guardar() {
    if (!freight?.id) return;
    if (!driverName.trim()) {
      Alert.alert('Chofer', 'Indica el nombre del chofer del viaje.');
      return;
    }
    if (!vehiculoId) {
      Alert.alert('Vehículo', 'Selecciona el vehículo que hará este servicio.');
      return;
    }
    setSaving(true);
    try {
      await asignarOperacionFreight({
        freightId: freight.id,
        vehiculoId,
        driverName: driverName.trim(),
        driverPhone: driverPhone.trim() || null,
        driverDocument: driverDocument.trim() || null,
        driverHasApp,
        driverHasGps,
        driverNotes: driverNotes.trim() || null,
      });
      await onSaved?.();
      onClose();
    } catch (error: unknown) {
      Alert.alert('Servicio', error instanceof Error ? error.message : 'No se pudo guardar la asignación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <View style={s.header}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>Preparar servicio</Text>
                <Text style={s.subtitle}>Asigna vehículo y chofer real del viaje para dejar claro el tracking.</Text>
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={onClose} accessibilityLabel="Cerrar">
                <Ionicons name="close-outline" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
              <Text style={s.routeTitle}>{freight?.tipo_servicio ?? 'Servicio asignado'}</Text>
              <Text style={s.routeSub}>
                {freight ? `${freight.origen_municipio}, ${freight.origen_estado}${freight.destino_municipio ? ` -> ${freight.destino_municipio}` : ''}` : '—'}
              </Text>

              <Text style={s.label}>Vehículo operativo</Text>
              <TouchableOpacity style={s.picker} onPress={() => setVehiclePicker(true)} activeOpacity={0.88}>
                <Text style={selectedVehicle ? s.pickerTxt : s.placeholder}>
                  {selectedVehicle ? `${selectedVehicle.placa} · ${[selectedVehicle.marca, selectedVehicle.modelo].filter(Boolean).join(' ')}` : 'Selecciona un vehículo'}
                </Text>
              </TouchableOpacity>

              <Text style={s.label}>Nombre del chofer</Text>
              <TextInput style={s.input} value={driverName} onChangeText={setDriverName} placeholder="Chofer asignado" placeholderTextColor={COLORS.textDisabled} />

              <Text style={s.label}>Teléfono</Text>
              <TextInput style={s.input} value={driverPhone} onChangeText={setDriverPhone} placeholder="+58..." placeholderTextColor={COLORS.textDisabled} keyboardType="phone-pad" />

              <Text style={s.label}>Documento</Text>
              <TextInput style={s.input} value={driverDocument} onChangeText={setDriverDocument} placeholder="Cédula o identificación" placeholderTextColor={COLORS.textDisabled} />

              <Text style={s.label}>Capacidad de seguimiento</Text>
              <View style={s.toggleRow}>
                <TouchableOpacity style={[s.toggle, driverHasApp && s.toggleOn]} onPress={() => setDriverHasApp((v) => !v)} activeOpacity={0.88}>
                  <Text style={[s.toggleTxt, driverHasApp && s.toggleTxtOn]}>Usa la app</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.toggle, driverHasGps && s.toggleOn]} onPress={() => setDriverHasGps((v) => !v)} activeOpacity={0.88}>
                  <Text style={[s.toggleTxt, driverHasGps && s.toggleTxtOn]}>GPS activo</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.label}>Notas operativas</Text>
              <TextInput
                style={[s.input, s.notes]}
                value={driverNotes}
                onChangeText={setDriverNotes}
                placeholder="Cambio de chofer, ventana horaria, observaciones..."
                placeholderTextColor={COLORS.textDisabled}
                multiline
              />

              <View style={s.trackingCard}>
                <Text style={s.trackingTitle}>{driverHasApp && driverHasGps ? 'Tracking en vivo habilitado' : 'Seguimiento manual visible al cliente'}</Text>
                <Text style={s.trackingBody}>
                  {driverHasApp && driverHasGps
                    ? 'El viaje podrá reportar salida, ubicación y llegada desde la pestaña Rutas.'
                    : 'El cliente verá que este servicio no tiene rastreo automático para evitar falsas expectativas.'}
                </Text>
              <Text style={s.trackingBody}>Al guardar, el servicio pasa a estado preparado para que el chofer pueda iniciar la ruta.</Text>
              </View>

              <TouchableOpacity style={s.saveBtn} onPress={() => void guardar()} disabled={saving} activeOpacity={0.9}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>Guardar servicio</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollableListModal
        visible={vehiclePicker}
        title="Vehículo operativo"
        data={vehiculos}
        keyExtractor={(item) => item.id}
        label={(item) => `${item.placa} · ${[item.marca, item.modelo].filter(Boolean).join(' ') || item.tipo}`}
        onSelect={(item) => {
          setVehiculoId(item.id);
          if (item.driver_has_gps_phone != null) setDriverHasGps(item.driver_has_gps_phone);
          if (item.driver_app_ready != null) setDriverHasApp(item.driver_app_ready);
          if (!driverNotes.trim() && item.device_notes) setDriverNotes(item.device_notes);
        }}
        onClose={() => setVehiclePicker(false)}
      />
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.46)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...SHADOW.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  routeTitle: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text },
  routeSub: { marginTop: 4, color: COLORS.textSecondary, fontSize: FONT.sizes.sm, marginBottom: SPACE.md },
  label: {
    marginBottom: 8,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.bold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  picker: {
    minHeight: 52,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
    marginBottom: SPACE.md,
  },
  pickerTxt: { color: COLORS.text, fontWeight: FONT.weights.semibold },
  placeholder: { color: COLORS.textDisabled },
  input: {
    minHeight: 52,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    color: COLORS.text,
    marginBottom: SPACE.md,
  },
  notes: { minHeight: 96, textAlignVertical: 'top' },
  toggleRow: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.md },
  toggle: {
    flex: 1,
    minHeight: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: '#e8f5e9',
    borderColor: '#86efac',
  },
  toggleTxt: { color: COLORS.textSecondary, fontWeight: FONT.weights.semibold },
  toggleTxtOn: { color: COLORS.primary },
  trackingCard: {
    borderRadius: RADIUS.md,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbeafe',
    padding: SPACE.md,
    marginBottom: SPACE.md,
  },
  trackingTitle: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold, color: COLORS.text },
  trackingBody: { marginTop: 4, fontSize: FONT.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  saveBtn: {
    minHeight: 52,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveTxt: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md },
});
