/**
 * Cheap ESC/POS printers (PT-210 / RPP / PR-81x) often reject the standard
 * SPP UUID on Android. Add the classic RFCOMM channel-1 reflection fallback.
 */
const fs = require('fs');
const path = require('path');

const MARKER = 'WMELON_RFCOMM_CHANNEL_1';

const FALLBACK = `            } catch (e: IOException) {
                Log.w(TAG, "[Native:Android] BluetoothClassicTransport.connect FALLBACK: \${e.message}")
                newSocket?.close()
                // Fallback: insecure channel via reflection
                val method = device.javaClass.getMethod(
                    "createInsecureRfcommSocketToServiceRecord",
                    UUID::class.java
                )
                newSocket = method.invoke(device, SPP_UUID) as BluetoothSocket
                newSocket.connect()
            }`;

const REPLACEMENT = `            } catch (e: IOException) {
                Log.w(TAG, "[Native:Android] BluetoothClassicTransport.connect FALLBACK: \${e.message}")
                newSocket?.close()
                try {
                    val insecure = device.javaClass.getMethod(
                        "createInsecureRfcommSocketToServiceRecord",
                        UUID::class.java
                    )
                    newSocket = insecure.invoke(device, SPP_UUID) as BluetoothSocket
                    newSocket.connect()
                } catch (insecureError: Exception) {
                    Log.w(TAG, "[Native:Android] BluetoothClassicTransport.connect CHANNEL1: \${insecureError.message}")
                    newSocket?.close()
                    // ${MARKER}
                    val channel = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
                    newSocket = channel.invoke(device, 1) as BluetoothSocket
                    newSocket.connect()
                }
            }`;

function findTransport(projectRoot) {
  const filePath = path.join(
    projectRoot,
    'node_modules/react-native-thermal-printer-driver/android/src/main/java/com/thermalprinterdriver/transport/BluetoothClassicTransport.kt'
  );
  if (!fs.existsSync(filePath)) return null;
  return fs.realpathSync(filePath);
}

function patchThermalPrinterAndroid(projectRoot = process.cwd()) {
  const filePath = findTransport(projectRoot);
  if (!filePath) return { ok: false, reason: 'transport-not-found' };
  const original = fs.readFileSync(filePath, 'utf8');
  if (original.includes(MARKER)) return { ok: true, reason: 'already-patched', filePath };
  if (!original.includes(FALLBACK)) return { ok: false, reason: 'anchor-not-found', filePath };
  fs.writeFileSync(filePath, original.replace(FALLBACK, REPLACEMENT));
  return { ok: true, filePath };
}

module.exports = { patchThermalPrinterAndroid };

if (require.main === module) {
  const result = patchThermalPrinterAndroid(path.resolve(__dirname, '..'));
  if (!result.ok) {
    console.warn('[patch-thermal-printer-android]', result.reason || 'failed');
    process.exit(0);
  }
  console.log(
    '[patch-thermal-printer-android]',
    result.reason === 'already-patched' ? 'already applied' : `patched ${result.filePath}`
  );
}
