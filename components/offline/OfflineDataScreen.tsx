import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useTheme } from '@/components/theme';
import {
  ActionBar,
  Button,
  Card,
  Metric,
  ModalSheet,
  OptionPickerField,
  ScreenState,
  SectionHeader,
  SegmentedControl,
  StatusChip,
} from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { useUserRoles } from '@/hooks/useUserRoles';
import { errorMessage } from '@/lib/errorMessage';
import { fetchLocationMasters, EMPTY_LOCATION_MASTERS, type LocationMasters } from '@/lib/locations/locationsService';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { formatLastDownloadTime, requestManualDownload } from '@/lib/offline/sync/downloadData';
import { fetchSellerOptions, type SellerOption } from '@/lib/users/sellersService';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  fetchCategoryOptions,
  fetchCustomerCandidates,
  fetchProductCandidates,
  fetchWarehouseOptions,
  type BulkCandidates,
  type NamedOption,
} from './infrastructure/bulkSelectionService';
import {
  listSyncSelection,
  setSyncMode,
  setSyncSelection,
  SELECTION_LIMITS,
  useSyncPrefs,
  type SelectionItem,
  type SyncMode,
  type SyncPrefDomain,
} from './infrastructure/syncPrefsService';

type IconName = React.ComponentProps<typeof StatusChip>['icon'];

const NOUNS: Record<SyncPrefDomain, { one: string; many: string; carried: string; carriedOne: string }> = {
  clientes: { one: 'cliente', many: 'clientes', carried: 'llevados', carriedOne: 'llevado' },
  productos: { one: 'producto', many: 'productos', carried: 'llevados', carriedOne: 'llevado' },
  ordenes: { one: 'orden', many: 'órdenes', carried: 'llevadas', carriedOne: 'llevada' },
};

export function carriedLabel(domain: SyncPrefDomain, count: number) {
  const noun = NOUNS[domain];
  return `${count} ${count === 1 ? noun.carriedOne : noun.carried}`;
}

const MODE_ITEMS = [
  { value: 'todo', label: 'Todo', icon: 'cloud-download' as const },
  { value: 'seleccion', label: 'Solo lo que elijo', icon: 'checklist' as const },
];

const LIST_PAGE = 10;

// ---------------------------------------------------------------------------

type BulkKind = 'mis' | 'vendedor' | 'ubicacion' | 'categoria' | 'bodega';

const BULK_TITLES: Record<BulkKind, string> = {
  mis: 'Llevar mis clientes',
  vendedor: 'Llevar clientes de un vendedor',
  ubicacion: 'Llevar clientes por municipio o vereda',
  categoria: 'Llevar productos de una categoría',
  bodega: 'Llevar productos de una bodega',
};

