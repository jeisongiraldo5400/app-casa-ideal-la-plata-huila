/* eslint-disable @typescript-eslint/no-require-imports -- resolución por plataforma */
import type { ComponentType } from 'react';
import { Platform } from 'react-native';

export const WarehouseFilter: ComponentType =
  Platform.OS === 'ios'
    ? require('./WarehouseFilter.ios').WarehouseFilter
    : require('./WarehouseFilter.android').WarehouseFilter;
