import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/shared/store/AuthContext';
import { useCompany } from '../hooks/useCompany';
import { upsertCompanyProfile, validateCompanyProfileInput } from '../services/companyProfileService';
import { storageService } from '@/shared/services/storageService';
import { COLORS, FONT, SPACE, RADIUS } from '@/shared/utils/theme';

export default function CompanyProfileSettings() {
  const { perfil } = useAuth();
  const { company, loading, loadError, refresh } = useCompany();
  const [razon, setRazon] = useState('');
  const [rif, setRif] = useState('');
  const [dirFiscal, setDirFiscal] = useState('');
  const [dir, setDir] = useState('');
  const [tel, setTel] = useState('');
  const [correo, setCorreo] = useState('');
  const [logo, setLogo] = useState('');
  const [logoUriLocal, setLogoUriLocal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const missingCompanyRow = !company && Boolean(loadError?.includes('No hay fila en companies'));

  const elegirLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso', 'Necesitamos acceso a tu galería para seleccionar el logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setLogoUriLocal(result.assets[0].uri);
    }
  };

  useEffect(() => {
    if (company) {
      setRazon(company.razon_social ?? '');
      setRif(company.rif ?? '');
      setDirFiscal(company.direccion_fiscal ?? '');
      setDir(company.direccion ?? '');
      setTel(company.telefono_contacto ?? '');
      setCorreo(company.correo_contacto ?? '');
      setLogo(company.logo_url ?? '');
      return;
    }
    setRazon(perfil?.nombre ?? '');
    setTel(perfil?.telefono ?? '');
    setCorreo('');
    setRif('');
    setDirFiscal('');
    setDir('');
    setLogo('');
  }, [company, perfil?.nombre, perfil?.telefono]);

  async function guardar() {
    if (!perfil?.id) return;
    const validation = validateCompanyProfileInput({
      razon_social: razon,
      rif,
      direccion_fiscal: dirFiscal,
      direccion: dir,
      telefono_contacto: tel,
      correo_contacto: correo,
      logo_url: logo,
    });
    if (validation) {
      Alert.alert('Empresa', validation);
      return;
    }
    setSaving(true);
    try {
      let logoFinal = logo;
      if (logoUriLocal) {
        try {
          logoFinal = await storageService.subirLogoEmpresa(perfil.id, logoUriLocal);
          setLogo(logoFinal);
          setLogoUriLocal(null);
        } catch {
          Alert.alert('Logo', 'No se pudo subir la imagen. Se guardará sin logo.');
        }
      }
      await upsertCompanyProfile(perfil.id, {
        razon_social: razon,
        rif,
        direccion_fiscal: dirFiscal,
        direccion: dir,
        telefono_contacto: tel,
        correo_contacto: correo,
        logo_url: logoFinal,
      });
      Alert.alert(
        company ? 'Guardado' : 'Empresa creada',
        company ? 'Datos de empresa actualizados.' : 'Tu empresa quedó creada. Ahora completa la revisión y activación comercial desde tu operación.',
      );
      await refresh();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !company) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={s.loadHint}>Cargando datos de la empresa…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <Text style={s.sub}>
          {company
            ? 'Edita razón social, RIF, direcciones, contacto y la URL del logo corporativo.'
            : 'Completa el alta corporativa para crear tu empresa operativa y poder recibir solicitudes de transportistas.'}
        </Text>
      </View>
      {!company ? (
        <View style={s.pendingBox}>
          <Text style={s.pendingTitle}>Alta corporativa pendiente</Text>
          <Text style={s.pendingTxt}>
            Aún no has creado el perfil formal de tu empresa. Al guardar este formulario activaremos tu ficha corporativa para continuar con la operación comercial.
          </Text>
        </View>
      ) : null}
      {loadError && !missingCompanyRow ? (
        <View style={s.errorBox}>
          <Text style={s.errorTxt}>{loadError}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => void refresh()}>
            <Text style={s.retryTxt}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={s.label}>Razón social</Text>
      <TextInput style={s.input} value={razon} onChangeText={setRazon} placeholderTextColor={COLORS.textDisabled} />
      <Text style={s.label}>RIF</Text>
      <TextInput style={s.input} value={rif} onChangeText={setRif} placeholder="J-12345678-9" autoCapitalize="characters" placeholderTextColor={COLORS.textDisabled} />
      <Text style={s.label}>Dirección fiscal</Text>
      <TextInput style={s.input} value={dirFiscal} onChangeText={setDirFiscal} multiline placeholderTextColor={COLORS.textDisabled} />
      <Text style={s.label}>Dirección operativa</Text>
      <TextInput style={s.input} value={dir} onChangeText={setDir} multiline placeholderTextColor={COLORS.textDisabled} />
      <Text style={s.label}>Teléfono contacto</Text>
      <TextInput style={s.input} value={tel} onChangeText={setTel} keyboardType="phone-pad" placeholderTextColor={COLORS.textDisabled} />
      <Text style={s.label}>Correo</Text>
      <TextInput style={s.input} value={correo} onChangeText={setCorreo} keyboardType="email-address" placeholderTextColor={COLORS.textDisabled} />
      <Text style={s.label}>Logo corporativo</Text>
      <View style={s.logoRow}>
        {(logoUriLocal ?? logo) ? (
          <Image
            source={{ uri: logoUriLocal ?? logo }}
            style={s.logoPreview}
            resizeMode="cover"
          />
        ) : (
          <View style={s.logoPlaceholder}>
            <Text style={s.logoPlaceholderTxt}>Sin logo</Text>
          </View>
        )}
        <View style={s.logoBtns}>
          <TouchableOpacity style={s.logoBtn} onPress={() => void elegirLogo()}>
            <Text style={s.logoBtnTxt}>📷 Elegir de galería</Text>
          </TouchableOpacity>
          {(logoUriLocal ?? logo) ? (
            <TouchableOpacity style={[s.logoBtn, s.logoBtnDanger]} onPress={() => { setLogoUriLocal(null); setLogo(''); }}>
              <Text style={s.logoBtnDangerTxt}>✕ Quitar logo</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <TouchableOpacity style={s.btn} onPress={() => void guardar()} disabled={saving || !perfil?.id}>
        {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnTxt}>{company ? 'Guardar cambios' : 'Crear empresa'}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACE.lg },
  loadHint: { marginTop: SPACE.md, fontSize: FONT.sizes.sm, color: COLORS.textSecondary, textAlign: 'center' },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: '#E57373',
  },
  errorTxt: { fontSize: FONT.sizes.sm, color: '#C62828', lineHeight: 20 },
  retryBtn: { marginTop: SPACE.sm, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: SPACE.md },
  retryTxt: { color: COLORS.primary, fontWeight: FONT.weights.semibold },
  pendingBox: {
    backgroundColor: '#eefbf3',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  pendingTitle: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold, color: '#166534', marginBottom: 4 },
  pendingTxt: { fontSize: FONT.sizes.sm, color: '#166534', lineHeight: 20 },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  header: { marginBottom: SPACE.md },
  sub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4, lineHeight: 20 },
  label: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: SPACE.sm, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACE.sm,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    minHeight: 44,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.sm },
  logoPreview: { width: 80, height: 80, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  logoPlaceholder: {
    width: 80, height: 80, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
    backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center',
  },
  logoPlaceholderTxt: { fontSize: FONT.sizes.xs, color: COLORS.textDisabled },
  logoBtns: { flex: 1, gap: SPACE.xs },
  logoBtn: {
    borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.sm,
    paddingVertical: 8, paddingHorizontal: SPACE.sm, alignItems: 'center',
  },
  logoBtnTxt: { color: COLORS.primary, fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold },
  logoBtnDanger: { borderColor: COLORS.danger },
  logoBtnDangerTxt: { color: COLORS.danger, fontSize: FONT.sizes.sm },
  btn: { backgroundColor: COLORS.primary, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACE.lg },
  btnTxt: { color: '#FFF', fontWeight: FONT.weights.bold },
});
