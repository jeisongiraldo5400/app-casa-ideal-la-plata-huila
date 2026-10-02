/**
 * Bodegas por encargado (3.4.0): el admin ve todas; los demás solo las
 * bodegas de las que son Responsables. Existencias, traslados en camino y
 * por despachar, e historial de movimientos. Solo consulta, con señal.
 */
export { WarehousesScreen } from './components/WarehousesScreen';
export { WarehouseDetailScreen } from './components/WarehouseDetailScreen';
export { parseWarehouseTabParam, warehouseDetailHref, type WarehouseDetailTab } from './utils/warehouseRoutes';
