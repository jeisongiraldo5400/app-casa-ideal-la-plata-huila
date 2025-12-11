-- Migración para eliminar el estado 'received' de delivery_orders
-- Solo se permiten: pending, approved, cancelled

-- Actualizar cualquier orden con estado 'received' a 'approved'
UPDATE public.delivery_orders
SET status = 'approved'
WHERE status = 'received';

-- Eliminar el constraint existente
ALTER TABLE public.delivery_orders
DROP CONSTRAINT IF EXISTS check_delivery_order_status;

-- Agregar el nuevo constraint con solo 3 estados
ALTER TABLE public.delivery_orders
ADD CONSTRAINT check_delivery_order_status
CHECK (status IN ('pending', 'approved', 'cancelled'));

-- Actualizar comentario
COMMENT ON CONSTRAINT check_delivery_order_status ON public.delivery_orders IS
'Restricts status to: pending (Pendiente), approved (Aprobada), cancelled (Cancelada)';

-- Actualizar observaciones de estado que referencian 'received'
UPDATE public.delivery_order_status_observations
SET status_action = 'approved',
    previous_status = CASE WHEN previous_status = 'received' THEN 'pending' ELSE previous_status END,
    new_status = CASE WHEN new_status = 'received' THEN 'approved' ELSE new_status END
WHERE status_action = 'received' OR previous_status = 'received' OR new_status = 'received';

-- Eliminar el constraint de status_action si incluye 'received'
ALTER TABLE public.delivery_order_status_observations
DROP CONSTRAINT IF EXISTS check_delivery_status_action;

-- Recrear el constraint sin 'received'
ALTER TABLE public.delivery_order_status_observations
ADD CONSTRAINT check_delivery_status_action
CHECK (status_action IN ('cancelled', 'approved'));

COMMENT ON COLUMN public.delivery_order_status_observations.status_action IS
'Tipo de acción: cancelled (Cancelada), approved (Aprobada)';

