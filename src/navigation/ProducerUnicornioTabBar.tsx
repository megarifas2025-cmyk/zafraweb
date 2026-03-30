/**
 * Tab bar productor — `diseños/agricultor.txt`: crema, bordes redondeados, FAB Scan central (#2D4F1E).
 * Reporta altura real a React Navigation (evita escena en blanco con tab bar custom).
 */
import React, { useContext } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  type LayoutChangeEvent,
} from 'react-native';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChatUnread } from '@/shared/store/ChatUnreadContext';

const CREAM = '#FDFBF7';
const FOREST = '#0F3B25';
export function ProducerUnicornioTabBar({ state, navigation }: BottomTabBarProps) {
  const { mercadoUnread } = useChatUnread();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 8);
  const onTabBarHeight = useContext(BottomTabBarHeightCallbackContext);

  const isFocused = (name: string) => state.routes[state.index]?.name === name;

  const onBarLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) onTabBarHeight?.(h);
  };

  return (
    <View style={[styles.wrap, { paddingBottom: bottomPad }]} onLayout={onBarLayout}>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.side}
          onPress={() => navigation.navigate('Dashboard' as never)}
          accessibilityRole="button"
          accessibilityLabel="Mi Finca"
        >
          <Text style={[styles.emoji, { opacity: isFocused('Dashboard') ? 1 : 0.35 }]}>🌽</Text>
          <Text style={[styles.label, isFocused('Dashboard') && styles.labelActive]}>Mi Finca</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.side}
          onPress={() => navigation.navigate('Seguimiento' as never)}
          accessibilityLabel="Seguimiento de carga"
        >
          <Ionicons name="cube-outline" size={22} color={isFocused('Seguimiento') ? FOREST : '#CBD5E1'} />
          <Text style={[styles.label, isFocused('Seguimiento') && styles.labelActive]}>Carga</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.side} onPress={() => navigation.navigate('Chat' as never)} accessibilityLabel="Chat">
          <View style={styles.iconWrap}>
            <Ionicons name="chatbubble-outline" size={22} color={isFocused('Chat') ? FOREST : '#CBD5E1'} />
            {mercadoUnread > 0 ? <View style={styles.tabDot} /> : null}
          </View>
          <Text style={[styles.label, isFocused('Chat') && styles.labelActive]}>Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.side} onPress={() => navigation.navigate('Perfil' as never)} accessibilityLabel="Perfil">
          <Ionicons name="person-outline" size={22} color={isFocused('Perfil') ? FOREST : '#CBD5E1'} />
          <Text style={[styles.label, isFocused('Perfil') && styles.labelActive]}>Perfil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    minWidth: 0,
  },
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 6,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  iconWrap: { position: 'relative' },
  tabDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: CREAM,
  },
  side: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    minHeight: 46,
    minWidth: 0,
  },
  emoji: { fontSize: 24, marginBottom: 2 },
  label: {
    fontSize: 8,
    fontWeight: '900',
    color: '#CBD5E1',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  labelActive: { color: FOREST },
});
