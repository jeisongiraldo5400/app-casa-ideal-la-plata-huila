import { useTheme } from '@/components/theme';
import {
  ActionBar,
  Button,
  Card,
  Metric,
  ScreenState,
  SectionHeader,
  StatusChip,
} from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { useUserRoles } from '@/hooks/useUserRoles';
import { errorMessage } from '@/lib/errorMessage';
import { localCatalogPulledAt } from '@/lib/offline/repositories/catalogRepository';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { formatLastDownloadTime, requestManualDownload } from '@/lib/offline/sync/downloadData';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { carriedLabel, SelectedList } from './prepare/SelectedList';
import { PREPARE_PHONE_AFTER_MS } from './SyncStatusBanner';
import { setSyncMode, SELECTION_LIMITS, useSyncPrefs } from './infrastructure/syncPrefsService';

export { carriedLabel } from './prepare/SelectedList';

function BlockDate({ label, at }: { label: string; at: number | null }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const time = formatLastDownloadTime(at);
  return (
    <Text style={[styles.caption, { color: colors.text.secondary }]}>
      {time ? `${label}: ${time}` : `${label}: aún no descargado`}
    </Text>
  );
}

/** Qué baja siempre (v3): los clientes van todos; los negocios, solo los abiertos. */
export function alwaysIncludedLines(input: { recaudador: boolean; canOrders: boolean }): string[] {
  return [
    input.recaudador
      ? 'Los clientes de los negocios que cobras, con sus direcciones'
      : 'Todos los clientes, con sus direcciones',
    'Negocios abiertos con sus cuotas y pagos (los cerrados y anulados no se llevan)',
    'Departamentos, municipios y veredas',
    'Métodos de pago y vendedores',
    'Tus rutas de cobro',
    ...(input.canOrders ? ['Remisiones pendientes (lista ligera)'] : []),
  ];
}

function estimateLine(estimated: { clientes: number; negocios: number } | null) {
  if (!estimated) return null;
  const clientes = `${estimated.clientes} ${estimated.clientes === 1 ? 'cliente' : 'clientes'}`;
  const negocios = `${estimated.negocios} ${estimated.negocios === 1 ? 'negocio abierto' : 'negocios abiertos'}`;
  return `Se descargarán unos ${clientes} y ${negocios}.`;
}

/**
 * «Preparar el teléfono» (contrato v2 + v3). Clientes y negocios abiertos van
 * siempre; se eligen productos (sí / no) y las órdenes, que se marcan desde
 * sus listas. Nada baja solo: cada cambio queda «Pendiente de descargar».
 */
