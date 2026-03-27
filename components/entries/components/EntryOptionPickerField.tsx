/* eslint-disable @typescript-eslint/no-require-imports -- Carga perezosa por plataforma */
import React from 'react';
import { Platform } from 'react-native';

import type { EntryOptionPickerFieldProps } from './entriesPickerFieldTypes';

export type { EntryOptionPickerFieldProps };

export const EntryOptionPickerField: React.ComponentType<EntryOptionPickerFieldProps> =
  Platform.OS === 'ios'
    ? require('./EntryOptionPickerField.ios').EntryOptionPickerField
    : require('./EntryOptionPickerField.android').EntryOptionPickerField;
