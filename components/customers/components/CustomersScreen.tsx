import { useTheme } from '@/components/theme';
import { DownloadDataButton } from '@/components/offline';
import {
  HeroActionCard,
  OptionPickerField,
  ScreenState,
  SearchField,
  SegmentedControl,
} from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { useUserRoles } from '@/hooks/useUserRoles';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { fetchSellerOptions, type SellerOption } from '@/lib/users/sellersService';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useCustomersList } from '../infrastructure/hooks/useCustomersList';
import { CustomerCreateSheet } from './CustomerCreateSheet';
import { CustomerListCard } from './CustomerListCard';

export function CustomersScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { isAdmin, isVendedor, isGestorCobro, loading: rolesLoading } = useUserRoles();
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const [createOpen, setCreateOpen] = useState(false);
  const [sellers, setSellers] = useState<SellerOption[]>([]);

  const list = useCustomersList();

  useEffect(() => {
    if (list.tab !== 'todos') return;
    fetchSellerOptions()
      .then(setSellers)
      .catch(() => setSellers([]));
  }, [list.tab]);

  const canCreate = isAdmin() || isVendedor();
  const canAccess = isAdmin() || isVendedor() || isGestorCobro();

  const sellerOptions = useMemo(
    () => sellers.map((seller) => ({ value: seller.id, label: seller.full_name })),
    [sellers]
  );

  if (!rolesLoading && !canAccess) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background.default }]}>
        <ScreenState
          icon="lock-outline"
          title="Sin acceso"
          description="Tu usuario no tiene un rol comercial. Pídelo a un administrador."
        />
      </View>
    );
  }

  const renderEmpty = () => {
    if (list.loading && list.customers.length === 0) {
      return <ScreenState loading title="Cargando clientes…" variant="inline" />;
    }
    if (list.error && list.customers.length === 0) {
      return (
        <ScreenState
          variant="inline"
          tone="error"
          icon="error-outline"
          title="No se pudieron cargar los clientes"
          description={list.error}
          actionLabel="Reintentar"
          onAction={list.reload}
        />
      );
    }
    if (list.hasFilters) {
      return (
        <ScreenState
          variant="inline"
          icon="search-off"
          title="Sin coincidencias"
          description="Prueba con otro nombre, documento o vendedor."
        />
      );
    }
    if (list.fromCache) {
      return (
        <ScreenState
          variant="inline"
          icon="cloud-off"
          title="Sin datos locales"
          description="Descarga los datos para consultar clientes sin conexión."
        >
          <DownloadDataButton variant="cta" />
        </ScreenState>
      );
    }
    return (
      <ScreenState
        variant="inline"
        icon="people-outline"
        title={list.tab === 'mios' ? 'Aún no tienes clientes' : 'No hay clientes registrados'}
        description={
          list.tab === 'mios'
            ? 'Los clientes que crees o que te asignen aparecerán aquí.'
            : 'Crea el primero con «Nuevo cliente».'
        }
      />
    );
  };

  const header = (
    <View style={styles.header}>
      {canCreate ? (
        <HeroActionCard
          title="Nuevo cliente"
          subtitle="Queda asignado a ti"
          icon="person-add"
          onPress={() => setCreateOpen(true)}
        />
      ) : null}

      <SegmentedControl
        items={[
          { value: 'mios', label: 'Mis clientes', icon: 'person', badge: list.myCount || undefined },
          { value: 'todos', label: 'Todos', icon: 'groups' },
        ]}
        value={list.tab}
        onChange={(value) => list.changeTab(value as 'mios' | 'todos')}
      />

      <SearchField
        value={list.search}
        onChangeText={list.setSearch}
        placeholder="Buscar por nombre, documento o teléfono…"
      />

      {list.tab === 'todos' ? (
        <OptionPickerField
          value={list.filterSellerId || ''}
          onValueChange={(value) => list.setFilterSellerId(value || null)}
          options={sellerOptions}
          placeholder="Todos los vendedores"
          modalTitle="Filtrar por vendedor"
          colors={colors}
        />
      ) : null}

      {list.fromCache ? (
        <Text style={[styles.notice, { color: colors.warning.main }]}>
          {formatLocalDataLabel(lastSyncedAt)} · Sin conexión: se muestran los clientes descargados.
        </Text>
      ) : null}
      {list.error && list.customers.length > 0 ? (
        <Text style={[styles.notice, { color: colors.warning.main }]}>
          No se pudo actualizar. Mostrando la última lista cargada.
        </Text>
      ) : null}
      {list.customers.length > 0 ? (
        <Text style={[styles.count, { color: colors.text.secondary }]}>
          {list.customers.length} de {list.totalCount}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <FlatList
        data={list.customers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={list.refresh}
            tintColor={colors.primary.main}
          />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmpty()}
        renderItem={({ item }) => (
          <CustomerListCard
            customer={item}
            showSeller={list.tab === 'todos'}
            onPress={() => router.push(`/cliente/${item.id}` as never)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          list.loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.primary.main} />
              <Text style={[styles.notice, { color: colors.text.secondary }]}>Cargando más clientes…</Text>
            </View>
          ) : null
        }
      />

      <CustomerCreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void list.refresh();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl },
  header: { gap: Spacing.md, marginBottom: Spacing.lg },
  notice: { ...Typography.metadata },
  count: { ...Typography.metadata, textAlign: 'right' },
  separator: { height: Spacing.md },
  footer: { paddingVertical: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
});
