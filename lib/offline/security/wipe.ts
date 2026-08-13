import { closeDatabase, isDatabaseOpen, resetDatabase } from '../database';
import { clearOfflineSecureData } from './secureKeys';

export async function wipeLocalOfflineData() {
  try {
    if (isDatabaseOpen()) {
      await resetDatabase();
    }
  } catch (error) {
    console.error('No se pudo resetear la base local', error);
  }
  await closeDatabase();
  await clearOfflineSecureData();
}
