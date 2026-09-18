import { useTheme } from "@/components/theme";
import { getColors } from "@/constants/theme";
import { MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  EMPTY_DELIVERY_LOCATION_FILTER,
  countActiveLocationFilters,
  type DeliveryLocationFilter,
} from "../domain/deliveryLocation";
import {
  EMPTY_LOCATION_MASTERS,
  fetchLocationMasters,
  type LocationMasters,
} from "@/lib/locations/locationsService";
import { useAllDeliveryOrders } from "../infrastructure/hooks/useAllDeliveryOrders";
import { DeliveryOrder } from "../types";
import { DeliveryOrderCard } from "./DeliveryOrderCard";
import { DeliveryOrderLocationFilterModal } from "./DeliveryOrderLocationFilterModal";

interface AllDeliveryOrdersListProps {
  searchQuery?: string;
  refreshTrigger?: number;
}

/**
 * «Todas las órdenes» → órdenes de entrega.
 *
 * El servidor busca, filtra y pagina: la pantalla recibe 10 órdenes con sus
 * totales ya sumados y pide la siguiente tanda al llegar al final de la lista.
 * Antes traía 200 órdenes con sus relaciones y después las líneas de todas
 * ellas para calcular los avances en el teléfono.
 */
export function AllDeliveryOrdersList({
  searchQuery = "",
  refreshTrigger,
}: AllDeliveryOrdersListProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [locationFilter, setLocationFilter] = useState<DeliveryLocationFilter>(
    EMPTY_DELIVERY_LOCATION_FILTER,
  );
  const [showLocationFilter, setShowLocationFilter] = useState(false);
  const [masters, setMasters] = useState<LocationMasters>(EMPTY_LOCATION_MASTERS);
  const [mastersLoading, setMastersLoading] = useState(true);

  const {
    orders,
    debouncedQuery,
    loading,
    loadingMore,
    refreshing,
    error,
    hasMore,
    isSearchDebouncing,
    refresh,
    loadMore,
  } = useAllDeliveryOrders({ searchQuery, locationFilter, refreshTrigger });

  // Los maestros cambian una vez cada varios meses: se piden al montar y no se
  // vuelven a tocar. Si fallan, el filtro queda vacío pero el listado sigue.
  useEffect(() => {
    let active = true;
    fetchLocationMasters()
      .then((next) => { if (active) setMasters(next); })
      .catch((err) => { console.error("Error loading location masters:", err); })
      .finally(() => { if (active) setMastersLoading(false); });
    return () => { active = false; };
  }, []);

  const activeLocationFilters = countActiveLocationFilters(locationFilter);

  /** Texto del botón: los nombres elegidos, de lo general a lo específico. */
  const locationSummary = useMemo(() => {
    if (!activeLocationFilters) return "Filtrar por ubicación";
    const names = [
      masters.departamentos.find((item) => item.id === locationFilter.departamentoId)?.nombre,
      masters.municipios.find((item) => item.id === locationFilter.municipioId)?.nombre,
      masters.veredas.find((item) => item.id === locationFilter.veredaId)?.nombre,
    ].filter(Boolean);
    return names.length ? names.join(" / ") : "Filtrar por ubicación";
  }, [activeLocationFilters, locationFilter, masters]);

  const renderEmpty = () => {
    // Mientras se busca o se carga la primera página no hay nada que decir
    // todavía: el indicador vive en el pie de la lista.
    if (loading || isSearchDebouncing) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary.main} />
          <Text style={[styles.centeredText, { color: colors.text.secondary }]}>
            {isSearchDebouncing || debouncedQuery
              ? "Buscando..."
              : "Cargando órdenes de entrega..."}
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centered}>
          <MaterialIcons name="error-outline" size={48} color={colors.error.main} />
          <Text style={[styles.errorText, { color: colors.error.main }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary.main }]}
            onPress={() => { void refresh(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.retryText, { color: colors.primary.contrastText }]}>
              Reintentar
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (debouncedQuery) {
      return (
        <View style={styles.centered}>
          <MaterialIcons name="search-off" size={64} color={colors.text.secondary} />
          <Text style={[styles.emptyText, { color: colors.text.primary }]}>
            No se encontraron resultados
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.text.secondary }]}>
            No hay órdenes de entrega que coincidan con &quot;{debouncedQuery}&quot;
          </Text>
        </View>
      );
    }

    if (activeLocationFilters > 0) {
      return (
        <View style={styles.centered}>
          <MaterialIcons name="filter-alt-off" size={64} color={colors.text.secondary} />
          <Text style={[styles.emptyText, { color: colors.text.primary }]}>
            Ninguna orden en esa ubicación
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.text.secondary }]}>
            Cambia el filtro o límpialo para ver todas las órdenes.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.centered}>
        <MaterialIcons name="local-shipping" size={64} color={colors.text.secondary} />
        <Text style={[styles.emptyText, { color: colors.text.primary }]}>
          No hay órdenes de entrega registradas
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.text.secondary }]}>
          Las órdenes de entrega aparecerán aquí
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (orders.length === 0) return null;

    if (loadingMore) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator size="small" color={colors.primary.main} />
          <Text style={[styles.footerText, { color: colors.text.secondary }]}>
            Cargando más órdenes...
          </Text>
        </View>
      );
    }

    // El error de una tanda intermedia no borra lo ya visible: se avisa al pie.
    if (error) {
      return (
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.error.main }]}>{error}</Text>
        </View>
      );
    }

    if (hasMore) return <View style={styles.footerSpacer} />;

    return (
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.text.secondary }]}>
          No hay más órdenes
        </Text>
      </View>
    );
  };

  const renderItem = ({ item }: { item: DeliveryOrder }) => (
    <DeliveryOrderCard order={item} />
  );

  return (
    <View style={styles.container}>
      {/* La barra queda fuera de la lista a propósito: si el filtro deja la
          lista vacía, el usuario tiene que poder abrirlo para limpiarlo. */}
      <TouchableOpacity
        style={[
          styles.locationFilterButton,
          {
            backgroundColor: activeLocationFilters
              ? colors.primary.main + "15"
              : colors.background.paper,
            borderColor: activeLocationFilters ? colors.primary.main : colors.divider,
          },
        ]}
        onPress={() => setShowLocationFilter(true)}
        activeOpacity={0.7}
      >
        <MaterialIcons
          name="place"
          size={18}
          color={activeLocationFilters ? colors.primary.main : colors.text.secondary}
        />
        <Text
          style={[
            styles.locationFilterText,
            { color: activeLocationFilters ? colors.primary.main : colors.text.secondary },
          ]}
          numberOfLines={1}
        >
          {locationSummary}
        </Text>
        <MaterialIcons
          name="expand-more"
          size={18}
          color={activeLocationFilters ? colors.primary.main : colors.text.secondary}
        />
      </TouchableOpacity>

      <FlatList
        data={orders}
        keyExtractor={(order) => order.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        contentContainerStyle={orders.length === 0 ? styles.emptyContent : styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { void refresh(); }}
            tintColor={colors.primary.main}
          />
        }
      />

      <DeliveryOrderLocationFilterModal
        visible={showLocationFilter}
        masters={masters}
        mastersLoading={mastersLoading}
        value={locationFilter}
        onChange={setLocationFilter}
        onClose={() => setShowLocationFilter(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  locationFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  locationFilterText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyContent: {
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  centeredText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "600",
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    textAlign: "center",
  },
  footer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  footerText: {
    fontSize: 13,
    textAlign: "center",
  },
  footerSpacer: {
    height: 16,
  },
});
