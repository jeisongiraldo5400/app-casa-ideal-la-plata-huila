/* eslint-disable @typescript-eslint/no-require-imports -- Carga perezosa por plataforma */
import React from 'react';
import { Platform } from 'react-native';

import type { WarehousePickerFieldProps } from './entriesPickerFieldTypes';

export type { WarehousePickerFieldProps };

export const WarehousePickerField: React.ComponentType<WarehousePickerFieldProps> =
  Platform.OS === 'ios'
    ? require('./WarehousePickerField.ios').WarehousePickerField
    : require('./WarehousePickerField.android').WarehousePickerField;
