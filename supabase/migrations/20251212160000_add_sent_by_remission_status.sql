-- Migration: Add 'sent_by_remission' status to delivery_orders
--
-- Date: 2025-12-12
--
-- Description: Adds a new status 'sent_by_remission' to indicate that a customer
--              delivery order has been assigned to a remission and is being sent
--              through that remission instead of directly.
--
-- ============================================================================

-- Eliminar el constraint existente
ALTER TABLE public.delivery_orders
DROP CONSTRAINT IF EXISTS check_delivery_order_status;

-- Agregar el nuevo constraint con el estado 'sent_by_remission'
ALTER TABLE public.delivery_orders
ADD CONSTRAINT check_delivery_order_status
CHECK (status IN ('pending', 'approved', 'sent_by_remission', 'delivered', 'cancelled'));

-- Actualizar comentario del constraint
COMMENT ON CONSTRAINT check_delivery_order_status ON public.delivery_orders IS
'Restricts status to: pending (Pendiente), approved (Aprobada), sent_by_remission (Enviado por Remisión), delivered (Entregado), cancelled (Cancelada)';

-- Actualizar comentario de la columna
COMMENT ON COLUMN public.delivery_orders.status IS
'Estados: pending (pendiente), approved (aprobada), sent_by_remission (enviado por remisión), delivered (entregado), cancelled (cancelada)';

-- ============================================================================
-- Actualizar delivery_order_status_observations para incluir 'sent_by_remission'
-- ============================================================================

-- Eliminar el constraint existente de status_action
ALTER TABLE public.delivery_order_status_observations
DROP CONSTRAINT IF EXISTS check_delivery_status_action;

-- Recrear el constraint con 'sent_by_remission'
ALTER TABLE public.delivery_order_status_observations
ADD CONSTRAINT check_delivery_status_action
CHECK (status_action IN ('cancelled', 'approved', 'sent_by_remission', 'delivered'));

-- Actualizar comentario
COMMENT ON COLUMN public.delivery_order_status_observations.status_action IS
'Tipo de acción: cancelled (Cancelada), approved (Aprobada), sent_by_remission (Enviado por Remisión), delivered (Entregado)';
