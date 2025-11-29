// Mock de AsyncStorage para tests
// eslint-disable-next-line no-undef
const mockFn = typeof jest !== 'undefined' ? jest.fn : () => () => {};

const AsyncStorage = {
  getItem: mockFn((key) => Promise.resolve(null)),
  setItem: mockFn((key, value) => Promise.resolve()),
  removeItem: mockFn((key) => Promise.resolve()),
  clear: mockFn(() => Promise.resolve()),
  getAllKeys: mockFn(() => Promise.resolve([])),
  multiGet: mockFn((keys) => Promise.resolve([])),
  multiSet: mockFn((keyValuePairs) => Promise.resolve()),
  multiRemove: mockFn((keys) => Promise.resolve()),
};

export default AsyncStorage;

