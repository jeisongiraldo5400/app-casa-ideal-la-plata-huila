// Mock del cliente de Supabase
export const supabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        then: jest.fn((callback) => Promise.resolve({ data: [], error: null }).then(callback)),
      })),
      in: jest.fn(() => ({
        then: jest.fn((callback) => Promise.resolve({ data: [], error: null }).then(callback)),
      })),
      then: jest.fn((callback) => Promise.resolve({ data: [], error: null }).then(callback)),
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => Promise.resolve({ data: null, error: null })),
      then: jest.fn((callback) => Promise.resolve({ data: null, error: null }).then(callback)),
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => Promise.resolve({ data: null, error: null })),
        then: jest.fn((callback) => Promise.resolve({ data: null, error: null }).then(callback)),
      })),
    })),
    delete: jest.fn(() => ({
      eq: jest.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  })),
  auth: {
    getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    signInWithPassword: jest.fn(() => Promise.resolve({ data: { user: null, session: null }, error: null })),
    signOut: jest.fn(() => Promise.resolve({ error: null })),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: null },
      unsubscribe: jest.fn(),
    })),
  },
  rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
};

