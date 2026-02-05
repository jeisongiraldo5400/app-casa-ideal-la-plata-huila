// Tipos compartidos para órdenes de entrega (Delivery Orders)

export interface DeliveryOrderItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  product_barcode: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  quantity: number;
  delivered_quantity: number;
  pending_quantity: number;
  is_complete: boolean;
}

export interface DeliveryOrderRecipient {
  type: 'customer' | 'remission';
  // Datos del cliente (si type === 'customer')
  customer_id: string | null;
  customer_name: string | null;
  customer_id_number: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  // Datos del usuario de remisión (si type === 'remission')
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
}

export interface DeliveryOrder {
  id: string;
  order_number: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string;
  customer_id: string | null;
  customer_id_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  assigned_to_user_id: string | null;
  assigned_to_user_name: string | null;
  assigned_to_user_email: string | null;
  order_type: string;
  delivery_address: string | null;
  notes: string | null;
  status: string;
  total_items: number;
  total_quantity: number;
  delivered_items: number;
  delivered_quantity: number;
  items: DeliveryOrderItem[];
}

export interface DeliveryOrderWithProgress extends DeliveryOrder {
  pending_items: number;
  completed_items: number;
  is_fully_delivered: boolean;
  progress_percentage: number;
}

// Helpers para calcular progreso
export function calculateDeliveryProgress(order: DeliveryOrder): {
  pending_items: number;
  completed_items: number;
  is_fully_delivered: boolean;
  progress_percentage: number;
} {
  const pending_items = order.total_items - order.delivered_items;
  const completed_items = order.delivered_items;
  const is_fully_delivered = order.total_quantity > 0 && order.delivered_quantity >= order.total_quantity;
  const progress_percentage = order.total_quantity > 0
    ? Math.min((order.delivered_quantity / order.total_quantity) * 100, 100)
    : 0;

  return {
    pending_items,
    completed_items,
    is_fully_delivered,
    progress_percentage,
  };
}

// Helper para obtener información del destinatario
export function getRecipientInfo(order: DeliveryOrder): DeliveryOrderRecipient {
  if (order.customer_id) {
    return {
      type: 'customer',
      customer_id: order.customer_id,
      customer_name: order.customer_name,
      customer_id_number: order.customer_id_number,
      customer_phone: order.customer_phone || null,
      customer_email: order.customer_email || null,
      customer_address: order.delivery_address,
      user_id: null,
      user_name: null,
      user_email: null,
    };
  } else {
    return {
      type: 'remission',
      customer_id: null,
      customer_name: null,
      customer_id_number: null,
      customer_phone: null,
      customer_email: null,
      customer_address: order.delivery_address,
      user_id: order.assigned_to_user_id,
      user_name: order.assigned_to_user_name,
      user_email: order.assigned_to_user_email,
    };
  }
}

// Helper para obtener color del estado
export function getStatusColor(status: string, colors: any): string {
  switch (status) {
    case 'delivered':
      return colors.success.main;
    case 'ready':
      return colors.info.main;
    case 'preparing':
      return colors.warning.main;
    case 'pending':
      return colors.warning.main;
    case 'cancelled':
      return colors.error.main;
    default:
      return colors.text.secondary;
  }
}

// Helper para obtener etiqueta del estado
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'delivered':
      return 'Entregada';
    case 'ready':
      return 'Lista';
    case 'preparing':
      return 'Preparando';
    case 'pending':
      return 'Pendiente';
    case 'cancelled':
      return 'Cancelada';
    default:
      return status;
  }
}

// Helper para formatear fecha
export function formatDate(dateString: string | null): string {
  if (!dateString) return 'Sin fecha';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Fecha inválida';
  }
}
