# Sistema visual de Casa Ideal

La interfaz usa los tokens de `constants/theme.ts`; las pantallas no deben declarar colores de marca, radios o sombras de forma independiente.

## Componentes base

- `ScreenHeader`: título, descripción, icono y acción superior opcional.
- `ActionCard` y `StatCard`: accesos operativos y métricas.
- `SegmentedControl`, `SearchField` y `StatusChip`: filtros, búsquedas y estados.
- `ScreenState`: carga, vacío y error con una acción opcional.
- `Card`, `Button` e `Input`: mantienen su API anterior y soportan las variantes del sistema nuevo.
- `FloatingTabBar`: navegación principal; solo muestra Inicio, Inventario, Escáner, Salidas y Perfil.

## Reglas de composición

1. Usar fondo `colors.background.default` y superficies `colors.background.paper`.
2. Separar secciones con `Spacing.xl` o `Spacing.xxl`.
3. Reservar colores `success`, `warning` y `error` para significado, no para decoración.
4. En listas extensas, conservar `FlatList`, paginación y estados de actualización.
5. Comprobar cada pantalla en tema claro y oscuro antes de migrar la siguiente.
