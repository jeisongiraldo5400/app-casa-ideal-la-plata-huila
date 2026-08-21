import { closeDatabase, isDatabaseOpen, resetDatabase } from '../database';
import { clearCachedActiveRoute } from '@/lib/collection-routes/routeCache';
import { clearOfflineSecureData } from './secureKeys';
import { clearLocalPagoSupportFiles } from './localFiles';

export async function wipeLocalOfflineData() {
  try {
    if (isDatabaseOpen()) {
      await resetDatabase();
    }
  } catch (error) {
    console.error('No se pudo resetear la base local', error);
  }
  await closeDatabase();
  const cleanupResults = await Promise.allSettled([
    clearOfflineSecureData(),
    clearCachedActiveRoute(),
    clearLocalPagoSupportFiles(),
  ]);
  cleanupResults.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('No se pudo limpiar un recurso local', result.reason);
    }
  });
}
