import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT } from '@/shared/utils/theme';

/**
 * Barra superior que aparece cuando el dispositivo pierde conectividad.
 * Usa `@react-native-community/netinfo` (ya instalado).
 */
export function OfflineBar() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const hiddenOffset = -(52 + insets.top);
  const [slideAnim] = useState(() => new Animated.Value(hiddenOffset));
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!offline && !showReconnected) {
      slideAnim.setValue(hiddenOffset);
    }
  }, [hiddenOffset, offline, showReconnected, slideAnim]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const isOffline = state.isConnected === false || state.isInternetReachable === false;
      if (isOffline && !wasOffline.current) {
        wasOffline.current = true;
        setOffline(true);
        setShowReconnected(false);
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 14 }).start();
      } else if (!isOffline && wasOffline.current) {
        wasOffline.current = false;
        setOffline(false);
        setShowReconnected(true);
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 14 }).start();
        // Ocultar la barra "reconectado" después de 3 s
        setTimeout(() => {
        setShowReconnected(false);
        Animated.timing(slideAnim, { toValue: hiddenOffset, duration: 300, useNativeDriver: true }).start();
        }, 3000);
      }
    });
    return () => unsub();
  }, [hiddenOffset, slideAnim]);

  if (!offline && !showReconnected) return null;

  return (
    <Animated.View
      style={[
        s.bar,
        { paddingTop: Math.max(insets.top, 10) },
        showReconnected && !offline ? s.barOnline : s.barOffline,
        { transform: [{ translateY: slideAnim }] },
      ]}
      accessibilityLiveRegion="polite"
    >
      <View style={s.row}>
        <Ionicons
          name={showReconnected && !offline ? 'wifi' : 'wifi-outline'}
          size={15}
          color="#FFF"
        />
        <Text style={s.txt}>
          {showReconnected && !offline
            ? 'Conexión restaurada'
            : 'Sin conexión — los datos pueden estar desactualizados'}
        </Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
  },
  barOffline: { backgroundColor: '#dc2626' },
  barOnline: { backgroundColor: '#16a34a' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  txt: { color: '#FFF', fontSize: FONT.sizes.sm, fontWeight: '600', flex: 1 },
});
