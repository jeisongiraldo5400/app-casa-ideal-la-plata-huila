-- Migration: Add source_delivery_order_id to delivery_order_items
--
-- Date: 2025-12-13
--
-- Description: Adds source_delivery_order_id field to delivery_order_items to track if an item
--              was copied from another delivery order. Items with this field set will NOT
--              affect stock (stock was already reserved when the source order was created).
--
-- ============================================================================

ALTER TABLE public.delivery_order_items 
  ADD COLUMN IF NOT EXISTS source_delivery_order_id UUID NULL;

-- Add foreign key constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_delivery_order_item_source'
  ) THEN
    ALTER TABLE public.delivery_order_items
      ADD CONSTRAINT fk_delivery_order_item_source
        FOREIGN KEY (source_delivery_order_id)
        REFERENCES public.delivery_orders(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE;
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_delivery_order_items_source_id 
  ON public.delivery_order_items(source_delivery_order_id)
  WHERE source_delivery_order_id IS NOT NULL;

-- Comment
COMMENT ON COLUMN public.delivery_order_items.source_delivery_order_id IS 
  'ID de la orden de entrega original de la cual se copió este item. Si está presente, el item NO afecta el stock (ya se reservó al crear la orden original).';
