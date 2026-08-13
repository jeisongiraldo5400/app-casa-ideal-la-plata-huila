# AGENTS.md — Casa Ideal (app móvil)

Instrucciones para agentes que trabajan en la app móvil del SGI Casa Ideal.

Actúa como un Ingeniero de Software Senior con criterio arquitectónico fuerte (Clean / Hexagonal **cuando aporte valor**), experto en React Native / Expo / TypeScript con Supabase. Objetivo: analizar, diseñar e implementar requisitos con escalabilidad, mantenibilidad y robustez — sin sobre-ingeniería.

**Alcance por defecto:** este directorio (`app-casa-ideal/`).  
El panel web vive en `../frontend/` y **no** se modifica salvo petición explícita.  
Las migraciones Supabase viven solo en `../frontend/supabase/migrations/` (fuente de verdad).

---

# Mobile Architecture Rules

El proyecto utiliza:

- React 19 + React Native
- TypeScript + TSX
- Expo (~54) + Expo Router
- Zustand (estado de flujo / sesión de módulo)
- Formik + Yup (formularios)
- Supabase (`@supabase/supabase-js`)
- AsyncStorage / SecureStore según el caso
- Jest + jest-expo + Testing Library
- **bun** como package manager

No hay TanStack Query ni MUI en esta app. No introducirlos sin justificación y aprobación.

## Roles y flujos principales

| Rol | Flujos típicos en la app |
|-----|--------------------------|
| Bodeguero / inventario | Entradas, salidas (OE), órdenes, inventario |
| Vendedor | Negocios, cobrar, cartera, clientes |
| Gestor de cobro | Negocios (autoasignados), cobrar su cartera |
| Admin | Acceso amplio según permisos / tabs |

Documentación de entradas: `REGISTRO_ENTRADAS.md`.

## Mapa del código

| Área | Ruta |
|------|------|
| Rutas (Expo Router) | `app/` — `(auth)`, `(tabs)`, `negocio/`, `ruta-cobros/` |
| Features | `components/<feature>/` |
| Shared / dominio ligero | `lib/` (supabase, credit, cartera, collection-routes, idempotency, …) |
| Hooks globales | `hooks/` (`useUserRoles`, dashboard, theme) |
| UI base | `components/ui/`, `constants/theme.ts` |
| Tipos DB | `types/database.types.ts` (**copia**; sync desde web) |
| Auth | `components/auth/` + guard en `app/_layout.tsx` |

Patrón preferido por feature:

```text
components/<feature>/
  components/                 # UI / presentational
  infrastructure/
    hooks/                    # Coordinación (Formik, efectos)
    services/                 # Acceso a datos / RPC / catálogos
    store/                    # Zustand del flujo (sesión de trabajo)
  utils/                      # Helpers del módulo (si aplica)
  index.ts                    # API pública del módulo (preferido)
```

Equivalencia pragmática con Clean/Hexagonal:

| Clean / Hexagonal | En esta app |
|-------------------|-------------|
| Dominio | `lib/*` puros + utils/validators del módulo |
| Casos de uso / aplicación | hooks + acciones de store delgadas + services |
| Adaptadores de UI | `components/<feature>/components`, pantallas en `app/` |
| Infraestructura | `infrastructure/services`, `lib/supabase.ts` |
| Puerto público | `components/<feature>/index.ts` (o exports explícitos) |

## 1. Arquitectura (Clean / Hexagonal — con juicio)

- Analiza el requerimiento con principios Clean/Hexagonal.
- **Capas estrictas solo con reglas de negocio reales** (FIFO/salidas, crédito, cobros, idempotencia, stock, firmas).
- En pantallas/listas simples: ruta delgada + componente + service/store pequeño.
- La lógica de negocio no debe depender de React Native, Expo Router, cámara ni AsyncStorage.
- Dependencias hacia adentro: `app/` → components UI → hooks/store → services/domain → Supabase.
- `app/` debe permanecer **delgado** (routing, wiring, composición). Evitar pantallas de miles de líneas con I/O directo.

## 2. Modularización y límites claros

- Priorizar features con límites funcionales claros (entries, exits, purchase-orders, negocios, cartera, collection-routes, inventory, auth, reports).
- Alta cohesión, bajo acoplamiento; no importar internals profundos de otro feature si se puede exportar desde su `index`.
- No mover a `components/ui` o `lib/` lógica específica de un flujo de bodega/crédito.
- Compartir con el web solo lo genérico de dominio ya existente (`creditCalculator`, `localDate`, `idempotency`, labels) — mantener alineado, no divergir en silencio.

## 3. Zustand y stores (punto crítico)

Los stores grandes (`entriesStore`, `exitsStore`, etc.) son deuda conocida.

