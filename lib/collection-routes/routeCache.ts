import AsyncStorage from '@react-native-async-storage/async-storage';
import { CollectionRoute } from './types';

const ACTIVE_ROUTE_KEY = '@casa_ideal/active_collection_route';

export async function cacheActiveRoute(route: CollectionRoute) {
  if (route.status === 'completada' || route.status === 'cancelada') {
    await AsyncStorage.removeItem(ACTIVE_ROUTE_KEY);
    return;
  }
  await AsyncStorage.setItem(ACTIVE_ROUTE_KEY, JSON.stringify(route));
}

export async function getCachedActiveRoute(): Promise<CollectionRoute | null> {
  const value = await AsyncStorage.getItem(ACTIVE_ROUTE_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as CollectionRoute;
  } catch {
    await AsyncStorage.removeItem(ACTIVE_ROUTE_KEY);
    return null;
  }
}

export async function clearCachedActiveRoute() {
  await AsyncStorage.removeItem(ACTIVE_ROUTE_KEY);
}

