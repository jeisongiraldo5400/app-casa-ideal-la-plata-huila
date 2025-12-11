-- ============================================================================
-- Actualizar estados de delivery_orders para que sean iguales a purchase_orders
-- Estados: pending, approved, received, cancelled (solo 4 estados)
-- ============================================================================

-- Actualizar cualquier estado inválido a 'pending'
UPDATE delivery_orders
SET status = 'pending'
WHERE status NOT IN ('pending', 'approved', 'received', 'cancelled');

-- Actualizar estados existentes al nuevo esquema
UPDATE delivery_orders
SET status = 'pending'
WHERE status IN ('preparing', 'ready');

UPDATE delivery_orders
SET status = 'approved'
WHERE status = 'delivered';

-- Actualizar el constraint
ALTER TABLE delivery_orders
DROP CONSTRAINT IF EXISTS check_delivery_order_status;

ALTER TABLE delivery_orders
ADD CONSTRAINT check_delivery_order_status 
CHECK (status IN ('pending', 'approved', 'received', 'cancelled'));

-- Actualizar comentario
COMMENT ON CONSTRAINT check_delivery_order_status ON delivery_orders IS 
'Restricts status to: pending (Pendiente), approved (Aprobada), received (Recibida), cancelled (Cancelada). Mismos estados que purchase_orders.';

-- Actualizar comentario de la columna
COMMENT ON COLUMN public.delivery_orders.status IS 
'Estados: pending (pendiente), approved (aprobada), received (recibida), cancelled (cancelada). Mismos estados que purchase_orders.';