- **Nuevo código:** preferir `services/` para I/O y catálogos; el store orquesta estado de sesión (items escaneados, selección, flags UI).
- No meter nuevas consultas Supabase enormes dentro del store si pueden vivir en un service testeable.
- Extraer reglas puras (validaciones, cálculo de progreso, FIFO helpers) fuera del store.
- No convertir Zustand en “React Query casero” para listados que no son sesión de trabajo; si hace falta caché de servidor, valorar un hook/service con estado local acotado antes de inflar el store.
- Limpiar listeners/subscripciones en `cleanup` (auth/theme ya lo hacen).

## 4. Calidad, SOLID y DRY

- SOLID con sentido práctico en stores, hooks y componentes.
- TypeScript estricto: **evitar `any` nuevos**. Preferir tipos de `database.types.ts`, tipos locales o `unknown` + narrowing.
- DRY sin abstracción prematura; duplicidad pequeña y clara > factory genérica frágil.
- Código autodescriptivo; comentarios solo para contexto no obvio (escáner, idempotencia, offline).

Buscar duplicidad en: JSX nativo, stores, services, validaciones, formularios, transformaciones, errores, consultas, mutaciones, flujos de escaneo.

## 5. Componentes, pantallas y hooks

**Pantallas (`app/`)**

- Routing + composición; delegar UI a `components/<feature>`.
- Respetar visibilidad de tabs/rutas por rol (`useUserRoles`).

**Componentes**

- Dividir cuando haya secciones funcionales independientes (selección de flujo, escáner, lista de ítems, confirmación).
- No subir a UI global piezas con reglas de negocio.
- Flujos Create vs detalle/edición: compartir secciones, no forzar un solo mega-formulario.

**Hooks**

- Dividir por responsabilidades independientes, no solo por líneas.
- Evitar un hook que mezcle cámara, Supabase, Formik, navegación y permisos a la vez.
- Auth: `useAuth` / `authStore`; roles: `useUserRoles`.

## 6. Datos, tipos y backend

- Cliente: `lib/supabase.ts`.
- Tipos: `types/database.types.ts`. Tras cambios de schema en web:

```bash
# Desde la raíz del monorepo
../scripts/sync-db-types.sh --from-web
```

- **No** inventar migraciones solo en `app-casa-ideal/supabase/`; la fuente de verdad es `frontend/supabase/migrations/`.
- Preferir RPCs existentes del web cuando el flujo ya esté definido allí (entradas/salidas/OE/negocios).
- Usar idempotency keys (`lib/idempotency`) en operaciones críticas de escritura.

## 7. Testing

- Jest (`bun test` / `bun run test:ci`).
- Priorizar tests de dominio/services/utils y reglas (FIFO, credit, route state, stores parciales).
- Hay tests en `lib/__tests__/`, `components/entries/.../__tests__/`, `lib/collection-routes/__tests__/`, etc. — seguir esos patrones.
- Diseñar código nuevo para ser testeable (services puros, menos I/O dentro de UI).

## 8. Reglas de interacción del agente

- Package manager: **bun**.
- No alucinar dependencias nativas/Expo; cualquier lib nueva debe justificarse (y considerar EAS/build).
- **Planificación previa:** viñetas con archivos a crear/modificar y propósito antes del código.
- Entregas completas: no dejar `// TODO: implementar el resto`.
- No cambiar el stack (añadir React Query, cambiar Formik, etc.) sin aprobación.
- Cuidado con permisos nativos (cámara, etc.): no pedir permisos que el flujo no use.

## 9. Antes de modificar código

1. Analizar el módulo completo (`app/` + `components/<feature>` + `lib` relacionado).
2. Identificar responsabilidades (UI vs sesión vs I/O vs reglas).
3. Detectar problemas (store dios, pantalla gorda, acoplamiento).
4. Proponer solución (service extract, split UI, domain puro, etc.).
5. Mostrar archivos afectados.
6. Esperar aprobación antes de una refactorización grande.

## 10. Al implementar (tras aprobación)

- Extracciones incrementales; no reescribir stores enteros de una vez sin plan.
- Ejecutar `bun test` y, si aplica, flujos manuales de escaneo/login por rol.
- Mantener comportamiento existente salvo que el requerimiento diga lo contrario.
- Si tocas lógica compartida con el web (`creditCalculator`, labels, fechas), alinear ambos lados o documentar la divergencia.

## Qué no hacer

- Clean Architecture ceremonial (ports/adapters vacíos) en pantallas simples.
- Inflar más `entriesStore` / `exitsStore` con I/O que debería ir a `services/`.
- Duplicar tipos DB a mano; usar el script de sync.
- Modificar migraciones solo en la app móvil.
- Mover reglas de bodega/crédito a `components/ui`.
- Introducir librerías de navegación/estado alternativas sin necesidad.
- Tocar el panel web (`../frontend/`) salvo pedido explícito.
