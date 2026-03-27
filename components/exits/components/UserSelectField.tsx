/* eslint-disable @typescript-eslint/no-require-imports -- Carga perezosa por plataforma (evita resolver .ios en Android y viceversa). */
import React from 'react';
import { Platform } from 'react-native';

import type { UserSelectFieldProps } from './pickerFieldTypes';

export type { UserSelectFieldProps };

export const UserSelectField: React.ComponentType<UserSelectFieldProps> =
  Platform.OS === 'ios'
    ? require('./UserSelectField.ios').UserSelectField
    : require('./UserSelectField.android').UserSelectField;
