import React, { useState, useMemo, useEffect, type ComponentProps } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '@/shared/services/authService';
import { getSupabaseConfigError } from '@/shared/lib/supabase';
import type { AuthNav } from '@/features/auth/navigation/authTypes';
import { listCompanyDirectory } from '@/shared/services/transporterCompanyLinkService';
import type { CompanyDirectoryEntry, DocPrefijo, RolUsuario, TransporterRegistrationMode } from '@/shared/types';
import { ESTADOS_REGISTRO, municipiosPorEstado } from '@/shared/data/venezuelaMunicipios';
import { ScrollableListModal } from '@/shared/components/ScrollableListModal';

const DARK_BG = '#03110A';
const ACCENT = '#1F7A4C';
const GLASS = 'rgba(255,255,255,0.05)';
const GLASS_BORDER = 'rgba(255,255,255,0.1)';
const LABEL = 'rgba(167, 243, 208, 0.5)';
const INPUT_BG = 'rgba(0,0,0,0.4)';
const PLACEHOLDER = 'rgba(120, 120, 120, 0.55)';

/** Orden y estilo `nuevo diseño.txt` (sin peritos en registro público). */
const ROLES_UI: {
  value: RolUsuario;
  label: string;
  desc: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  chipBg: string;
}[] = [
  { value: 'independent_producer', label: 'Agricultor', desc: 'Producción de Campo', icon: 'leaf', chipBg: '#059669' },
  { value: 'transporter', label: 'Transporte', desc: 'Logística de Carga', icon: 'bus', chipBg: '#1d4ed8' },
  { value: 'company', label: 'Empresa', desc: 'Servicios Corporativos', icon: 'business', chipBg: '#292524' },
  { value: 'agrotienda', label: 'Agrotienda', desc: 'Insumos y Equipos', icon: 'storefront', chipBg: '#d97706' },
  { value: 'buyer', label: 'Comprador', desc: 'Ventas y compras agro', icon: 'cart', chipBg: '#c2410c' },
];

const DOC_PREFIJOS: { v: DocPrefijo; label: string }[] = [
  { v: 'V', label: 'V-' },
  { v: 'E', label: 'E-' },
  { v: 'J', label: 'J-' },
  { v: 'G', label: 'G-' },
];

type PublicRegisterRole = Exclude<RolUsuario, 'perito' | 'zafra_ceo'>;

type RoleProfileCopy = {
  profileLead: string;
  profileHint: string;
  nameLabel: string;
  namePlaceholder: string;
  docLabel: string;
  docPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  requiresBirthDate: boolean;
  allowedDocPrefixes: DocPrefijo[];
  defaultDocPrefix: DocPrefijo;
};