export function OfflineDataScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { isAdmin, isVendedor, isBodeguero, onlyFindsBySearch, loading: rolesLoading } = useUserRoles();
  const prefs = useSyncPrefs();
  const online = useSyncStore((state) => state.online);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const syncStatus = useSyncStore((state) => state.status);
  const [downloading, setDownloading] = useState(false);
  const [savingProducts, setSavingProducts] = useState(false);
  const [catalogAt, setCatalogAt] = useState<number | null>(null);

  const lastDownload = prefs.lastManualAt ?? lastSyncedAt;
  const recaudador = onlyFindsBySearch();
  // El servidor dice qué aplica a este usuario; los roles quedan de respaldo.
  const canOrders = prefs.meta.ordersAllowed && !recaudador && (isAdmin() || isVendedor() || isBodeguero());
  const canCatalog = prefs.meta.catalogAllowed && !recaudador;
  const stale = lastDownload != null && Date.now() - lastDownload > PREPARE_PHONE_AFTER_MS;

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(localCatalogPulledAt())
      .then((value) => {
        if (!cancelled) setCatalogAt(value ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lastSyncedAt]);

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const result = await requestManualDownload();
      if (!result.ok && result.reason === 'offline') {
        Alert.alert('Sin conexión', 'Conéctate a internet para descargar.');
      } else if (!result.ok) {
        Alert.alert('No se pudo descargar', result.message);
      }
    } finally {
      setDownloading(false);
    }
  };

  const toggleProducts = useCallback(async (value: boolean) => {
    if (!useSyncStore.getState().online) {
      Alert.alert('Sin conexión', 'Necesitas señal para cambiar qué llevar en el teléfono.');
      return;
    }
    setSavingProducts(true);
    try {
      await setSyncMode('productos', value ? 'todo' : 'ninguno');
    } catch (err) {
      Alert.alert('No se pudo cambiar', errorMessage(err, 'Inténtalo de nuevo.'));
    } finally {
      setSavingProducts(false);
    }
  }, []);

  let blocked: React.ReactNode = null;
  if (rolesLoading || prefs.status === 'idle' || prefs.status === 'loading') {
    blocked = <ScreenState loading title="Cargando preferencias…" variant="inline" />;
  } else if (prefs.status === 'unsupported') {
    blocked = (
      <ScreenState
        icon="cloud-off"
        title="Aún no disponible"
        description="El servidor todavía no permite elegir qué llevar en el teléfono. «Descargar» trae todo, como siempre."
      />
    );
  } else if (prefs.status === 'error') {
    blocked = (
      <ScreenState
        tone="error"
        title="No se pudieron cargar las preferencias"
        description={prefs.error ?? undefined}
        actionLabel="Reintentar"
        onAction={() => void prefs.reload()}
      />
    );
  }

  const productsOn = prefs.config.productos.mode !== 'ninguno';
  const estimate = prefs.status === 'ready' ? estimateLine(prefs.meta.estimated) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <ScrollView contentContainerStyle={styles.content} testID="offline-data-screen" keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <View style={styles.summary}>
            <Metric label="Última descarga" value={formatLastDownloadTime(lastDownload) ?? 'Nunca'} size="md" />
            {syncStatus === 'syncing' || downloading ? (
              <StatusChip label="Descargando…" tone="primary" icon="sync" />
            ) : prefs.pendingDownload ? (
              <StatusChip label="Pendiente de descargar" tone="warning" icon="schedule" />
            ) : null}
          </View>
          {lastDownload == null ? (
            <Text style={[styles.caption, { color: colors.warning.main }]} testID="prepare-first-time">
              Aún no has preparado el teléfono. Revisa qué llevar y pulsa «Descargar» antes de salir.
            </Text>
          ) : prefs.pendingDownload || stale ? (
            <Text style={[styles.caption, { color: colors.warning.main }]} testID="prepare-warning">
              {prefs.pendingDownload
                ? 'Tienes elecciones pendientes de descargar. Pulsa «Descargar» antes de salir.'
                : 'La última descarga tiene más de 24 horas. Descarga de nuevo antes de salir.'}
            </Text>
          ) : null}
          {!online ? (
            <Text style={[styles.caption, { color: colors.warning.main }]}>
              Sin conexión: puedes ver lo elegido, pero los cambios y la descarga se hacen con señal.
            </Text>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <SectionHeader title="Siempre incluido" />
          {alwaysIncludedLines({ recaudador, canOrders }).map((line) => (
            <Text key={line} style={[styles.caption, { color: colors.text.secondary }]}>
              • {line}
            </Text>
          ))}
          {estimate ? (
            <Text style={[styles.caption, { color: colors.text.primary }]} testID="prepare-estimate">
              {estimate}
            </Text>
          ) : null}
          <BlockDate label="Descargado" at={lastDownload} />
        </Card>

        {blocked ?? (
          <>
            {canCatalog ? (
              <Card style={styles.card}>
                <View testID="domain-card-productos" style={styles.cardBody}>
                  <SectionHeader
                    title="Productos"
                    action={
                      <StatusChip
                        label={productsOn ? 'Todos' : 'Ninguno'}
                        tone={productsOn ? 'info' : 'neutral'}
                        icon="inventory-2"
                      />
                    }
                  />
                  <View style={styles.switchRow}>
                    <Text style={[styles.body, { color: colors.text.primary }]}>Llevar productos y existencias</Text>
                    {savingProducts ? (
                      <ActivityIndicator color={colors.primary.main} />
                    ) : (
                      <Switch
                        testID="products-switch"
                        value={productsOn}
                        disabled={!online}
                        onValueChange={(value) => void toggleProducts(value)}
                        trackColor={{ false: colors.divider, true: colors.primary.light }}
                        thumbColor={productsOn ? colors.primary.main : colors.text.secondary}
                      />
                    )}
                  </View>
                  <Text style={[styles.caption, { color: colors.text.secondary }]}>
                    {productsOn
                      ? 'Se lleva el catálogo completo con existencias, para crear negocios sin señal.'
                      : 'No se lleva el catálogo; al descargar se borra del teléfono.'}
                  </Text>
                  <BlockDate label="Productos descargados" at={catalogAt} />
                </View>
              </Card>
            ) : null}

            {canOrders ? (
              <Card style={styles.card}>
                <View testID="domain-card-ordenes" style={styles.cardBody}>
                  <SectionHeader
                    title="Órdenes de entrega"
                    action={
                      <StatusChip
                        label={carriedLabel(prefs.config.ordenes.count)}
                        tone={prefs.config.ordenes.count ? 'success' : 'neutral'}
                        icon="local-shipping"
                      />
                    }
                  />
                  <Text style={[styles.caption, { color: colors.text.secondary }]}>
                    Se marcan desde la lista de órdenes con «Llevar en el teléfono» (hasta {SELECTION_LIMITS.ordenes}).
                  </Text>
                  <SelectedList domain="ordenes" count={prefs.config.ordenes.count} disabled={!online} />
                  <BlockDate label="Órdenes descargadas" at={lastDownload} />
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
      <ActionBar>
        <Button
          title={downloading ? 'Descargando…' : 'Descargar'}
          icon="cloud-download"
          onPress={() => void download()}
          loading={downloading}
          disabled={downloading}
          style={styles.flex}
        />
      </ActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.xl },
  card: { gap: Spacing.md },
  cardBody: { gap: Spacing.md },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  caption: { ...Typography.caption },
  body: { ...Typography.bodySmallStrong, flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  flex: { flex: 1 },
});
