import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useCompany } from '../hooks/useCompany';
import {
  crearLoteFinanciado,
  eliminarLoteFinanciado,
  listarFincasActivasDeProductor,
  listarLotesFinanciadosPorEmpresa,
  resumirFinanciamientosProductor,
  type FincaFinancingCandidate,
  type LoteFinanciadoEmpresa,
} from '@/shared/services/financingService';
import { listAffiliationsForCompany, type CompanyAffiliation } from '@/shared/services/companyAffiliationsService';
import { ScrollableListModal } from '@/shared/components/ScrollableListModal';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

export default function RegisteredFarmsList() {
  const { company, loadError } = useCompany();
  const [rows, setRows] = useState<LoteFinanciadoEmpresa[]>([]);
  const [affiliations, setAffiliations] = useState<CompanyAffiliation[]>([]);
  const [producerFincas, setProducerFincas] = useState<FincaFinancingCandidate[]>([]);
  const [refresh, setRefresh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedProducerId, setSelectedProducerId] = useState('');
  const [selectedFincaId, setSelectedFincaId] = useState('');
  const [subLoteNombre, setSubLoteNombre] = useState('');
  const [hectareas, setHectareas] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalProductor, setModalProductor] = useState(false);
  const [modalFinca, setModalFinca] = useState(false);

  const cargar = useCallback(async () => {
    if (!company?.id) {
      setRows([]);
      setAffiliations([]);
      setErrorMsg(loadError);
      setLoading(false);
      return;
    }
    try {
      const [lots, companyAffiliations] = await Promise.all([
        listarLotesFinanciadosPorEmpresa(company.id),
        listAffiliationsForCompany(company.id),
      ]);
      setRows(lots);
      setAffiliations(companyAffiliations.filter((item) => item.status === 'active'));
      setErrorMsg(null);
    } catch (error: unknown) {
      setRows([]);
      setAffiliations([]);
      setErrorMsg(error instanceof Error ? error.message : 'No se pudieron cargar los sublotes financiados.');
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

  useEffect(() => {
    if (!selectedProducerId) {
      setProducerFincas([]);
      setSelectedFincaId('');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const fincas = await listarFincasActivasDeProductor(selectedProducerId);
        if (cancelled) return;
        setProducerFincas(fincas);
        setSelectedFincaId((current) => (fincas.some((item) => item.id === current) ? current : ''));
      } catch (error: unknown) {
        if (cancelled) return;
        setProducerFincas([]);
        setSelectedFincaId('');
        Alert.alert('Fincas', error instanceof Error ? error.message : 'No se pudieron cargar las fincas del productor.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedProducerId]);

  const producerOptions = useMemo(
    () => affiliations.map((item) => item.producer).filter((item): item is NonNullable<CompanyAffiliation['producer']> => !!item),
    [affiliations],
  );
  const selectedProducer = producerOptions.find((item) => item.id === selectedProducerId) ?? null;
  const selectedFinca = producerFincas.find((item) => item.id === selectedFincaId) ?? null;

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const grouped = resumirFinanciamientosProductor(
    rows.map((row) => ({
      ...row,
      company: {
        id: row.company_id,
        razon_social: company?.razon_social ?? 'Empresa',
        rif: company?.rif ?? '',
        logo_url: company?.logo_url ?? '',
        telefono_contacto: company?.telefono_contacto ?? null,
      },
      productor: row.productor,
    })),
  );

  const guardar = async () => {
    if (!company?.id) return;
    if (!selectedProducerId) {
      Alert.alert('Productor', 'Selecciona un productor vinculado.');
      return;
    }
    if (!selectedFincaId) {
      Alert.alert('Finca', 'Selecciona una finca activa.');
      return;
    }
    const ha = Number.parseFloat(hectareas.replace(',', '.'));
    if (!Number.isFinite(ha) || ha <= 0) {
      Alert.alert('Hectáreas', 'Indica una superficie válida mayor que 0.');
      return;
    }
    setSaving(true);
    try {
      await crearLoteFinanciado({
        companyId: company.id,
        productorId: selectedProducerId,
        fincaId: selectedFincaId,
        subLoteNombre,
        hectareasAsignadas: ha,
      });
      setSubLoteNombre('');
      setHectareas('');
      setSelectedFincaId('');
      await cargar();
      Alert.alert('Sublote guardado', 'El tramo financiado ya quedó registrado para esta finca.');
    } catch (error: unknown) {
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo guardar el sublote financiado.');
    } finally {
      setSaving(false);
    }
  };

  const confirmarEliminar = (loteId: string, label: string) => {
    Alert.alert('Eliminar sublote', `¿Deseas eliminar "${label}" de la cartera financiada?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await eliminarLoteFinanciado(loteId);
              await cargar();
            } catch (error: unknown) {
              Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo eliminar el sublote.');
            }
          })();
        },
      },
    ]);
  };

  const header = (
    <View>
      {errorMsg ? <Text style={s.error}>{errorMsg}</Text> : null}
      <View style={s.formCard}>
        <Text style={s.formTitle}>Registrar sublote financiado</Text>
        <Text style={s.formSub}>Selecciona productor, finca y superficie para reflejar repartos como 50/30/20 dentro de una misma finca.</Text>

        <Text style={s.label}>Productor vinculado</Text>
        <TouchableOpacity style={s.picker} onPress={() => setModalProductor(true)} activeOpacity={0.88}>
          <Text style={s.pickerTxt}>{selectedProducer?.nombre ?? 'Selecciona productor'}</Text>
        </TouchableOpacity>

        <Text style={s.label}>Finca activa</Text>
        <TouchableOpacity
          style={[s.picker, !selectedProducerId && s.pickerDisabled]}
          onPress={() => selectedProducerId && setModalFinca(true)}
          activeOpacity={0.88}
        >
          <Text style={s.pickerTxt}>
            {selectedFinca
              ? `${selectedFinca.nombre} · ${selectedFinca.hectareas ?? '—'} ha`
              : selectedProducerId
                ? 'Selecciona finca'
                : 'Primero elige productor'}
          </Text>
        </TouchableOpacity>

        <Text style={s.label}>Nombre del sublote</Text>
        <TextInput
          style={s.input}
          value={subLoteNombre}
          onChangeText={setSubLoteNombre}
          placeholder="Ej. Bloque Norte, Lote A"
          placeholderTextColor={COLORS.textDisabled}
        />

        <Text style={s.label}>Hectáreas financiadas</Text>
        <TextInput
          style={s.input}
          value={hectareas}
          onChangeText={setHectareas}
          keyboardType="decimal-pad"
          placeholder="50"
          placeholderTextColor={COLORS.textDisabled}
        />

        {selectedFinca ? (
          <Text style={s.helper}>
            Finca: {selectedFinca.rubro ?? 'Rubro sin definir'} · {selectedFinca.municipio ?? 'Municipio sin registrar'} · {selectedFinca.hectareas ?? '—'} ha totales
          </Text>
        ) : null}

        <TouchableOpacity style={s.saveBtn} onPress={() => void guardar()} disabled={saving} activeOpacity={0.88}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnTxt}>Guardar sublote</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <>
      <FlatList
        data={grouped}
        keyExtractor={item => item.fincaId}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={s.list}
        ListHeaderComponent={header}
        ListEmptyComponent={<Text style={s.empty}>No hay sublotes visibles en tu cartera financiada.</Text>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.nombre}>{item.fincaNombre}</Text>
            <Text style={s.meta}>{item.productorNombre}</Text>
            <Text style={s.meta}>
              {item.rubro ?? 'Rubro sin definir'}
              {item.hectareasTotales != null ? ` · ${item.hectareasTotales} ha totales` : ''}
              {item.municipio ? ` · ${item.municipio}, ${item.estado ?? '—'}` : ''}
            </Text>
            {item.tramos.map((segment) => (
              <View key={segment.id} style={s.segmentRow}>
                <View style={s.segmentInfo}>
                  <Text style={s.segmentLabel}>{segment.subLotName ?? 'Tramo financiado'}</Text>
                  <Text style={s.segmentValue}>{segment.hectareas != null ? `${segment.hectareas} ha` : 'ha sin cargar'}</Text>
                </View>
                <TouchableOpacity
                  style={s.deleteBtn}
                  onPress={() => confirmarEliminar(segment.id, segment.subLotName ?? 'Tramo financiado')}
                  activeOpacity={0.88}
                >
                  <Text style={s.deleteBtnTxt}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      />

      <ScrollableListModal
        visible={modalProductor}
        title="Productor vinculado"
        data={producerOptions}
        keyExtractor={(item) => item.id}
        label={(item) => `${item.nombre}${item.municipio ? ` · ${item.municipio}` : ''}`}
        onSelect={(item) => {
          setSelectedProducerId(item.id);
          setSelectedFincaId('');
        }}
        onClose={() => setModalProductor(false)}
      />

      <ScrollableListModal
        visible={modalFinca}
        title={selectedProducer?.nombre ?? 'Finca'}
        data={producerFincas}
        keyExtractor={(item) => item.id}
        label={(item) => `${item.nombre} · ${item.hectareas ?? '—'} ha`}
        onSelect={(item) => setSelectedFincaId(item.id)}
        onClose={() => setModalFinca(false)}
      />
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: COLORS.background },
  list: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  error: { color: COLORS.danger, textAlign: 'center', marginBottom: SPACE.md, lineHeight: 20 },
  empty: { color: COLORS.textDisabled, textAlign: 'center', marginTop: SPACE.xl },
  formCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.lg, ...SHADOW.sm },
  formTitle: { fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md, color: COLORS.text },
  formSub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 6, lineHeight: 20 },
  label: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: SPACE.md, marginBottom: 4 },
  picker: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACE.sm,
    backgroundColor: COLORS.background,
  },
  pickerDisabled: { opacity: 0.6 },
  pickerTxt: { fontSize: FONT.sizes.md, color: COLORS.text },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACE.sm,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  helper: { fontSize: FONT.sizes.xs, color: COLORS.primary, marginTop: SPACE.sm, lineHeight: 18 },
  saveBtn: {
    marginTop: SPACE.md,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  saveBtnTxt: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  nombre: { fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md, color: COLORS.text },
  meta: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  segmentRow: {
    marginTop: SPACE.sm,
    paddingTop: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  segmentInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm },
  segmentLabel: { flex: 1, fontSize: FONT.sizes.sm, color: COLORS.text, fontWeight: FONT.weights.semibold },
  segmentValue: { fontSize: FONT.sizes.sm, color: COLORS.primary, fontWeight: FONT.weights.bold },
  deleteBtn: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: '#FEF2F2',
  },
  deleteBtnTxt: { color: COLORS.danger, fontSize: FONT.sizes.xs, fontWeight: FONT.weights.bold },
});
