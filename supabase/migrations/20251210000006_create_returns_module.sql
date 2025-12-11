-- ============================================================================
-- MÓDULO: Returns (Devoluciones)
-- Sistema unificado para manejar devoluciones de órdenes de compra y entrega
-- ============================================================================

-- Tabla principal: returns
CREATE TABLE IF NOT EXISTS public.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tipo de devolución y orden asociada
    return_type TEXT NOT NULL CHECK (return_type IN ('purchase_order', 'delivery_order')),
    order_id UUID NOT NULL, -- Puede ser purchase_order_id o delivery_order_id según return_type
    
    -- Información del producto
    product_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    
    -- Información de la devolución
    return_reason TEXT NOT NULL, -- Razón obligatoria de la devolución
    observations TEXT, -- Observaciones adicionales
    
    -- Referencias a movimientos de inventario
    inventory_entry_id UUID, -- Para purchase orders: entrada creada al devolver
    inventory_exit_id UUID, -- Para delivery orders: salida original que se devuelve
    
    -- Auditoría
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign Keys
    CONSTRAINT fk_return_product 
        FOREIGN KEY (product_id) 
        REFERENCES public.products(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_return_warehouse 
        FOREIGN KEY (warehouse_id) 
        REFERENCES public.warehouses(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_return_inventory_entry 
        FOREIGN KEY (inventory_entry_id) 
        REFERENCES public.inventory_entries(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_return_inventory_exit 
        FOREIGN KEY (inventory_exit_id) 
        REFERENCES public.inventory_exits(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_return_user 
        FOREIGN KEY (created_by) 
        REFERENCES auth.users(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_returns_return_type 
    ON public.returns(return_type);

CREATE INDEX IF NOT EXISTS idx_returns_order_id 
    ON public.returns(order_id);

CREATE INDEX IF NOT EXISTS idx_returns_product_id 
    ON public.returns(product_id);

CREATE INDEX IF NOT EXISTS idx_returns_warehouse_id 
    ON public.returns(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_returns_created_at 
    ON public.returns(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_returns_inventory_entry_id 
    ON public.returns(inventory_entry_id)
    WHERE inventory_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_inventory_exit_id 
    ON public.returns(inventory_exit_id)
    WHERE inventory_exit_id IS NOT NULL;

-- Comentarios
COMMENT ON TABLE public.returns IS 
    'Sistema unificado para registrar devoluciones de productos de órdenes de compra y órdenes de entrega';

COMMENT ON COLUMN public.returns.return_type IS 
    'Tipo de devolución: purchase_order (devolución de orden de compra) o delivery_order (devolución de orden de entrega)';

COMMENT ON COLUMN public.returns.order_id IS 
    'ID de la orden (purchase_order_id o delivery_order_id según return_type)';

COMMENT ON COLUMN public.returns.return_reason IS 
    'Razón obligatoria por la cual se devuelve el producto (ej: defectuoso, incorrecto, etc.)';

COMMENT ON COLUMN public.returns.inventory_entry_id IS 
    'Para purchase orders: referencia a la entrada de inventario creada al procesar la devolución';

COMMENT ON COLUMN public.returns.inventory_exit_id IS 
    'Para delivery orders: referencia a la salida de inventario original que se devuelve';

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION public.update_returns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_returns_updated_at
    BEFORE UPDATE ON public.returns
    FOR EACH ROW
    EXECUTE FUNCTION public.update_returns_updated_at();

-- ============================================================================
-- Function: validate_return_quantity
-- Description: Valida que la cantidad a devolver no exceda lo recibido/entregado
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_return_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    max_quantity NUMERIC;
    total_returned NUMERIC;
    order_exists BOOLEAN;
BEGIN
    -- Validar según el tipo de devolución
    IF NEW.return_type = 'purchase_order' THEN
        -- Validar que la orden de compra existe
        SELECT EXISTS(
            SELECT 1 FROM purchase_orders 
            WHERE id = NEW.order_id AND deleted_at IS NULL
        ) INTO order_exists;
        
        IF NOT order_exists THEN
            RAISE EXCEPTION 'La orden de compra % no existe o ha sido eliminada', NEW.order_id;
        END IF;
        
        -- Obtener la cantidad recibida para este producto en esta orden
        -- Sumar todas las entradas de inventario relacionadas con esta orden
        SELECT COALESCE(SUM(quantity), 0)
        INTO max_quantity
        FROM inventory_entries
        WHERE purchase_order_id = NEW.order_id
          AND product_id = NEW.product_id
          AND warehouse_id = NEW.warehouse_id;
        
        -- Verificar que el producto esté en la orden
        IF NOT EXISTS (
            SELECT 1 FROM purchase_order_items
            WHERE purchase_order_id = NEW.order_id
              AND product_id = NEW.product_id
        ) THEN
            RAISE EXCEPTION 'El producto % no está incluido en la orden de compra %', 
                NEW.product_id, NEW.order_id;
        END IF;
        
    ELSIF NEW.return_type = 'delivery_order' THEN
        -- Validar que la orden de entrega existe
        SELECT EXISTS(
            SELECT 1 FROM delivery_orders 
            WHERE id = NEW.order_id AND deleted_at IS NULL
        ) INTO order_exists;
        
        IF NOT order_exists THEN
            RAISE EXCEPTION 'La orden de entrega % no existe o ha sido eliminada', NEW.order_id;
        END IF;
        
        -- Obtener la cantidad entregada para este producto en esta orden y bodega
        SELECT COALESCE(SUM(quantity), 0)
        INTO max_quantity
        FROM inventory_exits
        WHERE delivery_order_id = NEW.order_id
          AND product_id = NEW.product_id
          AND warehouse_id = NEW.warehouse_id;
        
        -- Verificar que el producto esté en la orden
        IF NOT EXISTS (
            SELECT 1 FROM delivery_order_items
            WHERE delivery_order_id = NEW.order_id
              AND product_id = NEW.product_id
              AND warehouse_id = NEW.warehouse_id
        ) THEN
            RAISE EXCEPTION 'El producto % no está incluido en la orden de entrega % para la bodega %', 
                NEW.product_id, NEW.order_id, NEW.warehouse_id;
        END IF;
        
        -- Si hay inventory_exit_id, validar que pertenece a esta orden
        IF NEW.inventory_exit_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM inventory_exits
                WHERE id = NEW.inventory_exit_id
                  AND delivery_order_id = NEW.order_id
                  AND product_id = NEW.product_id
                  AND warehouse_id = NEW.warehouse_id
            ) THEN
                RAISE EXCEPTION 'La salida de inventario % no pertenece a esta orden de entrega o producto', 
                    NEW.inventory_exit_id;
            END IF;
        END IF;
    ELSE
        RAISE EXCEPTION 'Tipo de devolución inválido: %', NEW.return_type;
    END IF;
    
    -- Calcular la cantidad total ya devuelta (excluyendo la actual si es UPDATE)
    SELECT COALESCE(SUM(quantity), 0)
    INTO total_returned
    FROM returns
    WHERE return_type = NEW.return_type
      AND order_id = NEW.order_id
      AND product_id = NEW.product_id
      AND warehouse_id = NEW.warehouse_id
      AND (TG_OP = 'INSERT' OR id != NEW.id); -- Excluir la fila actual si es UPDATE
    
    -- Validar que la cantidad total devuelta no exceda lo recibido/entregado
    IF (total_returned + NEW.quantity) > max_quantity THEN
        RAISE EXCEPTION 
            'La cantidad excede lo permitido para este producto. Máximo disponible: %, Ya devuelto: %, Intentando devolver: %, Total después de esta devolución: %',
            max_quantity, 
            total_returned, 
            NEW.quantity,
            total_returned + NEW.quantity;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Trigger para validar cantidad antes de insertar o actualizar
CREATE TRIGGER trg_validate_return_quantity
    BEFORE INSERT OR UPDATE ON returns
    FOR EACH ROW
    EXECUTE FUNCTION validate_return_quantity();

COMMENT ON FUNCTION public.validate_return_quantity() IS 
    'Valida que las devoluciones no excedan las cantidades recibidas/entregadas en las órdenes';

-- ============================================================================
-- Function: process_return_inventory
-- Description: Procesa la devolución creando entradas/salidas de inventario y actualizando stock
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_return_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    new_entry_id UUID;
BEGIN
    -- Solo procesar en INSERT
    IF TG_OP = 'INSERT' THEN
        IF NEW.return_type = 'purchase_order' THEN
            -- Para purchase orders: crear entrada de inventario (devolver al stock)
            INSERT INTO inventory_entries (
                product_id,
                warehouse_id,
                quantity,
                entry_type,
                purchase_order_id,
                created_by
            ) VALUES (
                NEW.product_id,
                NEW.warehouse_id,
                NEW.quantity,
                'return',
                NEW.order_id,
                NEW.created_by
            )
            RETURNING id INTO new_entry_id;
            
            -- Actualizar stock (sumar la cantidad devuelta)
            INSERT INTO warehouse_stock (product_id, warehouse_id, quantity, updated_at)
            VALUES (NEW.product_id, NEW.warehouse_id, NEW.quantity, NOW())
            ON CONFLICT (product_id, warehouse_id)
            DO UPDATE SET 
                quantity = warehouse_stock.quantity + NEW.quantity,
                updated_at = NOW();
            
            -- Actualizar el registro de devolución con el ID de la entrada
            UPDATE returns
            SET inventory_entry_id = new_entry_id
            WHERE id = NEW.id;
                
        ELSIF NEW.return_type = 'delivery_order' THEN
            -- Para delivery orders: crear entrada de inventario (devolver al stock)
            INSERT INTO inventory_entries (
                product_id,
                warehouse_id,
                quantity,
                entry_type,
                created_by
            ) VALUES (
                NEW.product_id,
                NEW.warehouse_id,
                NEW.quantity,
                'return',
                NEW.created_by
            )
            RETURNING id INTO new_entry_id;
            
            -- Actualizar stock (sumar la cantidad devuelta)
            INSERT INTO warehouse_stock (product_id, warehouse_id, quantity, updated_at)
            VALUES (NEW.product_id, NEW.warehouse_id, NEW.quantity, NOW())
            ON CONFLICT (product_id, warehouse_id)
            DO UPDATE SET 
                quantity = warehouse_stock.quantity + NEW.quantity,
                updated_at = NOW();
            
            -- Actualizar delivered_quantity en delivery_order_items (reducir cantidad entregada)
            UPDATE delivery_order_items
            SET delivered_quantity = GREATEST(0, delivered_quantity - NEW.quantity)
            WHERE delivery_order_id = NEW.order_id
              AND product_id = NEW.product_id
              AND warehouse_id = NEW.warehouse_id;
            
            -- Actualizar el registro de devolución con el ID de la entrada
            UPDATE returns
            SET inventory_entry_id = new_entry_id
            WHERE id = NEW.id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Trigger para procesar inventario después de insertar
-- Nota: El inventory_entry_id se actualiza mediante un UPDATE separado dentro de la función
CREATE TRIGGER trg_process_return_inventory
    AFTER INSERT ON returns
    FOR EACH ROW
    EXECUTE FUNCTION process_return_inventory();

COMMENT ON FUNCTION public.process_return_inventory() IS 
    'Procesa las devoluciones creando entradas de inventario y actualizando el stock automáticamente';

-- RLS (Row Level Security)
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios autenticados pueden ver todas las devoluciones
CREATE POLICY "Users can view returns"
    ON public.returns
    FOR SELECT
    TO authenticated
    USING (true);

-- Política: Los usuarios autenticados pueden crear devoluciones
CREATE POLICY "Users can create returns"
    ON public.returns
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Política: Los usuarios autenticados pueden actualizar devoluciones
CREATE POLICY "Users can update returns"
    ON public.returns
    FOR UPDATE
    TO authenticated
    USING (true);


