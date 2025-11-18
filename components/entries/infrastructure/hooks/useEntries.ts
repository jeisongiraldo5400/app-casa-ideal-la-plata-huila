import { useEntriesStore } from '../store/entriesStore';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';

/**
 * Hook personalizado para acceder al estado y funciones del módulo de entradas
 */
export function useEntries() {
  const store = useEntriesStore();
  const { user } = useAuth();

  const scanBarcode = async (barcode: string) => {
    await store.scanBarcode(barcode);
    
    // Si no se encontró el producto, registrar el intento
    if (!store.currentProduct && user) {
      await store.registerUnregisteredScan(barcode, user.id);
    }
  };

  const registerEntry = async (productId: string, quantity: number) => {
    if (!user) {
      return { error: { message: 'Usuario no autenticado' } };
    }
    return await store.registerEntry(productId, quantity, user.id);
  };

  return {
    ...store,
    scanBarcode,
    registerEntry,
  };
}

