import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/shared/store/AuthContext';
import { authService } from '@/shared/services/authService';
import { storageService } from '@/shared/services/storageService';
import { supabase } from '@/shared/lib/supabase';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import { COLORS, FONT, RADIUS, SHADOW } from '@/shared/utils/theme';

type SectionProps = {
  fullBleed?: boolean;
};

/** Acciones de cuenta en Perfil: contraseña y foto (Supabase Auth + Storage avatares). */
export function ProfileAccountSection({ fullBleed: _fullBleed }: SectionProps) {
  const { perfil, refreshPerfil } = useAuth();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);

  if (!perfil) return null;

  async function guardarPassword() {
    const a = pass1.trim();
    if (a.length < 6) {
      Alert.alert('Contraseña', 'Mínimo 6 caracteres.');
      return;
    }
    if (a !== pass2.trim()) {
      Alert.alert('Contraseña', 'Las dos claves no coinciden.');
      return;
    }
    setBusy(true);
    try {
      await authService.updatePassword(a);
      Alert.alert('Listo', 'Tu contraseña fue actualizada.');
      setPwdOpen(false);
      setPass1('');
      setPass2('');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar la contraseña.');
    } finally {
      setBusy(false);
    }
  }

  async function cambiarFoto() {
    const uid = perfil?.id;
    if (!uid) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso', 'Activa el acceso a fotos para elegir una imagen de perfil.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    try {
      const url = await storageService.subirAvatar(uid, res.assets[0].uri);
      const { error } = await supabase.from('perfiles').update({ avatar_url: url }).eq('id', uid);
      if (error) throw new Error(mensajeSupabaseConPista(error));
      await refreshPerfil();
      Alert.alert('Listo', 'Foto de perfil actualizada.');
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Error desconocido';
      const hint =
        m.includes('Bucket') || m.includes('bucket') || m.includes('Storage')
          ? '\n\nStorage: ejecuta database/crear-storage-buckets-app.sql y revisa bucket «avatares».'
          : '';
      Alert.alert('Error', `${m}${hint}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={s.card}>
        <Text style={s.cardTitle}>Cuenta ZafraClic</Text>
        <Text style={s.hint}>Contraseña y foto se guardan en tu cuenta segura.</Text>

        <TouchableOpacity style={s.row} onPress={() => setPwdOpen(true)} disabled={busy} activeOpacity={0.85}>
          <View style={s.rowIcon}>
            <Ionicons name="key-outline" size={20} color={COLORS.primary} />
          </View>
          <Text style={s.rowTxt}>Cambiar contraseña</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textDisabled} />
        </TouchableOpacity>

        <TouchableOpacity style={s.row} onPress={() => void cambiarFoto()} disabled={busy} activeOpacity={0.85}>
          <View style={s.rowIcon}>
            <Ionicons name="camera-outline" size={20} color={COLORS.primary} />
          </View>
          <Text style={s.rowTxt}>Actualizar foto de perfil</Text>
          {busy ? <ActivityIndicator /> : <Ionicons name="chevron-forward" size={18} color={COLORS.textDisabled} />}
        </TouchableOpacity>
      </View>

      <Modal visible={pwdOpen} transparent animationType="fade" onRequestClose={() => setPwdOpen(false)}>
        <View style={s.modalRoot}>
          <Pressable style={s.modalBackdrop} onPress={() => !busy && setPwdOpen(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalCenter}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Nueva contraseña</Text>
            <Text style={s.modalSub}>Debe tener al menos 6 caracteres.</Text>

            <Text style={s.lbl}>Nueva clave</Text>
            <View style={s.pwdRow}>
              <TextInput
                style={s.input}
                value={pass1}
                onChangeText={setPass1}
                secureTextEntry={!show1}
                placeholder="••••••••"
                placeholderTextColor={COLORS.textDisabled}
              />
              <TouchableOpacity onPress={() => setShow1((v) => !v)} hitSlop={12}>
                <Ionicons name={show1 ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={s.lbl}>Confirmar</Text>
            <View style={s.pwdRow}>
              <TextInput
                style={s.input}
                value={pass2}
                onChangeText={setPass2}
                secureTextEntry={!show2}
                placeholder="Repite la clave"
                placeholderTextColor={COLORS.textDisabled}
              />
              <TouchableOpacity onPress={() => setShow2((v) => !v)} hitSlop={12}>
                <Ionicons name={show2 ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.modalBtn, busy && s.modalBtnDis]}
              onPress={() => void guardarPassword()}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnTxt}>Guardar</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.modalCancel} onPress={() => setPwdOpen(false)} disabled={busy}>
              <Text style={s.modalCancelTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    ...SHADOW.sm,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  hint: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginBottom: 14, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTxt: { flex: 1, fontSize: FONT.sizes.md, fontWeight: '700', color: COLORS.text },
  modalRoot: { flex: 1 },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 0,
  },
  modalCenter: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    zIndex: 1,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 22,
    elevation: 6,
  },
  modalTitle: { fontSize: FONT.sizes.lg, fontWeight: '800', color: COLORS.text },
  modalSub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 6, marginBottom: 16 },
  lbl: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  pwdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: FONT.sizes.md, color: COLORS.text },
  modalBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: 8,
  },
  modalBtnDis: { opacity: 0.7 },
  modalBtnTxt: { color: '#fff', fontWeight: '800', fontSize: FONT.sizes.md },
  modalCancel: { paddingVertical: 12, alignItems: 'center' },
  modalCancelTxt: { color: COLORS.textSecondary, fontWeight: '600' },
});
