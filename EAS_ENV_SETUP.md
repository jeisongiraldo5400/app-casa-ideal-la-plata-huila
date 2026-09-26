# Variables de entorno en EAS (build de producción)

La app lee su configuración de variables que EAS inyecta al compilar. Si falta
alguna, la app puede no abrir (Supabase) o quedarse sin reportes de fallos
(Sentry). Se configuran **una sola vez** en el entorno `production` de EAS; el
perfil `production` de `eas.json` ya apunta a ese entorno
(`"environment": "production"`).

> Los comandos `eas secret:create` están obsoletos: usa `eas env:create`.
> Si ya existen secretos viejos con el mismo nombre, bórralos o migra con
> `eas env:list` / `eas env:delete` para no tener dos fuentes.

## 1. Variables de la app (van dentro del bundle)

Las `EXPO_PUBLIC_*` se incrustan en el JavaScript de la app, así que no pueden
ser `secret`: usa visibilidad `plaintext` o `sensitive`.

```bash
eas env:create --environment production --visibility plaintext \
  --name EXPO_PUBLIC_SUPABASE_URL --value "https://<proyecto>.supabase.co"

eas env:create --environment production --visibility sensitive \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<clave anónima de Supabase>"

# Reporte de fallos (crashes nativos y de pantalla). Sin DSN, Sentry no se inicia.
eas env:create --environment production --visibility sensitive \
  --name EXPO_PUBLIC_SENTRY_DSN --value "https://<clave>@<org>.ingest.sentry.io/<id>"

# Endpoint del panel web que despacha las notificaciones push.
eas env:create --environment production --visibility plaintext \
  --name EXPO_PUBLIC_NOTIFICATIONS_DISPATCH_URL --value "https://<panel>/api/notifications/dispatch"

# Origen del web de catálogos (sin barra final): enlaces <origen>/c/<token>.
eas env:create --environment production --visibility plaintext \
  --name EXPO_PUBLIC_CATALOG_SITE_URL --value "https://catalogo.<dominio>"
```

## 2. Sentry: subida de source maps

El plugin `@sentry/react-native` (en `app.json`) y `metro.config.js`
(`getSentryExpoConfig`) dejan el build listo para subir los source maps a
Sentry, así los errores llegan con archivo y línea reales en vez de código
minificado. Organización y proyecto **no** van en `app.json`: el plugin los toma
de estas variables del entorno de build.

```bash
# Token de Sentry con permiso project:releases (Settings → Auth Tokens).
eas env:create --environment production --visibility secret \
  --name SENTRY_AUTH_TOKEN --value "<token>"

# Slug de la organización y del proyecto en Sentry.
eas env:create --environment production --visibility plaintext \
  --name SENTRY_ORG --value "<slug-de-la-organizacion>"
eas env:create --environment production --visibility plaintext \
  --name SENTRY_PROJECT --value "<slug-del-proyecto>"
```

- En `production`, `eas.json` fija `SENTRY_ALLOW_FAILURE=true`: si falta el
  token o Sentry no responde, el build **no** falla; solo se queda sin source
  maps (el log del build lo dice).
- En `development` y `preview` la subida está apagada
  (`SENTRY_DISABLE_AUTO_UPLOAD=true`).
- Si usas Sentry autoalojado, añade también `SENTRY_URL`.

## 3. Verificar

```bash
eas env:list --environment production
```

Deben aparecer las cinco `EXPO_PUBLIC_*` y `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
`SENTRY_PROJECT`. Tras el siguiente build de producción, en Sentry →
Settings → Source Maps debe verse el release nuevo con sus artefactos.

## Nota

Las variables con prefijo `EXPO_PUBLIC_` se incluyen en el build y cualquiera
con el APK puede leerlas: nunca pongas ahí claves de servicio (`service_role`)
ni tokens.
