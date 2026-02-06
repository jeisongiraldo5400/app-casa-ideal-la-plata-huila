import { supabase } from "@/lib/supabase";

interface OperationErrorLog {
  error_code: string;
  error_message: string;
  module: "exits" | "entries" | "purchase_orders" | "returns";
  operation: string;
  step?: string;
  severity?: "error" | "warning";
  entity_type?:
    | "delivery_order"
    | "purchase_order"
    | "inventory_entry"
    | "inventory_exit";
  entity_id?: string;
  context?: Record<string, any>;
}

/**
 * Fire-and-forget: inserta un log de error sin bloquear la operación principal.
 * Nunca lanza excepciones.
 */
export async function logOperationError(log: OperationErrorLog): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("operation_error_logs").insert({
      error_code: log.error_code,
      error_message: log.error_message,
      module: log.module,
      operation: log.operation,
      step: log.step ?? null,
      severity: log.severity ?? "error",
      entity_type: log.entity_type ?? null,
      entity_id: log.entity_id ?? null,
      context: log.context ?? null,
      created_by: user?.id ?? null,
    });
  } catch (e) {
    console.error("[operationLogger] Failed to persist error log:", e);
  }
}
