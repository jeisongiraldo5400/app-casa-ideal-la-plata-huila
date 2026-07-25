# Casa Ideal — App móvil (SGI)

App Expo / React Native del **Sistema de Gestión de Inventario** (bodega + vendedores). Backend: Supabase compartido con el panel web.

## Roles en la app

| Rol | Tabs / flujos principales |
|-----|---------------------------|
| Bodeguero / inventario | Entradas, salidas (OE), órdenes |
| Vendedor | Negocios, cobrar, cartera, clientes |
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

Preferir el script del monorepo (desde la raíz):

```bash
../scripts/sync-db-types.sh <PROJECT_REF>
```

O desde aquí:

```bash
npx supabase gen types typescript --project-id <PROJECT_REF> --schema public > types/database.types.ts
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
