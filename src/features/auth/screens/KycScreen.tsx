import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/shared/store/AuthContext';
import { kycService } from '@/shared/services/kycService';
import { authService } from '@/shared/services/authService';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import type { DatosDoc } from '@/shared/services/kycService';

type TipoDoc = 'cedula' | 'rif' | 'acta_constitutiva';

export default function KycScreen() {
  const insets = useSafeAreaInsets();
  const { perfil, refreshPerfil } = useAuth();
  const [tipoDoc, setTipoDoc] = useState<TipoDoc>('cedula');
  const [uri, setUri] = useState<string | null>(null);
  const [resultado, setResultado] = useState<DatosDoc | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function tomarFoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso requerido', 'Necesitamos la cámara.'); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.95, allowsEditing: true, aspect: [4, 3] });
    if (!r.canceled) setUri(r.assets[0].uri);
  }

  async function seleccionarGaleria() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.95 });
    if (!r.canceled) setUri(r.assets[0].uri);
  }

  async function enviar() {
    if (!uri || !perfil) return;
    setCargando(true);
    try {
      const { docData } = await kycService.enviarDocumento(perfil.id, uri, tipoDoc);
      setResultado(docData);
      setEnviado(true);
      await refreshPerfil();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo procesar.');
    } finally {
      setCargando(false);
    }
  }

  if (!perfil) {
    return (
      <View style={s.root}>
        <ScrollView contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top, SPACE.md) }]}>
          <Text style={s.icon}>⚠️</Text>
          <Text style={s.title}>No hay perfil en la base de datos</Text>
          <Text style={s.sub}>
            Tu cuenta de Auth existe pero falta la fila en «perfiles» (suele crearse al registrarte en la app).
            Cierra sesión y usa Regístrate, o crea el registro en Supabase Table Editor ligado a tu uuid.
          </Text>
          <TouchableOpacity onPress={() => authService.logout()} style={s.logout}>
            <Text style={s.logoutTxt}>Cerrar sesión</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (enviado && resultado) {
    return (
      <View style={s.root}>
        <ScrollView contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top, SPACE.md) }]}>
          <Text style={s.icon}>{resultado.valido ? '✅' : '⚠️'}</Text>
          <Text style={s.title}>{resultado.valido ? 'Documento enviado' : 'Revisión manual'}</Text>
          <Text style={s.sub}>{resultado.valido ? 'En revisión 24-48h.' : 'Revisaremos manualmente.'}</Text>
          <View style={s.card}>
            <Text style={s.resultLabel}>Número</Text>
            <Text style={s.resultVal}>{resultado.numero || 'N/D'}</Text>
            <Text style={s.resultLabel}>Estado</Text>
            <Text style={s.resultVal}>{resultado.observaciones || 'Pendiente por revisión manual'}</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top, SPACE.md) }]} keyboardShouldPersistTaps="handled">
        <Text style={s.icon}>🔐</Text>
        <Text style={s.title}>Verificación KYC</Text>
        <Text style={s.sub}>Obligatoria para publicar, contactar o aceptar fletes.</Text>
        <Text style={s.label}>Tipo de documento</Text>
        <View style={s.tipoRow}>
          {(['cedula', 'rif', 'acta_constitutiva'] as TipoDoc[]).map(t => (
            <TouchableOpacity key={t} style={[s.tipoBtn, tipoDoc === t && s.tipoBtnActive]} onPress={() => setTipoDoc(t)}>
              <Text style={[s.tipoTxt, tipoDoc === t && s.tipoTxtActive]}>{t === 'cedula' ? '🪪 Cédula' : t === 'rif' ? '🏢 RIF' : '📄 Acta'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {uri ? <Image source={{ uri }} style={s.preview} resizeMode="cover" /> : <View style={s.placeholder}><Text style={s.placeholderTxt}>📷 Toma una foto clara</Text></View>}
        <View style={s.btnRow}>
          <TouchableOpacity style={[s.btn, s.btnSec]} onPress={tomarFoto}><Text style={s.btnSecTxt}>Cámara</Text></TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnSec]} onPress={seleccionarGaleria}><Text style={s.btnSecTxt}>Galería</Text></TouchableOpacity>
        </View>
        {uri && (
          <TouchableOpacity style={[s.btn, s.btnPrimary, cargando && s.btnDisabled]} onPress={enviar} disabled={cargando}>
            {cargando ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnTxt}>Enviar</Text>}
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => authService.logout()} style={s.logout}><Text style={s.logoutTxt}>Cerrar sesión</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, padding: SPACE.lg, alignItems: 'center' },
  icon: { fontSize: 64, marginTop: SPACE.xl },
  title: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, color: COLORS.text, textAlign: 'center' },
  sub: { fontSize: FONT.sizes.md, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACE.sm, marginBottom: SPACE.lg },
  label: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACE.sm, alignSelf: 'flex-start' },
  tipoRow: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.lg },
  tipoBtn: { flex: 1, borderWidth: 2, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACE.sm, alignItems: 'center', backgroundColor: COLORS.surface },
  tipoBtnActive: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  tipoTxt: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary },
  tipoTxtActive: { color: COLORS.primary, fontWeight: FONT.weights.semibold },
  preview: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 420,
    height: 220,
    borderRadius: RADIUS.md,
    marginBottom: SPACE.md,
  },
  placeholder: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 420,
    height: 180,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACE.md,
  },
  placeholderTxt: { color: COLORS.textSecondary },
  btnRow: { flexDirection: 'row', gap: SPACE.sm, width: '100%', marginBottom: SPACE.md },
  btn: { flex: 1, borderRadius: RADIUS.md, padding: SPACE.md, alignItems: 'center' },
  btnSec: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  btnSecTxt: { color: COLORS.text },
  btnPrimary: { backgroundColor: COLORS.primary, width: '100%' },
  btnDisabled: { opacity: 0.6 },
  btnTxt: { color: '#FFF', fontWeight: FONT.weights.bold },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, width: '100%', marginTop: SPACE.md, ...SHADOW.sm },
  resultLabel: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary },
  resultVal: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold },
  logout: { marginTop: SPACE.xl },
  logoutTxt: { color: COLORS.danger },
});
