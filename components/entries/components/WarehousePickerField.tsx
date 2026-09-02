import { OptionPickerField } from '@/components/ui/OptionPickerField';
import React, { useMemo } from 'react';

import type { WarehousePickerFieldProps } from './entriesPickerFieldTypes';

export type { WarehousePickerFieldProps };

/** Selector de bodega sobre el `OptionPickerField` compartido ('' = ninguna). */
export function WarehousePickerField({ warehouseId, warehouses, onWarehouseChange, colors }: WarehousePickerFieldProps) {
  const options = useMemo(() => warehouses.map((w) => ({ value: w.id, label: w.name || 'Sin nombre' })), [warehouses]);
  return (
    <OptionPickerField
      value={warehouseId ?? ''}
      onValueChange={(value) => onWarehouseChange(value || null)}
      options={options}
      placeholder="Seleccione una bodega"
      modalTitle="Bodega"
      colors={colors}
    />
  );
}
