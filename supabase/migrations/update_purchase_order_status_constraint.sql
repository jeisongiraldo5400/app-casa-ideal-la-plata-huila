-- Migration: Add CHECK constraint for purchase_order status
-- Description: Restricts the status column to only allow: 'pending', 'approved', 'received'
-- Date: 2024-11-22

-- First, update any existing invalid status values to 'pending'
UPDATE purchase_orders
SET status = 'pending'
WHERE status NOT IN ('pending', 'approved', 'received');

-- Add CHECK constraint to ensure only valid status values are allowed
ALTER TABLE purchase_orders
DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE purchase_orders
ADD CONSTRAINT purchase_orders_status_check 
CHECK (status IN ('pending', 'approved', 'received'));

-- Ensure the default value is set correctly
ALTER TABLE purchase_orders
ALTER COLUMN status SET DEFAULT 'pending';

-- Add a comment to document the constraint
COMMENT ON CONSTRAINT purchase_orders_status_check ON purchase_orders IS 
'Restricts status to: pending (Pendiente), approved (Aprobada), received (Recibida)';

