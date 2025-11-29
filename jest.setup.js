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

