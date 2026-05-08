import { useTheme } from "@/components/theme";
import { getColors } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { Database } from "@/types/database.types";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { DeliveryOrder } from "../types";
import { DeliveryOrderCard } from "./DeliveryOrderCard";

const RECENT_PAGE_INITIAL = 200;
const RECENT_PAGE_STEP = 100;
const SEARCH_PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 400;

type DeliveryOrderAdminRow =
  Database["public"]["Functions"]["get_delivery_orders_admin_list"]["Returns"][number];

interface AllDeliveryOrdersListProps {
  searchQuery?: string;
  refreshTrigger?: number;
}

/** Stats + transform shared by tabla directa y resultados post-RPC. */
async function buildDeliveryOrdersFromTableRows(
  ordersData: any[],
): Promise<DeliveryOrder[]> {
  if (!ordersData.length) {
    return [];
  }

  const createdByUserIds = [
    ...new Set(
      ordersData.map((order: any) => order.created_by).filter(Boolean),
    ),
  ];
  let createdByProfilesMap = new Map<string, { id: string; full_name: string | null; email: string | null }>();

  if (createdByUserIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", createdByUserIds);

    createdByProfilesMap = new Map(
      (profilesData || []).map((profile) => [profile.id, profile]),
    );
  }

  const orderIds = ordersData.map((order: any) => order.id);
  const BATCH_SIZE = 500;
  let allItemsData: any[] = [];

  for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
    const batch = orderIds.slice(i, i + BATCH_SIZE);
    const { data: itemsData, error: itemsError } = await supabase
      .from("delivery_order_items")
      .select("delivery_order_id, product_id, quantity, delivered_quantity")
      .in("delivery_order_id", batch)
      .is("deleted_at", null);

    if (itemsError) {
      console.error("Error loading delivery order items batch:", itemsError);
    } else {
      allItemsData = [...allItemsData, ...(itemsData || [])];
    }
  }

  const { data: cancelledExits } = await supabase
    .from("inventory_exit_cancellations")
    .select("inventory_exit_id");

  const cancelledExitIds = new Set(
    (cancelledExits || []).map((c: any) => c.inventory_exit_id),
  );

  let allExitsData: any[] = [];
  for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
    const batch = orderIds.slice(i, i + BATCH_SIZE);
    const { data: exitsData, error: exitsError } = await supabase
      .from("inventory_exits")
      .select("id, delivery_order_id, product_id, quantity")
      .in("delivery_order_id", batch);

    if (exitsError) {
      console.error("Error loading inventory exits batch:", exitsError);
    } else {
      allExitsData = [...allExitsData, ...(exitsData || [])];
    }
  }

  const exitsByOrderProduct = new Map<string, number>();
  allExitsData.forEach((exit: any) => {
    if (cancelledExitIds.has(exit.id)) return;
    if (!exit.delivery_order_id || !exit.product_id) return;
    const key = `${exit.delivery_order_id}:${exit.product_id}`;
    exitsByOrderProduct.set(
      key,
      (exitsByOrderProduct.get(key) || 0) + (exit.quantity || 0),
    );
  });

  const statsByOrder = new Map<
    string,
    {
      total_items: number;
      total_quantity: number;
      delivered_items: number;
      delivered_quantity: number;
    }
  >();

  allItemsData.forEach((item: any) => {
    const orderId = item.delivery_order_id;
    if (!statsByOrder.has(orderId)) {
      statsByOrder.set(orderId, {
        total_items: 0,
        total_quantity: 0,
        delivered_items: 0,
        delivered_quantity: 0,
      });
    }
    const stats = statsByOrder.get(orderId)!;
    stats.total_items += 1;
    const itemQuantity = item.quantity || 0;
    stats.total_quantity += itemQuantity;

    const fromDB = item.delivered_quantity || 0;
    const exitKey = `${orderId}:${item.product_id}`;
    const fromExits = exitsByOrderProduct.get(exitKey) || 0;
    const reconciledDelivered = Math.min(
      Math.max(fromExits, fromDB),
      itemQuantity,
    );

    if (reconciledDelivered >= itemQuantity && itemQuantity > 0) {
      stats.delivered_items += 1;
    }
    stats.delivered_quantity += reconciledDelivered;
  });

  const ordersWithStats = ordersData.map((order: any) => {
    const stats = statsByOrder.get(order.id) || {
      total_items: 0,
      total_quantity: 0,
      delivered_items: 0,
      delivered_quantity: 0,
    };
    const createdByProfile = createdByProfilesMap.get(order.created_by);
    return {
      ...order,
      total_items: stats.total_items,
      total_quantity: stats.total_quantity,
      delivered_items: stats.delivered_items,
      delivered_quantity: stats.delivered_quantity,
      created_by_name:
        createdByProfile?.full_name ||
        createdByProfile?.email ||
        "Usuario desconocido",
    };
  });

  return ordersWithStats.map((order: any) => ({
    id: order.id,
    order_number: order.order_number,
    created_at: order.created_at,
    created_by: order.created_by ?? "",
    created_by_name: order.created_by_name,
    customer_id: order.customer_id,
    customer_id_number: order.customer?.id_number || null,
    customer_name: order.customer?.name || null,
    customer_phone: order.customer?.phone || null,
    customer_email: order.customer?.email || null,
    assigned_to_user_id: order.assigned_to_user_id,
    assigned_to_user_name: order.assigned_to_user?.full_name || null,
    assigned_to_user_email: order.assigned_to_user?.email || null,
    order_type: order.order_type,
    delivery_address: order.delivery_address,
    notes: order.notes,
    status: order.status,
    total_items: order.total_items,
    total_quantity: order.total_quantity,
    delivered_items: order.delivered_items,
    delivered_quantity: order.delivered_quantity,
    items: [],
  }));
}

