import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { buildTestTicket } from '../domain/buildPaymentTicket';
import { IOS_BLE_UNAVAILABLE_MESSAGE, looksLikePt210, type PrinterDevice } from '../domain/printerTransport';
import {
  connectPrinter,
  mapPrinterError,
  printTicket,
  scanPrinters,
  stopPrinterScan,
} from '../services/printerService';
import { usePrinterStore } from '../store/printerStore';

export function PrinterPickerModal() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const pickerOpen = usePrinterStore((state) => state.pickerOpen);
  const savedPrinter = usePrinterStore((state) => state.savedPrinter);
  const setPickerOpen = usePrinterStore((state) => state.setPickerOpen);
  const setSavedPrinter = usePrinterStore((state) => state.setSavedPrinter);
  const setPendingTicket = usePrinterStore((state) => state.setPendingTicket);

  const [scanning, setScanning] = useState(false);
  const [connectingAddress, setConnectingAddress] = useState<string | null>(null);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [iosClassicOnly, setIosClassicOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void usePrinterStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    void runScan();
    return () => {
      void stopPrinterScan();
    };
  }, [pickerOpen]);

  const runScan = async () => {
    setScanning(true);
    setIosClassicOnly(false);
    try {
      const result = await scanPrinters();
      setDevices(result.devices);
      setIosClassicOnly(result.iosClassicOnly);
    } catch (error) {
      Alert.alert('Bluetooth', mapPrinterError(error));
    } finally {
      setScanning(false);
    }
  };

  const close = () => {
    setPendingTicket(null);
    setPickerOpen(false);
  };

  const selectDevice = async (device: PrinterDevice) => {
    setConnectingAddress(device.address);
    setScanning(false);
    try {
      await stopPrinterScan();
      await connectPrinter(device.address);
      await setSavedPrinter({
        name: device.name,
        address: device.address,
        deviceType: device.deviceType,
      });
      const pending = usePrinterStore.getState().pendingTicket;
      if (pending) {
        await printTicket(device.address, pending);
        setPendingTicket(null);
      }
      setPickerOpen(false);
    } catch (error) {
      Alert.alert('No se pudo conectar', mapPrinterError(error));
    } finally {
      setConnectingAddress(null);
    }
  };

  const handleTestPrint = async () => {
    if (!savedPrinter) return;
    setBusy(true);
    try {
      await printTicket(savedPrinter.address, buildTestTicket());
    } catch (error) {
      Alert.alert('No se pudo imprimir', mapPrinterError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleForget = async () => {
    await usePrinterStore.getState().setSavedPrinter(null);
  };

  const sortedDevices = [...devices].sort((a, b) => {
    const aScore = looksLikePt210(a.name) ? 0 : 1;
    const bScore = looksLikePt210(b.name) ? 0 : 1;
    if (aScore !== bScore) return aScore - bScore;
    return a.name.localeCompare(b.name);
  });

  return (
    <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background.paper }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text.primary }]}>Impresora Bluetooth</Text>
            <Pressable onPress={close} hitSlop={12}>
              <MaterialIcons name="close" size={24} color={colors.text.secondary} />
            </Pressable>
          </View>

          <Text style={[styles.hint, { color: colors.text.secondary }]}>
            Encienda la impresora y acérquela. En iPhone elija el nombre tipo RPP02N, PT-210 o Goojprt — no el televisor ni el Mac.
          </Text>

          {savedPrinter ? (
            <View style={[styles.saved, { borderColor: colors.divider }]}>
              <MaterialIcons name="print" size={22} color={colors.primary.main} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{savedPrinter.name}</Text>
                <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{savedPrinter.address}</Text>
              </View>
              <Pressable onPress={() => void handleTestPrint()} disabled={busy}>
                <Text style={{ color: colors.primary.main, fontWeight: '700' }}>Probar</Text>
              </Pressable>
              <Pressable onPress={() => void handleForget()}>
                <Text style={{ color: colors.error.main, fontWeight: '700' }}>Olvidar</Text>
              </Pressable>
            </View>
          ) : null}

          {iosClassicOnly ? (
            <Text style={[styles.warning, { color: colors.error.main }]}>
              {IOS_BLE_UNAVAILABLE_MESSAGE}
            </Text>
          ) : null}

          <View style={styles.scanRow}>
            <Text style={[styles.section, { color: colors.text.primary }]}>Dispositivos</Text>
            <Pressable onPress={() => void runScan()} disabled={scanning || Boolean(connectingAddress)} style={styles.scanBtn}>
              {scanning ? (
                <ActivityIndicator size="small" color={colors.primary.main} />
              ) : (
                <Text style={{ color: colors.primary.main, fontWeight: '700' }}>Buscar</Text>
              )}
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={{ gap: 8 }}>
            {sortedDevices.length === 0 && !scanning ? (
              <Text style={{ color: colors.text.secondary }}>
                No se encontraron impresoras. Empareje la PT-210 en Ajustes del celular y pulse Buscar.
              </Text>
            ) : (
              sortedDevices.map((device) => {
                const selected = savedPrinter?.address === device.address;
                const connecting = connectingAddress === device.address;
                return (
                  <Pressable
                    key={device.address}
                    onPress={() => void selectDevice(device)}
                    disabled={Boolean(connectingAddress)}
                    style={[
                      styles.device,
                      {
                        borderColor: selected ? colors.primary.main : colors.divider,
                        backgroundColor: selected ? `${colors.primary.main}12` : colors.background.default,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={looksLikePt210(device.name) ? 'print' : 'bluetooth'}
                      size={22}
                      color={colors.primary.main}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{device.name}</Text>
                      <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                        {device.deviceType.toUpperCase()} · {device.address}
                      </Text>
                    </View>
                    {connecting ? (
                      <Text style={{ color: colors.text.secondary, fontSize: 12 }}>Conectando...</Text>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  saved: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  section: {
    fontWeight: '800',
  },
  scanBtn: {
    minHeight: 36,
    justifyContent: 'center',
  },
  list: {
    maxHeight: 320,
  },
  device: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