function BulkSelectSheet({
  kind,
  onClose,
  onDone,
}: {
  kind: BulkKind | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { user } = useAuth();
  const domain: SyncPrefDomain = kind === 'categoria' || kind === 'bodega' ? 'productos' : 'clientes';
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [masters, setMasters] = useState<LocationMasters>(EMPTY_LOCATION_MASTERS);
  const [options, setOptions] = useState<NamedOption[]>([]);
  const [value, setValue] = useState('');
  const [location, setLocation] = useState({ departamentoId: '', municipioId: '', veredaId: '' });
  const [candidates, setCandidates] = useState<BulkCandidates | null>(null);
  const [counting, setCounting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue('');
    setLocation({ departamentoId: '', municipioId: '', veredaId: '' });
    setCandidates(null);
    setError(null);
    if (kind === 'vendedor') void fetchSellerOptions().then(setSellers).catch(() => setSellers([]));
    if (kind === 'ubicacion') void fetchLocationMasters().then(setMasters).catch(() => setMasters(EMPTY_LOCATION_MASTERS));
    if (kind === 'categoria') void fetchCategoryOptions().then(setOptions).catch(() => setOptions([]));
    if (kind === 'bodega') void fetchWarehouseOptions().then(setOptions).catch(() => setOptions([]));
  }, [kind]);

  // Criterio actual → ids candidatos (se cuentan antes de marcar).
  useEffect(() => {
    if (!kind) return;
    let cancelled = false;
    const run = async () => {
      let result: BulkCandidates | null = null;
      if (kind === 'mis') result = await fetchCustomerCandidates({ sellerId: user?.id ?? null });
      else if (kind === 'vendedor' && value) result = await fetchCustomerCandidates({ sellerId: value });
      else if (kind === 'ubicacion' && location.municipioId)
        result = await fetchCustomerCandidates({
          municipioId: location.municipioId,
          veredaId: location.veredaId || null,
        });
      else if (kind === 'categoria' && value) result = await fetchProductCandidates({ categoryId: value });
      else if (kind === 'bodega' && value) result = await fetchProductCandidates({ warehouseId: value });
      return result;
    };
    setCounting(true);
    setError(null);
    run()
      .then((result) => {
        if (!cancelled) setCandidates(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setCandidates(null);
          setError(errorMessage(err, 'No se pudo contar'));
        }
      })
      .finally(() => {
        if (!cancelled) setCounting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, value, location.municipioId, location.veredaId, user?.id]);

  const noun = NOUNS[domain];
  const count = candidates?.ids.length ?? 0;

  const confirm = async () => {
    if (!candidates || count === 0) return;
    setSaving(true);
    try {
      const result = await setSyncSelection(domain, candidates.ids, true);
      Alert.alert('Listo', `Llevas ${carriedLabel(domain, result.count)}. Se descargarán en la próxima sincronización.`);
      onDone();
    } catch (err) {
      Alert.alert('No se pudieron llevar', errorMessage(err, 'Inténtalo de nuevo.'));
    } finally {
      setSaving(false);
    }
  };

  const pickerOptions =
    kind === 'vendedor'
      ? sellers.map((seller) => ({ value: seller.id, label: seller.full_name }))
      : options.map((option) => ({ value: option.id, label: option.name }));

  const municipioOptions = masters.municipios
    .filter((item) => item.departamento_id === location.departamentoId)
    .map((item) => ({ value: item.id, label: item.nombre }));
  const veredaOptions = masters.veredas
    .filter((item) => item.municipio_id === location.municipioId)
    .map((item) => ({ value: item.id, label: item.nombre }));

  return (
    <ModalSheet
      visible={kind !== null}
      onClose={onClose}
      title={kind ? BULK_TITLES[kind] : ''}
      subtitle={`Hasta ${SELECTION_LIMITS[domain]} ${noun.many} en el teléfono.`}
      footer={
        <>
          <Button title="Cancelar" variant="outline" onPress={onClose} style={styles.flex} />
          <Button
            title={count ? `Llevar ${count}` : 'Llevar'}
            onPress={() => void confirm()}
            disabled={!count || counting}
            loading={saving}
            style={styles.flex}
          />
        </>
      }
    >
      {kind === 'vendedor' || kind === 'categoria' || kind === 'bodega' ? (
        <OptionPickerField
          value={value}
          onValueChange={setValue}
          options={pickerOptions}
          placeholder={kind === 'vendedor' ? 'Elige un vendedor' : kind === 'categoria' ? 'Elige una categoría' : 'Elige una bodega'}
          modalTitle={kind === 'vendedor' ? 'Vendedor' : kind === 'categoria' ? 'Categoría' : 'Bodega'}
          colors={colors}
        />
      ) : null}
      {kind === 'ubicacion' ? (
        <>
          <OptionPickerField
            value={location.departamentoId}
            onValueChange={(departamentoId) => setLocation({ departamentoId, municipioId: '', veredaId: '' })}
            options={masters.departamentos.map((item) => ({ value: item.id, label: item.nombre }))}
            placeholder="Departamento"
            modalTitle="Departamento"
            colors={colors}
          />
          <OptionPickerField
            value={location.municipioId}
            onValueChange={(municipioId) => setLocation((current) => ({ ...current, municipioId, veredaId: '' }))}
            options={municipioOptions}
            placeholder={location.departamentoId ? 'Municipio' : 'Elige primero un departamento'}
            modalTitle="Municipio"
            colors={colors}
            disabled={!location.departamentoId}
          />
          <OptionPickerField
            value={location.veredaId}
            onValueChange={(veredaId) => setLocation((current) => ({ ...current, veredaId }))}
            options={veredaOptions}
            placeholder={location.municipioId ? 'Todas las veredas' : 'Elige primero un municipio'}
            modalTitle="Vereda"
            colors={colors}
            disabled={!location.municipioId || veredaOptions.length === 0}
          />
        </>
      ) : null}
      {counting ? (
        <ActivityIndicator color={colors.primary.main} />
      ) : error ? (
        <Text style={[styles.caption, { color: colors.error.main }]}>{error}</Text>
      ) : candidates ? (
        <Text style={[styles.caption, { color: colors.text.primary }]} testID="bulk-count">
          {count === 0
            ? `No hay ${noun.many} con ese criterio.`
            : `Se llevarán ${count} ${count === 1 ? noun.one : noun.many} al teléfono.`}
          {candidates.total > count ? ` Hay ${candidates.total}; solo caben ${count}.` : ''}
        </Text>
      ) : null}
    </ModalSheet>
  );
}

// ---------------------------------------------------------------------------

function SelectedList({ domain, count, disabled }: { domain: SyncPrefDomain; count: number; disabled: boolean }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [items, setItems] = useState<SelectionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const page = await listSyncSelection(domain, LIST_PAGE, offset);
        setItems((current) => (offset === 0 ? page : [...current, ...page]));
        setHasMore(page.length === LIST_PAGE);
        setError(null);
      } catch (err) {
        setError(errorMessage(err, 'No se pudo cargar la lista'));
      } finally {
        setLoading(false);
      }
    },
    [domain]
  );

  useEffect(() => {
    if (disabled) return;
    void load(0);
  }, [load, count, disabled]);

  const remove = async (id: string) => {
    setRemoving(id);
    try {
      await setSyncSelection(domain, [id], false);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      Alert.alert('No se pudo quitar del teléfono', errorMessage(err, 'Inténtalo de nuevo.'));
    } finally {
      setRemoving(null);
    }
  };

  if (count === 0) {
    return (
      <Text style={[styles.caption, { color: colors.text.secondary }]}>
        {domain === 'ordenes'
          ? 'Aún no llevas órdenes. Márcalas con «Llevar en el teléfono» desde la lista de órdenes.'
          : `Aún no has marcado ${NOUNS[domain].many}.`}
      </Text>
    );
  }
  if (disabled) return null;

  return (
    <View style={styles.list} testID={`selected-list-${domain}`}>
      {error ? <Text style={[styles.caption, { color: colors.error.main }]}>{error}</Text> : null}
      {items.map((item) => (
        <View key={item.id} style={[styles.listRow, { borderColor: colors.divider }]}>
          <View style={styles.flex}>
            <Text style={[styles.itemLabel, { color: colors.text.primary }]} numberOfLines={1}>
              {item.label}
            </Text>
            {item.detail ? (
              <Text style={[styles.caption, { color: colors.text.secondary }]} numberOfLines={1}>
                {item.detail}
              </Text>
            ) : null}
          </View>
          <Button
            title="Quitar"
            variant="ghost"
            size="sm"
            loading={removing === item.id}
            disabled={removing !== null}
            onPress={() => void remove(item.id)}
            accessibilityLabel={`Quitar ${item.label} del teléfono`}
          />
        </View>
      ))}
      {loading ? <ActivityIndicator color={colors.primary.main} /> : null}
      {hasMore && !loading ? (
        <Button title="Ver más" variant="ghost" size="sm" onPress={() => void load(items.length)} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

function DomainCard({
  domain,
  title,
  icon,
  mode,
  count,
  online,
  onChangeMode,
  bulk,
  onBulk,
  help,
}: {
  domain: SyncPrefDomain;
  title: string;
  icon: IconName;
  mode: SyncMode;
  count: number;
  online: boolean;
  onChangeMode?: (mode: SyncMode) => void;
  bulk: { kind: BulkKind; label: string }[];
  onBulk: (kind: BulkKind) => void;
  help: string;
}) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const selecting = mode === 'seleccion';

  return (
    <Card style={styles.card}>
      <View testID={`domain-card-${domain}`} style={styles.cardBody}>
        <SectionHeader
          title={title}
          action={
            selecting ? (
              <StatusChip label={carriedLabel(domain, count)} tone={count ? 'success' : 'warning'} icon={icon} />
            ) : (
              <StatusChip label="Todo" tone="info" icon={icon} />
            )
          }
        />
        {onChangeMode ? (
          <SegmentedControl
            items={MODE_ITEMS}
            value={mode}
            onChange={(value) => {
              if (!online) {
                Alert.alert('Sin conexión', 'Necesitas señal para cambiar qué llevar en el teléfono.');
                return;
              }
              if (value !== mode) onChangeMode(value as SyncMode);
            }}
          />
        ) : null}
        <Text style={[styles.caption, { color: colors.text.secondary }]}>{help}</Text>
        {selecting ? (
          <>
            {bulk.length ? (
              <View style={styles.bulkRow}>
                {bulk.map((item) => (
                  <Button
                    key={item.kind}
                    title={item.label}
                    variant="outline"
                    size="sm"
                    icon="playlist-add"
                    disabled={!online}
                    onPress={() => onBulk(item.kind)}
                  />
                ))}
              </View>
            ) : null}
            <SelectedList domain={domain} count={count} disabled={!online} />
          </>
        ) : null}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function OfflineDataScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { isAdmin, isVendedor, isBodeguero, onlyFindsBySearch, loading: rolesLoading } = useUserRoles();
  const prefs = useSyncPrefs();
  const online = useSyncStore((state) => state.online);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const status = useSyncStore((state) => state.status);
  const [bulk, setBulk] = useState<BulkKind | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [changingMode, setChangingMode] = useState(false);

  const canOrders = isAdmin() || isVendedor() || isBodeguero();
  const lastDownload = formatLastDownloadTime(lastSyncedAt);

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

  const applyMode = useCallback(
    async (domain: SyncPrefDomain, mode: SyncMode) => {
      setChangingMode(true);
      try {
        await setSyncMode(domain, mode);
      } catch (err) {
        Alert.alert('No se pudo cambiar', errorMessage(err, 'Inténtalo de nuevo.'));
      } finally {
        setChangingMode(false);
      }
    },
    []
  );

  const changeMode = useCallback(
    (domain: SyncPrefDomain, mode: SyncMode) => {
      if (mode === 'todo') {
        void applyMode(domain, mode);
        return;
      }
      const count = prefs.config[domain].count;
      const noun = NOUNS[domain];
      const kept =
        domain === 'clientes'
          ? 'tus clientes, los de tus negocios y los que marques'
          : 'los productos que marques y los de tus órdenes llevadas';
      Alert.alert(
        'Solo lo que elijo',
        `Hoy tienes ${count} ${count === 1 ? noun.one : noun.many} marcados. El teléfono solo llevará ${kept}; el resto se borrará del teléfono en la próxima descarga (lo pendiente de enviar no se toca).`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Cambiar', onPress: () => void applyMode(domain, mode) },
        ]
      );
    },
    [applyMode, prefs.config]
  );

  const content = useMemo(() => {
    if (rolesLoading || prefs.status === 'idle' || prefs.status === 'loading') {
      return <ScreenState loading title="Cargando preferencias…" variant="inline" />;
    }
    if (onlyFindsBySearch()) {
      return (
        <ScreenState
          icon="payments"
          title="Tu teléfono lleva lo necesario para cobrar"
          description="Como recaudador, siempre llevas todos los negocios y su cartera. No hay nada que elegir."
        />
      );
    }
    if (prefs.status === 'unsupported') {
      return (
        <ScreenState
          icon="cloud-off"
          title="Aún no disponible"
          description="El servidor todavía no permite elegir qué llevar en el teléfono. Se descarga todo, como siempre."
        />
      );
    }
    if (prefs.status === 'error') {
      return (
        <ScreenState
          tone="error"
          title="No se pudieron cargar las preferencias"
          description={prefs.error ?? undefined}
          actionLabel="Reintentar"
          onAction={() => void prefs.reload()}
        />
      );
    }
    return null;
  }, [rolesLoading, prefs, onlyFindsBySearch]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <ScrollView contentContainerStyle={styles.content} testID="offline-data-screen">
        <Card style={styles.card}>
          <View style={styles.summary}>
            <Metric label="Última descarga" value={lastDownload ?? 'Nunca'} size="md" />
            {status === 'syncing' || downloading ? <StatusChip label="Descargando…" tone="primary" icon="sync" /> : null}
          </View>
          <Text style={[styles.caption, { color: colors.text.secondary }]}>
            Negocios, cartera y rutas van siempre completos. Aquí eliges cuántos clientes y productos llevar y qué órdenes
            de entrega tener a mano sin señal.
          </Text>
          {!online ? (
            <Text style={[styles.caption, { color: colors.warning.main }]}>
              Sin conexión: puedes ver lo elegido, pero los cambios se hacen con señal.
            </Text>
          ) : null}
        </Card>

        {content ?? (
          <>
            <DomainCard
              domain="clientes"
              title="Clientes"
              icon="people"
              mode={prefs.config.clientes.mode}
              count={prefs.config.clientes.count}
              online={online && !changingMode}
              onChangeMode={(mode) => changeMode('clientes', mode)}
              bulk={[
                { kind: 'mis', label: 'Mis clientes' },
                { kind: 'vendedor', label: 'Por vendedor' },
                { kind: 'ubicacion', label: 'Por municipio o vereda' },
              ]}
              onBulk={setBulk}
              help={
                prefs.config.clientes.mode === 'seleccion'
                  ? 'Siempre van tus clientes y los de tus negocios; además, los que marques.'
                  : 'Se lleva el directorio completo de clientes.'
              }
            />
            <DomainCard
              domain="productos"
              title="Productos"
              icon="inventory-2"
              mode={prefs.config.productos.mode}
              count={prefs.config.productos.count}
              online={online && !changingMode}
              onChangeMode={(mode) => changeMode('productos', mode)}
              bulk={[
                { kind: 'categoria', label: 'Por categoría' },
                { kind: 'bodega', label: 'Por bodega' },
              ]}
              onBulk={setBulk}
              help={
                prefs.config.productos.mode === 'seleccion'
                  ? 'Se llevan los productos que marques (con sus existencias) y los de tus órdenes llevadas.'
                  : 'Se lleva el catálogo completo con existencias.'
              }
            />
            {canOrders ? (
              <DomainCard
                domain="ordenes"
                title="Órdenes de entrega"
                icon="local-shipping"
                mode="seleccion"
                count={prefs.config.ordenes.count}
                online={online}
                bulk={[]}
                onBulk={setBulk}
                help={`Márcalas desde la lista de órdenes (hasta ${SELECTION_LIMITS.ordenes}).`}
              />
            ) : null}
          </>
        )}
      </ScrollView>
      <ActionBar>
        <Button
          title={downloading ? 'Descargando…' : 'Descargar ahora'}
          icon="cloud-download"
          onPress={() => void download()}
          loading={downloading}
          disabled={downloading}
          style={styles.flex}
        />
      </ActionBar>
      <BulkSelectSheet kind={bulk} onClose={() => setBulk(null)} onDone={() => setBulk(null)} />
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
  itemLabel: { ...Typography.bodySmallStrong },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  list: { gap: Spacing.xs },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: 1, paddingTop: Spacing.sm },
  flex: { flex: 1 },
});