export function AllDeliveryOrdersList({
  searchQuery = "",
  refreshTrigger,
}: AllDeliveryOrdersListProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [fetchLimit, setFetchLimit] = useState(RECENT_PAGE_INITIAL);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!debouncedQuery) {
      setFetchLimit(RECENT_PAGE_INITIAL);
    }
  }, [debouncedQuery]);

  const loadDeliveryOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const term = debouncedQuery;

      if (term) {
        const { data: rpcRows, error: rpcError } = await supabase.rpc(
          "get_delivery_orders_admin_list",
          {
            search_term: term,
            page: 1,
            page_size: SEARCH_PAGE_SIZE,
          },
        );

        if (rpcError) {
          console.error("Error loading delivery orders (search):", rpcError);
          setError(rpcError.message);
          setLoading(false);
          return;
        }

        const ids = (rpcRows as DeliveryOrderAdminRow[] | null)?.map(
          (r) => r.id,
        ) ?? [];
        if (ids.length === 0) {
          setDeliveryOrders([]);
          setLoading(false);
          return;
        }

        const { data: ordersData, error: ordersError } = await supabase
          .from("delivery_orders")
          .select(
            `
          id,
          created_at,
          created_by,
          customer_id,
          assigned_to_user_id,
          order_type,
          delivery_address,
          notes,
          status,
          order_number,
          customer:customers(id, name, id_number, phone, email),
          assigned_to_user:profiles(id, full_name, email)
        `,
          )
          .in("id", ids)
          .is("deleted_at", null);

        if (ordersError) {
          console.error("Error loading delivery orders by id:", ordersError);
          setError(ordersError.message);
          setLoading(false);
          return;
        }

        const byId = new Map((ordersData || []).map((o: any) => [o.id, o]));
        const ordered = ids
          .map((id: string) => byId.get(id))
          .filter(Boolean) as any[];

        const transformed = await buildDeliveryOrdersFromTableRows(ordered);
        setDeliveryOrders(transformed);
        setLoading(false);
        return;
      }

      const { data: ordersData, error: ordersError } = await supabase
        .from("delivery_orders")
        .select(
          `
          id,
          created_at,
          created_by,
          customer_id,
          assigned_to_user_id,
          order_type,
          delivery_address,
          notes,
          status,
          order_number,
          customer:customers(id, name, id_number, phone, email),
          assigned_to_user:profiles(id, full_name, email)
        `,
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(fetchLimit);

      if (ordersError) {
        console.error("Error loading delivery orders:", ordersError);
        setError(ordersError.message);
        setLoading(false);
        return;
      }

      const transformed = await buildDeliveryOrdersFromTableRows(
        ordersData || [],
      );
      setDeliveryOrders(transformed);
      setLoading(false);
    } catch (err: any) {
      console.error("Error loading delivery orders:", err);
      setError(err.message || "Error al cargar las órdenes de entrega");
      setLoading(false);
    }
  }, [debouncedQuery, fetchLimit]);

  useFocusEffect(
    useCallback(() => {
      loadDeliveryOrders();
    }, [loadDeliveryOrders]),
  );

  useEffect(() => {
    if (refreshTrigger === undefined || refreshTrigger < 1) {
      return;
    }
    loadDeliveryOrders();
  }, [refreshTrigger, loadDeliveryOrders]);

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) {
      return deliveryOrders;
    }
    const q = searchQuery.toLowerCase().trim();
    if (debouncedQuery === searchQuery.trim()) {
      return deliveryOrders;
    }
    return deliveryOrders.filter((order) => {
      const fields = [
        order.order_number,
        order.customer_name,
        order.customer_id_number,
        order.customer_phone,
        order.customer_email,
        order.assigned_to_user_name,
        order.assigned_to_user_email,
        order.delivery_address,
        order.status,
        order.notes,
        order.created_by_name,
        order.id,
      ];
      return fields.some(
        (field) => field && String(field).toLowerCase().includes(q),
      );
    });
  }, [deliveryOrders, searchQuery, debouncedQuery]);

  const isSearchDebouncing =
    searchQuery.trim() !== "" && searchQuery.trim() !== debouncedQuery;

  if (loading && !isSearchDebouncing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary.main} />
        <Text style={[styles.loadingText, { color: colors.text.secondary }]}>
          Cargando órdenes de entrega...
        </Text>
      </View>
    );
  }

  if (isSearchDebouncing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary.main} />
        <Text style={[styles.loadingText, { color: colors.text.secondary }]}>
          Buscando...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons
          name="error-outline"
          size={48}
          color={colors.error.main}
        />
        <Text style={[styles.errorText, { color: colors.error.main }]}>
          {error}
        </Text>
      </View>
    );
  }

  if (deliveryOrders.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons
          name="local-shipping"
          size={64}
          color={colors.text.secondary}
        />
        <Text style={[styles.emptyText, { color: colors.text.primary }]}>
          {debouncedQuery
            ? "No se encontraron resultados"
            : "No hay órdenes de entrega registradas"}
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.text.secondary }]}>
          {debouncedQuery
            ? `No hay órdenes que coincidan con "${debouncedQuery}"`
            : "Las órdenes de entrega aparecerán aquí"}
        </Text>
      </View>
    );
  }

  if (filteredOrders.length === 0 && searchQuery.trim()) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons
          name="search-off"
          size={64}
          color={colors.text.secondary}
        />
        <Text style={[styles.emptyText, { color: colors.text.primary }]}>
          No se encontraron resultados
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.text.secondary }]}>
          No hay órdenes de entrega que coincidan con &quot;{searchQuery}&quot;
        </Text>
      </View>
    );
  }

  const showLimitMessage =
    !debouncedQuery && deliveryOrders.length >= fetchLimit;
  const canLoadMore =
    !debouncedQuery &&
    deliveryOrders.length > 0 &&
    deliveryOrders.length === fetchLimit;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {showLimitMessage && (
        <View
          style={[
            styles.limitMessage,
            {
              backgroundColor: colors.info.main + "15",
              borderColor: colors.info.main,
            },
          ]}
        >
          <MaterialIcons
            name="info-outline"
            size={20}
            color={colors.info.main}
          />
          <Text style={[styles.limitMessageText, { color: colors.info.main }]}>
            Mostrando las últimas {fetchLimit} órdenes de entrega. Usa el
            buscador para encontrar órdenes anteriores.
          </Text>
        </View>
      )}
      {filteredOrders.map((order) => (
        <DeliveryOrderCard key={order.id} order={order} />
      ))}
      {canLoadMore && (
        <TouchableOpacity
          style={[
            styles.loadMoreButton,
            {
              backgroundColor: colors.background.paper,
              borderColor: colors.divider,
            },
          ]}
          onPress={() =>
            setFetchLimit((n) => n + RECENT_PAGE_STEP)
          }
          activeOpacity={0.7}
        >
          <Text style={[styles.loadMoreText, { color: colors.primary.main }]}>
            Cargar {RECENT_PAGE_STEP} más
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
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
  limitMessage: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  limitMessageText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  loadMoreButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 24,
  },
  loadMoreText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
