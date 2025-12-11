-- ============================================================================
-- Agregar campos de aprobación a delivery_order_items
-- Permite aprobar productos individuales antes de aprobar la orden completa
-- ============================================================================

ALTER TABLE public.delivery_order_items
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE NOT NULL;

ALTER TABLE public.delivery_order_items
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.delivery_order_items
ADD COLUMN IF NOT EXISTS approved_by UUID;

ALTER TABLE public.delivery_order_items
ADD CONSTRAINT fk_delivery_order_item_approved_by
    FOREIGN KEY (approved_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_delivery_order_items_is_approved
    ON public.delivery_order_items(is_approved)
    WHERE is_approved = true;

CREATE INDEX IF NOT EXISTS idx_delivery_order_items_approved_at
    ON public.delivery_order_items(approved_at DESC)
    WHERE approved_at IS NOT NULL;

COMMENT ON COLUMN public.delivery_order_items.is_approved IS
'Indica si el producto ha sido aprobado por el administrador para la entrega';

COMMENT ON COLUMN public.delivery_order_items.approved_at IS
'Fecha y hora en que el producto fue aprobado';

COMMENT ON COLUMN public.delivery_order_items.approved_by IS
'Usuario que aprobó el producto';

