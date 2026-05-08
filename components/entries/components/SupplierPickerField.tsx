/* eslint-disable @typescript-eslint/no-require-imports -- Carga perezosa por plataforma */
import React from 'react';
import { Platform } from 'react-native';

import type { SupplierPickerFieldProps } from './entriesPickerFieldTypes';

export type { SupplierPickerFieldProps };

export const SupplierPickerField: React.ComponentType<SupplierPickerFieldProps> =
  Platform.OS === 'ios'
    ? require('./SupplierPickerField.ios').SupplierPickerField
    : require('./SupplierPickerField.android').SupplierPickerField;
