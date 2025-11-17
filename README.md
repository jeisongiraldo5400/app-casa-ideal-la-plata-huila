# 🏠 Casa Ideal - Aplicación Móvil

Aplicación móvil desarrollada con [Expo](https://expo.dev) y React Native para la gestión de propiedades inmobiliarias.

## 📋 Descripción

Este proyecto es una aplicación móvil creada con [`create-expo-app`](https://www.npmjs.com/package/create-expo-app) que utiliza Expo para el desarrollo multiplataforma. La aplicación utiliza Supabase como backend y base de datos.

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js (versión recomendada según tu proyecto)
- npm o bun
- Expo CLI (se instala globalmente o se usa con npx)

### Instalación

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Inicia la aplicación:

   ```bash
   npx expo start
   ```

### Ejecutar la aplicación

Una vez iniciado el servidor de desarrollo, tendrás opciones para abrir la app en:

- [Development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go) - Sandbox limitado para probar el desarrollo con Expo

## 🛠️ Desarrollo

### Estructura del Proyecto

Este proyecto utiliza [file-based routing](https://docs.expo.dev/router/introduction). Puedes comenzar a desarrollar editando los archivos dentro del directorio **app**.

### Generar Tipos de Supabase

Para sincronizar los tipos de la base de datos con el cliente de TypeScript, ejecuta el siguiente comando desde la raíz del proyecto:

```bash
npx supabase gen types typescript > types/database.types.ts
```

Esto crea o actualiza el archivo `src/types/database.types.ts` con los tipos generados automáticamente desde tu base de datos de Supabase.

### Resetear el Proyecto

Si necesitas empezar desde cero, puedes ejecutar:

```bash
npm run reset-project
```

Este comando moverá el código inicial al directorio **app-example** y creará un directorio **app** en blanco donde puedes comenzar a desarrollar.

## 📚 Recursos y Documentación

### Aprende más sobre Expo

- [Documentación de Expo](https://docs.expo.dev/): Aprende fundamentos o profundiza en temas avanzados con nuestras [guías](https://docs.expo.dev/guides).
- [Tutorial de Expo](https://docs.expo.dev/tutorial/introduction/): Sigue un tutorial paso a paso donde crearás un proyecto que funciona en Android, iOS y web.

### Comunidad

Únete a nuestra comunidad de desarrolladores creando aplicaciones universales:

- [Expo en GitHub](https://github.com/expo/expo): Ve nuestra plataforma de código abierto y contribuye.
- [Comunidad de Discord](https://chat.expo.dev): Chatea con usuarios de Expo y haz preguntas.
