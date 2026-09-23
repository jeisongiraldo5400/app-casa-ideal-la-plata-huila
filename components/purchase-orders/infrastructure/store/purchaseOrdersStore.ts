import { logHandledError } from "@/lib/errorMessage";
import { fetchInChunks, IN_FILTER_PAGE_SIZE } from "@/lib/inChunks";
import { logOperationError } from "@/lib/operationLogger";
import { supabase } from "@/lib/supabase";
import { PURCHASE_ORDER_RECEIPT_ENTRY_TYPE } from "../../domain/purchaseOrderReceipts";
import { PURCHASE_ORDER_APPROVAL_ADMIN_ONLY_MESSAGE } from "../../domain/purchaseOrderApproval";
import { Database } from "@/types/database.types";
import { create } from "zustand";

type PurchaseOrder = Database["public"]["Tables"]["purchase_orders"]["Row"];
type PurchaseOrderUpdate =
  Database["public"]["Tables"]["purchase_orders"]["Update"];

/**
 * Columnas que pintan las tarjetas de «Todas las órdenes» y «Órdenes
 * recibidas» (PurchaseOrderCard + el filtro de AllOrdersList). `deleted_at` y
 * `updated_at` no se leen en ninguna de las dos, así que no viajan.
 */
const PURCHASE_ORDER_SELECT = `
  id,
  order_number,
  created_at,
  created_by,
  status,
  notes,
  supplier_id,
  suppliers:supplier_id (
    id,
    name,
    nit
  )
`;

const PURCHASE_ORDER_ITEM_SELECT = `
  id,
  purchase_order_id,
  product_id,
  quantity,
  created_at,
  products:product_id (
    id,
    name,
    barcode
  )
`;

/** Lo que se lee de `purchase_orders`; el resto de la fila no se usa. */
type PurchaseOrderSummary = Pick<
  PurchaseOrder,
  "id" | "order_number" | "created_at" | "created_by" | "status" | "notes" | "supplier_id"
> & { updated_at?: string | null };

interface PurchaseOrderItem {
  id: string;
  product_id: string;
  purchase_order_id: string;
  quantity: number;
  created_at: string | null;
  product?: {
    id: string;
    name: string;
    barcode: string;
  };
}

/** Fila de `purchase_order_items` con el producto anidado tal como llega. */
interface PurchaseOrderItemRow extends Omit<PurchaseOrderItem, "product"> {
  products?:
    | { id: string; name: string; barcode: string }
    | { id: string; name: string; barcode: string }[]
    | null;
}

interface PurchaseOrderProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface PurchaseOrderRow extends PurchaseOrderSummary {
  suppliers?:
    | { id: string; name: string | null; nit: string | null }
    | { id: string; name: string | null; nit: string | null }[]
    | null;
}

interface PurchaseOrderWithSupplier extends PurchaseOrderSummary {
  supplier?: {
    id: string;
    name: string | null;
    nit: string | null;
  };
  created_by_profile?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  items?: PurchaseOrderItem[];
}

/** Primer elemento cuando PostgREST devuelve la relación como lista. */
function firstRelated<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/** Perfiles de los creadores; sin ids no hay consulta que hacer. */
async function fetchCreatorProfiles(
  userIds: string[],
): Promise<Map<string, PurchaseOrderProfile>> {
  if (userIds.length === 0) return new Map();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds)
    .returns<PurchaseOrderProfile[]>();
  return new Map((data || []).map((profile) => [profile.id, profile]));
}

/**
 * Líneas de todas las órdenes traídas, agrupadas por orden.
 *
 * `fetchInChunks` parte los ids en lotes que caben en la URL y los lanza en
 * paralelo (con tope de concurrencia), además de paginar cada lote para no
 * chocar con el `max-rows` del proyecto. Si falla, se avisa y el listado sigue
 * sin líneas, como cuando fallaba un lote suelto.
 */
async function fetchOrderItems(
  orderIds: string[],
): Promise<Map<string, PurchaseOrderItem[]>> {
  const itemsByOrderId = new Map<string, PurchaseOrderItem[]>();
  if (orderIds.length === 0) return itemsByOrderId;

  let rows: PurchaseOrderItemRow[] = [];
  try {
    rows = await fetchInChunks(
      orderIds,
      (chunk) =>
        supabase
          .from("purchase_order_items")
          .select(PURCHASE_ORDER_ITEM_SELECT)
          .in("purchase_order_id", chunk)
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .returns<PurchaseOrderItemRow[]>(),
      { pageSize: IN_FILTER_PAGE_SIZE },
    );
  } catch (error) {
    logHandledError(
      "No se pudo cargar un lote de ítems de órdenes de compra",
      error,
    );
    return itemsByOrderId;
  }

  rows.forEach(({ products, ...item }) => {
    const orderId = item.purchase_order_id;
    if (!orderId) return;
    const list = itemsByOrderId.get(orderId) ?? [];
    list.push({ ...item, product: firstRelated(products) });
    itemsByOrderId.set(orderId, list);
  });

  return itemsByOrderId;
}

