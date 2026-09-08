import { OptionPickerField } from '@/components/ui/OptionPickerField';
import React, { useMemo } from 'react';

import type { UserSelectFieldProps } from './pickerFieldTypes';

export type { UserSelectFieldProps };

/** Selector de usuario destinatario sobre el `OptionPickerField` compartido ('' = ninguno). */
export function UserSelectField({ users, selectedUserId, onUserChange, colors }: UserSelectFieldProps) {
  const options = useMemo(
    () => users.map((u) => ({ value: u.id, label: u.full_name || u.email || 'Usuario sin nombre' })),
    [users],
  );
  return (
    <OptionPickerField
      value={selectedUserId ?? ''}
      onValueChange={(value) => onUserChange(value || null)}
      options={options}
      placeholder="Seleccione un usuario"
      modalTitle="Usuario destinatario"
      colors={colors}
    />
  );
}
