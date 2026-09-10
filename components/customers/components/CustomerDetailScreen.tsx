import { useTheme } from '@/components/theme';
import { BackButton, Button, Card, ScreenState, SectionHeader, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errorMessage';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCustomerDetail } from '../infrastructure/hooks/useCustomerDetail';
import { CustomerCarteraSummary } from './CustomerCarteraSummary';
import { CustomerContactBlock } from './CustomerContactBlock';
import { CustomerNegociosList } from './CustomerNegociosList';

interface CustomerDetailScreenProps {
  customerId: string | null;
}

export function CustomerDetailScreen({ customerId }: CustomerDetailScreenProps) {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const detail = useCustomerDetail(customerId);

  // Sin esto el encabezado muestra el nombre de la ruta («cliente/[id]») y se
  // queda sin botón de volver, porque el Stack raíz no los define por pantalla.
  const screenOptions = {
    title: detail.summary?.customer?.name ?? 'Cliente',
    headerLeft: () => <BackButton />,
  };

  const claim = async () => {
    try {
      await detail.claim();
      Alert.alert('Listo', 'El cliente quedó asignado a ti.');
    } catch (error) {
      Alert.alert('No se pudo asignar', errorMessage(error, 'Inténtalo de nuevo'));
    }
  };

  if (detail.loading && !detail.summary) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background.default }]}>
        <Stack.Screen options={screenOptions} />
        <ScreenState loading title="Cargando cliente…" />
      </View>
    );
  }

  if (detail.error || !detail.summary?.customer) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background.default }]}>
        <Stack.Screen options={screenOptions} />
        <ScreenState
          tone="error"
          icon="error-outline"
          title="No se pudo cargar el cliente"
          description={detail.error || 'Inténtalo de nuevo.'}
          actionLabel="Reintentar"
          onAction={detail.reload}
        />
      </View>
    );
  }

  const { customer, seller, negocios, cartera, scope } = detail.summary;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.default }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={detail.loading} onRefresh={detail.reload} tintColor={colors.primary.main} />
      }
    >
      <Stack.Screen options={screenOptions} />
      {detail.fromCache ? (
        <Text style={[styles.notice, { color: colors.warning.main }]}>
          {formatLocalDataLabel(lastSyncedAt)} · Sin conexión: datos locales.
        </Text>
      ) : null}

      <CustomerContactBlock customer={customer} />

      <View>
        <SectionHeader title="Vendedor" />
        <Card>
          {seller ? (
            <>
              <Text style={[styles.sellerName, { color: colors.text.primary }]}>{seller.full_name}</Text>
              {seller.email ? (
                <Text style={[styles.notice, { color: colors.text.secondary }]}>{seller.email}</Text>
              ) : null}
            </>
          ) : (
            <>
              <StatusChip label="Sin vendedor" tone="warning" />
              {detail.canClaim ? (
                <Button
                  title="Asignarme este cliente"
                  icon="person-add"
                  variant="outline"
                  size="sm"
                  loading={detail.claiming}
                  disabled={detail.claimDisabled || detail.claiming}
                  onPress={claim}
                  style={styles.claim}
                />
              ) : null}
              {detail.canClaim && detail.claimDisabled ? (
                <Text style={[styles.notice, { color: colors.text.secondary }]}>
                  Necesitas conexión para asignarte un cliente.
                </Text>
              ) : null}
            </>
          )}
        </Card>
      </View>

      <CustomerCarteraSummary cartera={cartera} scope={scope} unavailable={detail.fromCache} />

      <CustomerNegociosList
        negocios={negocios}
        onOpen={(negocioId) => router.push(`/negocio/${negocioId}` as never)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.xl },
  notice: { ...Typography.metadata },
  sellerName: { ...Typography.bodyStrong },
  claim: { marginTop: Spacing.md, alignSelf: 'flex-start' },
});
