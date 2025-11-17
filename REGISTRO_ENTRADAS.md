Aquí tienes el README.md completo, claro y profesional, que documenta:

✅ Cómo funciona la entrada de productos desde la aplicación móvil
✅ Qué ocurre cuando el código de barras NO está registrado en el sistema
✅ Flujo sugerido para el área de inventario
✅ Ejemplo de respuestas y errores

📱 Módulo de Entradas de Productos (Aplicación Móvil)

Este módulo permite gestionar la entrada de mercancía a bodega mediante escaneo de códigos de barras desde la aplicación móvil.
Su objetivo principal es garantizar la trazabilidad, exactitud y control del inventario en tiempo real.

🚀 1. Flujo General de Entrada de Productos

Las entradas solo pueden realizarse para productos creados previamente en el sistema y que tengan un código de barras registrado.

Pasos desde la App Móvil

El usuario inicia el módulo de “Entradas”.

Selecciona la Orden de Compra (opcional según diseño).

Escanea el código de barras del producto.

La app valida el código contra la base de datos.

Si existe:

Muestra el producto.

Solicita cantidad recibida.

Registra la entrada en la tabla de movimientos.

Actualiza el inventario disponible.

📥 2. Flujo: Producto con Código de Barras Registrado

Cuando la app escanea un código existente en la tabla products:

✔ Validación exitosa

El sistema retorna el producto:

{
  "id": "UUID",
  "name": "Nombre del producto",
  "sku": "ABC-123",
  "barcode": "1234567890123",
  "supplier_id": "UUID",
  "status": "active"
}

✔ Acción posterior

El usuario ingresa la cantidad recibida.

Se registra un movimiento:

Movimiento: Entrada

Fecha

Cantidad

Producto asociado

Usuario que recibió

Ubicación (opcional)

Orden de compra (si aplica)

❌ 3. Caso Especial: Producto SIN Código de Barras Registrado

Si el código escaneado NO existe en el sistema, se sigue el siguiente flujo.

🚫 Respuesta del backend (recomendada)
{
  "error": true,
  "message": "Producto no encontrado. Este código de barras no está registrado en el sistema."
}

📱 Mensaje mostrado en la app

❌ Producto no encontrado.
Este código de barras no está asociado a ningún producto.
Comuníquese con el área de inventario para registrarlo antes de continuar.

🔒 Acción de la app

Se bloquea la entrada de mercancía.

NO permite continuar con el registro.

NO crea productos desde el módulo móvil (por control de calidad).

📝 4. Registro de Intentos de Escaneo de Productos No Registrados (opcional pero recomendado)

Cada intento de escanear un código desconocido puede almacenarse para trazabilidad.

Tabla sugerida: unregistered_barcode_scans
Campo	Descripción
id	UUID
barcode	Código escaneado
scanned_at	Fecha del intento
scanned_by	Usuario móvil
purchase_order_id	OC asociada (opcional)
location	Punto de escaneo

Esto permite al equipo detectar productos no registrados y corregirlos rápidamente.

🏷️ 5. Flujo del Área de Inventario para Registrar Productos Faltantes

Cuando un código no existe, el flujo recomendado es:

🔧 Paso 1 — Revisar escaneos no registrados

Ir al panel de administración → revisar tabla de alertas (o lista generada por el sistema).

🛠 Paso 2 — Crear el producto en la plataforma web

El equipo de inventario debe ingresar:

Nombre del producto

Descripción

Proveedor

Unidad de medida

SKU

Código de barras

Categoría

Estado

▶ Paso 3 — Guardar el producto

Queda disponible inmediatamente.

▶ Paso 4 — Reintentar la entrada desde la app

Ahora el escaneo funcionará correctamente.

📦 6. Reglas Operativas del Sistema
Regla #1 — No se permite registrar entradas sin código de barras

El inventario debe basarse únicamente en identificadores únicos automáticos.

Regla #2 — No se crean productos desde la app

Para mantener la calidad del inventario, solo personal de inventario crea productos.

Regla #3 — Cada producto debe existir antes de recibirlo

Forma parte de la normalización del inventario.

📘 7. Ejemplo Completo de Entrada (Producto Registrado)
Escaneo

Código: 7701234567890

Backend

Encuentra el producto → retorna info.

Usuario ingresa cantidad

25 unidades

Sistema registra movimiento
{
  "movement_type": "entrada",
  "product_id": "...",
  "quantity": 25,
  "registered_by": "...",
  "timestamp": "2025-01-01T15:30:00Z"
}

✔ Inventario actualizado
🎯 Conclusión

Este módulo móvil garantiza:

Entradas controladas

Trazabilidad total

Eliminación de errores manuales

Inventario limpio desde el primer día

Flujo profesional de recepción de mercancía