import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadReportSnapshot } from '@/lib/offline/repositories/offlineRepository';
import { CASH_METHODS_SNAPSHOT } from './misCobrosService';

/**
 * Último método de pago con el que cobró cada usuario en este teléfono. Es una
 * comodidad (preseleccionarlo en el próximo cobro), no un dato del negocio:
 * vive en AsyncStorage y un fallo al leer o guardar se ignora.
 */
const keyFor = (userId: string) => `@casa_ideal/cobro/ultimo_metodo_pago/${userId}`;

export async function readLastPaymentMethod(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    return (await AsyncStorage.getItem(keyFor(userId))) || null;
  } catch {
    return null;
  }
}

export async function saveLastPaymentMethod(userId: string | null | undefined, methodId: string | null | undefined) {
  if (!userId || !methodId) return;
  try {
    await AsyncStorage.setItem(keyFor(userId), methodId);
  } catch {
    // Solo es una preferencia del teléfono.
  }
}

/** Métodos marcados como efectivo según la última consulta de «Cobros» con señal. */
export async function readCashMethodIds(): Promise<string[] | null> {
  try {
    const snapshot = await loadReportSnapshot<string[]>(CASH_METHODS_SNAPSHOT);
    return Array.isArray(snapshot?.payload) ? snapshot.payload : null;
  } catch {
    return null;
  }
}
