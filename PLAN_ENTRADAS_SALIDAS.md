# Plan de implementación — Entradas y Salidas de inventario

Fecha: 2026-09-02 · Alcance: `app/(tabs)/entries.tsx`, `app/(tabs)/exits.tsx`, `components/entries/**`, `components/exits/**`
Línea base: 51 tests verdes (7 suites), 3 errores TS (solo en `EntryScanningWorkspace.test.tsx:113-114`), árbol de trabajo limpio.

---

## 1. Diagnóstico

### 1.1 Arquitectura actual (ambos módulos)

| | Entradas | Salidas |
|---|---|---|
| Pasos (`step`) | `flow-selection → setup → confirmation → scanning → product-form` | `setup → confirmation → scanning` |
| Sub-máquina en workspace (`uiStage`) | `idle → product_review → entry_review → success` | `idle → product_review → exit_review → success` |
| Store | `entriesStore.ts` **1.719 líneas** | `exitsStore.ts` **2.142 líneas** |
| Persistencia | RPC `register_inventory_entries_batch` + idempotency key | RPC `register_inventory_exits_batch` + fingerprint |
| Guard contra reset | `resetGeneration` (parcial) | solo en búsqueda de clientes (`:616-633`) |
| Asignación a orden | por `product_id` contra PO | FIFO por `(product, warehouse)` (`fifoDeliveryAllocation.ts`) pero el escaneo elige línea **solo por `product_id`** |

Ambos módulos duplican entre sí `ProductReview`, `SessionCard`, `*Review`, `Success`, stepper del SetupForm y modal de carga; y dentro de entradas el cálculo de progreso de PO está implementado **3 veces** (`entriesStore.ts:738-812`, `PurchaseOrderProgress.tsx:25-96`, `EntryScanningWorkspace.tsx:58-64`).

### 1.2 Bugs — Críticos (afectan datos)

| ID | Módulo | Descripción | Ubicación |
|---|---|---|---|
| **E1** | Salidas | El escaneo filtra líneas de la orden **solo por `product_id`** y toma la más antigua con pendiente, en cualquier bodega. Con el mismo producto en 2 bodegas, cuando se llena la línea de la bodega X el siguiente escaneo descuenta silenciosamente de la bodega Y. El operario no puede elegir. | `exitsStore.ts:1342` |
| **E2** | Salidas | **El stock físico nunca se consulta ni se muestra.** `fetchWarehouseStock` existe pero no se usa. El mensaje "No hay suficiente stock. Disponible: N" muestra en realidad el pendiente de la orden. Un exceso de stock solo aparece como error genérico del RPC al finalizar. | `exitsService.ts:80`, `exitsStore.ts:1540` |
| **E3** | Salidas | Sin generation guard en `selectDeliveryOrder` / `searchDeliveryOrdersBy*` / `scanBarcode` / `finalizeExit`. Secuencia: seleccionar orden A → escribir otro cliente (limpia la orden) → llega la respuesta de A → se abre la confirmación de la orden de otro cliente. El reset a 400 ms tras perder foco pone `loading:false` y las promesas en vuelo escriben sobre el store ya reseteado (`scanBarcode` repobla `currentProduct`; `finalizeExit` relanza `selectDeliveryOrder` con 5+ consultas). | `exits.tsx:49-54`, `exitsStore.ts:1076-1087, 1410-1419, 1990, 2019`, `DeliveryOrderSelector.tsx:71` |
| **E4** | Salidas | `searchCustomersByTerm` interpola el texto del usuario dentro de un filtro PostgREST `.or(...)`. Comas, paréntesis o `%` rompen o alteran la consulta. | `exitsService.ts:50-52` |
| **N1** | Entradas | `updateProductQuantity` valida contra la PO solo si `entryType === 'PO_ENTRY'`, mientras `addProductToEntry` valida siempre que haya `purchaseOrderId`. El stepper +/– puede superar la cantidad de la orden. | `entriesStore.ts:1149` vs `:1042` |

### 1.3 Bugs — Altos

