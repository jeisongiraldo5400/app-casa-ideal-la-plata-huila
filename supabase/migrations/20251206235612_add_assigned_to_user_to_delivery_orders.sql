-- ============================================================================
-- Migración: Agregar campo assigned_to_user_id para remisiones
-- Permite asignar un usuario de la plataforma a una remisión
-- ============================================================================

-- Agregar campo assigned_to_user_id (nullable)
ALTER TABLE public.delivery_orders 
  ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID;

-- Agregar foreign key a profiles
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_delivery_order_assigned_to_user'
  ) THEN
    ALTER TABLE public.delivery_orders
      ADD CONSTRAINT fk_delivery_order_assigned_to_user 
        FOREIGN KEY (assigned_to_user_id) 
        REFERENCES public.profiles(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE;
  END IF;
END $$;

-- Eliminar constraint anterior que validaba customer_id requerido solo para customer
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_delivery_order_customer_required'
  ) THEN
    ALTER TABLE public.delivery_orders
      DROP CONSTRAINT check_delivery_order_customer_required;
  END IF;
END $$;

-- Crear nuevo constraint que valida:
-- - Si es 'customer': customer_id requerido, assigned_to_user_id NULL
-- - Si es 'remission': assigned_to_user_id requerido, customer_id NULL
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_delivery_order_recipient_required'
  ) THEN
    ALTER TABLE public.delivery_orders
      ADD CONSTRAINT check_delivery_order_recipient_required 
        CHECK (
          (order_type = 'customer' AND customer_id IS NOT NULL AND assigned_to_user_id IS NULL) OR
          (order_type = 'remission' AND assigned_to_user_id IS NOT NULL AND customer_id IS NULL)
        );
  END IF;
END $$;

-- Índice para optimizar consultas por usuario asignado
CREATE INDEX IF NOT EXISTS idx_delivery_orders_assigned_to_user_id 
    ON public.delivery_orders(assigned_to_user_id) 
    WHERE assigned_to_user_id IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN public.delivery_orders.assigned_to_user_id IS 
    'ID del usuario asignado a la remisión (requerido solo para tipo remission, NULL para customer)';
