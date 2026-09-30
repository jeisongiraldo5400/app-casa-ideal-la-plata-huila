/**
 * Traslados (órdenes de traslado con recepción confirmada, 3.3.0): el móvil
 * despacha, recibe y confirma devoluciones marcando cantidades (sin escáner).
 * Los traslados se crean en la web.
 */
export { TransfersScreen } from './components/TransfersScreen';
export { TransferDetailScreen } from './components/TransferDetailScreen';
export { useTransferTasks, type TransferTasksState } from './infrastructure/hooks/useTransferTasks';
export { parseModeParam, type TransferMode } from './utils/transferRules';
export { homeCardSubtitle, overdueCount } from './utils/transferTasks';
export type { TransferSummary, TransferTasks } from './utils/transferModel';