| ID | Módulo | Descripción | Ubicación |
|---|---|---|---|
| E5 | Salidas | `searchProductByBarcode` devuelve `null` ante **cualquier** error (incluida red) → el usuario ve "código no registrado" en un fallo de conexión. | `exitsStore.ts:1460-1464` |
| E6 | Salidas | `getActiveCancelledExitIds` devuelve set vacío ante error → salidas canceladas se cuentan como entregadas. | `exitsStore.ts:255-258` |
| E7 | Salidas | Tope **por línea** en el review (`currentAvailableStock = pending` de la línea) vs tope **agregado** en `addProductToExit`/`updateProductQuantity`. Con dos líneas de 3 unidades hay que escanear el mismo SKU dos veces. | `exitsStore.ts:1408, 1531, 1655`; `ExitScanningWorkspace.tsx:484, 514` |
| N2 | Entradas | Reset a 400 ms pone `loading:false` con el RPC de `finalizeEntry` en vuelo. La escritura en DB puede tener éxito mientras la UI se resetea: el carrito desaparece sin ningún mensaje. | `entries.tsx:29-33`, `entriesStore.ts:1242, 1672` |
| A1 | Ambos | Todos los `load*` (proveedores, bodegas, usuarios, validaciones de PO) tragan errores a `console.error` y dejan listas vacías sin aviso. `DeliveryOrderSelector` pinta "No hay remisiones pendientes" **antes** de evaluar `error`. | `entriesStore.ts:505-508, 562-564, 567-736`; `exitsStore.ts:598-611`; `DeliveryOrderSelector.tsx:89-101 vs :115` |

### 1.4 Bugs — Medios

- Salidas: "Este producto ya fue entregado completamente" también salta cuando el resto se agregó en la **sesión actual** (`exitsStore.ts:1363`).
- Salidas: validación duplicada e inalcanzable en `addProductToExit` (`:1501` y `:1513-1543`); `targetOrderItemId` se calcula pero no se usa para asignar.
- Salidas: `finalizeExit(userId)` ignora `userId` (`:1699`); `pendingExitRequests` nunca se limpia en reset (`:242`).
- Salidas: `router.back()` desde una pantalla de tab no tiene historial (`SetupForm.tsx:395, 402`).
- Ambos: doble fetch en montaje (`useEffect` + `useFocusEffect` hacen lo mismo: exits `SetupForm.tsx:83-85, 97-104`; entries `SetupForm.tsx:62-70, 72-76`).
- Salidas: autorización de 4 round-trips en select **y** de nuevo en finalize (`:1059, :1774`); `selectDeliveryOrder` completo tras finalizar cuyo resultado no se muestra (`:2019`).
- Entradas: `finalizeEntry` re-consulta `warehouses`, `products` y `purchase_orders` **en serie** (`:1346-1421`), sin `Promise.all`.
- Ambos: `useExitsStore()` / `useEntriesStore()` sin selector en workspaces, SetupForm y selector → re-render en cada cambio del store.
- Ambos: modal de carga global bloqueante (`onRequestClose` no-op) en cada escaneo (salidas) y en cargas rápidas como "Cargando detalles…" (entradas).

### 1.5 Deuda / bajo

- **Código muerto (≈1.500 líneas)** — verificado sin importadores fuera de los barrels, que a su vez nadie consume:
  - Entradas: `ProductFound.tsx`, `QuantityInput.tsx`, `UnregisteredBarcodeAlert.tsx`, `EntryItemsList.tsx`, `PurchaseOrderProgress.tsx`, `EntrySessionContext.tsx`.
  - Salidas: `ProductFound.tsx`, `QuantityInput.tsx` (permite 0), `ExitItemsList.tsx` (finalize sin guard), `DeliveryOrderProgress.tsx`, `ExitSessionContext.tsx`, `utils/translations.ts`, `exitsService.fetchProductByBarcode`, store `warehouses/loadWarehouses/setWarehouse`, `useExits` (alias trivial), estilos `scanCard…cancelButton` en `exits.tsx:124-182`.
- **Sistema de diseño** (viola `components/ui/README.md`): 6 archivos de entradas importan el `Colors` estático deprecado; hex en `PurchaseOrderSelector.tsx:345, 413, 423` y ~20 en `translations.ts`; tamaños y `fontWeight:'800'` hardcodeados en workspaces, SetupForms y `DeliveryOrderSelector` (solo `ExitOrderConfirmation` usa `Typography`); JSX de una sola línea (`EntryScanningWorkspace.tsx:300-302`, `ExitScanningWorkspace.tsx:543-546`).
- `any` en callbacks de Supabase (`exitsStore.ts:686-1035`, `entriesStore.ts:369-548`), `Finalize*Result.error: any`, `as never` en router (`ExitScanningWorkspace.tsx:227`).
- `console.log` en producción: `entriesStore.ts:485, 917-921`; `EntryScanningWorkspace.tsx:48-56`.
- Cámara montada con `opacity:0` durante el review (batería).

