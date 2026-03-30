import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '@/shared/services/authService';
import { getSupabaseConfigError } from '@/shared/lib/supabase';
import { useAuth } from '@/shared/store/AuthContext';
import type { AuthNav } from '@/features/auth/navigation/authTypes';
import { ZafraclicShieldLogo } from '@/features/auth/components/ZafraclicShieldLogo';

const DARK_BG = '#03110A';
const ACCENT = '#1F7A4C';
const GLASS = 'rgba(255,255,255,0.05)';
const GLASS_BORDER = 'rgba(255,255,255,0.1)';
const LABEL = 'rgba(167, 243, 208, 0.5)';
const INPUT_BG = 'rgba(0,0,0,0.4)';
const PLACEHOLDER = 'rgba(120, 120, 120, 0.55)';

function normalizeEmail(val: string): string {
  return val.trim().toLowerCase();
}

function esCorreoValido(val: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(val));
}

type ExtraDev = { devLoginEmail?: string; devLoginPassword?: string };
type DevLoginPreset = {
  id: string;
  label: string;
  email: string;
  password: string;
  enabled?: boolean;
};

function readOptionalDevPreset(
  id: string,
  label: string,
  emailEnv: string | undefined,
  passwordEnv: string | undefined,
): DevLoginPreset {
  const email = (emailEnv ?? '').trim().toLowerCase();
  const password = (passwordEnv ?? '').trim();
  if (email && password) {
    return { id, label, email, password, enabled: true };
  }
  return { id, label: `${label} (pendiente)`, email: '', password: '', enabled: false };
}

function getDevLoginPresets(): DevLoginPreset[] {
  /** En release (__DEV__ false) no construir presets: evita residuos de credenciales de .env en el APK. */
  if (!__DEV__) return [];
  return [
    readOptionalDevPreset('agricultor', 'Agricultor',
      process.env.EXPO_PUBLIC_DEV_LOGIN_AGRICULTOR_EMAIL,
      process.env.EXPO_PUBLIC_DEV_LOGIN_AGRICULTOR_PASSWORD,
    ),
    readOptionalDevPreset('empresa', 'Empresa',
      process.env.EXPO_PUBLIC_DEV_LOGIN_EMPRESA_EMAIL,
      process.env.EXPO_PUBLIC_DEV_LOGIN_EMPRESA_PASSWORD,
    ),
    readOptionalDevPreset('comprador', 'Comprador',
      process.env.EXPO_PUBLIC_DEV_LOGIN_COMPRADOR_EMAIL,
      process.env.EXPO_PUBLIC_DEV_LOGIN_COMPRADOR_PASSWORD,
    ),
    readOptionalDevPreset('transporte', 'Transporte',
      process.env.EXPO_PUBLIC_DEV_LOGIN_TRANSPORTE_EMAIL,
      process.env.EXPO_PUBLIC_DEV_LOGIN_TRANSPORTE_PASSWORD,
    ),
    readOptionalDevPreset('agrotienda', 'Agrotienda',
      process.env.EXPO_PUBLIC_DEV_LOGIN_AGROTIENDA_EMAIL,
      process.env.EXPO_PUBLIC_DEV_LOGIN_AGROTIENDA_PASSWORD,
    ),
    readOptionalDevPreset('zafra_ceo', 'Zafra CEO',
      process.env.EXPO_PUBLIC_DEV_LOGIN_CEO_EMAIL,
      process.env.EXPO_PUBLIC_DEV_LOGIN_CEO_PASSWORD,
    ),
    readOptionalDevPreset('perito', 'Perito',
      process.env.EXPO_PUBLIC_DEV_LOGIN_PERITO_EMAIL,
      process.env.EXPO_PUBLIC_DEV_LOGIN_PERITO_PASSWORD,
    ),
  ];
}

/** Solo __DEV__: credenciales desde .env (process.env + extra del manifiesto; ADB no actualiza estado en TextInput controlados). */
function devLoginInitial(): { email: string; password: string } {
  if (!__DEV__) return { email: '', password: '' };
  const extra = (Constants.expoConfig?.extra ?? {}) as ExtraDev;
  const em = (process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL ?? extra.devLoginEmail ?? '').trim();
  const pw = (process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD ?? extra.devLoginPassword ?? '').trim();
  if (em && pw) return { email: em, password: pw };
  const firstEnabledPreset = getDevLoginPresets().find((preset) => preset.enabled && preset.email && preset.password);
  if (firstEnabledPreset) {
    return {
      email: firstEnabledPreset.email,
      password: firstEnabledPreset.password,
    };
  }
  return { email: '', password: '' };
}

