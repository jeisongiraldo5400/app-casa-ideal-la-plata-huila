import type { ExitMode } from '@/components/exits/infrastructure/store/exitsStore';
import { OptionPickerField } from '@/components/ui/OptionPickerField';
import React from 'react';

import type { ExitModePickerFieldProps } from './pickerFieldTypes';

export type { ExitModePickerFieldProps };

const OPTIONS: { value: ExitMode; label: string }[] = [
  { value: 'direct_user', label: 'Remisión' },
  { value: 'direct_customer', label: 'Entrega a Cliente' },
];

/** Selector del tipo de salida sobre el `OptionPickerField` compartido ('' = ninguno). */
export function ExitModePickerField({ exitMode, onExitModeChange, colors }: ExitModePickerFieldProps) {
  return (
    <OptionPickerField
      value={exitMode ?? ''}
      onValueChange={(value) => onExitModeChange((value as ExitMode) || null)}
      options={OPTIONS}
      placeholder="Seleccione el tipo de salida"
      modalTitle="Tipo de salida"
      colors={colors}
    />
  );
}
