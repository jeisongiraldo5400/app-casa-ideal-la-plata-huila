const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Android 11+ esconde las demás apps: sin estas <queries>,
 * react-native-share no ve WhatsApp ni WhatsApp Business (isPackageInstalled
 * siempre da false) y el PDF del contrato o del recibo no puede abrir el chat
 * del cliente.
 */
const WHATSAPP_PACKAGES = ['com.whatsapp', 'com.whatsapp.w4b'];

function withWhatsAppPackageQueries(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    if (!Array.isArray(manifest.queries)) manifest.queries = [];
    if (manifest.queries.length === 0) manifest.queries.push({});
    const queries = manifest.queries[0];
    if (!Array.isArray(queries.package)) queries.package = [];
    for (const name of WHATSAPP_PACKAGES) {
      if (!queries.package.some((item) => item.$?.['android:name'] === name)) {
        queries.package.push({ $: { 'android:name': name } });
      }
    }
    return androidConfig;
  });
}

module.exports = withWhatsAppPackageQueries;
