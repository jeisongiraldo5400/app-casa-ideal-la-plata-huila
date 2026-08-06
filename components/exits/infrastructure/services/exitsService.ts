import { supabase } from "@/lib/supabase";
import { Database } from "@/types/database.types";

type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];

export async function fetchActiveWarehouses(): Promise<Warehouse[]> {
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchActiveProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .is("deleted_at", null)
    .order("full_name");

  if (error) {
    throw error;
  }

  return (data as Profile[]) || [];
}

export async function searchCustomersByTerm(
  searchTerm: string,
  limit = 50
): Promise<Customer[]> {
  const normalizedSearchTerm = searchTerm.trim();
  if (!normalizedSearchTerm) {
    return [];
  }

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .is("deleted_at", null)
    .or(
      `name.ilike.%${normalizedSearchTerm}%,id_number.ilike.%${normalizedSearchTerm}%`
    )
    .order("name")
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
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

export async function fetchWarehouseStock(
  productId: string,
  warehouseId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("warehouse_stock")
    .select("quantity")
    .eq("product_id", productId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return data?.quantity ?? 0;
}
