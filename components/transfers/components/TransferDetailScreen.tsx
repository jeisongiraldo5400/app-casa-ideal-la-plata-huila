import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
import { BackButton, Card, ScreenState, SegmentedControl } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { HeaderHeightContext } from '@react-navigation/elements';
import { Stack } from 'expo-router';
import React, { useContext, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { useTransferDetail } from '../infrastructure/hooks/useTransferDetail';
import { availableModes, initialMode, type TransferMode } from '../utils/transferRules';
import { OFFLINE_TRANSFER_MESSAGE, TRANSFER_MODE_LABEL, viewNotice } from '../utils/transferTexts';
import { DispatchPanel } from './DispatchPanel';
import { ReceivePanel } from './ReceivePanel';
import { ReturnPanel } from './ReturnPanel';
import { TransferHeaderCard } from './TransferHeaderCard';
import { TransferItemsView } from './TransferItemsView';
import { TransferPhotosView } from './TransferPhotosView';

type Props = {
  transferOrderId: string | null;
  /** Acción pedida desde la lista (`?modo=`); se usa solo si está disponible. */
  preferredMode?: TransferMode | null;
};

/**
 * Detalle de un traslado. Abre el modo según el estado y `permissions` del
 * servidor: sacar productos (solo quien «Saca» o un admin), recibir (solo
 * quien «Recibe» o un admin) o confirmar devolución; si no hay acción, solo
 * lectura con el motivo. Sin señal no deja confirmar, pero lo marcado se
 * conserva en memoria.
 */
export function TransferDetailScreen({ transferOrderId, preferredMode = null }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { user } = useAuth();
  const online = useNetworkStatus();
  const { detail, loading, error, reload } = useTransferDetail(transferOrderId);
  const [mode, setMode] = useState<TransferMode>('view');
  const [success, setSuccess] = useState<string | null>(null);
  // El header (StackHeader) va encima de esta vista: sin restarlo, el cálculo
  // del teclado se queda corto justo en los campos de abajo (nota, foto).
  const headerHeight = useContext(HeaderHeightContext) ?? 0;

  const modes = detail ? availableModes(detail) : [];
  const modesKey = modes.join(',');

  // Al cargar (o recargar tras confirmar) se elige el modo; si el que estaba
  // abierto ya no aplica (p. ej. se recibió todo), se cambia.
  useEffect(() => {
    if (!detail) return;
    setMode((current) => (current !== 'view' && modes.includes(current) ? current : initialMode(detail, preferredMode)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, modesKey, preferredMode]);

  const screenOptions = {
    title: detail?.order.orderNumber ?? 'Traslado',
    headerLeft: () => <BackButton />,
  };

  if (!detail) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        {loading ? (
          <ScreenState loading title="Cargando traslado…" style={styles.state} />
        ) : (
          <ScreenState
            tone="error"
            title="No se pudo abrir el traslado"
            description={error ?? undefined}
            actionLabel="Reintentar"
            onAction={() => void reload()}
            style={styles.state}
          />
        )}
      </>
    );
  }

  const onDone = (message: string) => {
    setSuccess(message);
    void reload();
  };
  const notice = mode === 'view' ? viewNotice(detail.order, user?.id) : null;

  return (
    // Android (edge-to-edge): la ventana ya no se encoge con el teclado, así
    // que la vista se achica ('height') para que se pueda bajar hasta la nota y
    // el botón. iOS: el ScrollView corre el contenido y lleva a la vista el
    // campo enfocado (automaticallyAdjustKeyboardInsets).
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'android' ? 'height' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <Stack.Screen options={screenOptions} />
      <ScrollView
        style={[styles.flex, { backgroundColor: colors.background.default }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}
      >
        {!online ? (
          <Card variant="muted">
            <Text style={[styles.banner, { color: colors.warning.dark }]} accessibilityLiveRegion="polite">
              {OFFLINE_TRANSFER_MESSAGE}
            </Text>
          </Card>
        ) : null}
        {success ? (
          <Card variant="muted">
            <Text style={[styles.banner, { color: colors.success.dark }]} accessibilityLiveRegion="polite">
              {success}
            </Text>
          </Card>
        ) : null}
        {error ? <Text style={[styles.banner, { color: colors.error.main }]}>{error}</Text> : null}

        <TransferHeaderCard detail={detail} />
        <TransferPhotosView events={detail.events} />

        {modes.length > 1 ? (
          <SegmentedControl
            items={modes.map((value) => ({ value, label: TRANSFER_MODE_LABEL[value] }))}
            value={mode}
            onChange={(value) => setMode(value as TransferMode)}
          />
        ) : null}

        {mode === 'dispatch' ? <DispatchPanel detail={detail} online={online} onDone={onDone} /> : null}
        {mode === 'receive' ? <ReceivePanel detail={detail} online={online} onDone={onDone} /> : null}
        {mode === 'return' ? <ReturnPanel detail={detail} online={online} onDone={onDone} /> : null}
        {mode === 'view' ? (
          <>
            {notice ? <Text style={[styles.notice, { color: colors.text.secondary }]}>{notice}</Text> : null}
            <TransferItemsView detail={detail} />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl * 2, gap: Spacing.lg },
  state: { margin: Spacing.xl },
  banner: { ...Typography.bodySmallStrong },
  notice: { ...Typography.bodySmall },
});
