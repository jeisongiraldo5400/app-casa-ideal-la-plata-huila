// Mock de variables de entorno
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// Mock del runtime de Expo para evitar errores de import
if (typeof global.__ExpoImportMetaRegistry === 'undefined') {
  global.__ExpoImportMetaRegistry = new Map();
}

// Mock de structuredClone si no está disponible
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Mock de TextDecoderStream si no está disponible
if (typeof global.TextDecoderStream === 'undefined') {
  global.TextDecoderStream = class TextDecoderStream {
    constructor() {
      this.readable = {};
      this.writable = {};
    }
  };
}

// Mock global de console para evitar ruido en los tests
global.console = {
  ...console,
  // Mantener console.error y console.warn para ver errores reales
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
};

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('@nozbe/watermelondb/decorators', () => ({
  field: () => () => undefined,
  date: () => () => undefined,
  readonly: () => () => undefined,
}));

jest.mock('@nozbe/watermelondb', () => ({
  Q: {
    where: jest.fn((...args) => args),
    oneOf: jest.fn((values) => values),
  },
  Database: class Database {},
  Model: class Model {},
  appSchema: jest.fn((value) => value),
  tableSchema: jest.fn((value) => value),
}));

