import { logOperationError } from '@/lib/operationLogger';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  children: React.ReactNode;
  /** Etiqueta legible para el fallback y para diferenciar logs, ej. "Salidas", "Buscar producto". */
  screen: string;
  /**
   * Módulo para persistir el crash en operation_error_logs vía logOperationError.
   * Solo se debe pasar cuando el módulo existe en el CHECK constraint de esa tabla
   * (exits | entries | purchase_orders | returns). Si se omite, el crash solo se
   * loguea por consola (no hay soporte de módulo en la BD para el resto de pantallas).
   */
  logModule?: 'exits' | 'entries' | 'purchase_orders' | 'returns';
  /** Snapshot legible del estado al momento del render, para el log de error. */
  getDebugContext?: () => Record<string, any>;
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

    if (this.props.logModule) {
      void logOperationError({
        error_code: 'SCREEN_RENDER_CRASH',
        error_message: `${error.message}\n${info.componentStack || ''}`.slice(0, 4000),
        module: this.props.logModule,
        operation: 'render',
        severity: 'error',
        context,
      });
    }
  }

  handleRetry = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <MaterialIcons name="error-outline" size={48} color="#DC2626" />
          <Text style={styles.title}>Algo salió mal en {this.props.screen}</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  title: { fontSize: 17, fontWeight: '800' },
  message: { fontSize: 13, opacity: 0.7, textAlign: 'center' },
  button: { backgroundColor: '#DC2626', borderRadius: 10, marginTop: 8, paddingHorizontal: 24, paddingVertical: 12 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