### 1.6 UX

| Problema | Entradas | Salidas |
|---|---|---|
| Pasos hasta el primer escaneo | Hasta **7 pantallas** en `PO_ENTRY` | ~10–11 toques para una salida de 1 ítem |
| Pantalla `confirmation` | Redundante: repite lo elegido en SetupForm | Redundante y además duplicada con la observación del `exit_review` |
| Stepper | — | Dice "Destino / Orden / Confirmar" pero Confirmar es otra pantalla y Escanear no aparece |
| Loading | Modal global en cargas rápidas | Modal global **en cada escaneo** |
| Lista en curso | Solo en `idle`; invisible durante review/escaneo | Igual; pestaña "Pendiente" oculta ítems en 0 aunque la ayuda diga "Estado completo" |
| Stock | n/a | Nunca se ve stock físico, ni antes ni después de la cantidad |
| Re-escaneo | Se fusiona bien, pero "Ya agregado" es un tile neutro fácil de pasar por alto | Mismo SKU en varias líneas obliga a re-escanear |
| Undo | No hay tras "Quitar" | No hay; cancelar en setup pide confirmación aunque solo se eligió el modo |
| Errores | Banner genérico | Mismo banner; "Reintentar" siempre abre el escáner aunque el error sea de cantidad; error duplicado al pie |
| Accesibilidad | +/–, quitar, segmented sin `accessibilityLabel`/`role` | Igual; targets de 36 px (< 44 px regla 4); barras sin `accessibilityValue` |
| Offline | Sin manejo | Sin manejo |
| Fortaleza | Haptics en escaneo/agregar/finalizar; "Agregar y escanear siguiente" | Igual |

---

## 2. Diseño objetivo (compartido por ambos módulos)

```
[1] Configurar ─────► [2] Escanear ─────► [3] Revisar producto ─────► [4] Revisar y registrar ─────► [5] Éxito
 stepper real          cámara +             bottom sheet sobre           lista editable +               "Registrar otra"
 resumen en el         barra persistente    la lista (no pantalla        ActionBar fijo                 conserva la config
 último paso           "N prod · M uds"     completa)
 (sin pantalla         + últimos 3 ítems    · pendiente de orden
  Confirmar)                                · stock físico (salidas)
                                            · "ya agregado" en warning
                                            · selector de bodega
```

Principios:
1. **Una sola configuración**: el resumen vive en el último paso del stepper y reemplaza `EntryConfirmation` / `ExitOrderConfirmation`.
2. **Contexto siempre visible**: `ScanSessionBar` con contador y últimos ítems mientras se escanea; el review es un `ModalSheet` sobre la lista.
3. **Información para decidir** (salidas): pendiente de la orden **y** stock físico de la bodega, con selector cuando hay más de una línea candidata.
4. **Carga inline, no modal**: `Button loading`, `ScreenState variant="inline"`; modal bloqueante solo durante `finalizing`.
5. **Errores accionables**: `ScreenState tone="error"` con la acción correcta (reintentar búsqueda / corregir cantidad / abrir escáner).
6. **Reversible**: snackbar de deshacer 5 s tras quitar; "Registrar otra" preserva proveedor/orden/bodega.
7. **Accesible**: targets ≥ 44 px, `accessibilityLabel`/`role` en todo control, `accessibilityValue` en barras.

---

## 3. Fases

### Fase 0 — Limpieza y red de seguridad · ½–1 día
1. Borrar los archivos muertos listados en 1.5 y sus exports en `index.ts`; borrar estilos sin uso de `exits.tsx`; eliminar `console.log`; corregir los 3 errores TS del test.
2. **Antes de tocar lógica**, añadir tests de los huecos que Fase 1 va a modificar:
   - salidas: `scanBarcode` con producto en 2 bodegas, `validateProductAgainstOrder`, `updateProductQuantity`/`removeProductFromExit` (deltas de progreso), `finalizeExit` (idempotencia, mapeo de error), reset durante `selectDeliveryOrder`.
   - entradas: `updateProductQuantity` vs PO en `ENTRY` con `purchaseOrderId`, reset durante `finalizeEntry`.
