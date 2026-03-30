import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCompany } from '../hooks/useCompany';
import {
  inviteProducerToCompany,
  listAffiliationsForCompany,
  searchProducerByDocument,
  type CompanyAffiliation,
  type CompanyAffiliationProducer,
} from '@/shared/services/companyAffiliationsService';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import type { CompanyStackParamList } from '@/features/company/navigation/types';

export default function AffiliatedFarmersList() {
  const navigation = useNavigation<NativeStackNavigationProp<CompanyStackParamList>>();
  const { company, loadError } = useCompany();
  const [rows, setRows] = useState<CompanyAffiliation[]>([]);
  const [refresh, setRefresh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [doc, setDoc] = useState('');
  const [candidate, setCandidate] = useState<CompanyAffiliationProducer | null>(null);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState(false);

  const cargar = useCallback(async () => {
    if (!company?.id) {
      setRows([]);
      setErrorMsg(loadError);
      setLoading(false);
      return;
    }
    try {
      const data = await listAffiliationsForCompany(company.id);
      setRows(data);
      setErrorMsg(null);
    } catch (error: unknown) {
      setRows([]);
      setErrorMsg(error instanceof Error ? error.message : 'No se pudo cargar la cartera.');
    }
    setLoading(false);
  }, [company?.id, loadError]);

  useEffect(() => {
    setLoading(true);
    void cargar();
  }, [cargar]);

  const onRefresh = async () => {
    setRefresh(true);
    await cargar();
    setRefresh(false);
  };

  const activos = useMemo(() => rows.filter((row) => row.status === 'active'), [rows]);
  const pendientes = useMemo(() => rows.filter((row) => row.status === 'pending'), [rows]);

  const buscar = async () => {
    const clean = doc.replace(/\D/g, '');
    if (clean.length < 6) {
      Alert.alert('Documento', 'Ingresa una cédula válida para buscar al agricultor.');
      return;
    }
    setSearching(true);
    try {
      const found = await searchProducerByDocument(clean);
      setCandidate(found);
      if (!found) {
        Alert.alert('Sin resultados', 'No se encontró un agricultor registrado con ese documento.');
      }
    } catch (error: unknown) {
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo buscar al agricultor.');
    } finally {
      setSearching(false);
    }
  };

  const invitar = async () => {
    if (!company?.id) {
      Alert.alert('Empresa', 'Completa primero el perfil corporativo antes de invitar agricultores.');
      return;
    }
    if (!candidate?.id) {
      Alert.alert('Agricultor', 'Busca y selecciona un agricultor válido antes de enviar la invitación.');
      return;
    }
    setInviting(true);
    try {
      const status = await inviteProducerToCompany(company.id, candidate.id);
      await cargar();
      Alert.alert(
        status === 'active' ? 'Ya vinculado' : 'Invitación enviada',
        status === 'active'
          ? `${candidate.nombre} ya está vinculado a tu empresa.`
          : `${candidate.nombre} ya puede aceptar la invitación desde su panel de agricultor.`,
      );
      setCandidate(null);
      setDoc('');
    } catch (error: unknown) {
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo crear la vinculación.');
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={activos}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      contentContainerStyle={s.list}
      ListHeaderComponent={
        <View>
          {errorMsg ? <Text style={s.error}>{errorMsg}</Text> : null}
          <View style={s.inviteCard}>
            <Text style={s.inviteTitle}>Registrar agricultor financiado</Text>
            <Text style={s.inviteSub}>Busca al productor por cédula y envíale la invitación para que la acepte en su panel.</Text>
            <TextInput
              style={s.input}
              value={doc}
              onChangeText={setDoc}
              keyboardType="number-pad"
              placeholder="Documento del agricultor"
              placeholderTextColor={COLORS.textDisabled}
            />
            <View style={s.inviteActions}>
              <TouchableOpacity style={s.searchBtn} onPress={() => void buscar()} disabled={searching}>
                {searching ? <ActivityIndicator color="#fff" /> : <Text style={s.searchBtnTxt}>Buscar</Text>}
              </TouchableOpacity>
            </View>
            {candidate ? (
              <View style={s.candidateCard}>
                <Text style={s.candidateName}>{candidate.nombre}</Text>
                <Text style={s.candidateMeta}>{candidate.municipio ?? 'Municipio sin registrar'} · {candidate.telefono ?? 'Sin teléfono'}</Text>
                <TouchableOpacity style={s.inviteBtn} onPress={() => void invitar()} disabled={inviting}>
                  {inviting ? <ActivityIndicator color={COLORS.text} /> : <Text style={s.inviteBtnTxt}>Enviar invitación</Text>}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          {pendientes.length > 0 ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Invitaciones pendientes</Text>
              {pendientes.map((item) => (
                <View key={item.id} style={s.pendingCard}>
                  <Text style={s.nombre}>{item.producer?.nombre ?? item.producer_id.slice(0, 8)}</Text>
                  <Text style={s.meta}>{item.producer?.municipio ?? '—'} · {item.producer?.telefono ?? '—'}</Text>
                  <Text style={s.pendingTxt}>Pendiente por aceptación del agricultor</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={s.sectionTitle}>Agricultores vinculados</Text>
        </View>
      }
      ListEmptyComponent={<Text style={s.empty}>Aún no tienes agricultores aceptados. Empieza invitando uno por documento.</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={s.card}
          activeOpacity={0.88}
          onPress={() =>
            navigation.navigate('SharedProducerProfile', {
              producerId: item.producer_id,
              producerName: item.producer?.nombre ?? undefined,
              accessContext: 'company_view',
            })
          }
        >
          <Text style={s.nombre}>{item.producer?.nombre ?? item.producer_id.slice(0, 8)}</Text>
          <Text style={s.meta}>{item.producer?.municipio ?? '—'} · {item.producer?.telefono ?? '—'}</Text>
          <Text style={s.activeTxt}>Financiado activo en empresa</Text>
        </TouchableOpacity>
      )}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: COLORS.background },
  list: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  error: { color: COLORS.danger, textAlign: 'center', marginBottom: SPACE.md, lineHeight: 20 },
  inviteCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.lg, ...SHADOW.sm },
  inviteTitle: { fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md, color: COLORS.text },
  inviteSub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 6, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACE.sm,
    marginTop: SPACE.md,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  inviteActions: { flexDirection: 'row', marginTop: SPACE.sm },
  searchBtn: { backgroundColor: COLORS.primary, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.sm },
  searchBtnTxt: { color: '#fff', fontWeight: FONT.weights.bold },
  candidateCard: {
    marginTop: SPACE.md,
    padding: SPACE.md,
    backgroundColor: '#f8fafc',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  candidateName: { fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md, color: COLORS.text },
  candidateMeta: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  inviteBtn: {
    marginTop: SPACE.sm,
    alignSelf: 'flex-start',
    backgroundColor: '#FBBC24',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.sm,
  },
  inviteBtnTxt: { color: COLORS.text, fontWeight: FONT.weights.bold },
  section: { marginBottom: SPACE.lg },
  sectionTitle: { fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md, color: COLORS.text, marginBottom: SPACE.sm },
  pendingCard: { backgroundColor: '#fff7ed', borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, borderWidth: 1, borderColor: '#fdba74' },
  pendingTxt: { fontSize: FONT.sizes.xs, color: '#9a3412', fontWeight: FONT.weights.bold, marginTop: 6, textTransform: 'uppercase' },
  empty: { color: COLORS.textDisabled, textAlign: 'center', marginTop: SPACE.xl },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  nombre: { fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md, color: COLORS.text },
  meta: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  activeTxt: { fontSize: FONT.sizes.xs, color: COLORS.success, fontWeight: FONT.weights.bold, marginTop: 6, textTransform: 'uppercase' },
});
