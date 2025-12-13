-- Migration: Add deleted_at to remission_delivery_orders and update unique constraint
--
-- Date: 2025-12-12
--
-- Description: Adds soft delete support to remission_delivery_orders table and updates
--              the unique constraint to only apply to non-deleted records. This allows
--              orders to be reassigned after a remission is deleted.
--
-- ============================================================================

-- Add deleted_at column
ALTER TABLE public.remission_delivery_orders
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Drop the old unique index
DROP INDEX IF EXISTS public.idx_unique_source_delivery_order;

-- Create new partial unique index that only applies when deleted_at IS NULL
CREATE UNIQUE INDEX idx_unique_source_delivery_order_active
  ON public.remission_delivery_orders(source_delivery_order_id)
  WHERE deleted_at IS NULL;

-- Add comment
COMMENT ON INDEX public.idx_unique_source_delivery_order_active IS
  'Ensures that a customer delivery order can only be assigned to one active (non-deleted) remission at a time. Allows reassignment after remission is deleted.';

COMMENT ON COLUMN public.remission_delivery_orders.deleted_at IS
  'Soft delete timestamp. When a remission is deleted, its relationships are also soft-deleted to allow order reassignment.';

-- ============================================================================
-- Create trigger to soft-delete relationships when remission is soft-deleted
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_soft_delete_remission_relationships()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When a remission is soft-deleted, soft-delete all its relationships
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.remission_delivery_orders
    SET deleted_at = NEW.deleted_at
    WHERE remission_id = NEW.id
      AND deleted_at IS NULL;
  END IF;
  
  -- When a remission is restored (deleted_at set back to NULL), restore relationships
  IF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
    UPDATE public.remission_delivery_orders
    SET deleted_at = NULL
    WHERE remission_id = NEW.id
      AND deleted_at IS NOT NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on delivery_orders for remissions
DROP TRIGGER IF EXISTS trg_soft_delete_remission_relationships ON public.delivery_orders;

CREATE TRIGGER trg_soft_delete_remission_relationships
  AFTER UPDATE OF deleted_at ON public.delivery_orders
  FOR EACH ROW
  WHEN (OLD.order_type = 'remission')
  EXECUTE FUNCTION public.fn_soft_delete_remission_relationships();

-- Comments
COMMENT ON FUNCTION public.fn_soft_delete_remission_relationships() IS
  'Automatically soft-deletes or restores remission relationships when a remission is soft-deleted or restored. This ensures that orders can be reassigned after a remission is deleted.';

COMMENT ON TRIGGER trg_soft_delete_remission_relationships ON public.delivery_orders IS
  'Soft-deletes or restores remission relationships when a remission is soft-deleted or restored.';
