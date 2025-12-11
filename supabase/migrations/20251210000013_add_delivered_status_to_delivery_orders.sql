-- ============================================================================
-- Agregar estado 'delivered' a delivery_orders
-- Estados permitidos: pending, approved, delivered, cancelled
-- ============================================================================

-- Eliminar el constraint existente
ALTER TABLE public.delivery_orders
DROP CONSTRAINT IF EXISTS check_delivery_order_status;

-- Agregar el nuevo constraint con el estado 'delivered'
ALTER TABLE public.delivery_orders
ADD CONSTRAINT check_delivery_order_status
CHECK (status IN ('pending', 'approved', 'delivered', 'cancelled'));

-- Actualizar comentario del constraint
COMMENT ON CONSTRAINT check_delivery_order_status ON public.delivery_orders IS
'Restricts status to: pending (Pendiente), approved (Aprobada), delivered (Entregado), cancelled (Cancelada)';

-- Actualizar comentario de la columna
COMMENT ON COLUMN public.delivery_orders.status IS
'Estados: pending (pendiente), approved (aprobada), delivered (entregado), cancelled (cancelada)';

-- ============================================================================
-- Actualizar delivery_order_status_observations para incluir 'delivered'
-- ============================================================================

-- Eliminar el constraint existente de status_action
ALTER TABLE public.delivery_order_status_observations
DROP CONSTRAINT IF EXISTS check_delivery_status_action;

-- Recrear el constraint con 'delivered'
ALTER TABLE public.delivery_order_status_observations
ADD CONSTRAINT check_delivery_status_action
CHECK (status_action IN ('cancelled', 'approved', 'delivered'));

-- Actualizar comentario
COMMENT ON COLUMN public.delivery_order_status_observations.status_action IS
'Tipo de acción: cancelled (Cancelada), approved (Aprobada), delivered (Entregado)';
