import { OptionPickerField } from '@/components/ui/OptionPickerField';
import React, { useMemo } from 'react';

import type { SupplierPickerFieldProps } from './entriesPickerFieldTypes';

export type { SupplierPickerFieldProps };

function supplierLabel(s: SupplierPickerFieldProps['suppliers'][0]): string {
  return `${s.name || 'Sin nombre'}${s.nit ? ` - NIT: ${s.nit}` : ''}`;
}

/** Selector de proveedor sobre el `OptionPickerField` compartido ('' = ninguno). */
export function SupplierPickerField({ supplierId, suppliers, onSupplierChange, colors }: SupplierPickerFieldProps) {
  const options = useMemo(() => suppliers.map((s) => ({ value: s.id, label: supplierLabel(s) })), [suppliers]);
  return (
    <OptionPickerField
      value={supplierId ?? ''}
      onValueChange={(value) => onSupplierChange(value || null)}
      options={options}
      placeholder="Seleccione un proveedor"
      modalTitle="Proveedor"
      colors={colors}
    />
  );
}
