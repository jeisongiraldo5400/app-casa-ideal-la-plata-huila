# Guía de Aplicación de Índices de Base de Datos

## 📋 Resumen

Esta guía te ayudará a aplicar los índices de optimización de rendimiento en tu base de datos de Supabase.

## 🎯 Beneficios Esperados

- **Búsquedas por barcode/SKU**: 10-100x más rápidas
- **Búsquedas por nombre**: Búsqueda fuzzy muy rápida
- **Filtros por bodega/fecha**: 5-10x más rápidas
- **Reportes**: 3-5x más rápidos
- **Carga de dashboards**: 60-80% más rápido

## 📝 Pasos para Aplicar los Índices

### Opción 1: Supabase Dashboard (Recomendado)

1. **Abre Supabase Dashboard**
   - Ve a [https://app.supabase.com](https://app.supabase.com)
   - Selecciona tu proyecto

2. **Abre el SQL Editor**
   - En el menú lateral, clic en "SQL Editor"
   - Clic en "New query"

3. **Copia el contenido del archivo SQL**
   - Abre el archivo: `supabase/migrations/add_performance_indexes.sql`
   - Copia TODO el contenido

4. **Pega y ejecuta**
   - Pega el contenido en el SQL Editor
   - Clic en "Run" (o Ctrl/Cmd + Enter)

5. **Verifica la creación**
   - Deberías ver mensajes de éxito para cada índice
   - Al final, verás una tabla con todos los índices creados

### Opción 2: Supabase CLI (Avanzado)

```bash
# Asegúrate de estar en el directorio del proyecto
cd /Users/jeisongiraldo/Documents/jeison/casa_ideal/app-casa-ideal

# Aplica la migración
supabase db push

# O si prefieres aplicar el archivo específico
supabase db execute -f supabase/migrations/add_performance_indexes.sql
```

## ✅ Verificación

Después de aplicar los índices, ejecuta esta consulta para verificar:

```sql
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

Deberías ver aproximadamente **15-20 índices** creados.

## 📊 Índices Creados

### Products (5 índices)
- ✅ `idx_products_barcode` - Búsquedas por código de barras
- ✅ `idx_products_name_trgm` - Búsquedas fuzzy por nombre
- ✅ `idx_products_sku` - Búsquedas por SKU
- ✅ `idx_products_category_brand` - Filtros combinados

### Inventory Entries (4 índices)
- ✅ `idx_inventory_entries_warehouse_date` - Filtros por bodega y fecha
- ✅ `idx_inventory_entries_purchase_order` - Búsquedas por orden de compra
- ✅ `idx_inventory_entries_product_date` - Reportes por producto
- ✅ `idx_inventory_entries_type` - Filtros por tipo de entrada

### Inventory Exits (3 índices)
- ✅ `idx_inventory_exits_warehouse_date` - Filtros por bodega y fecha
- ✅ `idx_inventory_exits_product_date` - Reportes por producto
- ✅ `idx_inventory_exits_created_by` - Auditoría por usuario

### Purchase Orders (2 índices)
- ✅ `idx_purchase_orders_status_date` - Filtros por estado
- ✅ `idx_purchase_orders_supplier` - Búsquedas por proveedor

### Warehouse Stock (2 índices)
- ✅ `idx_warehouse_stock_warehouse_product` - Consultas de stock
- ✅ `idx_warehouse_stock_low_stock` - Alertas de stock bajo

### Purchase Order Items (2 índices)
- ✅ `idx_purchase_order_items_order` - Items por orden
- ✅ `idx_purchase_order_items_product` - Historial por producto

### Cancellations (1 índice)
- ✅ `idx_cancellations_cancelled_by` - Auditoría de cancelaciones

## ⚠️ Notas Importantes

### 1. Extensión pg_trgm
El índice de búsqueda fuzzy requiere la extensión `pg_trgm`. Si obtienes un error:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Si no tienes permisos, contacta al soporte de Supabase.

### 2. Tiempo de Creación
- La creación de índices puede tomar **1-5 minutos** dependiendo del tamaño de tus datos
- Durante este tiempo, la base de datos sigue funcionando normalmente
- Las escrituras pueden ser ligeramente más lentas durante la creación

### 3. Espacio en Disco
- Los índices ocuparán aproximadamente **10-20%** del tamaño de tus tablas
- Esto es normal y aceptable para el beneficio en rendimiento

### 4. Índices Parciales
Usamos índices parciales (con `WHERE`) para:
- Solo indexar productos activos (`WHERE deleted_at IS NULL`)
- Solo indexar movimientos no cancelados (`WHERE is_cancelled = false`)
- Esto hace los índices más pequeños y eficientes

## 🔍 Monitoreo de Uso

Para ver qué índices se están usando:

```sql
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as "times_used",
    idx_tup_read as "tuples_read",
    idx_tup_fetch as "tuples_fetched"
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%'
ORDER BY idx_scan DESC;
```

## 🧹 Mantenimiento

PostgreSQL mantiene los índices automáticamente, pero es bueno ejecutar esto ocasionalmente:

```sql
-- Actualizar estadísticas (Supabase lo hace automáticamente)
ANALYZE products;
ANALYZE inventory_entries;
ANALYZE inventory_exits;
ANALYZE purchase_orders;
ANALYZE warehouse_stock;

-- Limpiar espacio (Supabase lo hace automáticamente)
VACUUM ANALYZE;
```

## 🚨 Solución de Problemas

### Error: "permission denied"
- Asegúrate de estar usando una cuenta con permisos de administrador
- En Supabase Dashboard, usa el SQL Editor (tiene permisos completos)

### Error: "relation does not exist"
- Verifica que el nombre de la tabla sea correcto
- Asegúrate de estar en el esquema `public`

### Error: "index already exists"
- Esto es normal si ejecutas el script dos veces
- Los índices ya están creados, puedes ignorar este error

### Índices no mejoran el rendimiento
- Ejecuta `ANALYZE` en las tablas afectadas
- Verifica que las consultas estén usando los índices con `EXPLAIN ANALYZE`
- Espera 5-10 minutos para que PostgreSQL actualice sus estadísticas

## 📈 Pruebas de Rendimiento

Antes y después de aplicar los índices, prueba:

1. **Búsqueda por barcode**
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM products WHERE barcode = 'ABC123' AND deleted_at IS NULL;
   ```

2. **Filtro de entradas por bodega**
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM inventory_entries 
   WHERE warehouse_id = 'xxx' 
   AND is_cancelled = false 
   ORDER BY created_at DESC 
   LIMIT 50;
   ```

3. **Búsqueda fuzzy por nombre**
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM products 
   WHERE name ILIKE '%producto%' 
   AND deleted_at IS NULL;
   ```

Deberías ver "Index Scan" en lugar de "Seq Scan" después de aplicar los índices.

## ✨ Resultado Esperado

Después de aplicar los índices:
- ✅ Carga de inventario: **< 500ms** (antes: 1-2s)
- ✅ Búsquedas: **< 100ms** (antes: 500ms-1s)
- ✅ Reportes: **< 1s** (antes: 3-5s)
- ✅ Dashboards: **< 1s** (antes: 2-3s)

## 🎉 ¡Listo!

Una vez aplicados los índices, tu aplicación debería sentirse **significativamente más rápida**, especialmente en:
- Búsquedas de productos
- Filtros de inventario
- Carga de reportes
- Dashboards con estadísticas
