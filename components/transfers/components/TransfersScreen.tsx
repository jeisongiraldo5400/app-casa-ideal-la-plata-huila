import { useTheme } from '@/components/theme';
import { ScreenState } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { useNavigateWithLoading } from '@/hooks/useNavigateWithLoading';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useIsFocused } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTransferTasks } from '../infrastructure/hooks/useTransferTasks';
import {
  TRANSFER_SECTIONS,
  defaultSection,
  overdueCount,
  sortForList,
  type TransferSectionKey,
} from '../utils/transferTasks';
import { modeParam } from '../utils/transferRules';
import { TransferSectionPicker } from './TransferSectionPicker';
import { TransferSummaryCard } from './TransferSummaryCard';

/**
 * Lista «Traslados»: Por despachar / Por recibir / Que transporto /
 * Devoluciones por confirmar, con contadores y los vencidos en rojo (arriba).
 * Los traslados se crean en la web; aquí solo se atienden.
 */
export function TransfersScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const navigate = useNavigateWithLoading();
  const focused = useIsFocused();
  const online = useNetworkStatus();
  const state = useTransferTasks({ enabled: focused && online });
  const [section, setSection] = useState<TransferSectionKey | null>(null);

  // La primera vez que llegan las tareas se abre la primera sección con algo pendiente.
  useEffect(() => {
    if (state.tasks && section === null) setSection(defaultSection(state.tasks));
  }, [section, state.tasks]);

  const active = TRANSFER_SECTIONS.find((item) => item.key === (section ?? 'toDispatch')) ?? TRANSFER_SECTIONS[0];
  const rows = state.tasks ? sortForList(state.tasks[active.key]) : [];
  const overdue = overdueCount(rows);

  const body = () => {
    if (state.unavailable) {
      return (
        <ScreenState
          tone="warning"
          icon="update"
          title="Traslados aún no disponible"
          description="El servidor todavía no tiene las órdenes de traslado. Pide a un administrador que lo actualice."
        />
      );
    }
    if (!state.tasks) {
      if (!online) {
        return (
          <ScreenState
            tone="warning"
            icon="wifi-off"
            title="Sin señal"
            description="Los traslados se consultan con conexión. Vuelve a intentarlo cuando tengas señal."
          />
        );
      }
      if (state.error) {
        return (
          <ScreenState
            tone="error"
            title="No se pudieron cargar los traslados"
            description={state.error}
            actionLabel="Reintentar"
            onAction={() => void state.reload()}
          />
        );
      }
      return <ScreenState loading title="Cargando traslados…" />;
    }
    if (!state.rolesLoading && !state.canUse) {
      return (
        <ScreenState
          icon="lock-outline"
          title="Sin traslados asignados"
          description="Traslados es para bodegueros y administradores: el bodeguero despacha y recibe. Si deberías hacerlo, pide a un administrador el perfil de bodeguero."
        />
      );
    }
    if (rows.length === 0) {
      return <ScreenState icon="inventory-2" title={active.title} description={active.empty} variant="inline" />;
    }
    return rows.map((order) => (
      <TransferSummaryCard
        key={order.id}
        order={order}
        onPress={() =>
          navigate(
            (active.mode
              ? `/traslado/${encodeURIComponent(order.id)}?modo=${modeParam(active.mode)}`
              : `/traslado/${encodeURIComponent(order.id)}`) as never
          )
        }
      />
    ));
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.default }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={state.loading && Boolean(state.tasks)} onRefresh={() => void state.reload()} />
      }
    >
      {state.tasks && !state.unavailable ? (
        <TransferSectionPicker
          value={active.key}
          counts={{
            toDispatch: state.tasks.toDispatch.length,
            toReceive: state.tasks.toReceive.length,
            carrying: state.tasks.carrying.length,
            toConfirmReturn: state.tasks.toConfirmReturn.length,
          }}
          onChange={setSection}
        />
      ) : null}
      {state.tasks && !state.unavailable ? (
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text.primary }]}>{active.title}</Text>
          {overdue > 0 ? (
            <Text style={[styles.overdue, { color: colors.error.main }]}>
              {overdue} vencido{overdue === 1 ? '' : 's'}
            </Text>
          ) : null}
        </View>
      ) : null}
      {state.tasks && !online ? (
        <Text style={[styles.offline, { color: colors.warning.dark }]}>
          Sin señal: la lista puede estar desactualizada y no podrás confirmar despachos ni recepciones.
        </Text>
      ) : null}
      {state.tasks && state.error ? (
        <Text style={[styles.offline, { color: colors.error.main }]}>{state.error}</Text>
      ) : null}
      {body()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl * 2, gap: Spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  title: { ...Typography.section },
  overdue: { ...Typography.bodySmallStrong },
  offline: { ...Typography.caption },
});
