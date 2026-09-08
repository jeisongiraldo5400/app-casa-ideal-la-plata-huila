import { OptionPickerField } from '@/components/ui/OptionPickerField';
import React from 'react';

import type { EntryOptionPickerFieldProps } from './entriesPickerFieldTypes';

export type { EntryOptionPickerFieldProps };

/** Alias del `OptionPickerField` compartido para categorías/marcas del formulario de producto. */
export function EntryOptionPickerField({ value, onValueChange, options, placeholder, modalTitle, colors }: EntryOptionPickerFieldProps) {
  return (
    <OptionPickerField
      value={value}
      onValueChange={onValueChange}
      options={options}
      placeholder={placeholder}
      modalTitle={modalTitle}
      colors={colors}
    />
  );
}
