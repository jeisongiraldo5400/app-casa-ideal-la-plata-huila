/**
 * WatermelonDB local database.
 *
 * Encryption verdict (Fase 0): WatermelonDB 0.28 JSI has no official SQLCipher
 * adapter. We rely on OS Data Protection (iOS file protection / Android
 * internal storage), per-user DB files, SecureStore for session/roles, app lock,
 * and wipe on logout. Do not assume the SQLite file is ciphertext at rest.
 */
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { Platform } from 'react-native';
import { schema } from './schema';
import { migrations } from './migrations';
import { modelClasses } from './models';

let database: Database | null = null;
let currentUserId: string | null = null;

function createAdapter(dbName: string) {
  if (Platform.OS === 'web') {
    const LokiJSAdapter = require('@nozbe/watermelondb/adapters/lokijs').default;
    return new LokiJSAdapter({
      schema,
      useWebWorker: false,
      useIncrementalIndexedDB: true,
    });
  }

  return new SQLiteAdapter({
    schema,
    migrations,
    dbName,
    jsi: true,
    onSetUpError: (error) => {
      console.error('WatermelonDB setup failed', error);
    },
  });
}

export function getDatabase(): Database {
  if (!database) {
    throw new Error('La base local no está abierta');
  }
  return database;
}

export function isDatabaseOpen() {
  return database != null;
}

export async function openDatabaseForUser(userId: string): Promise<Database> {
  if (database && currentUserId === userId) return database;
  if (database && currentUserId !== userId) {
    await closeDatabase();
  }
  const adapter = createAdapter(`casa_ideal_${userId}`);
  database = new Database({ adapter, modelClasses: modelClasses as never });
  currentUserId = userId;
  return database;
}

export async function closeDatabase() {
  database = null;
  currentUserId = null;
}

export async function resetDatabase() {
  if (!database) return;
  await database.write(async () => {
    await database!.unsafeResetDatabase();
  });
}
