# Sistema visual de Casa Ideal

La interfaz usa los tokens de `constants/theme.ts`; las pantallas **no declaran colores, radios,
sombras ni tamaños de fuente por su cuenta**. Regla rápida: si un archivo fuera de `constants/theme.ts`
contiene un `#` hexadecimal, está mal.

## Tokens

| Token | Uso |
|---|---|
| `Spacing` xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · xxxl 32 | padding, gap, márgenes |
| `Radius` chip 10 · control 12 · icon 14 · card 18 · panel 24 · pill | chips, botones/inputs, cuadros de icono, tarjetas, modales |
| `IconSize` sm 18 · md 22 · lg 26 | `MaterialIcons size` |
| `Shadows.card` / `Shadows.floating` | tarjetas elevadas / barra flotante |
| `getColors(isDark)` | siempre vía `useTheme()`; nunca el `Colors` estático (deprecado) |

Colores especiales: `text.tertiary`, `text.inverse`, `text.disabled`; `onPrimary.{text,textMuted,border,chipBg}`
para texto sobre `primary.main` / `navigation.background`; `overlay` para fondos de modal.

### Tipografía (`Typography`)

| Rol | Tamaño / alto / peso | Uso |
|---|---|---|
| `display` | 32 / 38 / 800 | pantallas de bienvenida |
| `title` | 28 / 34 / 800 | título de `ScreenHeader` |
| `headline` | 22 / 28 / 800 | cifras destacadas, nombre en hero |
| `section` | 19 / 24 / 800 | títulos de sección y header nativo |
| `body` / `bodyStrong` | 15 / 21 | texto principal |
| `bodySmall` / `bodySmallStrong` | 14 / 20 | texto en tarjetas |
| `caption` | 13 / 18 / 400 | ayudas y descripciones |
| `metadata` | 12 / 17 / 500 | fechas, conteos, pistas |
| `label` | 11 / 14 / 800, mayúsculas | etiquetas de `Metric`, eyebrows |
| `button` | 16 / 20 / 700 | texto de `Button` |

## Componentes base (`@/components/ui`)

- Estructura: `ScreenHeader`, `SectionHeader` (título + pista o acción), `ActionBar` (pie fijo de acciones).
- Navegación y acciones: `FloatingTabBar`, `BackButton`, `Button` (variantes, `size="sm"`, `icon`, `loading`),
  `IconButton` (opcional `label`), `HeroActionCard` (acción principal sobre fondo oscuro), `ActionCard`.
- Datos: `StatCard`, `Metric` (etiqueta/valor, `tone`, `inverse` para héroes), `StatusChip`, `ListCard`
  (fila de lista, pulsable si recibe `onPress`), `Card`.
- Entrada y filtros: `Input`, `SearchField`, `SegmentedControl`, `OptionPickerField`.
- Estados: `ScreenState` (carga, vacío, error; `variant="inline"` dentro de listas; `tone="error"`),
  `Pagination`, `ScreenErrorBoundary`.
- Modales: `ModalSheet` (diálogo centrado con overlay, header y pie) y `FullScreenModal` (pantalla
  completa con área segura, header con cierre y pie opcional en `ActionBar`).

Los tonos de estado de negocios y cuotas salen de `negocioStatusTone` / `cuotaStatusTone`
(`lib/negocioLabels.ts`), no de condicionales en pantalla.

## Reglas de composición

1. Fondo `colors.background.default`; superficies `colors.background.paper`.
2. Separar secciones con `Spacing.xl` o `Spacing.xxl`; dentro de una sección, `Spacing.md`.
3. `success`, `warning` y `error` solo con significado; nunca como decoración.
4. Objetivos táctiles de 44 px como mínimo (`Button size="sm"`, `IconButton`, `ListCard`).
5. Toda pantalla tiene estados de carga, vacío y error con `ScreenState`; los errores no se
   disfrazan de "lista vacía".
6. Listas extensas con `FlatList` y `RefreshControl`; listas cortas dentro de un `ScrollView` con `Pagination`.
7. Componentes de feature (`components/<feature>/components`) toman colores de `useTheme()`, no por props.
8. Comprobar cada pantalla en tema claro y oscuro antes de migrar la siguiente.
9. Área segura: la app corre con `edgeToEdgeEnabled`, así que todo lo que se dibuje fuera del
   navegador debe leer `useSafeAreaInsets()`. Modal a pantalla completa → `FullScreenModal`
   (nunca `presentationStyle="pageSheet"`: Android lo ignora y pinta desde y = 0). Hoja inferior →
   `paddingBottom: Math.max(insets.bottom, Spacing.xxl)` en el contenedor de la hoja. Pie fijo →
   `ActionBar`.

## Flujos de inventario (`@/components/inventory-flow`)

Entradas y salidas comparten los mismos bloques, en este orden: **configurar → escanear → revisar
producto → revisar sesión → éxito**. Ninguna de las dos pantallas tiene ya un paso de "confirmación"
aparte: el resumen vive en el último paso del `SetupForm`.

- `FlowStepper` (pasos reales del formulario), `SessionProgressHeader` (destino + avance sobre la orden),
  `ScanSessionBar` (sobre el escáner: "N productos · M unidades" y últimos agregados).
- `ProductReviewSheet`: hoja inferior sobre la lista para confirmar cantidad; el módulo mete su contenido
  (bodega, stock físico, métricas) como `children`. `FlowMetric` para las métricas.
- `SessionItemCard` (+/− de 44 px, quitar con `UndoToast`), `PendingItemCard`, `SessionReviewScreen`,
  `SuccessScreen`, `ErrorBanner` (mensaje + acción contextual + cerrar).
- Los estados de órdenes de compra y de entrega se pintan con `StatusChip` y los tonos de
  `lib/inventoryOrderLabels.ts` (`purchaseOrderStatusTone`, `deliveryOrderStatusTone`).
- Los selectores de proveedor/bodega/usuario/tipo de salida son envoltorios de `OptionPickerField`.
- Solo `finalizing` (el RPC de registro) muestra modal bloqueante; el resto de cargas van en línea.

## Pendiente de migrar (fase 2)

`negocio-create.tsx`, `SignaturePad`, `NegocioItemsList`, `NegocioProductAddSection`, `NegocioDatePicker`,
`cartera/` (pantalla principal y `CollectionManagerPaymentsModal`), `collection-routes/`, `ruta-cobros/`,
`inventory/WarehouseFilter` y los demás consumidores del `Colors` estático en `auth` y `scanning`
(`components/entries` y `components/exits` ya están migrados).
