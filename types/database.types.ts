export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      brands: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      category: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      colors: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          client_code: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          id_number: string
          name: string
          neighborhood: string | null
          municipio_id: string | null
          notes: string | null
          phone: string | null
          phone_secondary: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          client_code?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          id_number: string
          name: string
          neighborhood?: string | null
          municipio_id?: string | null
          notes?: string | null
          phone?: string | null
          phone_secondary?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          client_code?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          id_number?: string
          name?: string
          neighborhood?: string | null
          municipio_id?: string | null
          notes?: string | null
          phone?: string | null
          phone_secondary?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_municipio_id_fkey"
            columns: ["municipio_id"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["id"]
          },
        ]
      }
      departamentos: {
        Row: {
          codigo: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          nombre: string
          updated_at: string | null
        }
        Insert: { codigo?: string | null; created_at?: string; deleted_at?: string | null; id?: string; is_active?: boolean; nombre: string; updated_at?: string | null }
        Update: { codigo?: string | null; created_at?: string; deleted_at?: string | null; id?: string; is_active?: boolean; nombre?: string; updated_at?: string | null }
        Relationships: []
      }
      gestor_municipios: {
        Row: { assigned_by: string | null; created_at: string; deleted_at: string | null; gestor_id: string; id: string; municipio_id: string }
        Insert: { assigned_by?: string | null; created_at?: string; deleted_at?: string | null; gestor_id: string; id?: string; municipio_id: string }
        Update: { assigned_by?: string | null; created_at?: string; deleted_at?: string | null; gestor_id?: string; id?: string; municipio_id?: string }
        Relationships: [
          { foreignKeyName: "gestor_municipios_gestor_id_fkey"; columns: ["gestor_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "gestor_municipios_municipio_id_fkey"; columns: ["municipio_id"]; isOneToOne: false; referencedRelation: "municipios"; referencedColumns: ["id"] },
        ]
      }
      delivery_order_edit_observations: {
        Row: {
          created_at: string
          created_by: string | null
          delivery_order_id: string
          edit_type: string
          id: string
          new_quantity: number | null
          observations: string
          previous_quantity: number | null
          product_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivery_order_id: string
          edit_type: string
          id?: string
          new_quantity?: number | null
          observations: string
          previous_quantity?: number | null
          product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivery_order_id?: string
          edit_type?: string
          id?: string
          new_quantity?: number | null
          observations?: string
          previous_quantity?: number | null
          product_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_delivery_edit_observation_order"
            columns: ["delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_delivery_edit_observation_product"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_order_item_approvals: {
        Row: {
          approved_at: string
          approved_by: string | null
          created_at: string
          deleted_at: string | null
          delivered_by_user_id: string | null
          delivery_order_id: string
          id: string
          observations: string
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_by_user_id?: string | null
          delivery_order_id: string
          id?: string
          observations: string
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_by_user_id?: string | null
          delivery_order_id?: string
          id?: string
          observations?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_order_item_approvals_delivered_by_user_id_fkey"
            columns: ["delivered_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_order_item_approvals_delivery_order_id_fkey"
            columns: ["delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_order_items: {
        Row: {
          approval_id: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          deleted_at: string | null
          delivered_quantity: number
          delivery_order_id: string
          id: string
          is_approved: boolean
          notes: string | null
          product_id: string
          quantity: number
          requested_by_user_id: string | null
          source_delivery_order_id: string | null
          warehouse_id: string
        }
        Insert: {
          approval_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_quantity?: number
          delivery_order_id: string
          id?: string
          is_approved?: boolean
          notes?: string | null
          product_id: string
          quantity: number
          requested_by_user_id?: string | null
          source_delivery_order_id?: string | null
          warehouse_id: string
        }
        Update: {
          approval_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deleted_at?: string | null
          delivered_quantity?: number
          delivery_order_id?: string
          id?: string
          is_approved?: boolean
          notes?: string | null
          product_id?: string
          quantity?: number
          requested_by_user_id?: string | null
          source_delivery_order_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_order_items_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "delivery_order_item_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_order_items_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_delivery_order_item_order"
            columns: ["delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_delivery_order_item_product"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_delivery_order_item_source"
            columns: ["source_delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_delivery_order_item_warehouse"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_order_pickup_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          delivery_order_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_order_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_order_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_order_pickup_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_order_pickup_assignments_delivery_order_id_fkey"
            columns: ["delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_order_pickup_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_order_returns: {
        Row: {
          created_at: string
          created_by: string | null
          delivery_order_id: string
          id: string
          inventory_entry_id: string | null
          inventory_exit_id: string
          observations: string | null
          product_id: string
          quantity: number
          return_reason: string
          updated_at: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivery_order_id: string
          id?: string
          inventory_entry_id?: string | null
          inventory_exit_id: string
          observations?: string | null
          product_id: string
          quantity: number
          return_reason: string
          updated_at?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivery_order_id?: string
          id?: string
          inventory_entry_id?: string | null
          inventory_exit_id?: string
          observations?: string | null
          product_id?: string
          quantity?: number
          return_reason?: string
          updated_at?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_return_delivery_order"
            columns: ["delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_return_inventory_entry"
            columns: ["inventory_entry_id"]
            isOneToOne: false
            referencedRelation: "inventory_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_return_inventory_exit"
            columns: ["inventory_exit_id"]
            isOneToOne: false
            referencedRelation: "inventory_exits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_return_product"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_return_warehouse"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_order_status_observations: {
        Row: {
          created_at: string
          created_by: string | null
          delivery_order_id: string
          id: string
          new_status: string
          observations: string
          previous_status: string
          status_action: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivery_order_id: string
          id?: string
          new_status: string
          observations: string
          previous_status: string
          status_action: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivery_order_id?: string
          id?: string
          new_status?: string
          observations?: string
          previous_status?: string
          status_action?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_delivery_status_observation_order"
            columns: ["delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_orders: {
        Row: {
          assigned_to_user_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          delivery_address: string | null
          id: string
          negocio_id: string | null
          notes: string | null
          order_number: string | null
          order_type: string
          status: string
          updated_at: string | null
          zone_id: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          delivery_address?: string | null
          id?: string
          negocio_id?: string | null
          notes?: string | null
          order_number?: string | null
          order_type?: string
          status?: string
          updated_at?: string | null
          zone_id?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          delivery_address?: string | null
          id?: string
          negocio_id?: string | null
          notes?: string | null
          order_number?: string | null
          order_type?: string
          status?: string
          updated_at?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_orders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_delivery_order_assigned_to_user"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_delivery_order_customer"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_entries: {
        Row: {
          barcode_scanned: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          delivery_order_return_id: string | null
          entry_type: string
          id: string
          product_id: string
          purchase_order_id: string | null
          quantity: number
          supplier_id: string | null
          warehouse_id: string
        }
        Insert: {
          barcode_scanned?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_order_return_id?: string | null
          entry_type?: string
          id?: string
          product_id: string
          purchase_order_id?: string | null
          quantity: number
          supplier_id?: string | null
          warehouse_id: string
        }
        Update: {
          barcode_scanned?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_order_return_id?: string | null
          entry_type?: string
          id?: string
          product_id?: string
          purchase_order_id?: string | null
          quantity?: number
          supplier_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_entry_delivery_order_return"
            columns: ["delivery_order_return_id"]
            isOneToOne: false
            referencedRelation: "delivery_order_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_entries_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_entries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_entry_cancellations: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          inventory_entry_id: string
          observations: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inventory_entry_id: string
          observations: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inventory_entry_id?: string
          observations?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_entry_cancellation_entry"
            columns: ["inventory_entry_id"]
            isOneToOne: true
            referencedRelation: "inventory_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_exit_cancellations: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          inventory_exit_id: string
          observations: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inventory_exit_id: string
          observations: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inventory_exit_id?: string
          observations?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_exit_cancellation_exit"
            columns: ["inventory_exit_id"]
            isOneToOne: true
            referencedRelation: "inventory_exits"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_exits: {
        Row: {
          barcode_scanned: string | null
          created_at: string
          created_by: string | null
          delivered_to_customer_id: string | null
          delivered_to_user_id: string | null
          delivery_observations: string | null
          delivery_order_id: string | null
          id: string
          product_id: string
          quantity: number
          warehouse_id: string
        }
        Insert: {
          barcode_scanned?: string | null
          created_at?: string
          created_by?: string | null
          delivered_to_customer_id?: string | null
          delivered_to_user_id?: string | null
          delivery_observations?: string | null
          delivery_order_id?: string | null
          id?: string
          product_id: string
          quantity: number
          warehouse_id: string
        }
        Update: {
          barcode_scanned?: string | null
          created_at?: string
          created_by?: string | null
          delivered_to_customer_id?: string | null
          delivered_to_user_id?: string | null
          delivery_observations?: string | null
          delivery_order_id?: string | null
          id?: string
          product_id?: string
          quantity?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_inventory_exit_delivery_order"
            columns: ["delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_exits_delivered_to_customer_id_fkey"
            columns: ["delivered_to_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_exits_delivered_to_user_id_fkey"
            columns: ["delivered_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_exits_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_exits_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_error_logs: {
        Row: {
          context: Json | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          error_code: string
          error_message: string
          id: string
          module: string
          operation: string
          severity: string
          step: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_code: string
          error_message: string
          id?: string
          module: string
          operation: string
          severity?: string
          step?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string
          error_message?: string
          id?: string
          module?: string
          operation?: string
          severity?: string
          step?: string | null
        }
        Relationships: []
      }
      permisos: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          descripcion: string | null
          id: string
          nombre: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      product_suppliers: {
        Row: {
          created_at: string
          id: string
          product_id: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_suppliers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string
          brand_id: string
          category_id: string
          color_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          sale_price: number
          sku: string
          status: boolean | null
          updated_at: string | null
        }
        Insert: {
          barcode: string
          brand_id?: string
          category_id?: string
          color_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          sale_price?: number
          sku: string
          status?: boolean | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string
          brand_id?: string
          category_id?: string
          color_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          sale_price?: number
          sku?: string
          status?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
        ]
      }

      credit_settings: {
        Row: {
          created_at: string
          default_frequency: string
          deleted_at: string | null
          formula_type: string
          id: string
          interest_rate_monthly_pct: number
          is_active: boolean
          late_fee_rate_pct: number
          legal_text: string | null
          max_installments: number
          money_decimal_places: number
          min_installments: number
          rounding_unit: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_frequency?: string
          deleted_at?: string | null
          formula_type?: string
          id?: string
          interest_rate_monthly_pct?: number
          is_active?: boolean
          late_fee_rate_pct?: number
          legal_text?: string | null
          max_installments?: number
          money_decimal_places?: number
          min_installments?: number
          rounding_unit?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_frequency?: string
          deleted_at?: string | null
          formula_type?: string
          id?: string
          interest_rate_monthly_pct?: number
          is_active?: boolean
          late_fee_rate_pct?: number
          legal_text?: string | null
          max_installments?: number
          money_decimal_places?: number
          min_installments?: number
          rounding_unit?: number
          updated_at?: string
        }
        Relationships: []
      }
      negocios: {
        Row: {
          codeudor_customer_id: string | null
          codeudor_snapshot: Json | null
          created_at: string
          created_by: string | null
          customer_id: string
          customer_signature_url: string | null
          deal_date: string
          deleted_at: string | null
          delivery_order_id: string | null
          direccion: string | null
          down_payment: number
          down_payment_date: string | null
          financed_amount: number
          first_due_date: string | null
          formula_snapshot: Json
          frequency: string
          guarantor_signature_url: string | null
          gestor_cobro_id: string | null
          id: string
          installment_amount: number
          installments_count: number
          interest_amount: number
          location: string | null
          municipio_id: string | null
          notes: string | null
          numero: number
          products_subtotal: number
          remission_id: string | null
          seller_id: string
          seller_signature_url: string | null
          signed_at: string | null
          source_delivery_order_id: string | null
          status: string
          total_credit: number
          updated_at: string
        }
        Insert: {
          codeudor_customer_id?: string | null
          codeudor_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          customer_signature_url?: string | null
          deal_date?: string
          deleted_at?: string | null
          delivery_order_id?: string | null
          direccion?: string | null
          down_payment?: number
          down_payment_date?: string | null
          financed_amount?: number
          first_due_date?: string | null
          formula_snapshot?: Json
          frequency?: string
          guarantor_signature_url?: string | null
          gestor_cobro_id?: string | null
          id?: string
          installment_amount?: number
          installments_count?: number
          interest_amount?: number
          location?: string | null
          municipio_id?: string | null
          notes?: string | null
          numero?: number
          products_subtotal?: number
          remission_id?: string | null
          seller_id: string
          seller_signature_url?: string | null
          signed_at?: string | null
          source_delivery_order_id?: string | null
          status?: string
          total_credit?: number
          updated_at?: string
        }
        Update: {
          codeudor_customer_id?: string | null
          codeudor_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          customer_signature_url?: string | null
          deal_date?: string
          deleted_at?: string | null
          delivery_order_id?: string | null
          direccion?: string | null
          down_payment?: number
          down_payment_date?: string | null
          financed_amount?: number
          first_due_date?: string | null
          formula_snapshot?: Json
          frequency?: string
          guarantor_signature_url?: string | null
          gestor_cobro_id?: string | null
          id?: string
          installment_amount?: number
          installments_count?: number
          interest_amount?: number
          location?: string | null
          municipio_id?: string | null
          notes?: string | null
          numero?: number
          products_subtotal?: number
          remission_id?: string | null
          seller_id?: string
          seller_signature_url?: string | null
          signed_at?: string | null
          source_delivery_order_id?: string | null
          status?: string
          total_credit?: number
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "negocios_gestor_cobro_id_fkey"; columns: ["gestor_cobro_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "negocios_municipio_id_fkey"; columns: ["municipio_id"]; isOneToOne: false; referencedRelation: "municipios"; referencedColumns: ["id"] },
          { foreignKeyName: "negocios_source_delivery_order_id_fkey"; columns: ["source_delivery_order_id"]; isOneToOne: false; referencedRelation: "delivery_orders"; referencedColumns: ["id"] },
        ]
      }
      negocio_gestor_historial: {
        Row: {
          accion: string
          asignado_por: string | null
          created_at: string
          gestor_anterior_id: string | null
          gestor_cobro_id: string | null
          id: string
          motivo: string | null
          negocio_id: string
        }
        Insert: {
          accion: string
          asignado_por?: string | null
          created_at?: string
          gestor_anterior_id?: string | null
          gestor_cobro_id?: string | null
          id?: string
          motivo?: string | null
          negocio_id: string
        }
        Update: {
          accion?: string
          asignado_por?: string | null
          created_at?: string
          gestor_anterior_id?: string | null
          gestor_cobro_id?: string | null
          id?: string
          motivo?: string | null
          negocio_id?: string
        }
        Relationships: [
          { foreignKeyName: "negocio_gestor_historial_negocio_id_fkey"; columns: ["negocio_id"]; isOneToOne: false; referencedRelation: "negocios"; referencedColumns: ["id"] },
          { foreignKeyName: "negocio_gestor_historial_gestor_anterior_id_fkey"; columns: ["gestor_anterior_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "negocio_gestor_historial_gestor_cobro_id_fkey"; columns: ["gestor_cobro_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "negocio_gestor_historial_asignado_por_fkey"; columns: ["asignado_por"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      negocio_vendedor_historial: {
        Row: {
          accion: string
          asignado_por: string | null
          created_at: string
          id: string
          motivo: string | null
          negocio_id: string
          vendedor_anterior_id: string | null
          vendedor_id: string | null
        }
        Insert: {
          accion: string
          asignado_por?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          negocio_id: string
          vendedor_anterior_id?: string | null
          vendedor_id?: string | null
        }
        Update: {
          accion?: string
          asignado_por?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          negocio_id?: string
          vendedor_anterior_id?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          { foreignKeyName: "negocio_vendedor_historial_negocio_id_fkey"; columns: ["negocio_id"]; isOneToOne: false; referencedRelation: "negocios"; referencedColumns: ["id"] },
          { foreignKeyName: "negocio_vendedor_historial_vendedor_anterior_id_fkey"; columns: ["vendedor_anterior_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "negocio_vendedor_historial_vendedor_id_fkey"; columns: ["vendedor_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "negocio_vendedor_historial_asignado_por_fkey"; columns: ["asignado_por"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      municipios: {
        Row: { codigo: string | null; created_at: string; deleted_at: string | null; departamento_id: string; id: string; is_active: boolean; nombre: string; updated_at: string | null }
        Insert: { codigo?: string | null; created_at?: string; deleted_at?: string | null; departamento_id: string; id?: string; is_active?: boolean; nombre: string; updated_at?: string | null }
        Update: { codigo?: string | null; created_at?: string; deleted_at?: string | null; departamento_id?: string; id?: string; is_active?: boolean; nombre?: string; updated_at?: string | null }
        Relationships: [
          { foreignKeyName: "municipios_departamento_id_fkey"; columns: ["departamento_id"]; isOneToOne: false; referencedRelation: "departamentos"; referencedColumns: ["id"] },
        ]
      }
      negocio_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          negocio_id: string
          product_id: string
          quantity: number
          subtotal: number
          unit_price: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          negocio_id: string
          product_id: string
          quantity: number
          subtotal: number
          unit_price: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          negocio_id?: string
          product_id?: string
          quantity?: number
          subtotal?: number
          unit_price?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          { foreignKeyName: "negocio_items_negocio_id_fkey"; columns: ["negocio_id"]; isOneToOne: false; referencedRelation: "negocios"; referencedColumns: ["id"] },
          { foreignKeyName: "negocio_items_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
          { foreignKeyName: "negocio_items_warehouse_id_fkey"; columns: ["warehouse_id"]; isOneToOne: false; referencedRelation: "warehouses"; referencedColumns: ["id"] },
        ]
      }
      negocio_cuotas: {
        Row: {
          amount: number
          created_at: string
          deleted_at: string | null
          due_date: string
          id: string
          installment_number: number
          late_fee_amount: number
          negocio_id: string
          notes: string | null
          paid_amount: number
          paid_at: string | null
          receipt_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          deleted_at?: string | null
          due_date: string
          id?: string
          installment_number: number
          late_fee_amount?: number
          negocio_id: string
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          receipt_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          deleted_at?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          late_fee_amount?: number
          negocio_id?: string
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          receipt_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      negocio_pagos: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          cuota_id: string | null
          deleted_at: string | null
          id: string
          negocio_id: string
          notes: string | null
          paid_at: string
          receipt_number: string | null
          receipt_status: string
          support_file_name: string | null
          support_mime: string | null
          support_path: string | null
          virtual_receipt_number: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          cuota_id?: string | null
          deleted_at?: string | null
          id?: string
          negocio_id: string
          notes?: string | null
          paid_at?: string
          receipt_number?: string | null
          receipt_status?: string
          support_file_name?: string | null
          support_mime?: string | null
          support_path?: string | null
          virtual_receipt_number?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          cuota_id?: string | null
          deleted_at?: string | null
          id?: string
          negocio_id?: string
          notes?: string | null
          paid_at?: string
          receipt_number?: string | null
          receipt_status?: string
          support_file_name?: string | null
          support_mime?: string | null
          support_path?: string | null
          virtual_receipt_number?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_edit_observations: {
        Row: {
          created_at: string
          created_by: string | null
          edit_type: string
          id: string
          new_quantity: number | null
          observations: string
          previous_quantity: number | null
          product_id: string | null
          purchase_order_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          edit_type: string
          id?: string
          new_quantity?: number | null
          observations: string
          previous_quantity?: number | null
          product_id?: string | null
          purchase_order_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          edit_type?: string
          id?: string
          new_quantity?: number | null
          observations?: string
          previous_quantity?: number | null
          product_id?: string | null
          purchase_order_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_edit_observation_order"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_edit_observation_product"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          product_id: string
          purchase_order_id: string
          quantity: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_poi_po"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_poi_product"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_status_observations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          new_status: string
          observations: string
          previous_status: string
          purchase_order_id: string
          status_action: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_status: string
          observations: string
          previous_status: string
          purchase_order_id: string
          status_action: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_status?: string
          observations?: string
          previous_status?: string
          purchase_order_id?: string
          status_action?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_status_observation_order"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string | null
          created_by: string
          deleted_at: string | null
          id: string
          notes: string | null
          order_number: string | null
          status: string
          supplier_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          status?: string
          supplier_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_po_supplier"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      remission_delivery_orders: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          remission_id: string
          source_delivery_order_id: string
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          remission_id: string
          source_delivery_order_id: string
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          remission_id?: string
          source_delivery_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_remission_delivery_orders_remission"
            columns: ["remission_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_remission_delivery_orders_source"
            columns: ["source_delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          inventory_entry_id: string | null
          inventory_exit_id: string | null
          observations: string | null
          order_id: string
          product_id: string
          quantity: number
          return_reason: string
          return_type: string
          updated_at: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inventory_entry_id?: string | null
          inventory_exit_id?: string | null
          observations?: string | null
          order_id: string
          product_id: string
          quantity: number
          return_reason: string
          return_type: string
          updated_at?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inventory_entry_id?: string | null
          inventory_exit_id?: string | null
          observations?: string | null
          order_id?: string
          product_id?: string
          quantity?: number
          return_reason?: string
          return_type?: string
          updated_at?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_return_inventory_entry"
            columns: ["inventory_entry_id"]
            isOneToOne: false
            referencedRelation: "inventory_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_return_inventory_exit"
            columns: ["inventory_exit_id"]
            isOneToOne: false
            referencedRelation: "inventory_exits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_return_product"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_return_warehouse"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_return_reversals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          observations: string
          return_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          observations: string
          return_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          observations?: string
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_return_reversals_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          nombre: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nombre: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      roles_permisos: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          permiso_id: string
          rol_id: string
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          permiso_id: string
          rol_id: string
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          permiso_id?: string
          rol_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_permisos_permiso_id_fkey"
            columns: ["permiso_id"]
            isOneToOne: false
            referencedRelation: "permisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_permisos_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustment_logs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          new_quantity: number
          previous_quantity: number
          product_id: string
          reason: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_quantity: number
          previous_quantity: number
          product_id: string
          reason: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_quantity?: number
          previous_quantity?: number
          product_id?: string
          reason?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_logs_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string | null
          created_by: string | null
          destination_warehouse_id: string
          id: string
          observations: string
          product_id: string
          quantity: number
          source_warehouse_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          destination_warehouse_id: string
          id?: string
          observations: string
          product_id: string
          quantity: number
          source_warehouse_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          destination_warehouse_id?: string
          id?: string
          observations?: string
          product_id?: string
          quantity?: number
          source_warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_destination_warehouse_id_fkey"
            columns: ["destination_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_source_warehouse_id_fkey"
            columns: ["source_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          cell_phone: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string | null
          nit: string | null
          updated_at: string | null
        }
        Insert: {
          cell_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string | null
          nit?: string | null
          updated_at?: string | null
        }
        Update: {
          cell_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string | null
          nit?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_stock: {
        Row: {
          id: string
          product_id: string
          quantity: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      stock_transfers_searchable: {
        Row: {
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          destination_warehouse_id: string | null
          destination_warehouse_name: string | null
          id: string | null
          observations: string | null
          product_id: string | null
          product_name: string | null
          product_sku: string | null
          quantity: number | null
          source_warehouse_id: string | null
          source_warehouse_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_destination_warehouse_id_fkey"
            columns: ["destination_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_source_warehouse_id_fkey"
            columns: ["source_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cancelled_entries: {
        Row: {
          cancellation_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          entry_created_at: string | null
          entry_created_by: string | null
          entry_type: string | null
          inventory_entry_id: string | null
          observations: string | null
          product_id: string | null
          quantity: number | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_entry_cancellation_entry"
            columns: ["inventory_entry_id"]
            isOneToOne: true
            referencedRelation: "inventory_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_entries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cancelled_exits: {
        Row: {
          cancellation_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          exit_created_at: string | null
          exit_created_by: string | null
          inventory_exit_id: string | null
          observations: string | null
          product_id: string | null
          quantity: number | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_exit_cancellation_exit"
            columns: ["inventory_exit_id"]
            isOneToOne: true
            referencedRelation: "inventory_exits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_exits_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_exits_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_product_stock: {
        Args: {
          p_new_quantity: number
          p_product_id: string
          p_reason: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      assign_orders_to_remission_batch: {
        Args: { p_order_ids: string[]; p_remission_id: string }
        Returns: {
          error_message: string
          order_id: string
          success: boolean
        }[]
      }
      cancel_delivery_order_with_items: {
        Args: { p_cancelled_at?: string; p_order_id: string }
        Returns: undefined
      }
      consume_admin_api_rate_limit: {
        Args: { p_max_requests?: number; p_window_seconds?: number }
        Returns: boolean
      }
      edit_delivery_order_items: {
        Args: {
          p_delivery_address?: string
          p_delivery_order_id: string
          p_items: Json
          p_notes?: string
          p_status?: string
        }
        Returns: Json
      }
      edit_purchase_order_items: {
        Args: {
          p_items: Json
          p_notes?: string
          p_purchase_order_id: string
          p_status?: string
          p_supplier_id?: string
        }
        Returns: Json
      }
      fn_assert_delivery_order_can_be_returned: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      fn_decrement_delivery_order_item_delivered: {
        Args: {
          p_order_id: string
          p_product_id: string
          p_quantity: number
          p_warehouse_id: string
        }
        Returns: undefined
      }
      get_authorized_delivery_order_items: {
        Args: { p_order_id: string }
        Returns: {
          created_at: string
          delivered_quantity: number
          id: string
          notes: string | null
          product_barcode: string | null
          product_id: string
          product_name: string
          product_sku: string | null
          quantity: number
          source_delivery_order_id: string | null
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_customer_delivery_orders: {
        Args: { customer_id_param: string; page?: number; page_size?: number }
        Returns: {
          created_at: string
          created_by_name: string
          delivered_quantity: number
          delivery_address: string
          id: string
          is_complete: boolean
          notes: string
          status: string
          total_count: number
          total_items: number
          total_quantity: number
        }[]
      }
      get_customer_exit_history: {
        Args: { customer_id_param: string; page?: number; page_size?: number }
        Returns: {
          created_at: string
          created_by_name: string
          id: string
          is_cancelled: boolean
          product_name: string
          quantity: number
          total_count: number
          warehouse_name: string
        }[]
      }
      get_customers: {
        Args: { page?: number; page_size?: number; search_term?: string }
        Returns: {
          address: string
          email: string
          id: string
          id_number: string
          last_exit_date: string
          name: string
          phone: string
          total_count: number
          total_exits: number
        }[]
      }
      get_customers_dashboard: {
        Args: { page?: number; page_size?: number; search_term?: string }
        Returns: {
          address: string
          created_at: string
          created_by: string
          created_by_name: string
          email: string
          id: string
          id_number: string
          last_exit_date: string
          name: string
          notes: string
          phone: string
          total_count: number
          total_exits: number
        }[]
      }
      get_customers_stats: {
        Args: never
        Returns: {
          customers_with_exits: number
          customers_without_exits: number
          total_customers: number
          total_exits_to_customers: number
        }[]
      }
      get_delivery_orders_admin_list: {
        Args: {
          end_ts?: string
          order_type_filter?: string
          page?: number
          page_size?: number
          search_term?: string
          start_ts?: string
          status_filter?: string
        }
        Returns: {
          assigned_to_user_id: string
          assigned_user_name: string
          can_mark_delivered: boolean
          created_at: string
          created_by: string
          created_by_name: string
          customer_id: string
          customer_name: string
          delivered_quantity: number
          delivery_address: string
          id: string
          notes: string
          order_number: string
          order_type: string
          pickup_assigned_user_id: string
          pickup_assigned_user_name: string
          status: string
          total_count: number
          total_items: number
          total_quantity: number
          zone_id: string
          zone_name: string
        }[]
      }
      get_delivery_orders_dashboard: {
        Args: { page?: number; page_size?: number; search_term?: string }
        Returns: {
          created_at: string
          created_by: string
          created_by_name: string
          customer_id: string
          customer_id_number: string
          customer_name: string
          delivered_items: number
          delivered_quantity: number
          delivery_address: string
          id: string
          items: Json
          notes: string
          status: string
          total_count: number
          total_items: number
          total_quantity: number
        }[]
      }
      get_delivery_orders_stats: {
        Args: never
        Returns: {
          cancelled_orders: number
          delivered_orders: number
          pending_orders: number
          preparing_orders: number
          ready_orders: number
          total_items_pending: number
          total_orders: number
          total_quantity_pending: number
        }[]
      }
      get_inventory_entries_dashboard: {
        Args: {
          date_from?: string
          date_to?: string
          page?: number
          page_size?: number
          search_term?: string
          supplier_filter?: string
          user_filter?: string
        }
        Returns: {
          barcode_scanned: string
          cancellation_created_at: string
          cancellation_id: string
          cancellation_observations: string
          created_at: string
          created_by: string
          created_by_name: string
          entry_type: string
          id: string
          is_cancelled: boolean
          product_barcode: string
          product_id: string
          product_name: string
          product_sku: string
          purchase_order_id: string
          quantity: number
          supplier_id: string
          supplier_name: string
          total_count: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_inventory_entries_stats: {
        Args: never
        Returns: {
          active_entries: number
          cancelled_entries: number
          total_entries: number
          total_quantity: number
          unique_warehouses: number
        }[]
      }
      get_inventory_exits_dashboard: {
        Args: {
          date_from?: string
          date_to?: string
          page?: number
          page_size?: number
          search_term?: string
          status_filter?: string
          user_filter?: string
          warehouse_filter?: string
        }
        Returns: {
          barcode_scanned: string
          cancellation_created_at: string
          cancellation_id: string
          cancellation_observations: string
          created_at: string
          created_by: string
          created_by_name: string
          delivered_to_id_number: string
          delivered_to_name: string
          delivered_to_type: string
          delivery_observations: string
          delivery_order_id: string
          id: string
          is_cancelled: boolean
          product_barcode: string
          product_id: string
          product_name: string
          product_sku: string
          quantity: number
          total_count: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_inventory_exits_stats: {
        Args: never
        Returns: {
          active_exits: number
          cancelled_exits: number
          total_exits: number
          total_quantity: number
          unique_warehouses: number
        }[]
      }
      get_movements_by_period: {
        Args: { end_date: string; movement_limit?: number; start_date: string }
        Returns: {
          cancellation_observations: string
          cancelled_at: string
          cancelled_by: string
          created_at: string
          delivered_to_id_number: string
          delivered_to_name: string
          delivered_to_type: string
          delivery_observations: string
          delivery_order_id: string
          id: string
          is_cancelled: boolean
          movement_type: string
          product_barcode: string
          product_name: string
          product_sku: string
          purchase_order_id: string
          quantity: number
          supplier_name: string
          user_name: string
          warehouse_name: string
        }[]
      }
      get_orders_for_return:
        | {
            Args: { return_type_param: string }
            Returns: {
              display_name: string
              id: string
              order_number: string
            }[]
          }
        | {
            Args: { return_type_param: string; search_term?: string }
            Returns: {
              display_name: string
              id: string
              order_number: string
            }[]
          }
      get_period_stats: {
        Args: { end_date: string; period_type?: string; start_date: string }
        Returns: {
          cancellations_count: number
          entries_count: number
          entries_quantity: number
          exits_count: number
          exits_quantity: number
          net_movement: number
          period_date: string
          period_label: string
        }[]
      }
      get_product_movement_timeline: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_movement_types?: string[]
          p_page?: number
          p_page_size?: number
          p_product_id: string
        }
        Returns: {
          description: string
          id: string
          is_cancelled: boolean
          movement_date: string
          movement_type: string
          observations: string
          quantity: number
          related_order_id: string
          related_order_number: string
          related_order_type: string
          secondary_warehouse_name: string
          total_count: number
          user_name: string
          warehouse_name: string
        }[]
      }
      get_product_timeline_summary: {
        Args: { p_product_id: string }
        Returns: {
          current_stock: Json
          product_barcode: string
          product_name: string
          product_sku: string
          total_cancellations: number
          total_entries: number
          total_exits: number
          total_reserved: number
          total_returns: number
          total_transfers: number
        }[]
      }
      get_product_traceability: {
        Args: {
          events_limit?: number
          product_ids?: string[]
          products_limit?: number
          search_term?: string
        }
        Returns: {
          events: Json
          product_barcode: string
          product_id: string
          product_name: string
          product_sku: string
        }[]
      }
      get_products_dashboard: {
        Args: {
          include_deleted?: boolean
          page?: number
          page_size?: number
          p_warehouse_id?: string
          search_term?: string
        }
        Returns: {
          barcode: string
          brand_id: string
          brand_name: string
          category_id: string
          category_name: string
          color_id: string
          color_name: string
          created_at: string
          deleted_at: string
          id: string
          name: string
          sale_price: number
          sku: string
          status: boolean
          stock_by_warehouse: Json
          total_count: number
          total_stock: number
        }[]
      }
      activate_negocio: {
        Args: { p_idempotency_key?: string; p_negocio_id: string }
        Returns: string
      }
      assign_gestor_to_negocios: {
        Args: { p_gestor_cobro_id: string; p_motivo?: string | null; p_negocio_ids: string[] }
        Returns: { unchanged_count: number; updated_count: number }[]
      }
      assign_seller_to_negocio: {
        Args: { p_negocio_id: string; p_seller_id: string; p_motivo?: string | null }
        Returns: boolean
      }
      unassign_gestor_from_negocios: {
        Args: { p_motivo?: string | null; p_negocio_ids: string[] }
        Returns: { unchanged_count: number; updated_count: number }[]
      }
      unassign_order_from_remission: {
        Args: { p_remission_id: string; p_source_order_id: string }
        Returns: boolean
      }
      get_negocio_gestor_historial: {
        Args: { p_negocio_id: string }
        Returns: {
          accion: string
          asignado_por: string
          asignado_por_nombre: string
          created_at: string
          gestor_anterior_id: string
          gestor_anterior_nombre: string
          gestor_cobro_id: string
          gestor_cobro_nombre: string
          id: string
          motivo: string
          negocio_id: string
        }[]
      }
      get_negocio_vendedor_historial: {
        Args: { p_negocio_id: string }
        Returns: {
          accion: string
          asignado_por: string | null
          asignado_por_nombre: string | null
          created_at: string
          id: string
          motivo: string | null
          negocio_id: string
          vendedor_anterior_id: string | null
          vendedor_anterior_nombre: string | null
          vendedor_id: string | null
          vendedor_nombre: string | null
        }[]
      }
      create_negocio: {
        Args: {
          p_activate: boolean
          p_idempotency_key: string
          p_items: Json
          p_negocio: Json
          p_negocio_id: string
        }
        Returns: string
      }
      create_purchase_order: {
        Args: {
          p_idempotency_key: string
          p_items: Json
          p_notes: string | null
          p_order_id: string
          p_supplier_id: string
        }
        Returns: string
      }
      create_delivery_order: {
        Args: {
          p_assigned_to_user_id: string | null
          p_customer_id: string | null
          p_delivery_address: string | null
          p_idempotency_key: string
          p_items: Json
          p_notes: string | null
          p_order_id: string
          p_order_type: string
          p_zone_id: string | null
        }
        Returns: string
      }
      create_inventory_product: {
        Args: {
          p_barcode: string
          p_brand_id: string
          p_category_id: string
          p_description: string | null
          p_idempotency_key: string
          p_name: string
          p_sku: string
          p_supplier_id: string | null
        }
        Returns: Database["public"]["Tables"]["products"]["Row"]
      }
      register_negocio_customer_signature: {
        Args: { p_customer_signature_url: string; p_negocio_id: string }
        Returns: string
      }
      update_negocio: {
        Args: { p_activate: boolean; p_idempotency_key: string; p_items: Json; p_negocio: Json; p_negocio_id: string }
        Returns: string
      }
      register_inventory_entries_batch: {
        Args: {
          p_entry_type: string
          p_idempotency_key: string
          p_items: Json
          p_purchase_order_id: string | null
          p_supplier_id: string | null
          p_warehouse_id: string
        }
        Returns: Json
      }
      register_inventory_exits_batch: {
        Args: {
          p_delivered_to_customer_id: string | null
          p_delivered_to_user_id: string | null
          p_delivery_observations: string | null
          p_delivery_order_id: string | null
          p_exit_mode: string
          p_idempotency_key: string
          p_items: Json
        }
        Returns: Json
      }
      register_delivery_order_return: {
        Args: { p_delivery_order_id: string; p_idempotency_key: string; p_inventory_exit_id: string; p_observations?: string | null; p_quantity: number; p_reason: string }
        Returns: string
      }
      get_delivery_order_returnable_exits: {
        Args: { p_order_id: string }
        Returns: {
          inventory_exit_id: string
          product_id: string
          product_name: string
          product_sku: string | null
          warehouse_id: string
          warehouse_name: string
          exit_quantity: number
          already_returned: number
          max_returnable: number
        }[]
      }
      delete_delivery_order: {
        Args: { p_delivery_order_id: string; p_idempotency_key: string }
        Returns: boolean
      }
      approve_delivery_order_with_returns: {
        Args: { p_delivery_order_id: string; p_observations: string; p_idempotency_key: string }
        Returns: boolean
      }
      register_negocio_pago: {
        Args: {
          p_negocio_id: string
          p_amount: number
          p_paid_at?: string
          p_receipt_number?: string | null
          p_cuota_id?: string | null
          p_notes?: string | null
          p_idempotency_key?: string | null
        }
        Returns: string
      }
      attach_negocio_pago_support: {
        Args: {
          p_pago_id: string
          p_path: string
          p_mime: string
          p_file_name?: string | null
        }
        Returns: string
      }
      void_negocio_pago: {
        Args: { p_pago_id: string }
        Returns: undefined
      }
      cancel_negocio: {
        Args: { p_idempotency_key: string; p_negocio_id: string; p_reason?: string | null }
        Returns: undefined
      }
      cancel_inventory_entry: {
        Args: { p_entry_id: string; p_idempotency_key: string; p_observations: string }
        Returns: string
      }
      cancel_purchase_order_with_entries: {
        Args: { p_purchase_order_id: string; p_observations: string; p_idempotency_key: string }
        Returns: Json
      }
      cancel_inventory_exit: {
        Args: { p_exit_id: string; p_idempotency_key: string; p_observations: string }
        Returns: string
      }
      revert_purchase_order_return: {
        Args: { p_return_id: string; p_observations: string; p_idempotency_key: string }
        Returns: string
      }
      delete_purchase_order: {
        Args: { p_purchase_order_id: string; p_idempotency_key: string }
        Returns: boolean
      }
      mark_cuotas_en_mora: {
        Args: { p_negocio_id?: string | null }
        Returns: number
      }
      get_cartera_cuotas: {
        Args: {
          p_filter?: string
          p_days?: number
          p_search?: string
          p_page?: number
          p_page_size?: number
          p_municipio_id?: string | null
          p_gestor_id?: string | null
          p_seller_id?: string | null
        }
        Returns: {
          cuota_id: string
          negocio_id: string
          negocio_numero: number
          customer_name: string | null
          customer_id_number: string | null
          customer_phone: string | null
          customer_address: string | null
          municipio_id: string | null
          municipio_name: string | null
          departamento_name: string | null
          seller_id: string | null
          seller_name: string | null
          installment_number: number
          due_date: string
          amount: number
          paid_amount: number
          late_fee_amount: number
          saldo: number
          status: string
          negocio_status: string
          total_count: number
        }[]
      }
      get_cartera_management_dashboard: {
        Args: { p_municipio_id?: string | null }
        Returns: Json
      }
      search_collection_managers: {
        Args: { p_search?: string; p_limit?: number }
        Returns: { id: string; full_name: string }[]
      }
      get_collection_manager_businesses: {
        Args: { p_gestor_id: string; p_search?: string; p_limit?: number }
        Returns: {
          negocio_id: string
          negocio_numero: number
          customer_name: string
          customer_id_number: string
          current_assignment: boolean
          historical_assignment: boolean
        }[]
      }
      get_collection_manager_payments: {
        Args: {
          p_gestor_id: string
          p_scope?: string
          p_negocio_id?: string | null
          p_date_from?: string | null
          p_date_to?: string | null
          p_receipt_status?: string
          p_search?: string
          p_page?: number
          p_page_size?: number
        }
        Returns: Json
      }
      get_collection_route_candidates: {
        Args: {
          p_search?: string
          p_filter?: string
          p_municipio_id?: string | null
          p_page?: number
          p_page_size?: number
        }
        Returns: {
          negocio_id: string
          negocio_numero: number
          customer_name: string
          customer_id_number: string
          customer_phone: string
          customer_address: string
          municipality_id: string
          municipality_name: string
          expected_balance: number
          overdue_balance: number
          next_due_date: string
          open_installments: number
          total_count: number
        }[]
      }
      create_collection_route: {
        Args: { p_negocio_ids: string[]; p_route_date?: string }
        Returns: string
      }
      get_collection_route: {
        Args: { p_route_id: string }
        Returns: Json
      }
      get_my_collection_routes: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          route_date: string
          status: string
          stop_count: number
          completed_count: number
          expected_total: number
          collected_total: number
        }[]
      }
      start_collection_route: {
        Args: { p_route_id: string }
        Returns: undefined
      }
      select_collection_route_stop: {
        Args: { p_stop_id: string }
        Returns: undefined
      }
      update_collection_route_stop: {
        Args: {
          p_stop_id: string
          p_status: string
          p_reason?: string | null
          p_notes?: string | null
        }
        Returns: undefined
      }
      register_collection_route_payment: {
        Args: {
          p_stop_id: string
          p_amount: number
          p_paid_at: string
          p_receipt_number?: string | null
          p_cuota_id?: string | null
          p_notes?: string | null
          p_idempotency_key?: string | null
        }
        Returns: string
      }
      finish_collection_route: {
        Args: { p_route_id: string; p_cancel?: boolean }
        Returns: undefined
      }
      has_role: {
        Args: { role_name: string }
        Returns: boolean
      }
      is_admin_or_vendedor: {
        Args: never
        Returns: boolean
      }
      get_products_for_return: {
        Args: { order_id_param: string; return_type_param: string }
        Returns: {
          already_returned: number
          max_returnable: number
          product_id: string
          product_name: string
          product_sku: string
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_products_stats: {
        Args: never
        Returns: {
          products_with_barcode: number
          products_with_internal_barcode: number
          total_products: number
          unique_categories: number
        }[]
      }
      get_products_with_stock_for_delivery: {
        Args: { search_term?: string }
        Returns: {
          product_barcode: string
          product_id: string
          product_name: string
          product_sku: string
          stock_by_warehouse: Json
        }[]
      }
      get_purchase_orders_dashboard:
        | {
            Args: { page?: number; page_size?: number; search_term?: string }
            Returns: {
              completion: Json
              completion_detail: Json
              created_at: string
              id: string
              notes: string
              status: string
              supplier_id: string
              supplier_name: string
              total_count: number
              total_items: number
              total_quantity: number
            }[]
          }
        | {
            Args: {
              date_from?: string
              date_to?: string
              page?: number
              page_size?: number
              search_term?: string
              status_filter?: string
            }
            Returns: {
              completion: Json
              completion_detail: Json
              created_at: string
              id: string
              notes: string
              order_number: string
              status: string
              supplier_id: string
              supplier_name: string
              total_count: number
              total_items: number
              total_quantity: number
            }[]
          }
      get_purchase_orders_stats: {
        Args: never
        Returns: {
          approved: number
          cancelled: number
          pending: number
          received: number
          total: number
          total_items: number
          total_quantity: number
        }[]
      }
      get_reports_stats_today: {
        Args: never
        Returns: {
          cancelled_entries_today: number
          cancelled_exits_today: number
          entries_quantity_today: number
          entries_today: number
          exits_quantity_today: number
          exits_today: number
          movements_today: number
          total_stock: number
        }[]
      }
      get_returns_dashboard: {
        Args: {
          page?: number
          page_size?: number
          return_type_filter?: string
          search_term?: string
        }
        Returns: {
          created_at: string
          created_by: string
          created_by_name: string
          id: string
          inventory_entry_id: string
          is_reverted: boolean
          observations: string
          order_id: string
          order_number: string
          product_id: string
          product_name: string
          product_sku: string
          quantity: number
          return_reason: string
          return_type: string
          revert_observations: string
          reverted_at: string
          total_count: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_stock_by_product_for_delivery: {
        Args: { p_product_id: string }
        Returns: {
          available_quantity: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_stock_validation: {
        Args: {
          p_bodega_id?: string
          p_diagnostico?: string
          p_estado_producto?: string
          p_page?: number
          p_page_size?: number
          p_search_term?: string
        }
        Returns: {
          ajustes_manuales: number
          bodega: string
          bodega_id: string
          codigo_barras: string
          count_faltante: number
          count_negativo: number
          count_ok: number
          count_sobrante: number
          devoluciones_proveedor: number
          diagnostico: string
          diferencia: number
          entradas_validas: number
          estado_producto: string
          product_id: string
          producto: string
          reservado_pendiente: number
          salidas_directas: number
          salidas_ordenes_entrega: number
          sku: string
          stock_actual: number
          stock_teorico: number
          total_count: number
          transferencias_entrada: number
          transferencias_salida: number
        }[]
      }
      get_user_activities_today: {
        Args: never
        Returns: {
          entries_count: number
          exits_count: number
          total_movements: number
          user_email: string
          user_id: string
          user_name: string
        }[]
      }
      get_user_delivery_orders_expanded: {
        Args: { p_user_id: string }
        Returns: {
          assigned_to_user_id: string
          assigned_to_user_name: string
          created_at: string
          customer_id: string
          customer_id_number: string
          customer_name: string
          delivery_address: string
          id: string
          is_from_remission: boolean
          notes: string
          order_number: string
          order_type: string
          remission_id: string
          status: string
          total_items: number
          total_quantity: number
        }[]
      }
      get_my_authorized_delivery_orders: {
        Args: never
        Returns: {
          assigned_to_user_id: string | null
          created_at: string
          customer_id: string | null
          customer_id_number: string | null
          customer_name: string | null
          delivered_quantity: number
          delivery_address: string | null
          id: string
          notes: string | null
          order_number: string | null
          order_type: string
          pending_quantity: number
          status: string
          total_items: number
          total_quantity: number
        }[]
      }
      get_my_registered_delivery_order_items: {
        Args: { p_order_id: string }
        Returns: {
          cancellation_observations: string | null
          created_at: string
          delivery_observations: string | null
          exit_id: string
          is_cancelled: boolean
          product_barcode: string | null
          product_id: string
          product_name: string
          product_sku: string | null
          quantity: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_my_registered_delivery_orders: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_search_term?: string | null
        }
        Returns: {
          created_at: string
          customer_id: string | null
          customer_id_number: string | null
          customer_name: string | null
          delivered_quantity: number
          delivery_address: string | null
          id: string
          last_exit_at: string
          my_active_exit_count: number
          my_active_quantity: number
          my_cancelled_exit_count: number
          my_cancelled_quantity: number
          order_number: string | null
          order_type: string
          pending_quantity: number
          recipient_name: string | null
          recipient_type: string
          status: string
          total_count: number
          total_items: number
          total_quantity: number
        }[]
      }
      get_users_dashboard: {
        Args: { page?: number; page_size?: number; search_term?: string }
        Returns: {
          avatar_url: string
          created_at: string
          deleted_at: string
          email: string
          full_name: string
          id: string
          roles: Json
          total_count: number
        }[]
      }
      get_users_stats: {
        Args: never
        Returns: {
          active: number
          admins: number
          bodegueros: number
          total: number
          vendedores: number
        }[]
      }
      get_warehouses_stats: {
        Args: never
        Returns: {
          address: string
          city: string
          id: string
          is_active: boolean
          last_activity: string
          name: string
          total_products: number
          total_units: number
        }[]
      }
      search_customers: {
        Args: { limit_count?: number; search_term?: string }
        Returns: {
          address: string
          id: string
          id_number: string
          name: string
        }[]
      }
      search_customer_negocios: {
        Args: { p_search?: string; p_limit?: number }
        Returns: Json
      }
      search_products_for_delivery_order: {
        Args: { p_search_term?: string }
        Returns: {
          product_barcode: string
          product_id: string
          product_name: string
          product_sku: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      transfer_product_between_warehouses: {
        Args: {
          p_destination_warehouse_id: string
          p_observations: string
          p_product_id: string
          p_quantity: number
          p_source_warehouse_id: string
        }
        Returns: Json
      }
      update_delivery_order_progress: {
        Args: {
          order_id_param: string
          product_id_param: string
          quantity_delivered_param: number
          warehouse_id_param: string
        }
        Returns: Json
      }
      update_delivery_order_progress_batch: {
        Args: { items_param: Json; order_id_param: string }
        Returns: Json
      }
      update_purchase_order_progress: {
        Args: { order_id_param: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
