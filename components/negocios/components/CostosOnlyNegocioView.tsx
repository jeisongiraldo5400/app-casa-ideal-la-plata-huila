import { useTheme } from '@/components/theme';
import { BackButton, ScreenState } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { labelNegocioCodigo } from '@/lib/negocioLabels';
import { parseNegocioCostResult, type NegocioCostResult } from '@/lib/negocios/negocioCosts';
import { supabase } from '@/lib/supabase';
import { Stack } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NegocioCostPanel } from './NegocioCostPanel';

type Header = { numero: number | null; customerName: string | null; sellerName: string | null; status: string | null };

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; header: Header; result: NegocioCostResult };

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * Negocio visto por quien tiene SOLO el perfil «costos» (p. ej. al tocar un
 * aviso de venta bajo costo). No puede leer el negocio (no es suyo ni lo
 * cobra), así que se muestra únicamente lo que le corresponde: costo y margen
 * por producto, con `cost_get_negocio`. Requiere señal; nada se guarda.
 */
export function CostosOnlyNegocioView({ negocioId }: { negocioId: string }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const online = useNetworkStatus();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    (supabase.rpc as unknown as (name: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>)(
      'cost_get_negocio',
      { p_negocio_id: negocioId }
    ).then(
      ({ data, error }) => {
        const result = error ? null : parseNegocioCostResult(data);
        if (!result) {
          setState({ status: 'error', message: error?.message || 'No se pudo consultar el costo del negocio.' });
          return;
        }
        const root = (data ?? {}) as Record<string, unknown>;
        setState({
          status: 'ready',
          result,
          header: {
            numero: typeof root.numero === 'number' ? root.numero : Number(root.numero) || null,
            customerName: text(root.customer_name),
            sellerName: text(root.seller_name),
            status: text(root.status),
          },
        });
      },
      () => setState({ status: 'error', message: 'No se pudo consultar el costo del negocio.' })
    );
  }, [negocioId]);

  useEffect(() => {
    if (online) load();
  }, [online, load]);

  if (!online) {
    return (
      <ScreenState
        icon="wifi-off"
        tone="warning"
        title="Sin señal"
        description="El costo y el margen del negocio se consultan con conexión."
        style={styles.state}
      />
    );
  }
  if (state.status === 'loading') return <ScreenState loading title="Consultando costos…" style={styles.state} />;
  if (state.status === 'error') {
    return (
      <ScreenState icon="error-outline" tone="error" title="No se pudo cargar" description={state.message} actionLabel="Reintentar" onAction={load} style={styles.state} />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} testID="costos-only-negocio">
      <View style={styles.header}>
        <Text style={[Typography.headline, { color: colors.text.primary }]}>Negocio {labelNegocioCodigo(state.header.numero)}</Text>
        <Text style={[Typography.bodySmall, { color: colors.text.secondary }]}>
          {state.header.customerName ?? 'Sin cliente'} · Vendedor {state.header.sellerName ?? '—'}
        </Text>
      </View>
      <NegocioCostPanel result={state.result} showTotals />
    </ScrollView>
  );
}

/**
 * Pantalla completa de la vista anterior dentro del Stack raíz. El header del
 * Stack (`StackHeader`) solo pinta el botón de volver si la pantalla trae
 * `headerLeft`: sin él, al llegar desde un aviso no había cómo regresar.
 */
export function CostosOnlyNegocioScreen({ negocioId }: { negocioId: string }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
      <Stack.Screen options={{ title: 'Costo del negocio', headerLeft: () => <BackButton /> }} />
      <CostosOnlyNegocioView negocioId={negocioId} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
  header: { marginBottom: Spacing.md, gap: Spacing.xs },
  state: { margin: Spacing.lg },
});
