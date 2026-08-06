# Casa Ideal — App móvil (SGI)

App Expo / React Native del **Sistema de Gestión de Inventario** (bodega + vendedores). Backend: Supabase compartido con el panel web.

## Roles en la app

| Rol | Tabs / flujos principales |
|-----|---------------------------|
| Bodeguero / inventario | Entradas, salidas (OE), órdenes |
| Vendedor | Negocios, cobrar, cartera, clientes |
| Gestor de cobro | Crea negocios (queda autoasignado), cobra su cartera asignada |
| Admin | Acceso amplio según permisos |

## Inicio rápido

```bash
npm install
npx expo start
```

Variables (EAS / `.env` según tu setup): URL y anon key de Supabase (`EXPO_PUBLIC_SUPABASE_*`).

## Estructura

- `app/` — rutas (Expo Router): tabs, auth, negocios, entradas/salidas
- `components/` — módulos (entries, exits, auth, theme, …)
- `types/database.types.ts` — tipos generados (sincronizar con web)

## Tipos Supabase

El esquema y las migraciones viven solo en
[`../frontend/supabase/migrations/`](../frontend/supabase/migrations/).
Los tipos se mantienen en `frontend/src/types/database.types.ts`; esta app solo
tiene una copia en `types/database.types.ts`.

Desde la raíz del monorepo:

```bash
# Copiar tipos web → móvil (uso habitual tras cambios locales)
../scripts/sync-db-types.sh --from-web

# Regenerar desde Supabase remoto (migraciones ya aplicadas)
../scripts/sync-db-types.sh <PROJECT_REF>
```

## Flujos documentados

- Entradas / producto desconocido: [`REGISTRO_ENTRADAS.md`](./REGISTRO_ENTRADAS.md)

## Tests

```bash
npm test
npm run test:ci
```

## Versión

Alineada con `app.json` → `expo.version` (**2.0.0**).
