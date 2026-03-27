# Configuración de Variables de Entorno en EAS

## Problema
Si la aplicación no abre en producción, es muy probable que las variables de entorno no estén configuradas en EAS Build.

## Solución

### 1. Configurar las variables de entorno en EAS

Ejecuta estos comandos para configurar las variables de entorno:

```bash
# Configurar la URL de Supabase
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "tu_url_de_supabase"

# Configurar la clave anónima de Supabase
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "tu_clave_anonima_de_supabase"
```

### 2. Verificar que las variables estén configuradas

```bash
eas env:list
```

### 3. Hacer el build nuevamente

```bash
eas build --platform android --profile production
```

## Nota Importante

Las variables de entorno con prefijo `EXPO_PUBLIC_` se incluyen automáticamente en el build. Asegúrate de que los valores sean correctos antes de hacer el build.