interface PurchaseOrdersState {
  purchaseOrders: PurchaseOrderWithSupplier[];
  loading: boolean;
  error: string | null;
  loadPurchaseOrders: (
    status?: "pending" | "approved" | "received",
    userId?: string,
  ) => Promise<void>;
  /**
   * Aprobar ("approved") exige `options.canApprove` (solo admin, ver
   * canApprovePurchaseOrders); sin él se rechaza sin ir al servidor, que de
   * todas formas lo exige.
   */
  updatePurchaseOrderStatus: (
    orderId: string,
    status: "pending" | "approved" | "received",
    options?: { canApprove?: boolean },
  ) => Promise<{ success: boolean; error: string | null }>;
  validateOrderIsComplete: (orderId: string) => Promise<{
    isComplete: boolean;
    error: string | null;
    details?: {
      totalItemsQuantity: number;
      totalQuantityRegistered: number;
      missingItems: {
        product_id: string;
        expected: number;
        registered: number;
        missing: number;
      }[];
    };
  }>;
  markOrderAsReceived: (
    orderId: string,
  ) => Promise<{ success: boolean; error: string | null }>;
  clearError: () => void;
}

export const usePurchaseOrdersStore = create<PurchaseOrdersState>(
  (set, get) => ({
    purchaseOrders: [],
    loading: false,
    error: null,

    loadPurchaseOrders: async (
      status?: "pending" | "approved" | "received",
      userId?: string,
    ) => {
      set({ loading: true, error: null });
      try {
        let query = supabase
          .from("purchase_orders")
          .select(PURCHASE_ORDER_SELECT)
          .is("deleted_at", null)
          .neq("status", "cancelled") // Excluir órdenes canceladas
          .order("created_at", { ascending: false })
          .limit(100); // Limitar a 100 órdenes para mejorar rendimiento

        if (status) {
          query = query.eq("status", status);
        }

        if (userId) {
          query = query.eq("created_by", userId);
        }

        const { data, error } = await query.returns<PurchaseOrderRow[]>();

        if (error) {
          console.error("Error loading purchase orders:", error);
          logOperationError({
            error_code: "PO_LOAD_FAILED",
            error_message: error.message || String(error),
            module: "purchase_orders",
            operation: "load_purchase_orders",
            step: "query",
            context: { status, userId },
          });
          set({ error: error.message, loading: false });
          return;
        }

        const orders = data || [];
        const userIds = [...new Set(orders.map((order) => order.created_by))];
        const orderIds = orders.map((order) => order.id);

        // Los perfiles y las líneas dependen de las órdenes, pero no el uno del
        // otro: van a la vez en lugar de una consulta tras otra. Y dentro de las
        // líneas, cada lote de ids sale en paralelo (antes era un `for` que
        // esperaba lote a lote).
        const [profilesMap, itemsByOrderId] = await Promise.all([
          fetchCreatorProfiles(userIds),
          fetchOrderItems(orderIds),
        ]);

        // Asignar items a cada orden
        const ordersWithItems: PurchaseOrderWithSupplier[] = orders.map(
          ({ suppliers, ...order }) => ({
            ...order,
            supplier: firstRelated(suppliers),
            created_by_profile: profilesMap.get(order.created_by) || null,
            items: itemsByOrderId.get(order.id) || [],
          }),
        );

        set({ purchaseOrders: ordersWithItems, loading: false });
      } catch (error: any) {
        console.error("Error loading purchase orders:", error);
        set({
          error: error.message || "Error al cargar las órdenes de compra",
          loading: false,
        });
      }
    },

    updatePurchaseOrderStatus: async (
      orderId: string,
      status: "pending" | "approved" | "received",
      options?: { canApprove?: boolean },
    ) => {
      if (status === "approved" && !options?.canApprove) {
        return { success: false, error: PURCHASE_ORDER_APPROVAL_ADMIN_ONLY_MESSAGE };
      }
      set({ loading: true, error: null });
      try {
        const updateData: PurchaseOrderUpdate = {
          status,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("purchase_orders")
          .update(updateData)
          .eq("id", orderId);

        if (error) {
          console.error("Error updating purchase order status:", error);
          logOperationError({
            error_code: "PO_STATUS_UPDATE_FAILED",
            error_message: error.message || String(error),
            module: "purchase_orders",
            operation: "update_status",
            step: "update_record",
            entity_type: "purchase_order",
            entity_id: orderId,
            context: { orderId, status },
          });
          set({ loading: false });
          return { success: false, error: error.message };
        }

        // Actualizar el estado local
        const currentOrders = get().purchaseOrders;
        const updatedOrders = currentOrders.map((order) =>
          order.id === orderId
            ? { ...order, status, updated_at: updateData.updated_at }
            : order,
        );

        set({
          purchaseOrders: updatedOrders as PurchaseOrderWithSupplier[],
          loading: false,
        });
        return { success: true, error: null };
      } catch (error: any) {
        console.error("Error updating purchase order status:", error);
        set({ loading: false });
        return {
          success: false,
          error: error.message || "Error al actualizar el estado",
        };
      }
    },

    /**
     * Valida si una orden de compra está completa (todas las unidades registradas)
     */
    validateOrderIsComplete: async (
      orderId: string,
    ): Promise<{
      isComplete: boolean;
      error: string | null;
      details?: {
        totalItemsQuantity: number;
        totalQuantityRegistered: number;
        missingItems: {
          product_id: string;
          expected: number;
          registered: number;
          missing: number;
        }[];
      };
    }> => {
      try {
        // Cargar los items de la orden
        const { data: orderItems, error: itemsError } = await supabase
          .from("purchase_order_items")
          .select("product_id, quantity")
          .eq("purchase_order_id", orderId)
          .is("deleted_at", null);

        if (itemsError) {
          return {
            isComplete: false,
            error: `Error al cargar los items de la orden: ${itemsError.message}`,
          };
        }

        if (!orderItems || orderItems.length === 0) {
          return {
            isComplete: false,
            error: "La orden de compra no tiene items",
          };
        }

        // Recepciones vigentes (PO_ENTRY) de esta orden: las devoluciones a proveedor no cuentan
        const { data: inventoryEntries, error: entriesError } = await supabase
          .from("inventory_entries")
          .select("product_id, quantity")
          .eq("purchase_order_id", orderId)
          .eq("entry_type", PURCHASE_ORDER_RECEIPT_ENTRY_TYPE)
          .is("deleted_at", null);

        if (entriesError) {
          return {
            isComplete: false,
            error: `Error al cargar las entradas de inventario: ${entriesError.message}`,
          };
        }

        // Calcular cantidades por producto
        const expectedByProduct: Record<string, number> = {};
        orderItems.forEach((item) => {
          expectedByProduct[item.product_id] =
            (expectedByProduct[item.product_id] || 0) + item.quantity;
        });

        const registeredByProduct: Record<string, number> = {};
        (inventoryEntries || []).forEach((entry) => {
          registeredByProduct[entry.product_id] =
            (registeredByProduct[entry.product_id] || 0) + entry.quantity;
        });

        // Verificar que todos los productos tengan las cantidades completas
        const missingItems: {
          product_id: string;
          expected: number;
          registered: number;
          missing: number;
        }[] = [];

        let isComplete = true;
        const totalItemsQuantity = orderItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );
        const totalQuantityRegistered = (inventoryEntries || []).reduce(
          (sum, entry) => sum + entry.quantity,
          0,
        );

        for (const productId in expectedByProduct) {
          const expected = expectedByProduct[productId];
          const registered = registeredByProduct[productId] || 0;
          const missing = expected - registered;

          if (missing > 0) {
            isComplete = false;
            missingItems.push({
              product_id: productId,
              expected,
              registered,
              missing,
            });
          }
        }

        return {
          isComplete,
          error: isComplete
            ? null
            : `La orden no está completa. Faltan unidades por registrar.`,
          details: {
            totalItemsQuantity,
            totalQuantityRegistered,
            missingItems,
          },
        };
      } catch (error: any) {
        return {
          isComplete: false,
          error: error.message || "Error al validar la orden",
        };
      }
    },

    markOrderAsReceived: async (orderId: string) => {
      // Primero validar que la orden esté completa
      const validation = await get().validateOrderIsComplete(orderId);

      if (!validation.isComplete) {
        return {
          success: false,
          error:
            validation.error ||
            "No se puede marcar la orden como recibida porque no está completa. Todas las unidades deben estar registradas.",
        };
      }

      // Si está completa, actualizar el estado
      return get().updatePurchaseOrderStatus(orderId, "received");
    },

    clearError: () => {
      set({ error: null });
    },
  }),
);
