/**
 * Weather Ticker – Banner Marquee tipo TV
 * Rota: Alertas Waze verificadas, clima municipal, publicidad patrocinada
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/shared/lib/supabase';
import { COLORS, FONT, SPACE } from '@/shared/utils/theme';
import type { TickerItem } from '@/shared/types';

const { width: SCREEN_W } = Dimensions.get('window');
const TICKER_H = 38;
const VELOCIDAD = 75;

const TIPO_EMOJI: Record<string, string> = {
  alerta_waze: '⚠️',
  clima:       '⛅',
  oferta:     '🌽',
  publicidad: '📢',
  noticia:    '📰',
};

const FALLBACK: TickerItem[] = [
  { id: '1', tipo: 'noticia', texto: 'Bienvenido a ZafraClic', estado_ve: null, prioridad: 10 },
  { id: '2', tipo: 'clima', texto: 'Clima: consulta el pronóstico en tu zona desde el panel', estado_ve: null, prioridad: 8 },
  { id: '3', tipo: 'alerta_waze', texto: 'Mantén tu perfil y tu ubicación actualizados para publicar y contactar más rápido', estado_ve: null, prioridad: 9 },
];

interface Props {
  estado_ve?: string;
  /** Clima en vivo (GPS + OpenWeather) para mostrarlo en la cinta, no solo texto genérico */
  climaEnVivo?: string;
  /** Abre pantalla de clima / alertas meteorológicas (separado de notificaciones). */
  onPress?: () => void;
  /** Si el ticker es el primer elemento de la pantalla, aplica el safe-area top inset automáticamente */
  topInset?: boolean;
}

function mezclarClimaEnVivo(base: TickerItem[], climaEnVivo: string | undefined, estadoVe: string | undefined): TickerItem[] {
  const linea = climaEnVivo?.trim();
  if (!linea) return base;
  const enVivo: TickerItem = {
    id: 'clima-en-vivo',
    tipo: 'clima',
    texto: linea.startsWith('⛅') ? linea : `⛅ ${linea}`,
    estado_ve: estadoVe ?? null,
    prioridad: 100,
  };
  const sinClimaEstatico = base.filter(it => it.id !== '2');
  return [enVivo, ...sinClimaEstatico];
}

function escapePostgrestValue(value: string): string {
  return value.replace(/"/g, '""');
}

const RETRY_DELAYS = [10_000, 30_000, 60_000];

export function WeatherTicker({ estado_ve, climaEnVivo, onPress, topInset = false }: Props) {
  const insets = useSafeAreaInsets();
  const topPad = topInset ? insets.top : 0;
  const [items, setItems] = useState<TickerItem[]>(FALLBACK);
  const [contentW, setContentW] = useState(0);
  const [translateX] = useState(() => new Animated.Value(SCREEN_W));
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async () => {
    try {
      let q = supabase.from('ticker_items').select('id, tipo, texto, estado_ve, prioridad').eq('activo', true).order('prioridad', { ascending: false }).limit(20);
      if (estado_ve?.trim()) q = q.or(`estado_ve.eq."${escapePostgrestValue(estado_ve.trim())}",estado_ve.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      if (data && data.length > 0) {
        setItems(data as TickerItem[]);
        retryCountRef.current = 0;
      }
    } catch {
      // Mantener FALLBACK visible; reintentar con backoff
      if (retryCountRef.current < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[retryCountRef.current] ?? 60_000;
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(() => { void cargar(); }, delay);
      }
    }
  }, [estado_ve]);

  useEffect(() => {
    void cargar();
    const ch = supabase
      .channel('ticker')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticker_items' }, (p) => {
        const it = p.new as TickerItem;
        if (!it.estado_ve || it.estado_ve === estado_ve) setItems(prev => [it, ...prev].slice(0, 25));
      })
      .subscribe();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      void supabase.removeChannel(ch);
    };
  }, [cargar, estado_ve]);

  const iniciarAnim = useCallback(() => {
    if (contentW === 0) return;
    const duracion = ((SCREEN_W + contentW) / VELOCIDAD) * 1000;
    translateX.setValue(SCREEN_W);
    animRef.current = Animated.loop(
      Animated.timing(translateX, { toValue: -contentW, duration: duracion, easing: Easing.linear, useNativeDriver: true }),
    );
    animRef.current.start();
  }, [contentW, translateX]);

  useEffect(() => {
    iniciarAnim();
    return () => animRef.current?.stop();
  }, [iniciarAnim]);

  const cinta = mezclarClimaEnVivo(items, climaEnVivo, estado_ve);

  const inner = (
    <>
      <View style={s.badge}>
        <Text style={s.badgeText}>EN VIVO</Text>
      </View>
      <View style={s.track}>
        <Animated.View style={{ transform: [{ translateX }] }} onLayout={e => setContentW(e.nativeEvent.layout.width)}>
          <Text style={s.cinta} numberOfLines={1}>
            {cinta.map((it, i) => (
              <Text key={it.id}>
                <Text style={s.emoji}>{TIPO_EMOJI[it.tipo] ?? '•'}  </Text>
                <Text style={s.itemTxt}>{it.texto}</Text>
                {i < cinta.length - 1 && <Text style={s.sep}>{'    ◆    '}</Text>}
              </Text>
            ))}
          </Text>
        </Animated.View>
      </View>
    </>
  );

  const content = (
    <>
      {topPad > 0 ? <View style={{ height: topPad, backgroundColor: '#0D2B1D' }} /> : null}
      <View style={s.wrapper}>{inner}</View>
    </>
  );

  if (onPress) {
    return (
      <Pressable style={s.shell} onPress={onPress} accessibilityRole="button" accessibilityLabel="Ver clima y alertas de campo">
        {content}
      </Pressable>
    );
  }

  return <View style={s.shell}>{content}</View>;
}

const s = StyleSheet.create({
  shell: { backgroundColor: '#0D2B1D' },
  wrapper: { height: TICKER_H, backgroundColor: '#0D2B1D', flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  badge: { backgroundColor: COLORS.accent, paddingHorizontal: SPACE.sm, height: '100%', justifyContent: 'center', minWidth: 62, alignItems: 'center' },
  badgeText: { color: '#FFF', fontSize: FONT.sizes.xs, fontWeight: FONT.weights.heavy, letterSpacing: 1.4 },
  track: { flex: 1, overflow: 'hidden', height: '100%', justifyContent: 'center' },
  cinta: { fontSize: FONT.sizes.sm, color: '#FFFFFF' },
  emoji: { fontSize: FONT.sizes.sm },
  itemTxt: { fontWeight: FONT.weights.semibold, fontSize: FONT.sizes.sm },
  sep: { color: '#FFFFFF55', fontSize: FONT.sizes.sm },
});
