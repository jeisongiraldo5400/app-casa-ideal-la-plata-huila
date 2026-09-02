import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  children: React.ReactNode;
  /** Identifica la pantalla en los logs de error (create, list, detail). */
  screen: 'create' | 'list' | 'detail';
  /** Snapshot legible del estado al momento del render, para el log de error. */
  getDebugContext?: () => Record<string, any>;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Captura crashes de render dentro del módulo de Negocios para que no se lleven
 * de encuentro toda la app. Sin esto, cualquier excepción no controlada en
 * negocio-create/negocios/negocio-detail tumba la app entera y no queda ningún
 * rastro de qué pasó (mismo problema ya corregido en Entradas via EntryErrorBoundary).
 */
export class NegocioErrorBoundary extends React.Component<Props, State> {
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

    // Nota: a diferencia de EntryErrorBoundary, aquí no se persiste en
    // operation_error_logs porque su constraint check_module solo admite
    // 'exits' | 'entries' | 'purchase_orders' | 'returns'. Si se necesita
    // seguimiento remoto de crashes de Negocios, hay que ampliar ese CHECK
    // en la base de datos y el tipo en lib/operationLogger.ts primero.
    console.error(`[NegocioErrorBoundary:${this.props.screen}] Crash capturado en el módulo de Negocios:`, error, info.componentStack, context);
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
          <Text style={styles.title}>Algo salió mal en Negocios</Text>
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
