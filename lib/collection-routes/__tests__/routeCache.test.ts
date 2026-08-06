import AsyncStorage from '@react-native-async-storage/async-storage';
import { cacheActiveRoute, clearCachedActiveRoute, getCachedActiveRoute } from '../routeCache';
import { CollectionRoute } from '../types';

const route: CollectionRoute = {
  id: 'route-1', gestor_id: 'manager-1', route_date: '2026-08-02', status: 'activa',
  started_at: null, completed_at: null, total_expected: 100, total_collected: 0, stops: [],
};

describe('routeCache', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => values.get(key) ?? null);
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => { values.set(key, value); });
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { values.delete(key); });
    (AsyncStorage.clear as jest.Mock).mockImplementation(async () => { values.clear(); });
  });

  it('guarda y recupera la ruta activa', async () => {
    await cacheActiveRoute(route);
    await expect(getCachedActiveRoute()).resolves.toEqual(route);
  });

  it('elimina rutas finalizadas y datos inválidos', async () => {
    await cacheActiveRoute(route);
    await cacheActiveRoute({ ...route, status: 'completada' });
    await expect(getCachedActiveRoute()).resolves.toBeNull();

    await AsyncStorage.setItem('@casa_ideal/active_collection_route', '{invalid');
    await expect(getCachedActiveRoute()).resolves.toBeNull();
  });

  it('permite limpiar manualmente el caché', async () => {
    await cacheActiveRoute(route);
    await clearCachedActiveRoute();
    await expect(getCachedActiveRoute()).resolves.toBeNull();
  });
});
