import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/shared/lib/supabase';
import { trackUiEvent } from '@/shared/runtime/uiEventTracker';
import { FONT, SPACE, SHADOW } from '@/shared/utils/theme';
import { ScrollableListModal } from '@/shared/components/ScrollableListModal';
import { CeoBackdrop } from '@/features/super-admin/components/CeoBackdrop';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';
import type { DocPrefijo } from '@/shared/types';

type CompanyOpt = { id: string; razon_social: string; rif: string };

const DOC_PREFIJOS: { id: DocPrefijo; label: string }[] = [
  { id: 'V', label: 'V-' },
  { id: 'E', label: 'E-' },
  { id: 'J', label: 'J-' },
  { id: 'G', label: 'G-' },
];

function soloDigitos(value: string): string {
  return value.replace(/\D/g, '');
}

function esCorreoValido(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

export default function CreatePeritoAccountScreen() {
  const insets = useSafeAreaInsets();
  const [nombre, setNombre] = useState('');
  const [doc, setDoc] = useState('');
  const [docPrefijo, setDocPrefijo] = useState<DocPrefijo>('V');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [company, setCompany] = useState<CompanyOpt | null>(null);
  const [picker, setPicker] = useState(false);
  const [docPicker, setDocPicker] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadCompanies = useCallback(async () => {
    setLoadingList(true);
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 8_000); });
      const query = supabase.from('companies').select('id, razon_social, rif').order('razon_social', { ascending: true });
      const result = await Promise.race([query, timeout]);
      if (timer) clearTimeout(timer);
      if (!result) { setCompanies([]); return; }
      const { data, error } = result as Awaited<typeof query>;
      if (error) { setCompanies([]); Alert.alert('Empresas', error.message); }
      else setCompanies((data as CompanyOpt[]) ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  async function guardar() {
    if (!nombre.trim() || soloDigitos(doc).length < 6 || !email.trim() || password.length < 6) {
      Alert.alert('Formulario', 'Completa nombre, documento oficial, correo y contraseña temporal (mín. 6 caracteres).');
      return;
    }
    if (!esCorreoValido(email)) {
      Alert.alert('Correo', 'Ingresa un correo institucional válido.');
      return;
    }
    if (!company) {
      Alert.alert('Empresa', 'Selecciona la empresa a la que quedará vinculado el perito.');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke<Record<string, unknown>>('create-perito-account', {
        body: {
          nombre: nombre.trim(),
          doc_numero: soloDigitos(doc),
          doc_prefijo: docPrefijo,
          email: email.trim().toLowerCase(),
          password,
          company_id: company.id,
        },
      });
      if (error) throw new Error(error.message);
      const errMsg = data && typeof data.error === 'string' ? data.error : null;
      if (errMsg) throw new Error(errMsg);
      trackUiEvent({
        eventType: 'submit',
        eventName: 'ceo_perito_created',
        screen: 'CreatePeritoAccount',
        module: 'ceo_governance',
        targetType: 'company',
        targetId: company.id,
        status: 'success',
        metadata: {
          company_name: company.razon_social,
          email: email.trim().toLowerCase(),
        },
      });
      Alert.alert('Listo', 'Cuenta perito creada y vinculada a la empresa.', [
        {
          text: 'OK',
          onPress: () => {
            setNombre('');
            setDoc('');
            setDocPrefijo('V');
            setEmail('');
            setPassword('');
            setCompany(null);
          },
        },
      ]);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={s.root}>
      <CeoBackdrop />
      <ScrollView
        style={s.root}
        contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top, SPACE.md) }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>Crear cuenta perito</Text>
        <Text style={s.subtitle}>Alta de personal oficial e institucional.</Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>Empresa asignada</Text>
          <TouchableOpacity style={s.pickerBtn} onPress={() => setPicker(true)} activeOpacity={0.9}>
            <View style={{ flex: 1 }}>
              <Text style={s.pickerLabel}>{company ? company.razon_social : 'Selecciona una empresa validada...'}</Text>
              <Text style={s.pickerSub}>{company ? company.rif : `${companies.length} empresa(s) registradas`}</Text>
            </View>
            <Ionicons name="chevron-down-outline" size={18} color={CEO_COLORS.textMute} />
          </TouchableOpacity>

          {loadingList ? <ActivityIndicator color={CEO_COLORS.purple} style={{ marginTop: 10 }} /> : null}

          <View style={s.divider} />

          <Text style={s.label}>Nombre completo</Text>
          <TextInput style={s.input} value={nombre} onChangeText={setNombre} placeholder="Ej: Ing. Roberto Sanchez" placeholderTextColor={CEO_COLORS.textMute} />

          <Text style={s.label}>Identificación oficial</Text>
          <View style={s.docRow}>
            <TouchableOpacity style={s.docPrefixBtn} onPress={() => setDocPicker(true)} activeOpacity={0.9}>
              <Text style={s.docPrefixTxt}>{docPrefijo}-</Text>
              <Ionicons name="chevron-down-outline" size={16} color={CEO_COLORS.textMute} />
            </TouchableOpacity>
            <TextInput
              style={[s.input, s.docInput]}
              value={doc}
              onChangeText={text => setDoc(soloDigitos(text))}
              placeholder="00000000"
              placeholderTextColor={CEO_COLORS.textMute}
              keyboardType="numeric"
            />
          </View>

          <Text style={s.label}>Correo institucional</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="roberto@empresa.com"
            placeholderTextColor={CEO_COLORS.textMute}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={s.label}>Contraseña temporal</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Minimo 6 caracteres"
            placeholderTextColor={CEO_COLORS.textMute}
            secureTextEntry
          />

          <Text style={s.helper}>
            Esta acción queda registrada en la bitácora ejecutiva y crea la cuenta operativa del perito bajo control del CEO.
          </Text>

          <TouchableOpacity style={s.saveBtn} onPress={() => void guardar()} disabled={saving} activeOpacity={0.92}>
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={s.saveTxt}>Crear cuenta perito</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <ScrollableListModal
          visible={picker}
          title="Empresas registradas"
          data={companies}
          keyExtractor={c => c.id}
          label={c => c.razon_social}
          subtitle={c => c.rif}
          onSelect={setCompany}
          onClose={() => setPicker(false)}
          emptyPlaceholder="No hay empresas registradas disponibles."
          footerCloseLabel="Cerrar"
          variant="ceoDark"
        />

        <ScrollableListModal
          visible={docPicker}
          title="Prefijo del documento"
          data={DOC_PREFIJOS}
          keyExtractor={item => item.id}
          label={item => `${item.label} identificación`}
          onSelect={item => setDocPrefijo(item.id)}
          onClose={() => setDocPicker(false)}
          footerCloseLabel="Cerrar"
          variant="ceoDark"
        />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CEO_COLORS.bg },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  title: { fontSize: 24, fontWeight: FONT.weights.bold, color: CEO_COLORS.text },
  subtitle: { marginTop: 6, color: CEO_COLORS.textSoft, lineHeight: 20, fontSize: FONT.sizes.sm },
  card: {
    marginTop: SPACE.md,
    backgroundColor: CEO_COLORS.panel,
    borderRadius: 30,
    padding: SPACE.lg,
    borderWidth: 1,
    borderColor: 'rgba(192,132,252,0.22)',
    ...SHADOW.lg,
  },
  cardTitle: { color: CEO_COLORS.purple, fontSize: FONT.sizes.xs, textTransform: 'uppercase', letterSpacing: 1.6, fontWeight: FONT.weights.bold, marginBottom: 8 },
  label: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold, color: CEO_COLORS.textSoft, marginTop: SPACE.md },
  helper: { marginTop: SPACE.md, color: CEO_COLORS.textSoft, lineHeight: 20, fontSize: FONT.sizes.sm },
  input: {
    marginTop: 6,
    backgroundColor: 'rgba(2,6,23,0.55)',
    borderRadius: 16,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    fontSize: FONT.sizes.md,
    color: CEO_COLORS.text,
  },
  docRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  docPrefixBtn: {
    backgroundColor: 'rgba(2,6,23,0.55)',
    borderRadius: 16,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  docPrefixTxt: { color: CEO_COLORS.text, fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold },
  docInput: { flex: 1, marginTop: 0 },
  pickerBtn: {
    marginTop: 6,
    backgroundColor: 'rgba(2,6,23,0.55)',
    borderRadius: 18,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(192,132,252,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickerLabel: { fontSize: FONT.sizes.md, color: CEO_COLORS.text, fontWeight: FONT.weights.bold },
  pickerSub: { marginTop: 2, fontSize: FONT.sizes.sm, color: CEO_COLORS.textMute },
  divider: { height: 1, backgroundColor: CEO_COLORS.border, marginVertical: SPACE.md },
  saveBtn: {
    marginTop: SPACE.xl,
    backgroundColor: 'rgba(147,51,234,0.92)',
    padding: SPACE.md,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    ...SHADOW.md,
  },
  saveTxt: { color: '#FFF', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md },
});
