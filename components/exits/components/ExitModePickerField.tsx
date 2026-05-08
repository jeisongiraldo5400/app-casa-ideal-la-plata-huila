/* eslint-disable @typescript-eslint/no-require-imports -- Carga perezosa por plataforma (evita resolver .ios en Android y viceversa). */
import React from 'react';
import { Platform } from 'react-native';

import type { ExitModePickerFieldProps } from './pickerFieldTypes';

export type { ExitModePickerFieldProps };

export const ExitModePickerField: React.ComponentType<ExitModePickerFieldProps> =
  Platform.OS === 'ios'
    ? require('./ExitModePickerField.ios').ExitModePickerField
    : require('./ExitModePickerField.android').ExitModePickerField;
