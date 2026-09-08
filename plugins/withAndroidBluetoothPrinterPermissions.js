const { withAndroidManifest } = require('@expo/config-plugins');

function withAndroidBluetoothPrinterPermissions(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    if (!manifest.$) manifest.$ = {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }
    if (!manifest['uses-permission']) manifest['uses-permission'] = [];

    const permissions = manifest['uses-permission'];
    const scan = permissions.find((item) => item.$?.['android:name'] === 'android.permission.BLUETOOTH_SCAN');
    if (scan) {
      scan.$['android:usesPermissionFlags'] = 'neverForLocation';
      scan.$['tools:targetApi'] = '31';
    } else {
      permissions.push({
        $: {
          'android:name': 'android.permission.BLUETOOTH_SCAN',
          'android:usesPermissionFlags': 'neverForLocation',
          'tools:targetApi': '31',
        },
      });
    }
    return androidConfig;
  });
}

module.exports = withAndroidBluetoothPrinterPermissions;
