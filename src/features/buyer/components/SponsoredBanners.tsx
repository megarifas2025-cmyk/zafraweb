import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  View,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Linking,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import type { AdCampaignRow } from '@/shared/services/marketBuyerService';
import { COLORS, SPACE } from '@/shared/utils/theme';

const { width: W } = Dimensions.get('window');
const SLIDE_W = W;
const INTERVAL_MS = 4500;

export function SponsoredBanners({ campaigns }: { campaigns: AdCampaignRow[] }) {
  const scrollRef = useRef<ScrollView>(null);
  const [ix, setIx] = useState(0);
  const n = campaigns.length;

  useEffect(() => {
    if (n <= 1) return;
    const t = setInterval(() => {
      setIx((i) => {
        const next = (i + 1) % n;
        scrollRef.current?.scrollTo({ x: next * SLIDE_W, animated: true });
        return next;
      });
    }, INTERVAL_MS);
    return () => clearInterval(t);
  }, [n]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / SLIDE_W);
    if (i >= 0 && i < n && i !== ix) setIx(i);
  };

  if (!n) return null;

  return (
    <View style={s.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={SLIDE_W}
        snapToAlignment="center"
        onMomentumScrollEnd={onScroll}
        contentContainerStyle={{ paddingHorizontal: 0 }}
      >
        {campaigns.map((c) => (
          <TouchableOpacity
            key={c.id}
            activeOpacity={0.9}
            onPress={() => {
              if (c.link) Linking.openURL(c.link).catch(() => Alert.alert('Error', 'No se pudo abrir el enlace.'));
            }}
            style={[s.slide, { width: SLIDE_W }]}
          >
            <Image source={{ uri: c.image_url }} style={s.img} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {n > 1 && (
        <View style={s.dots}>
          {campaigns.map((c, i) => (
            <View key={c.id} style={[s.dot, i === ix && s.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginVertical: SPACE.sm },
  slide: {},
  img: {
    width: W - SPACE.md * 2,
    marginHorizontal: SPACE.md,
    height: 120,
    borderRadius: 12,
    backgroundColor: COLORS.border,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.roles.buyer, width: 18 },
});
