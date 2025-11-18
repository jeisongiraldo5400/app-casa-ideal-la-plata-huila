import { useInventoryStore } from '../store/inventoryStore';

export function useInventory() {
  return useInventoryStore();
}
