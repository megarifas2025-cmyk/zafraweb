import React, { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/shared/lib/supabase';
import { clearExpoPushTokenForUser } from '@/shared/services/pushNotifications';
import { useAuth } from '@/shared/store/AuthContext';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const MIN_LEN = 6;

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { clearPasswordRecoveryFlow } = useAuth();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);

  async function guardar() {
    const a = pass.trim();
    const b = pass2.trim();
    if (a.length < MIN_LEN || b.length < MIN_LEN) {
      Alert.alert('Contraseña', `Usa al menos ${MIN_LEN} caracteres en ambos campos.`);
      return;
    }
    if (a !== b) {
      Alert.alert('Contraseña', 'Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: a });
      if (error) throw error;
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      if (s?.user?.id) await clearExpoPushTokenForUser(s.user.id);
      await supabase.auth.signOut();
      clearPasswordRecoveryFlow();
      Alert.alert('Listo', 'Tu contraseña fue actualizada. Inicia sesión con la nueva clave.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar la contraseña.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top, SPACE.lg) }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>Nueva contraseña</Text>
        <Text style={s.sub}>
          Elige una contraseña segura. Luego podrás entrar con tu correo y esta clave.
        </Text>
        <Text style={s.label}>Nueva contraseña</Text>
        <TextInput
          style={s.input}
          value={pass}
          onChangeText={setPass}
          placeholder={`Mínimo ${MIN_LEN} caracteres`}
          placeholderTextColor={COLORS.textDisabled}
          secureTextEntry
        />
        <Text style={s.label}>Confirmar contraseña</Text>
        <TextInput
          style={s.input}
          value={pass2}
          onChangeText={setPass2}
          placeholder="Repite la contraseña"
          placeholderTextColor={COLORS.textDisabled}
          secureTextEntry
        />
        <TouchableOpacity style={[s.btn, busy && s.btnDisabled]} onPress={() => void guardar()} disabled={busy}>
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnTxt}>Guardar y salir</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACE.lg, paddingTop: SPACE.xl },
  title: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, color: COLORS.text },
  sub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: SPACE.sm, marginBottom: SPACE.lg, lineHeight: 20 },
  label: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACE.sm + 4,
    fontSize: FONT.sizes.md,
    color: COLORS.text,
    marginBottom: SPACE.md,
    backgroundColor: COLORS.surface,
  },
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    alignItems: 'center',
    marginTop: SPACE.md,
    ...SHADOW.sm,
  },
  btnDisabled: { opacity: 0.6 },
  btnTxt: { color: '#FFF', fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold },
});
