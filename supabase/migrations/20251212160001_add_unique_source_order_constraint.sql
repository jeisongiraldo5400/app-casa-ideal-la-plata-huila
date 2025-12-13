-- Migration: Add unique constraint on source_delivery_order_id
--
-- Date: 2025-12-12
--
-- Description: Ensures that a customer delivery order can only be assigned to
--              ONE remission at a time. This prevents the same order from being
--              included in multiple remissions simultaneously.
--
-- ============================================================================

-- Create unique index on source_delivery_order_id
-- This ensures that each source order can only appear once in the table
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_source_delivery_order 
  ON public.remission_delivery_orders(source_delivery_order_id);

-- Add comment
COMMENT ON INDEX public.idx_unique_source_delivery_order IS
  'Ensures that a customer delivery order can only be assigned to one remission at a time. Prevents duplicate assignments across different remissions.';
