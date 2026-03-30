import React from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '@/shared/utils/theme';
import { logError, serializeError } from '@/shared/runtime/appLogger';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError('runtime.error_boundary', 'Unhandled React render error', {
      error: serializeError(error),
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.root}>
          <Text style={styles.title}>Ocurrió un error inesperado</Text>
          <Text style={styles.subtitle}>
            La app encontró un problema de renderizado. Reinicia esta pantalla o vuelve a abrir la aplicación.
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
