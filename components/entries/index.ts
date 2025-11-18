/**
 * Entries Module - Exportaciones principales
 * 
 * Este módulo contiene toda la funcionalidad relacionada con entradas de productos:
 * - Store de Zustand para el estado de entradas
 * - Hook personalizado useEntries
 * - Componentes de entradas (scanner, formularios, alertas)
 */

export { useEntriesStore } from './infrastructure/store/entriesStore';
export type { EntryItem, NewProductData, PurchaseOrderWithItems } from './infrastructure/store/entriesStore';
export { useEntries } from './infrastructure/hooks/useEntries';
export { BarcodeScanner } from './components/BarcodeScanner';
export { ProductFound } from './components/ProductFound';
export { QuantityInput } from './components/QuantityInput';
export { UnregisteredBarcodeAlert } from './components/UnregisteredBarcodeAlert';
export { SetupForm } from './components/SetupForm';
export { ProductForm } from './components/ProductForm';
export { EntryItemsList } from './components/EntryItemsList';
export { PurchaseOrderSelector } from './components/PurchaseOrderSelector';