function isSelectedPreset(preset: DevLoginPreset, email: string, password: string): boolean {
  return normalizeEmail(email) === normalizeEmail(preset.email) && password === preset.password;
}

export default function LoginScreen() {
  const nav = useNavigation<AuthNav>();
  const { bootMessage, clearBootMessage } = useAuth();
  const dev0 = devLoginInitial();
  const devPresets = __DEV__ ? getDevLoginPresets() : [];
  const [email, setEmail] = useState(dev0.email);
  const [password, setPassword] = useState(dev0.password);
  const [cargando, setCargando] = useState(false);
  const [enviandoRecuperacion, setEnviandoRecuperacion] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function mapLoginError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    const low = msg.toLowerCase();
    if (low.includes('network request failed') || low.includes('failed to fetch')) {
      return 'Sin conexión al servidor. Revisa internet y reinicia Expo.';
    }
    if (low.includes('email not confirmed') || low.includes('email_not_confirmed')) {
      return 'Confirma el correo: revisa la bandeja o desactiva «Confirm email» en Supabase → Authentication → Providers → Email.';
    }
    const code = typeof (e as { code?: string })?.code === 'string' ? (e as { code: string }).code : '';
    if (code === 'invalid_credentials' || low.includes('invalid login') || low.includes('invalid_credentials')) {
      return 'Correo o contraseña incorrectos. Si no tienes cuenta, crea una nueva cuenta.';
    }
    return msg || 'Verifica tus credenciales.';
  }

  async function solicitarRecuperacionContrasena() {
    const cfgErr = getSupabaseConfigError();
    if (cfgErr) {
      Alert.alert('Configuración', cfgErr);
      return;
    }
    if (!email.trim()) {
      Alert.alert('Correo necesario', 'Escribe el correo registrado primero.');
      return;
    }
    if (!esCorreoValido(email)) {
      Alert.alert('Correo inválido', 'Escribe el correo completo con formato usuario@dominio.com.');
      return;
    }
    const em = normalizeEmail(email);
    setEnviandoRecuperacion(true);
    try {
      await authService.resetPassword(em);
      Alert.alert(
        'Revisa tu correo',
        'Si existe una cuenta con ese email, recibirás un enlace para restablecer la contraseña.',
      );
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo enviar el correo de recuperación.');
    } finally {
      setEnviandoRecuperacion(false);
    }
  }

  async function entrar() {
    const pass = password.trim();
    if (!email.trim() || !pass) {
      Alert.alert('Campos requeridos', 'Ingresa correo y contraseña.');
      return;
    }
    if (!esCorreoValido(email)) {
      Alert.alert('Correo inválido', 'Escribe el correo completo con formato usuario@dominio.com.');
      return;
    }
    const cfgErr = getSupabaseConfigError();
    if (cfgErr) {
      Alert.alert('Configuración', cfgErr);
      return;
    }
    setCargando(true);
    try {
      await authService.login(normalizeEmail(email), pass);
    } catch (e: unknown) {
      Alert.alert('Error', mapLoginError(e));
    } finally {
      setCargando(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar style="light" backgroundColor={DARK_BG} translucent={false} />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={s.backBtn} onPress={() => nav.navigate('Welcome')} accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color="#e7e5e4" />
          </TouchableOpacity>

          <View style={s.card}>
            <View style={s.cardHead}>
              <ZafraclicShieldLogo size={96} />
              <Text style={s.cardTitle}>Ingreso de Usuario</Text>
              <View style={s.cardAccent} />
            </View>

            {getSupabaseConfigError() ? (
              <Text style={s.warn}>Configura Supabase en .env (URL y anon key) y reinicia Expo.</Text>
            ) : null}
            {bootMessage && !getSupabaseConfigError() ? (
              <TouchableOpacity onPress={clearBootMessage} activeOpacity={0.7}>
                <Text style={s.warn}>{bootMessage}</Text>
              </TouchableOpacity>
            ) : null}
            {__DEV__ ? (
              <View style={s.devBox}>
                <Text style={s.devTitle}>Accesos de prueba</Text>
                <Text style={s.devHint}>Toca un rol para rellenar el formulario sin usar ADB.</Text>
                <View style={s.devPresetGrid}>
                  {devPresets.map(preset => {
                    const active = isSelectedPreset(preset, email, password);
                    const enabled = preset.enabled !== false;
                    return (
                      <TouchableOpacity
                        key={preset.id}
                        style={[s.devPresetChip, active && s.devPresetChipActive, !enabled && s.devPresetChipDisabled]}
                        onPress={() => {
                          if (!enabled) return;
                          setEmail(preset.email);
                          setPassword(preset.password);
                        }}
                        activeOpacity={0.85}
                        disabled={!enabled}
                        accessibilityLabel={`Usar acceso ${preset.label}`}
                      >
                        <Text style={[s.devPresetText, active && s.devPresetTextActive, !enabled && s.devPresetTextDisabled]}>
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Text style={s.label}>Correo Electrónico</Text>
            <View style={s.fieldWrap}>
              <Ionicons name="mail-outline" size={18} color="rgba(167,243,208,0.25)" style={s.fieldIcon} />
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="ejemplo@correo.com"
                placeholderTextColor={PLACEHOLDER}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={s.label}>Contraseña</Text>
            <View style={s.fieldWrap}>
              <Ionicons name="lock-closed-outline" size={18} color="rgba(167,243,208,0.25)" style={s.fieldIcon} />
              <TextInput
                style={[s.input, s.inputLock]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={PLACEHOLDER}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={s.eye}
                onPress={() => setShowPassword(v => !v)}
                hitSlop={12}
                accessibilityLabel={showPassword ? 'Ocultar' : 'Mostrar'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color="rgba(167,243,208,0.4)"
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.btnPrimary, cargando && s.btnDisabled]}
              onPress={entrar}
              disabled={cargando}
              activeOpacity={0.95}
            >
              {cargando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnPrimaryTxt}>Ingresar al Sistema</Text>
              )}
            </TouchableOpacity>

            {enviandoRecuperacion ? <ActivityIndicator style={{ marginVertical: 8 }} color={ACCENT} /> : null}
            <TouchableOpacity onPress={() => void solicitarRecuperacionContrasena()} disabled={enviandoRecuperacion}>
              <Text style={s.forgot}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => nav.navigate('Register')} style={s.toRegister}>
              <Text style={s.toRegisterTxt}>
                ¿No tienes cuenta? <Text style={s.toRegisterBold}>Crear nueva cuenta</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: DARK_BG },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 24, paddingBottom: 32 },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  card: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 40,
    padding: 32,
    overflow: 'hidden',
  },
  cardHead: { alignItems: 'center', marginBottom: 28 },
  cardTitle: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  cardAccent: { height: 2, width: 32, backgroundColor: 'rgba(234, 179, 8, 0.3)', borderRadius: 2, marginTop: 12 },
  label: {
    fontSize: 9,
    fontWeight: '900',
    color: LABEL,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontStyle: 'italic',
    marginBottom: 8,
    marginLeft: 4,
  },
  fieldWrap: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  fieldIcon: { position: 'absolute', left: 14, zIndex: 1 },
  input: {
    flex: 1,
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingLeft: 48,
    paddingRight: 16,
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  inputLock: { paddingRight: 48 },
  eye: { position: 'absolute', right: 14, top: '50%', marginTop: -12 },
  warn: {
    fontSize: 13,
    color: '#fecaca',
    backgroundColor: 'rgba(127, 29, 29, 0.35)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  devBox: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(6, 78, 59, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.18)',
  },
  devTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#bbf7d0',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  devHint: {
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(220, 252, 231, 0.72)',
    marginBottom: 12,
  },
  devPresetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  devPresetChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  devPresetChipActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderColor: 'rgba(74, 222, 128, 0.5)',
  },
  devPresetChipDisabled: {
    opacity: 0.45,
  },
  devPresetText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(220, 252, 231, 0.76)',
  },
  devPresetTextActive: {
    color: '#dcfce7',
  },
  devPresetTextDisabled: {
    color: 'rgba(220, 252, 231, 0.5)',
  },
  btnPrimary: {
    backgroundColor: ACCENT,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  btnDisabled: { opacity: 0.65 },
  btnPrimaryTxt: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 4,
    fontStyle: 'italic',
  },
  forgot: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '900',
    color: 'rgba(74, 222, 128, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontStyle: 'italic',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(74, 222, 128, 0.2)',
    marginVertical: 8,
  },
  toRegister: { marginTop: 12 },
  toRegisterTxt: { textAlign: 'center', fontSize: 13, color: 'rgba(168, 162, 158, 0.85)' },
  toRegisterBold: { color: ACCENT, fontWeight: '800' },
});
