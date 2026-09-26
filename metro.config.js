// Configuración de Metro de Expo más la de Sentry: inyecta los Debug IDs en el
// bundle para que los source maps que sube el build de producción casen con
// los errores reportados (ver EAS_ENV_SETUP.md, sección Sentry).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
