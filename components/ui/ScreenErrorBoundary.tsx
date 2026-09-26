import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { logOperationError } from '@/lib/operationLogger';
import { MaterialIcons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type LogModule = 'exits' | 'entries' | 'purchase_orders' | 'returns';

/**
 * Módulo con el que se guarda el fallo cuando la pantalla no dice el suyo.
 * `operation_error_logs.module` tiene un CHECK con solo cuatro valores; se usa
 * el de órdenes (la tabla nació para ellas) y la pantalla real va en `step` y
 * en el contexto, para que ningún fallo se quede sin registrar.
 */
export const DEFAULT_CRASH_LOG_MODULE: LogModule = 'purchase_orders';

export const SCREEN_CRASH_MESSAGE =
  'Esta pantalla tuvo un problema inesperado y ya quedó registrado. Toca «Reintentar»; si se repite, avisa al administrador.';

interface Props {
  children: React.ReactNode;
  /** Etiqueta legible para el fallback y para diferenciar logs, ej. "Salidas", "Buscar producto". */
  screen: string;
  /**
   * Módulo con el que se guarda el fallo en operation_error_logs (CHECK:
   * exits | entries | purchase_orders | returns). Si se omite se usa
   * `DEFAULT_CRASH_LOG_MODULE`: el fallo se registra siempre.
   */
  logModule?: LogModule;
  /** Snapshot legible del estado al momento del render, para el log de error. */
  getDebugContext?: () => Record<string, unknown>;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Captura crashes de render dentro de una pantalla para que no se lleven de
 * encuentro toda la app. Sin esto, cualquier excepción no controlada en el
 * árbol de la pantalla tumba la app entera y no queda ningún rastro de qué pasó.
 */
export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const context = (() => {
      try {
        return this.props.getDebugContext?.() || {};
      } catch {
        return {};
      }
    })();

    console.error(`[ScreenErrorBoundary:${this.props.screen}] Crash capturado:`, error, info.componentStack, context);

    // Sentry solo existe si hay DSN (app/_layout.tsx); sin él no se llama.
    if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
      try {
        Sentry.captureException(error, {
          tags: { screen: this.props.screen },
          contexts: { react: { componentStack: info.componentStack ?? '' }, screen: context },
        });
      } catch {
        // Nunca dejar que el reporte tumbe el fallback.
      }
    }

    void logOperationError({
      error_code: 'SCREEN_RENDER_CRASH',
      error_message: `${error.message}\n${info.componentStack || ''}`.slice(0, 4000),
      module: this.props.logModule ?? DEFAULT_CRASH_LOG_MODULE,
      operation: 'render',
      step: this.props.screen,
      severity: 'error',
      context: { screen: this.props.screen, ...context },
    });
  }

  handleRetry = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return <CrashFallback screen={this.props.screen} error={this.state.error} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

function CrashFallback({ screen, error, onRetry }: { screen: string; error: Error; onRetry: () => void }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [showDetail, setShowDetail] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <MaterialIcons name="error-outline" size={48} color={colors.error.main} />
      <Text style={[styles.title, { color: colors.text.primary }]}>Algo salió mal en {screen}</Text>
      <Text style={[styles.message, { color: colors.text.secondary }]}>{SCREEN_CRASH_MESSAGE}</Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.error.main }]}
        onPress={onRetry}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Reintentar</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setShowDetail((value) => !value)} accessibilityRole="button" hitSlop={8}>
        <Text style={[styles.link, { color: colors.text.secondary }]}>
          {showDetail ? 'Ocultar detalle' : 'Ver detalle'}
        </Text>
      </TouchableOpacity>
      {showDetail ? (
        <ScrollView style={[styles.detail, { borderColor: colors.divider }]}>
          <Text selectable style={[styles.detailText, { color: colors.text.secondary }]}>
            {error.name}: {error.message}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 14, textAlign: 'center' },
  button: { borderRadius: 10, marginTop: 8, paddingHorizontal: 24, paddingVertical: 12 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  link: { fontSize: 13, textDecorationLine: 'underline' },
  detail: { alignSelf: 'stretch', borderRadius: 8, borderWidth: 1, maxHeight: 160, padding: 12 },
  detailText: { fontFamily: 'monospace', fontSize: 12 },
});