3. Criterio: `npx tsc --noEmit` sin errores en `entries|exits`; `npx jest components/entries components/exits` verde.

### Fase 1 — Corrección de bugs de datos · 2–3 días
| # | Acción | Cierra |
|---|---|---|
| 1.1 | `scanBarcode` devuelve `candidateLines[]` (líneas con pendiente para el producto, agrupadas por bodega). Si hay 1, se asigna; si hay >1, el review muestra selector de bodega. `addProductToExit` usa `targetOrderItemId` + `warehouseId`; FIFO se calcula por `(product, warehouse)`. | E1, E7 |
| 1.2 | En `scanBarcode`, llamar `fetchWarehouseStock(product, warehouse)` en paralelo con el lookup; guardar `currentPhysicalStock`; validar `qty ≤ min(pendiente, stock)`; mostrar ambos en el review. Corregir el texto del error `:1540`. | E2 |
| 1.3 | Generation guard único en el store de salidas (reutilizar patrón `:616-633`) aplicado a `selectDeliveryOrder`, `search*`, `scanBarcode`, `finalizeExit`; `resetAll` incrementa la generación. Deshabilitar el `TextInput` de cliente mientras carga una orden. | E3 |
| 1.4 | Entradas: `resetAll` no pone `loading:false` si hay `finalizeEntry` en vuelo; guardar `lastFinalizeResult` y mostrar "La entrada se registró" al volver si el RPC terminó tras el reset. | N2 |
| 1.5 | Sanitizar el término de búsqueda de clientes: escapar `, ( ) %` o usar dos `.ilike` encadenados / RPC. | E4 |
| 1.6 | `updateProductQuantity` (entradas) valida si `purchaseOrderId`, sin condición de `entryType`. | N1 |
| 1.7 | `searchProductByBarcode` distingue error de red (lanza) de no encontrado (`null`); `getActiveCancelledExitIds` propaga el error. | E5, E6 |
| 1.8 | Loaders setean `error` y los pickers lo muestran con `ScreenState tone="error"` + reintentar; `DeliveryOrderSelector` evalúa `error` antes que vacío. | A1 |
| 1.9 | Mensaje "ya entregado" distingue sesión vs DB; eliminar validación duplicada `:1513-1543`; usar o quitar `userId`; limpiar `pendingExitRequests` en reset; eliminar doble fetch (dejar solo `useFocusEffect`); `Promise.all` en `finalizeEntry`; no repetir autorización en finalize si ya se validó para la misma orden/usuario; no recargar la orden tras finalizar (usar `progressData` del RPC). | Medios |

Criterio: tests de Fase 0 verdes + prueba manual con producto en 2 bodegas y cambio de tab durante finalize en ambos módulos.

### Fase 2 — Rediseño de flujo compartido · 3–4 días
| # | Acción |
|---|---|
| 2.1 | Crear `components/inventory-flow/` con `FlowStepper`, `ScanSessionBar`, `ProductReviewSheet` (`ModalSheet` + métricas + stepper 44 px + selector de bodega), `SessionItemCard` (+/–, quitar con undo), `SessionReview`, `SuccessScreen`. Ambos workspaces pasan a componer estos bloques. |
| 2.2 | Eliminar el paso `confirmation` de `EntryStep`/`ExitStep`: el último paso del stepper muestra el resumen y "Comenzar a escanear". Actualizar `exitsConfirmation.test.ts`, `ExitOrderConfirmation.test.tsx` y los tests de store de entradas. |
| 2.3 | Separar `finalizing` de `loading`. Modal bloqueante solo con `finalizing`; el resto es carga inline. Quitar el modal de cada escaneo. |
| 2.4 | Errores con `ScreenState tone="error"` y acción según tipo (`network` → reintentar, `quantity` → volver al review, `not_found` → crear producto / escanear otro). |
| 2.5 | Snackbar de deshacer tras quitar; "Registrar otra" conserva configuración y genera **nueva** idempotency key. |
| 2.6 | Accesibilidad: labels/roles en +/–, quitar, segmented, back; targets ≥ 44 px; `accessibilityValue` en barras de progreso. |

Criterio: `PO_ENTRY` ≤ 4 pantallas hasta el primer escaneo; salida de 1 ítem ≤ 7 toques; lista visible en todo momento durante el escaneo.

