import { supabase } from "@/lib/supabase";
import { Database } from "@/types/database.types";

type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];
type Category = Database["public"]["Tables"]["category"]["Row"];
type Brand = Database["public"]["Tables"]["brands"]["Row"];
type PurchaseOrder = Database["public"]["Tables"]["purchase_orders"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .is("deleted_at", null)
    .order("name");

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchWarehouses(): Promise<Warehouse[]> {
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name");

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("category")
    .select("*")
    .is("deleted_at", null)
    .order("name");

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchBrands(): Promise<Brand[]> {
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .is("deleted_at", null)
    .order("name");

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchPendingPurchaseOrders(
  supplierId: string
): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("supplier_id", supplierId)
    .in("status", ["pending"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

type PurchaseOrderItemWithProductJoin = Database["public"]["Tables"]["purchase_order_items"]["Row"] & {
  products: Pick<Product, "id" | "name" | "barcode" | "sku" | "deleted_at"> | null;
};

export async function fetchPurchaseOrderItems(orderIds: string[]): Promise<PurchaseOrderItemWithProductJoin[]> {
  if (orderIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("purchase_order_items")
    .select(
      `
      *,
      products!inner(id, name, barcode, sku, deleted_at),
      purchase_order_id
    `
    )
    .in("purchase_order_id", orderIds)
    .is("deleted_at", null)
    .is("products.deleted_at", null);

  if (error) {
    throw error;
  }

  // El join !inner con alias no lo infiere el generador de tipos.
  return ((data || []) as unknown as PurchaseOrderItemWithProductJoin[]).filter(
    (item) => !item.deleted_at && item.products && !item.products.deleted_at
  );
}

export async function fetchProductByBarcode(
  barcode: string
): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", barcode)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
