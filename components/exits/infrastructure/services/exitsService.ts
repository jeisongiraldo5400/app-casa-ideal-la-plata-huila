import { supabase } from "@/lib/supabase";
import { Database } from "@/types/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Customer = Database["public"]["Tables"]["customers"]["Row"];

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

/**
 * Deja solo letras, números, espacios, puntos, guiones y apóstrofes. El término se
 * interpola en un filtro PostgREST `.or(...)`, donde comas, paréntesis, comillas, `%`
 * y `_` cambian el significado de la consulta (o la rompen).
 */
export function sanitizeSearchTerm(searchTerm: string): string {
  return searchTerm
    .replace(/[^\p{L}\p{N}\s.'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchCustomersByTerm(
  searchTerm: string,
  limit = 50
): Promise<Customer[]> {
  const normalizedSearchTerm = sanitizeSearchTerm(searchTerm);
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
