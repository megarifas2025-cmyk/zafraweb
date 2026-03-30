import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getAccountStatusLabel } from '@/shared/lib/accountStatus';
import { TrustBadge } from '@/shared/components/TrustBadge';
import type { ProducerProfileAccess } from '@/shared/entities/producer-profile/producerProfileAccess';
import type { CompanyAffiliation } from '@/shared/services/companyAffiliationsService';
import {
  resumirFinanciamientosProductor,
  type LoteFinanciadoProductor,
} from '@/shared/services/financingService';
import type { ProducerProfileSnapshot } from '@/shared/services/producerProfileService';
import { COLORS, FONT, SHADOW } from '@/shared/utils/theme';

type Props = {
  producer: ProducerProfileSnapshot['producer'];
  access: ProducerProfileAccess;
  affiliations: CompanyAffiliation[];
  financedLots: LoteFinanciadoProductor[];
};

export function SharedProducerProfileBody({
  producer,
  access,
  affiliations,
  financedLots,
}: Props) {
  const phoneText = access.canSeeContactPhone ? (producer.telefono ?? '–') : 'Visible solo para contextos autorizados';
  const financedSummaries = resumirFinanciamientosProductor(financedLots);

  return (
    <>
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionBar} />
        <Text style={styles.sectionTitle}>Motor productivo</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.roleLine}>{access.heroLabel}</Text>
        <View style={styles.kycPill}>
          <Text style={styles.kycTxt}>
            {getAccountStatusLabel(producer)}
          </Text>
        </View>
        <Text style={styles.rep}>
          ⭐ {producer.reputacion?.toFixed(1) ?? '—'} ({producer.total_tratos ?? 0} ops)
        </Text>
        <TrustBadge trustScore={producer.trust_score ?? 50} zafrasCompletadas={producer.zafras_completadas ?? 0} />
        <Text style={styles.helper}>{access.helperText}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Datos de contacto</Text>
        <Text style={styles.infoRow}>Nombre: {producer.nombre}</Text>
        <Text style={styles.infoRow}>Teléfono: {phoneText}</Text>
        <Text style={styles.infoRow}>Estado: {producer.estado_ve}</Text>
        <Text style={styles.infoRow}>Municipio: {producer.municipio ?? '–'}</Text>
      </View>

      {access.canViewAffiliations && affiliations.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Empresas vinculadas</Text>
          {affiliations.map((item) => (
            <View key={item.id} style={styles.affRow}>
              <Text style={styles.affName}>{item.company?.razon_social ?? 'Empresa vinculada'}</Text>
              <Text style={styles.affMeta}>
                {item.company?.telefono_contacto ?? 'Sin teléfono'}
                {item.company?.rif ? ` · ${item.company.rif}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {access.canViewFinancedLots && financedSummaries.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Lotes financiados</Text>
          {financedSummaries.map((item) => (
            <View key={item.fincaId} style={styles.affRow}>
              <Text style={styles.affName}>{item.fincaNombre}</Text>
              <Text style={styles.affMeta}>
                {item.rubro ?? 'Rubro sin definir'}
                {item.hectareasTotales != null ? ` · ${item.hectareasTotales} ha totales` : ''}
                {item.municipio ? ` · ${item.municipio}` : ''}
              </Text>
              {item.tramos.map((segment) => (
                <View key={segment.id} style={styles.segmentRow}>
                  <Text style={styles.segmentLabel}>
                    {segment.subLotName ?? 'Tramo financiado'} · {segment.companyName}
                  </Text>
                  <Text style={styles.segmentValue}>
                    {segment.hectareas != null ? `${segment.hectareas} ha` : 'ha sin cargar'}
                  </Text>
                </View>
              ))}
              {item.hectareasPropias != null ? (
                <View style={styles.ownRow}>
                  <Text style={styles.ownLabel}>Superficie propia</Text>
                  <Text style={styles.ownValue}>{item.hectareasPropias} ha</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Acceso contextual</Text>
        {access.canEditProfile ? (
          <>
            <Text style={styles.infoRow}>Puedes editar tus datos operativos desde tu propio panel.</Text>
            <Text style={styles.infoRow}>Tus empresas vinculadas y financiamientos se muestran completos para gestión directa.</Text>
          </>
        ) : access.canInitiateOffer ? (
          <>
            <Text style={styles.infoRow}>Esta vista es de consulta. Las ofertas deben salir desde el flujo de mercado y chat privado.</Text>
            <Text style={styles.infoRow}>No se exponen acciones de edición del perfil del productor.</Text>
          </>
        ) : (
          <>
            <Text style={styles.infoRow}>Esta ficha se muestra en modo lectura para seguimiento operativo.</Text>
            <Text style={styles.infoRow}>Las acciones sensibles del productor quedan reservadas al perfil propietario.</Text>
          </>
        )}
      </View>
    </>
  );
}

const FOREST = '#0F3B25';

const styles = StyleSheet.create({
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 4,
  },
  sectionBar: { width: 4, height: 16, borderRadius: 4, backgroundColor: FOREST },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  hero: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    ...SHADOW.sm,
  },
  roleLine: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  kycPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  kycTxt: { fontSize: FONT.sizes.sm, fontWeight: '700', color: COLORS.text },
  rep: { marginTop: 14, color: '#b45309', fontWeight: '700', fontSize: FONT.sizes.md },
  helper: {
    marginTop: 12,
    color: COLORS.textSecondary,
    lineHeight: 20,
    fontSize: FONT.sizes.sm,
  },
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
    marginBottom: 12,
  },
  infoRow: { fontSize: FONT.sizes.sm, paddingVertical: 8, color: COLORS.text, fontWeight: '600' },
  affRow: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e7e5e4' },
  affName: { fontSize: FONT.sizes.md, color: COLORS.text, fontWeight: '800' },
  affMeta: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  segmentRow: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  segmentLabel: { flex: 1, fontSize: FONT.sizes.sm, color: COLORS.text, fontWeight: '700' },
  segmentValue: { fontSize: FONT.sizes.sm, color: '#312e81', fontWeight: '900' },
  ownRow: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ownLabel: { fontSize: FONT.sizes.sm, color: '#065f46', fontWeight: '800' },
  ownValue: { fontSize: FONT.sizes.sm, color: '#065f46', fontWeight: '900' },
});
