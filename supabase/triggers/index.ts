[
    {
        "schema": "public",
        "table_name": "profiles",
        "trigger_name": "update_profiles_timestamp",
        "trigger_definition": "CREATE TRIGGER update_profiles_timestamp BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at()"
    },
    {
        "schema": "public",
        "table_name": "colors",
        "trigger_name": "trigger_update_colors_updated_at",
        "trigger_definition": "CREATE TRIGGER trigger_update_colors_updated_at BEFORE UPDATE ON public.colors FOR EACH ROW EXECUTE FUNCTION update_colors_updated_at()"
    },
    {
        "schema": "public",
        "table_name": "inventory_exits",
        "trigger_name": "trg_update_stock_on_exit",
        "trigger_definition": "CREATE TRIGGER trg_update_stock_on_exit AFTER INSERT ON public.inventory_exits FOR EACH ROW EXECUTE FUNCTION fn_update_stock_on_exit()"
    },
    {
        "schema": "public",
        "table_name": "inventory_exits",
        "trigger_name": "trg_validate_inventory_exit_quantity",
        "trigger_definition": "CREATE TRIGGER trg_validate_inventory_exit_quantity BEFORE INSERT OR UPDATE ON public.inventory_exits FOR EACH ROW WHEN ((new.delivery_order_id IS NOT NULL)) EXECUTE FUNCTION validate_inventory_exit_quantity()"
    },
    {
        "schema": "public",
        "table_name": "inventory_entries",
        "trigger_name": "trg_update_stock_after_entry",
        "trigger_definition": "CREATE TRIGGER trg_update_stock_after_entry AFTER INSERT ON public.inventory_entries FOR EACH ROW EXECUTE FUNCTION fn_update_stock_on_entry()"
    },
    {
        "schema": "public",
        "table_name": "inventory_entries",
        "trigger_name": "trg_validate_inventory_entry",
        "trigger_definition": "CREATE TRIGGER trg_validate_inventory_entry BEFORE INSERT ON public.inventory_entries FOR EACH ROW EXECUTE FUNCTION fn_validate_inventory_entry()"
    },
    {
        "schema": "public",
        "table_name": "inventory_entries",
        "trigger_name": "trg_validate_inventory_entry_quantity",
        "trigger_definition": "CREATE TRIGGER trg_validate_inventory_entry_quantity BEFORE INSERT OR UPDATE ON public.inventory_entries FOR EACH ROW WHEN ((new.purchase_order_id IS NOT NULL)) EXECUTE FUNCTION validate_inventory_entry_quantity()"
    },
    {
        "schema": "public",
        "table_name": "zones",
        "trigger_name": "trigger_update_zones_updated_at",
        "trigger_definition": "CREATE TRIGGER trigger_update_zones_updated_at BEFORE UPDATE ON public.zones FOR EACH ROW EXECUTE FUNCTION update_zones_updated_at()"
    },
    {
        "schema": "public",
        "table_name": "products",
        "trigger_name": "set_timestamp",
        "trigger_definition": "CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION handle_updated_at()"
    },
    {
        "schema": "public",
        "table_name": "delivery_order_status_observations",
        "trigger_name": "trigger_update_delivery_status_observation_updated_at",
        "trigger_definition": "CREATE TRIGGER trigger_update_delivery_status_observation_updated_at BEFORE UPDATE ON public.delivery_order_status_observations FOR EACH ROW EXECUTE FUNCTION update_delivery_status_observation_updated_at()"
    },
    {
        "schema": "public",
        "table_name": "purchase_order_edit_observations",
        "trigger_name": "trigger_update_edit_observation_updated_at",
        "trigger_definition": "CREATE TRIGGER trigger_update_edit_observation_updated_at BEFORE UPDATE ON public.purchase_order_edit_observations FOR EACH ROW EXECUTE FUNCTION update_purchase_order_edit_observation_updated_at()"
    },
    {
        "schema": "public",
        "table_name": "delivery_order_edit_observations",
        "trigger_name": "trigger_update_delivery_edit_observation_updated_at",
        "trigger_definition": "CREATE TRIGGER trigger_update_delivery_edit_observation_updated_at BEFORE UPDATE ON public.delivery_order_edit_observations FOR EACH ROW EXECUTE FUNCTION update_delivery_order_edit_observation_updated_at()"
    },
    {
        "schema": "public",
        "table_name": "delivery_order_returns",
        "trigger_name": "trigger_update_delivery_order_return_updated_at",
        "trigger_definition": "CREATE TRIGGER trigger_update_delivery_order_return_updated_at BEFORE UPDATE ON public.delivery_order_returns FOR EACH ROW EXECUTE FUNCTION update_delivery_order_return_updated_at()"
    },
    {
        "schema": "public",
        "table_name": "inventory_entry_cancellations",
        "trigger_name": "trigger_update_entry_cancellation_updated_at",
        "trigger_definition": "CREATE TRIGGER trigger_update_entry_cancellation_updated_at BEFORE UPDATE ON public.inventory_entry_cancellations FOR EACH ROW EXECUTE FUNCTION update_entry_cancellation_updated_at()"
    },
    {
        "schema": "public",
        "table_name": "inventory_exit_cancellations",
        "trigger_name": "trigger_update_exit_cancellation_updated_at",
        "trigger_definition": "CREATE TRIGGER trigger_update_exit_cancellation_updated_at BEFORE UPDATE ON public.inventory_exit_cancellations FOR EACH ROW EXECUTE FUNCTION update_exit_cancellation_updated_at()"
    },
    {
        "schema": "public",
        "table_name": "delivery_order_items",
        "trigger_name": "trg_adjust_stock_on_delivery_order_item_update",
        "trigger_definition": "CREATE TRIGGER trg_adjust_stock_on_delivery_order_item_update AFTER UPDATE ON public.delivery_order_items FOR EACH ROW WHEN (((old.quantity IS DISTINCT FROM new.quantity) OR (old.delivered_quantity IS DISTINCT FROM new.delivered_quantity))) EXECUTE FUNCTION fn_adjust_stock_on_delivery_order_item_change()"
    },
    {
        "schema": "public",
        "table_name": "delivery_order_items",
        "trigger_name": "trg_reserve_stock_on_delivery_order_item",
        "trigger_definition": "CREATE TRIGGER trg_reserve_stock_on_delivery_order_item AFTER INSERT ON public.delivery_order_items FOR EACH ROW EXECUTE FUNCTION fn_reserve_stock_on_delivery_order_item()"
    },
    {
        "schema": "public",
        "table_name": "delivery_order_items",
        "trigger_name": "trg_revert_stock_on_delivery_order_item_delete",
        "trigger_definition": "CREATE TRIGGER trg_revert_stock_on_delivery_order_item_delete AFTER DELETE ON public.delivery_order_items FOR EACH ROW EXECUTE FUNCTION fn_revert_stock_on_delivery_order_item()"
    },
    {
        "schema": "public",
        "table_name": "delivery_order_items",
        "trigger_name": "trg_sync_remission_items_on_order_edit",
        "trigger_definition": "CREATE TRIGGER trg_sync_remission_items_on_order_edit AFTER INSERT OR DELETE OR UPDATE ON public.delivery_order_items FOR EACH ROW EXECUTE FUNCTION fn_sync_remission_items_on_order_edit()"
    },
    {
        "schema": "public",
        "table_name": "delivery_orders",
        "trigger_name": "trg_revert_stock_on_delivery_order_delete",
        "trigger_definition": "CREATE TRIGGER trg_revert_stock_on_delivery_order_delete AFTER UPDATE ON public.delivery_orders FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION fn_revert_stock_on_delivery_order_delete()"
    },
    {
        "schema": "public",
        "table_name": "delivery_orders",
        "trigger_name": "trg_soft_delete_remission_relationships",
        "trigger_definition": "CREATE TRIGGER trg_soft_delete_remission_relationships AFTER UPDATE OF deleted_at ON public.delivery_orders FOR EACH ROW WHEN ((old.order_type = 'remission'::text)) EXECUTE FUNCTION fn_soft_delete_remission_relationships()"
    },
    {
        "schema": "public",
        "table_name": "delivery_orders",
        "trigger_name": "trigger_generate_delivery_order_number",
        "trigger_definition": "CREATE TRIGGER trigger_generate_delivery_order_number BEFORE INSERT ON public.delivery_orders FOR EACH ROW WHEN ((new.order_number IS NULL)) EXECUTE FUNCTION generate_delivery_order_number()"
    },
    {
        "schema": "public",
        "table_name": "delivery_orders",
        "trigger_name": "trigger_update_delivery_orders_updated_at",
        "trigger_definition": "CREATE TRIGGER trigger_update_delivery_orders_updated_at BEFORE UPDATE ON public.delivery_orders FOR EACH ROW EXECUTE FUNCTION update_delivery_orders_updated_at()"
    },
    {
        "schema": "public",
        "table_name": "purchase_orders",
        "trigger_name": "trigger_generate_purchase_order_number",
        "trigger_definition": "CREATE TRIGGER trigger_generate_purchase_order_number BEFORE INSERT ON public.purchase_orders FOR EACH ROW WHEN ((new.order_number IS NULL)) EXECUTE FUNCTION generate_purchase_order_number()"
    },
    {
        "schema": "public",
        "table_name": "remission_delivery_orders",
        "trigger_name": "trg_update_status_on_remission_assignment",
        "trigger_definition": "CREATE TRIGGER trg_update_status_on_remission_assignment AFTER INSERT OR DELETE ON public.remission_delivery_orders FOR EACH ROW EXECUTE FUNCTION fn_update_order_status_on_remission_assignment()"
    },
    {
        "schema": "public",
        "table_name": "remission_delivery_orders",
        "trigger_name": "trg_validate_remission_delivery_order_types",
        "trigger_definition": "CREATE TRIGGER trg_validate_remission_delivery_order_types BEFORE INSERT OR UPDATE ON public.remission_delivery_orders FOR EACH ROW EXECUTE FUNCTION fn_validate_remission_delivery_order_types()"
    },
    {
        "schema": "public",
        "table_name": "purchase_order_status_observations",
        "trigger_name": "trigger_update_status_observation_updated_at",
        "trigger_definition": "CREATE TRIGGER trigger_update_status_observation_updated_at BEFORE UPDATE ON public.purchase_order_status_observations FOR EACH ROW EXECUTE FUNCTION update_status_observation_updated_at()"
    },
    {
        "schema": "public",
        "table_name": "returns",
        "trigger_name": "trg_process_return_inventory",
        "trigger_definition": "CREATE TRIGGER trg_process_return_inventory AFTER INSERT ON public.returns FOR EACH ROW EXECUTE FUNCTION process_return_inventory()"
    },
    {
        "schema": "public",
        "table_name": "returns",
        "trigger_name": "trg_validate_return_quantity",
        "trigger_definition": "CREATE TRIGGER trg_validate_return_quantity BEFORE INSERT OR UPDATE ON public.returns FOR EACH ROW EXECUTE FUNCTION validate_return_quantity()"
    },
    {
        "schema": "public",
        "table_name": "returns",
        "trigger_name": "trigger_update_returns_updated_at",
        "trigger_definition": "CREATE TRIGGER trigger_update_returns_updated_at BEFORE UPDATE ON public.returns FOR EACH ROW EXECUTE FUNCTION update_returns_updated_at()"
    }
]