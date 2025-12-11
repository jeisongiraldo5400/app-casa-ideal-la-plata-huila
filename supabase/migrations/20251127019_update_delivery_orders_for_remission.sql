-- ============================================================================
-- Migración: Actualizar delivery_orders para soportar Remisión y Cliente
-- Agrega campo order_type y hace customer_id opcional
-- ============================================================================

-- Agregar campo order_type con valor por defecto 'customer' para mantener compatibilidad
ALTER TABLE public.delivery_orders 
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'customer';

-- Hacer customer_id opcional (NULL para remisiones)
ALTER TABLE public.delivery_orders 
  ALTER COLUMN customer_id DROP NOT NULL;

-- Agregar constraint para order_type
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_delivery_order_type'
  ) THEN
    ALTER TABLE public.delivery_orders
      ADD CONSTRAINT check_delivery_order_type 
        CHECK (order_type IN ('remission', 'customer'));
  END IF;
END $$;

-- Agregar constraint para validar que customer_id sea requerido solo para tipo 'customer'
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_delivery_order_customer_required'
  ) THEN
    ALTER TABLE public.delivery_orders
      ADD CONSTRAINT check_delivery_order_customer_required 
        CHECK (
          (order_type = 'customer' AND customer_id IS NOT NULL) OR
          (order_type = 'remission' AND customer_id IS NULL)
        );
  END IF;
END $$;

-- Índice para order_type
CREATE INDEX IF NOT EXISTS idx_delivery_orders_order_type 
    ON public.delivery_orders(order_type);

-- Comentarios
COMMENT ON COLUMN public.delivery_orders.order_type IS 
    'Tipo de orden: remission (remisión) o customer (cliente)';
COMMENT ON COLUMN public.delivery_orders.customer_id IS 
    'ID del cliente (requerido solo para tipo customer, NULL para remission)';

