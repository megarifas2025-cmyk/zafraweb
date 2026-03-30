import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FONT, SPACE, RADIUS } from '@/shared/utils/theme';

export type TrustTier = 'bronce' | 'plata' | 'oro';

export function trustTierFromScore(score: number | undefined): TrustTier {
  const s = score ?? 50;
  if (s >= 80) return 'oro';
  if (s >= 65) return 'plata';
  return 'bronce';
}

const TIER_STYLE: Record<TrustTier, { label: string; bg: string; fg: string }> = {
  bronce: { label: 'Bronce', bg: '#D7CCC8', fg: '#3E2723' },
  plata: { label: 'Plata', bg: '#E0E0E0', fg: '#424242' },
  oro: { label: 'Oro', bg: '#FFE082', fg: '#5D4037' },
};

interface Props {
  trustScore?: number;
  zafrasCompletadas?: number;
  compact?: boolean;
}

export function TrustBadge({ trustScore = 50, zafrasCompletadas = 0, compact }: Props) {
  const tier = trustTierFromScore(trustScore);
  const st = TIER_STYLE[tier];
  return (
    <View style={[s.wrap, { backgroundColor: st.bg }, compact && s.wrapCompact]}>
      <Text style={[s.tier, { color: st.fg }]}>Escudo confianza · {st.label}</Text>
      <Text style={[s.sub, { color: st.fg }]}>
        Score {trustScore}/100 · Zafras {zafrasCompletadas}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: RADIUS.md, padding: SPACE.sm, marginVertical: SPACE.xs },
  wrapCompact: { paddingVertical: 6, paddingHorizontal: SPACE.sm },
  tier: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold },
  sub: { fontSize: FONT.sizes.xs, marginTop: 2 },
});