const ROLE_PROFILE_COPY: Record<PublicRegisterRole, RoleProfileCopy> = {
  independent_producer: {
    profileLead: 'Registra tu identidad personal y la ubicación donde operas hoy. Tus fincas y lotes se completan luego dentro del módulo agrícola.',
    profileHint: 'Este acceso es para productores independientes. Más adelante podrás cargar finca, cultivos y maquinaria sin repetir esta ficha base.',
    nameLabel: 'Nombre completo',
    namePlaceholder: 'Ej: Jose Antonio Perez',
    docLabel: 'Cédula o identificación',
    docPlaceholder: '12345678',
    phoneLabel: 'WhatsApp del productor',
    phonePlaceholder: '+58 412 000 0000',
    requiresBirthDate: true,
    allowedDocPrefixes: ['V', 'E'],
    defaultDocPrefix: 'V',
  },
  buyer: {
    profileLead: 'Crea tu perfil comercial personal para comprar cosechas, negociar por chat y solicitar apoyo logístico.',
    profileHint: 'Usaremos esta información para mostrarte oportunidades, tiendas cercanas y trazabilidad de tus negociaciones.',
    nameLabel: 'Nombre completo',
    namePlaceholder: 'Ej: Maria Fernanda Rojas',
    docLabel: 'Cédula o identificación',
    docPlaceholder: '12345678',
    phoneLabel: 'WhatsApp del comprador',
    phonePlaceholder: '+58 414 000 0000',
    requiresBirthDate: true,
    allowedDocPrefixes: ['V', 'E'],
    defaultDocPrefix: 'V',
  },
  transporter: {
    profileLead: 'Registra al titular de la cuenta de transporte. Luego podrás trabajar como particular o solicitar vinculación con una empresa.',
    profileHint: 'La cuenta representa al operador logístico responsable. Los servicios, vehículos y asignaciones se manejan después dentro del módulo de transporte.',
    nameLabel: 'Nombre completo del transportista',
    namePlaceholder: 'Ej: Carlos Mendoza',
    docLabel: 'Cédula o identificación',
    docPlaceholder: '12345678',
    phoneLabel: 'WhatsApp operativo',
    phonePlaceholder: '+58 424 000 0000',
    requiresBirthDate: true,
    allowedDocPrefixes: ['V', 'E'],
    defaultDocPrefix: 'V',
  },
  company: {
    profileLead: 'Crea la cuenta principal de la empresa con su razón social, documento fiscal y ubicación operativa actual.',
    profileHint: 'Después podrás completar dirección fiscal, datos corporativos y equipos desde el panel de empresa sin duplicar el registro inicial.',
    nameLabel: 'Razón social',
    namePlaceholder: 'Ej: Agroindustrial Los Llanos C.A.',
    docLabel: 'RIF o identificación fiscal',
    docPlaceholder: '123456789',
    phoneLabel: 'Teléfono principal / WhatsApp',
    phonePlaceholder: '+58 212 000 0000',
    requiresBirthDate: false,
    allowedDocPrefixes: ['J', 'G'],
    defaultDocPrefix: 'J',
  },
  agrotienda: {
    profileLead: 'Registra la agrotienda con su nombre comercial o razón social y el documento fiscal que usará para operar dentro de la app.',
    profileHint: 'El stock, la línea de negocio y el catálogo privado se gestionan luego desde el panel de agrotienda.',
    nameLabel: 'Nombre comercial o razón social',
    namePlaceholder: 'Ej: AgroRepuestos Portuguesa',
    docLabel: 'RIF o identificación fiscal',
    docPlaceholder: '123456789',
    phoneLabel: 'Teléfono de ventas / WhatsApp',
    phonePlaceholder: '+58 414 000 0000',
    requiresBirthDate: false,
    allowedDocPrefixes: ['J', 'G', 'V', 'E'],
    defaultDocPrefix: 'J',
  },
};

function soloDigitos(t: string): string {
  return t.replace(/\D/g, '');
}

function esCorreoValido(t: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.trim().toLowerCase());
}

function normalizarTelefono(t: string): string {
  return t.replace(/[^\d+]/g, '').trim();
}

function telefonoValido(t: string): boolean {
  return soloDigitos(t).length >= 10;
}

function edadMinimaCumplida(fecha: Date, minYears: number): boolean {
  const today = new Date();
  let years = today.getFullYear() - fecha.getFullYear();
  const monthDiff = today.getMonth() - fecha.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < fecha.getDate())) {
    years -= 1;
  }
  return years >= minYears;
}

