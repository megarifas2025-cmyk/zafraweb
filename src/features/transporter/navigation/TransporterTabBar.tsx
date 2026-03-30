import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/** Identidad transporte Zafraclic V2 — azul logístico (diseño maestro). */
const TX = { navy: '#1E3A8A', blue: '#3B82F6', bg: '#FDFBF7' };

/**
 * Barra inferior: Flota · Rutas · [FAB Radar] · Chat · Perfil.
 * El FAB no duplica pantalla: lleva a Flota con scroll a la pizarra.
 */
export function TransporterTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 8);
  const onTabBarHeight = React.useContext(BottomTabBarHeightCallbackContext);

  const idx = state.index;
  const routeAt = (name: string) => state.routes.findIndex(r => r.name === name);

  function go(name: string) {
    const target = routeAt(name);
    if (target < 0) return;
    const event = navigation.emit({ type: 'tabPress', target: state.routes[target].key, canPreventDefault: true });
    if (!event.defaultPrevented) {
      navigation.navigate(name);
    }
  }

  function fabRadar() {
    navigation.navigate('Flota', { scrollPizarra: true } as never);
  }

  const flotaOn = idx === routeAt('Flota');
  const rutasOn = idx === routeAt('Rutas');
  const chatOn = idx === routeAt('Chat');
  const perfilOn = idx === routeAt('Perfil');

  return (
    <View
      style={[styles.wrap, { paddingBottom: bottom }]}
      onLayout={(event) => {
        const height = event.nativeEvent.layout.height;
        if (height > 0) onTabBarHeight?.(height);
      }}
    >
      <View style={styles.row}>
        <TabBtn
          label="Flota"
          active={flotaOn}
          onPress={() => go('Flota')}
          icon={p => <Ionicons name="bus-outline" size={22} color={p} />}
        />
        <TabBtn
          label="Rutas"
          active={rutasOn}
          onPress={() => go('Rutas')}
          icon={p => <Ionicons name="map-outline" size={22} color={p} />}
        />
        <View style={styles.fabSpacer} />
        <TabBtn
          label="Chat"
          active={chatOn}
          onPress={() => go('Chat')}
          icon={p => <Ionicons name="chatbubbles-outline" size={22} color={p} />}
        />
        <TabBtn
          label="Perfil"
          active={perfilOn}
          onPress={() => go('Perfil')}
          icon={p => <Ionicons name="person-outline" size={22} color={p} />}
        />
      </View>

      <View style={[styles.fabOuter, { bottom: bottom + 18 }]} pointerEvents="box-none">
        <View style={styles.fabStack}>
          <TouchableOpacity style={styles.fab} onPress={fabRadar} activeOpacity={0.88} accessibilityLabel="Radar y pizarra de fletes">
            <Ionicons name="radio" size={26} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.fabLabel}>Radar</Text>
        </View>
      </View>
    </View>
  );
}

function TabBtn({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: (color: string) => React.ReactNode;
}) {
  const color = active ? TX.blue : '#9CA3AF';
  return (
    <TouchableOpacity style={styles.tabHit} onPress={onPress} activeOpacity={0.85}>
      {icon(color)}
      <Text style={[styles.tabTxt, { color: active ? TX.navy : '#9CA3AF' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.08)',
    paddingTop: 6,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  fabSpacer: { width: 56 },
  tabHit: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40, paddingBottom: 2 },
  tabTxt: { fontSize: 9, fontWeight: '900', marginTop: 2, letterSpacing: 0.5, textTransform: 'uppercase' },
  fabOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fabStack: { alignItems: 'center' },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: TX.navy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: TX.bg,
    ...Platform.select({
      ios: { shadowColor: TX.navy, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 14 },
      android: { elevation: 10 },
    }),
  },
  fabLabel: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '900',
    color: TX.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
