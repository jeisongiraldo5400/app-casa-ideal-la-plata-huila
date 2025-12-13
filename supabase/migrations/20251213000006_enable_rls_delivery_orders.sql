-- Migration: Enable RLS and create policies for delivery_orders, delivery_order_items, and remission_delivery_orders
--
-- Date: 2025-12-13
--
-- Description: Enables Row Level Security (RLS) and creates policies for authenticated users
--              to access delivery_orders, delivery_order_items, and remission_delivery_orders tables.
--
-- ============================================================================

-- ============================================================================
-- DELIVERY_ORDERS
-- ============================================================================

-- Habilitar RLS en delivery_orders
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios autenticados pueden ver todas las órdenes (excepto eliminadas)
DROP POLICY IF EXISTS "Users can view delivery orders" ON public.delivery_orders;
CREATE POLICY "Users can view delivery orders"
    ON public.delivery_orders
    FOR SELECT
    TO authenticated
    USING (deleted_at IS NULL);

-- Política: Los usuarios autenticados pueden crear órdenes
DROP POLICY IF EXISTS "Users can create delivery orders" ON public.delivery_orders;
CREATE POLICY "Users can create delivery orders"
    ON public.delivery_orders
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Política: Los usuarios autenticados pueden actualizar órdenes
DROP POLICY IF EXISTS "Users can update delivery orders" ON public.delivery_orders;
CREATE POLICY "Users can update delivery orders"
    ON public.delivery_orders
    FOR UPDATE
    TO authenticated
    USING (deleted_at IS NULL)
    WITH CHECK (deleted_at IS NULL);

-- Política: Los usuarios autenticados pueden eliminar (soft delete) órdenes
DROP POLICY IF EXISTS "Users can delete delivery orders" ON public.delivery_orders;
CREATE POLICY "Users can delete delivery orders"
    ON public.delivery_orders
    FOR DELETE
    TO authenticated
    USING (deleted_at IS NULL);

-- ============================================================================
-- DELIVERY_ORDER_ITEMS
-- ============================================================================

-- Habilitar RLS en delivery_order_items
ALTER TABLE public.delivery_order_items ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios autenticados pueden ver todos los items
DROP POLICY IF EXISTS "Users can view delivery order items" ON public.delivery_order_items;
CREATE POLICY "Users can view delivery order items"
    ON public.delivery_order_items
    FOR SELECT
    TO authenticated
    USING (true);

-- Política: Los usuarios autenticados pueden crear items
DROP POLICY IF EXISTS "Users can create delivery order items" ON public.delivery_order_items;
CREATE POLICY "Users can create delivery order items"
    ON public.delivery_order_items
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Política: Los usuarios autenticados pueden actualizar items
DROP POLICY IF EXISTS "Users can update delivery order items" ON public.delivery_order_items;
CREATE POLICY "Users can update delivery order items"
    ON public.delivery_order_items
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Política: Los usuarios autenticados pueden eliminar items
DROP POLICY IF EXISTS "Users can delete delivery order items" ON public.delivery_order_items;
CREATE POLICY "Users can delete delivery order items"
    ON public.delivery_order_items
    FOR DELETE
    TO authenticated
    USING (true);

-- ============================================================================
-- REMISSION_DELIVERY_ORDERS
-- ============================================================================

-- Habilitar RLS en remission_delivery_orders
ALTER TABLE public.remission_delivery_orders ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios autenticados pueden ver todas las relaciones remisión-órdenes
DROP POLICY IF EXISTS "Users can view remission delivery orders" ON public.remission_delivery_orders;
CREATE POLICY "Users can view remission delivery orders"
    ON public.remission_delivery_orders
    FOR SELECT
    TO authenticated
    USING (true);

-- Política: Los usuarios autenticados pueden crear relaciones remisión-órdenes
DROP POLICY IF EXISTS "Users can create remission delivery orders" ON public.remission_delivery_orders;
CREATE POLICY "Users can create remission delivery orders"
    ON public.remission_delivery_orders
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Política: Los usuarios autenticados pueden actualizar relaciones remisión-órdenes
DROP POLICY IF EXISTS "Users can update remission delivery orders" ON public.remission_delivery_orders;
CREATE POLICY "Users can update remission delivery orders"
    ON public.remission_delivery_orders
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Política: Los usuarios autenticados pueden eliminar relaciones remisión-órdenes
DROP POLICY IF EXISTS "Users can delete remission delivery orders" ON public.remission_delivery_orders;
CREATE POLICY "Users can delete remission delivery orders"
    ON public.remission_delivery_orders
    FOR DELETE
    TO authenticated
    USING (true);

-- Comments
COMMENT ON POLICY "Users can view delivery orders" ON public.delivery_orders IS 
  'Permite a usuarios autenticados ver todas las órdenes de entrega no eliminadas';

COMMENT ON POLICY "Users can create delivery orders" ON public.delivery_orders IS 
  'Permite a usuarios autenticados crear órdenes de entrega';

COMMENT ON POLICY "Users can update delivery orders" ON public.delivery_orders IS 
  'Permite a usuarios autenticados actualizar órdenes de entrega no eliminadas';

COMMENT ON POLICY "Users can delete delivery orders" ON public.delivery_orders IS 
  'Permite a usuarios autenticados eliminar (soft delete) órdenes de entrega';

COMMENT ON POLICY "Users can view remission delivery orders" ON public.remission_delivery_orders IS 
  'Permite a usuarios autenticados ver todas las relaciones remisión-órdenes';

COMMENT ON POLICY "Users can create remission delivery orders" ON public.remission_delivery_orders IS 
  'Permite a usuarios autenticados crear relaciones remisión-órdenes';