export default function RegisterScreen() {
  const nav = useNavigation<AuthNav>();
  const [step, setStep] = useState(1);
  const [rol, setRol] = useState<RolUsuario | null>(null);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [estado, setEstado] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [docPrefijo, setDocPrefijo] = useState<DocPrefijo>('V');
  const [docNumero, setDocNumero] = useState('');
  const [fechaNac, setFechaNac] = useState(() => new Date(1990, 0, 15));
  const [showFecha, setShowFecha] = useState(false);
  const [modalDoc, setModalDoc] = useState(false);
  const [modalEstado, setModalEstado] = useState(false);
  const [modalMuni, setModalMuni] = useState(false);
  const [modalEmpresa, setModalEmpresa] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [transporterMode, setTransporterMode] = useState<TransporterRegistrationMode>('particular');
  const [companyDirectory, setCompanyDirectory] = useState<CompanyDirectoryEntry[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyDirectoryEntry | null>(null);
  const [loadingCompanyDirectory, setLoadingCompanyDirectory] = useState(false);
  const [companyDirectoryError, setCompanyDirectoryError] = useState('');

  const municipios = useMemo(() => municipiosPorEstado(estado), [estado]);
  const rolLabel = ROLES_UI.find(r => r.value === rol)?.label ?? '';
  const roleProfile = rol ? ROLE_PROFILE_COPY[rol as PublicRegisterRole] : null;

  useEffect(() => {
    if (!estado.trim()) {
      setMunicipio('');
      return;
    }
    const list = municipiosPorEstado(estado);
    if (!list.length) return;
    setMunicipio(m => (m && list.includes(m) ? m : list[0]!));
  }, [estado]);

  useEffect(() => {
    if (!rol) return;
    const allowedPrefixes = ROLE_PROFILE_COPY[rol as PublicRegisterRole].allowedDocPrefixes;
    const defaultPrefix = ROLE_PROFILE_COPY[rol as PublicRegisterRole].defaultDocPrefix;
    setDocPrefijo(prev => (allowedPrefixes.includes(prev) ? prev : defaultPrefix));
  }, [rol]);

  useEffect(() => {
    if (rol !== 'transporter') {
      setTransporterMode('particular');
      setSelectedCompany(null);
      setCompanyDirectoryError('');
      return;
    }
    let alive = true;
    setLoadingCompanyDirectory(true);
    setCompanyDirectoryError('');
    void (async () => {
      try {
        const rows = await listCompanyDirectory();
        if (alive) {
          setCompanyDirectory(rows);
          if (!rows.length) {
            setCompanyDirectoryError('Aun no hay empresas de transporte disponibles para vincular.');
          }
        }
      } catch {
        if (alive) {
          setCompanyDirectory([]);
          setCompanyDirectoryError('No pudimos cargar el directorio de empresas en este momento.');
        }
      } finally {
        if (alive) setLoadingCompanyDirectory(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [rol]);

  const labelDoc = DOC_PREFIJOS.find(d => d.v === docPrefijo)?.label ?? 'V-';

  function goBack() {
    if (step === 1) nav.navigate('Welcome');
    else if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else setStep(1);
  }

  function selectRole(r: RolUsuario) {
    setRol(r);
    setStep(2);
  }

  function nextFromProfile() {
    if (!rol || !roleProfile) return;
    if (!nombre.trim()) {
      Alert.alert(roleProfile.nameLabel, `Ingresa ${roleProfile.nameLabel.toLowerCase()}.`);
      return;
    }
    const docDig = soloDigitos(docNumero);
    if (docDig.length < 6) {
      Alert.alert('Documento', `Indica ${roleProfile.docLabel.toLowerCase()} válido (mín. 6 dígitos).`);
      return;
    }
    if (!estado.trim()) {
      Alert.alert('Ubicación', 'Selecciona el estado donde operas actualmente.');
      return;
    }
    if (!municipio.trim()) {
      Alert.alert('Ubicación', 'Selecciona municipio.');
      return;
    }
    if (!telefonoValido(telefono)) {
      Alert.alert(roleProfile.phoneLabel, 'Indica un teléfono o WhatsApp válido con al menos 10 dígitos.');
      return;
    }
    if (roleProfile.requiresBirthDate && !edadMinimaCumplida(fechaNac, 18)) {
      Alert.alert('Fecha de nacimiento', 'Debes registrar una persona mayor de edad para este tipo de cuenta.');
      return;
    }
    if (rol === 'transporter' && transporterMode === 'company_link' && !selectedCompany?.id) {
      Alert.alert('Empresa', 'Selecciona la empresa a la que te vas a vincular.');
      return;
    }
    if (rol === 'transporter' && transporterMode === 'company_link' && !companyDirectory.length && companyDirectoryError) {
      Alert.alert('Empresa', companyDirectoryError);
      return;
    }
    setStep(3);
  }

  async function registrar() {
    if (!rol || !roleProfile) return;
    if (!email.trim() || !password) {
      Alert.alert('Campos requeridos', 'Completa correo y contraseña.');
      return;
    }
    if (!esCorreoValido(email)) {
      Alert.alert('Correo inválido', 'Escribe un correo real con formato usuario@dominio.com.');
      return;
    }
    if (password !== password2) {
      Alert.alert('Error', 'Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Mínimo 6 caracteres en la contraseña.');
      return;
    }
    const docDig = soloDigitos(docNumero);
    const cfgErr = getSupabaseConfigError();
    if (cfgErr) {
      Alert.alert('Configuración', cfgErr);
      return;
    }
    const fechaIso = roleProfile.requiresBirthDate ? fechaNac.toISOString().slice(0, 10) : null;
    setCargando(true);
    try {
      await authService.registrar({
        email: email.trim().toLowerCase(),
        password,
        nombre: nombre.trim(),
        rol,
        telefono: normalizarTelefono(telefono) || undefined,
        estado_ve: estado,
        municipio: municipio.trim(),
        doc_prefijo: docPrefijo,
        doc_numero: docDig,
        fecha_nacimiento: fechaIso,
        transporter_registration_mode: rol === 'transporter' ? transporterMode : undefined,
        transporter_company_id: rol === 'transporter' && transporterMode === 'company_link' ? selectedCompany?.id ?? null : null,
      });
      setStep(4);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Intenta de nuevo.';
      Alert.alert('Error', msg);
    } finally {
      setCargando(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar style="light" backgroundColor={DARK_BG} translucent={false} />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              <TouchableOpacity style={s.backBtn} onPress={goBack} hitSlop={12} accessibilityLabel="Volver">
                <Ionicons name="arrow-back" size={22} color="#e7e5e4" />
              </TouchableOpacity>
              <View style={s.roleCardShell}>
                <Text style={s.roleShellTitle}>Configura tu Perfil</Text>
                {ROLES_UI.map(r => (
                  <TouchableOpacity
                    key={r.value}
                    style={s.roleRow}
                    onPress={() => selectRole(r.value)}
                    activeOpacity={0.92}
                  >
                    <View style={[s.roleChip, { backgroundColor: r.chipBg }]}>
                      <Ionicons name={r.icon} size={22} color="#fff" />
                    </View>
                    <View style={s.roleText}>
                      <Text style={s.roleTitle}>{r.label}</Text>
                      <Text style={s.roleDesc}>{r.desc}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.15)" />
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={() => nav.navigate('Login')} style={s.haveAccount}>
                <Text style={s.haveAccountTxt}>
                  ¿Ya tienes cuenta? <Text style={s.haveAccountBold}>Iniciar sesión</Text>
                </Text>
              </TouchableOpacity>
            </>
          ) : null}

          {step >= 2 && step < 4 ? (
            <View style={s.stepHeader}>
              <TouchableOpacity style={s.backBtnInline} onPress={goBack} hitSlop={12} accessibilityLabel="Volver">
                <Ionicons name="arrow-back" size={22} color="#e7e5e4" />
              </TouchableOpacity>
              <View style={s.headerTextBox}>
                <Text style={s.portal} numberOfLines={1}>
                  ZafraClic
                </Text>
                <Text style={s.h2}>{step === 2 ? 'Tus datos' : 'Credenciales'}</Text>
              </View>
            </View>
          ) : null}

          {step === 2 && rol ? (
            <View style={s.block}>
              <View style={s.aiBanner}>
                <Ionicons name="hardware-chip-outline" size={20} color="rgba(74,222,128,0.8)" style={s.aiIcon} />
                <Text style={s.aiBannerTxt}>
                  Perfil: <Text style={s.aiEm}>{rolLabel}</Text>
                </Text>
              </View>

              <Text style={s.sectionSub}>{roleProfile?.profileLead}</Text>
              <View style={s.roleHintCard}>
                <Text style={s.roleHintTxt}>{roleProfile?.profileHint}</Text>
              </View>

              <Text style={s.label}>{roleProfile?.docLabel}</Text>
              <View style={s.docRow}>
                <TouchableOpacity style={s.docPref} onPress={() => setModalDoc(true)}>
                  <Text style={s.docPrefTxt}>{labelDoc} ▾</Text>
                </TouchableOpacity>
                <TextInput
                  style={s.docInput}
                  value={docNumero}
                  onChangeText={t => setDocNumero(soloDigitos(t))}
                  placeholder={roleProfile?.docPlaceholder}
                  placeholderTextColor={PLACEHOLDER}
                  keyboardType="number-pad"
                  autoComplete="off"
                  textContentType="none"
                  contextMenuHidden={false}
                  maxLength={12}
                />
              </View>

              {roleProfile?.requiresBirthDate ? (
                <>
                  <Text style={s.label}>Fecha de nacimiento</Text>
                  <TouchableOpacity style={s.inputLike} onPress={() => setShowFecha(true)}>
                    <Text style={s.inputLikeTxt}>{fechaNac.toISOString().slice(0, 10)}</Text>
                  </TouchableOpacity>
                  {showFecha ? (
                    <DateTimePicker
                      value={fechaNac}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      maximumDate={new Date()}
                      minimumDate={new Date(1924, 0, 1)}
                      onChange={(ev, date) => {
                        if (Platform.OS === 'android') setShowFecha(false);
                        if (ev.type === 'dismissed') return;
                        if (date) setFechaNac(date);
                      }}
                    />
                  ) : null}
                  {Platform.OS === 'ios' && showFecha ? (
                    <TouchableOpacity style={s.iosFechaOk} onPress={() => setShowFecha(false)}>
                      <Text style={s.iosFechaOkTxt}>Listo</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : null}

              <Text style={s.label}>{roleProfile?.nameLabel}</Text>
              <TextInput
                style={s.input}
                value={nombre}
                onChangeText={setNombre}
                placeholder={roleProfile?.namePlaceholder}
                placeholderTextColor={PLACEHOLDER}
                autoCapitalize="words"
              />

              <Text style={s.label}>Estado (Venezuela)</Text>
              <TouchableOpacity style={s.inputLike} onPress={() => setModalEstado(true)}>
                <Ionicons name="location-outline" size={18} color={LABEL} style={s.inlineIcon} />
                <Text style={estado ? s.inputLikeTxt : s.placeholder}>{estado || 'Selecciona estado'}</Text>
              </TouchableOpacity>

              <Text style={s.label}>Municipio</Text>
              <TouchableOpacity style={s.inputLike} onPress={() => setModalMuni(true)}>
                <Ionicons name="location-outline" size={18} color={LABEL} style={s.inlineIcon} />
                <Text style={municipio ? s.inputLikeTxt : s.placeholder}>{municipio || 'Selecciona municipio'}</Text>
              </TouchableOpacity>

              <Text style={s.label}>{roleProfile?.phoneLabel}</Text>
              <View style={s.phoneRow}>
                <Ionicons name="call-outline" size={18} color={LABEL} style={s.inlineIcon} />
                <TextInput
                  style={s.phoneInput}
                  value={telefono}
                  onChangeText={setTelefono}
                  placeholder={roleProfile?.phonePlaceholder}
                  placeholderTextColor={PLACEHOLDER}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                />
              </View>

              {rol === 'transporter' ? (
                <>
                  <Text style={s.label}>Modo operativo</Text>
                  <View style={s.modeRow}>
                    <TouchableOpacity
                      style={[s.modeChip, transporterMode === 'particular' && s.modeChipOn]}
                      onPress={() => setTransporterMode('particular')}
                      activeOpacity={0.9}
                    >
                      <Text style={[s.modeChipTxt, transporterMode === 'particular' && s.modeChipTxtOn]}>Particular</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.modeChip, transporterMode === 'company_link' && s.modeChipOn]}
                      onPress={() => setTransporterMode('company_link')}
                      activeOpacity={0.9}
                    >
                      <Text style={[s.modeChipTxt, transporterMode === 'company_link' && s.modeChipTxtOn]}>Vinculado a empresa</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.modeHint}>
                    {transporterMode === 'particular'
                      ? 'Operas con tu propia cuenta y sin aprobación empresarial.'
                      : 'La empresa debe aprobar tu solicitud antes de operar como aliado.'}
                  </Text>
                  {transporterMode === 'company_link' ? (
                    <>
                      <Text style={s.label}>Empresa objetivo</Text>
                      <TouchableOpacity style={s.inputLike} onPress={() => setModalEmpresa(true)} activeOpacity={0.9}>
                        <Ionicons name="business-outline" size={18} color={LABEL} style={s.inlineIcon} />
                        <Text style={selectedCompany ? s.inputLikeTxt : s.placeholder}>
                          {selectedCompany ? `${selectedCompany.razon_social} · ${selectedCompany.rif}` : 'Selecciona una empresa'}
                        </Text>
                      </TouchableOpacity>
                      {loadingCompanyDirectory ? <ActivityIndicator style={s.directoryLoading} color="#9ae6b4" /> : null}
                      {companyDirectoryError ? <Text style={s.inlineWarn}>{companyDirectoryError}</Text> : null}
                    </>
                  ) : null}
                </>
              ) : null}

              <TouchableOpacity style={s.btnPrimary} onPress={nextFromProfile} activeOpacity={0.95}>
                <Text style={s.btnPrimaryTxt}>Continuar</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {step === 3 && rol ? (
            <View style={s.block}>
              <Text style={s.sectionSub}>
                {rol === 'company' || rol === 'agrotienda'
                  ? 'Estas credenciales administrarán la cuenta principal del negocio dentro de ZafraClic.'
                  : 'Este correo y contraseña se usarán para iniciar sesión en ZafraClic.'}
              </Text>

              <Text style={s.label}>Correo electrónico</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={PLACEHOLDER}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={s.label}>Contraseña</Text>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Mín. 6 caracteres"
                placeholderTextColor={PLACEHOLDER}
                secureTextEntry
              />
              <Text style={s.label}>Repetir contraseña</Text>
              <TextInput
                style={s.input}
                value={password2}
                onChangeText={setPassword2}
                placeholder="Repite la contraseña"
                placeholderTextColor={PLACEHOLDER}
                secureTextEntry
              />

              <TouchableOpacity
                style={[s.btnPrimary, cargando && s.btnDisabled]}
                onPress={registrar}
                disabled={cargando}
                activeOpacity={0.95}
              >
                {cargando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnPrimaryTxt}>Crear cuenta</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {step === 4 ? (
            <View style={s.success}>
              <View style={s.successIcon}>
                <Ionicons name="checkmark" size={48} color={ACCENT} />
              </View>
              <Text style={s.successTitle}>Nodo vinculado</Text>
              <Text style={s.successBody}>
                Tu perfil quedó registrado en ZafraClic. Ya puedes iniciar sesión.
              </Text>
              <TouchableOpacity style={s.btnPrimary} onPress={() => nav.navigate('Login')} activeOpacity={0.95}>
                <Text style={s.btnPrimaryTxt}>Iniciar sesión</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {step < 4 && step > 1 ? (
            <Text style={s.footer}>Uniendo esfuerzos, asegurando cosechas</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ScrollableListModal
        visible={modalDoc}
        title="Tipo de documento"
        data={roleProfile ? DOC_PREFIJOS.filter(item => roleProfile.allowedDocPrefixes.includes(item.v)) : DOC_PREFIJOS}
        keyExtractor={i => i.v}
        label={i => `${i.label} ${roleProfile?.docLabel.toLowerCase() ?? 'documento'}`}
        onSelect={i => setDocPrefijo(i.v)}
        onClose={() => setModalDoc(false)}
        variant="authDark"
      />

      <ScrollableListModal
        visible={modalEstado}
        title="Estado (Venezuela)"
        data={ESTADOS_REGISTRO}
        keyExtractor={item => item}
        label={item => item}
        onSelect={item => setEstado(item)}
        onClose={() => setModalEstado(false)}
        variant="authDark"
      />

      <ScrollableListModal
        visible={modalMuni}
        title={estado || 'Municipio'}
        data={municipios}
        keyExtractor={item => item}
        label={item => item}
        onSelect={item => setMunicipio(item)}
        onClose={() => setModalMuni(false)}
        variant="authDark"
      />

      <ScrollableListModal
        visible={modalEmpresa}
        title="Empresa de transporte"
        data={companyDirectory}
        keyExtractor={item => item.id}
        label={item => `${item.razon_social} · ${item.rif}`}
        onSelect={item => setSelectedCompany(item)}
        onClose={() => setModalEmpresa(false)}
        variant="authDark"
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: DARK_BG },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 16, paddingBottom: 40 },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  roleCardShell: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 36,
    padding: 20,
    marginBottom: 20,
  },
  roleShellTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: 'rgba(167, 243, 208, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: 3,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 16,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginBottom: 10,
  },
  roleChip: {
    padding: 12,
    borderRadius: 16,
    marginRight: 14,
  },
  roleText: { flex: 1 },
  roleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  roleDesc: {
    fontSize: 9,
    color: 'rgba(167, 243, 208, 0.4)',
    textTransform: 'uppercase',
    fontWeight: '900',
    marginTop: 6,
    letterSpacing: 0.5,
    opacity: 0.75,
  },
  haveAccount: { paddingVertical: 12 },
  haveAccountTxt: { textAlign: 'center', fontSize: 14, color: 'rgba(168, 162, 158, 0.85)' },
  haveAccountBold: { color: ACCENT, fontWeight: '800' },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  backBtnInline: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextBox: { flex: 1, justifyContent: 'center' },
  portal: {
    fontSize: 15,
    fontWeight: '900',
    color: 'rgba(74, 222, 128, 0.85)',
    letterSpacing: 0,
    fontStyle: 'italic',
  },
  h2: { fontSize: 20, fontWeight: '900', color: '#fff', fontStyle: 'italic' },
  block: { marginBottom: 20 },
  sectionSub: {
    fontSize: 12,
    color: 'rgba(168, 162, 158, 0.85)',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 46, 22, 0.5)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.15)',
    marginBottom: 16,
  },
  aiIcon: { marginRight: 10 },
  aiBannerTxt: { flex: 1, fontSize: 11, fontWeight: '800', color: 'rgba(167, 243, 208, 0.9)', fontStyle: 'italic' },
  aiEm: { color: '#fff' },
  roleHintCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    marginBottom: 16,
  },
  roleHintTxt: {
    color: 'rgba(214, 211, 209, 0.9)',
    fontSize: 12,
    lineHeight: 19,
  },
  label: {
    fontSize: 9,
    fontWeight: '900',
    color: LABEL,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontStyle: 'italic',
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 4,
  },
  input: {
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 14,
  },
  inputLike: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 16,
    marginBottom: 14,
  },
  inlineIcon: { marginRight: 10 },
  inputLikeTxt: { fontSize: 14, color: '#fff', fontWeight: '600' },
  placeholder: { fontSize: 14, color: PLACEHOLDER },
  docRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  docPref: {
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: INPUT_BG,
    marginRight: 10,
  },
  docPrefTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
  docInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 14,
    color: '#fff',
    backgroundColor: INPUT_BG,
    fontWeight: '600',
  },
  iosFechaOk: { alignSelf: 'flex-end', marginBottom: 8 },
  iosFechaOkTxt: { color: ACCENT, fontWeight: '800' },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingLeft: 14,
    marginBottom: 20,
  },
  phoneInput: { flex: 1, paddingVertical: 16, paddingRight: 14, fontSize: 14, color: '#fff', fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  modeChip: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: INPUT_BG,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  modeChipOn: {
    backgroundColor: 'rgba(31,122,76,0.22)',
    borderColor: 'rgba(74,222,128,0.35)',
  },
  modeChipTxt: { color: '#cbd5e1', fontSize: 12, fontWeight: '800' },
  modeChipTxtOn: { color: '#fff' },
  modeHint: {
    color: 'rgba(167, 243, 208, 0.65)',
    fontSize: 11,
    lineHeight: 18,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  directoryLoading: { marginTop: -4, marginBottom: 12 },
  inlineWarn: {
    color: '#fbbf24',
    fontSize: 11,
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  btnPrimary: {
    backgroundColor: ACCENT,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.65 },
  btnPrimaryTxt: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  success: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16 },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(5, 46, 22, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 12, fontStyle: 'italic' },
  successBody: {
    fontSize: 14,
    color: 'rgba(168, 162, 158, 0.9)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    fontStyle: 'italic',
  },
  footer: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(167, 243, 208, 0.25)',
    letterSpacing: 3,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
});