### Fase 3 — Sistema de diseño · 1–2 días
- Migrar a `useTheme()` los archivos de entradas que sigan importando `Colors` estático tras Fase 0; sustituir hex de `PurchaseOrderSelector`; los tonos de estado de órdenes pasan a `lib/deliveryOrderLabels.ts` con tonos semánticos (patrón `negocioStatusTone`).
- `Typography`/`Spacing`/`Radius` en workspaces, SetupForms y `DeliveryOrderSelector`; reformatear los JSX de una línea.
- Verificar tema claro y oscuro (regla 8 del README) y actualizar la sección "Pendiente de migrar".

### Fase 4 — Store y robustez · 2–3 días (recomendable)
- Selectores (`useShallow`) en `useExitsStore`/`useEntriesStore` para cortar re-renders.
- Dividir cada store en slices: `setup`, `catalog` (proveedores/bodegas/usuarios), `order` (PO/DO + progreso), `session` (carrito + escaneo), `finalize`. Objetivo < 500 líneas por slice; tipar respuestas con los tipos de `Database` y eliminar `any`.
- Cámara: `active={false}` / desmontar durante el review.
- Offline básico: `NetInfo` → banner y bloqueo de finalize con mensaje claro (cola offline fuera de alcance).

---

## 4. Orden, dependencias y estimación

`0 → 1 → 2 → 3 → 4`. Fase 3 puede ir en paralelo con Fase 2 si se hace archivo por archivo. **Total: 9–13 días.**

## 5. Riesgos
- **1.1** toca la asignación por bodega: confirmar que `register_inventory_exits_batch` y `update_delivery_order_progress` filtran por `warehouse_id` (este último ya se corrigió).
- **2.2** elimina un paso que tienen tests existentes; migrarlos, no borrarlos.
- **2.5** al conservar configuración hay que garantizar una idempotency key nueva por registro.
- **1.3** los guards deben cubrir también el `Modal` de carga: si el reset ocurre con `finalizing`, no ocultar el modal.

## 6. Verificación
- `npx jest components/entries components/exits` · `npx tsc --noEmit`.
- Checklist manual: producto en 2 bodegas · cambiar de tab durante finalize · sin red al escanear · cliente con coma en el nombre · stepper superando la PO · tema oscuro · Android back durante carga.

---

## 7. Estado de ejecución (2026-09-02)

Las 5 fases quedaron implementadas en la rama `feat/negocios` (sin commit; ver `git status`).

| Fase | Resultado |
|---|---|
| 0 | 12 archivos muertos borrados, barrel limpio, `console.log` fuera, 3 errores TS del test corregidos. |
| 1 | E1–E7, N1, N2 y A1 cerrados. Nuevos: `warehouseCandidates` + `selectScanWarehouse`, stock físico (`currentPhysicalStock`, `ExitItem.physicalStock`), `sessionGeneration` en salidas, `lastFinalizeResult` en ambos, `sanitizeSearchTerm`, `catalogError`/`usersError`. 22 tests nuevos. |
| 2 | `components/inventory-flow/` (11 bloques). Paso `confirmation` eliminado en ambos módulos (`ExitOrderSummary` inline; resumen en el paso de bodega de entradas). Revisión de producto como bottom-sheet, `ScanSessionBar`, deshacer con `restoreExitItem`/`restoreEntryItem`, `startNewSession`, `finalizing` separado de `loading`. |
| 3 | 0 hex, 0 `Colors` estático, tokens en todos los `StyleSheet`; `lib/inventoryOrderLabels.ts`; los 5 pickers son envoltorios de `OptionPickerField`; README actualizado. |
| 4 | `useShallow` en consumidores y en `useExits`/`useEntries`; 0 `any` en los stores; consultas y autorización extraídas a `deliveryOrderQueries.ts`, `exitAuthorization.ts`, `entriesQueries.ts`, `orderAllowance.ts`; `useNetworkStatus` + bloqueo de registro sin red; cámara ya pausada vía `active={false}`. |

Verificación: `npx tsc --noEmit` → 0 errores; `npx jest` → 48 suites / 244 tests verdes.
Pendiente manual (no verificable aquí): recorrido en dispositivo con producto en 2 bodegas, cambio de pestaña durante el registro y tema oscuro.
