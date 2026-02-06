-- ============================================================================
-- Migration: Reconcile delivered_quantity from inventory_exits
-- Date: 2026-02-06
-- Description: Fixes historical data where delivered_quantity in
--              delivery_order_items is 0 (or incorrect) but inventory_exits
--              records exist. This happened because the RPC
--              update_delivery_order_progress was failing silently due to a
--              signature mismatch (3 params vs 4 params after adding
--              warehouse_id_param).
--              Also auto-updates delivery order status to 'delivered' for
--              orders where all items are now fully delivered.
-- ============================================================================

-- Step 1: Reconcile delivered_quantity from inventory_exits
-- For each delivery_order_item, set delivered_quantity to the sum of
-- non-cancelled inventory_exits, capped at the item's quantity.
-- Only updates rows where the current delivered_quantity is less than what
-- inventory_exits shows.
UPDATE delivery_order_items doi
SET delivered_quantity = LEAST(
  COALESCE(exit_totals.total_delivered, 0),
  doi.quantity
)
FROM (
  SELECT ie.delivery_order_id, ie.product_id, SUM(ie.quantity) as total_delivered
  FROM inventory_exits ie
  WHERE ie.delivery_order_id IS NOT NULL
    AND ie.id NOT IN (SELECT inventory_exit_id FROM inventory_exit_cancellations)
  GROUP BY ie.delivery_order_id, ie.product_id
) exit_totals
WHERE doi.delivery_order_id = exit_totals.delivery_order_id
  AND doi.product_id = exit_totals.product_id
  AND doi.delivered_quantity < LEAST(exit_totals.total_delivered, doi.quantity);

-- Step 2: Auto-update delivery order status to 'delivered' for fully delivered orders
-- Only update orders that are in a status that allows transition to 'delivered'
UPDATE delivery_orders
SET status = 'delivered', updated_at = NOW()
WHERE id IN (
  SELECT delivery_order_id FROM delivery_order_items
  GROUP BY delivery_order_id
  HAVING COUNT(*) = COUNT(CASE WHEN delivered_quantity >= quantity THEN 1 END)
)
AND status IN ('pending', 'approved', 'sent_by_remission');
