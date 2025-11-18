/**
 * Entries Module - Exportaciones principales
 * 
 * Este módulo contiene toda la funcionalidad relacionada con entradas de productos:
 * - Store de Zustand para el estado de entradas
 * - Hook personalizado useEntries
 * - Componentes de entradas (scanner, formularios, alertas)
 */

export { useEntriesStore } from './infrastructure/store/entriesStore';
export type { Product, Movement, UnregisteredBarcodeScan } from './infrastructure/store/entriesStore';
export { useEntries } from './infrastructure/hooks/useEntries';
export { BarcodeScanner } from './components/BarcodeScanner';
export { ProductFound } from './components/ProductFound';
export { QuantityInput } from './components/QuantityInput';
export { UnregisteredBarcodeAlert } from './components/UnregisteredBarcodeAlert';

