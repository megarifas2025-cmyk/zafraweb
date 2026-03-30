import React from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { DefaultTheme } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/shared/utils/theme';
import appIcon from '../../assets/icon.png';

export const NAV_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.background,
    card: COLORS.surface,
    text: COLORS.text,
    border: COLORS.border,
    primary: COLORS.primary,
  },
};

type RouterSpinnerProps = {
  title?: string;
  subtitle?: string | null;
};

export function RouterSpinner({
  title = 'Iniciando…',
  subtitle = null,
}: RouterSpinnerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.center, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.logoShell}>
        <Image source={appIcon} style={styles.logo} resizeMode="contain" />
      </View>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.bootHint}>{title}</Text>
      {subtitle ? <Text style={styles.bootSub}>{subtitle}</Text> : null}
    </View>
  );
}

type RouterFallbackScreenProps = {
  title: string;
  message: string | null | undefined;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
};

export function RouterFallbackScreen({
  title,
  message,
  actionLabel,
  onAction,
  children,
}: RouterFallbackScreenProps) {
  return (
    <View style={styles.roleFallback}>
      <Text style={styles.roleFallbackTitle}>{title}</Text>
      {message ? <Text style={styles.roleFallbackSub}>{message}</Text> : null}
      {children}
      {actionLabel && onAction ? (
        <Text style={styles.roleFallbackLink} onPress={onAction}>
          {actionLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 24,
  },
  logoShell: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 18,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  bootHint: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '600',
  },
  bootSub: {
    marginTop: 10,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  roleFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 24,
  },
  roleFallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  roleFallbackSub: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  roleFallbackLink: {
    marginTop: 18,
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '700',
  },
});
