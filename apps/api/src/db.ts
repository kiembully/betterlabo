/**
 * The single Mongoose connection for the process.
 *
 * `readyState === 1` is the only notion of "the database is up" the routes use;
 * when it is false every data route answers `503 db_unavailable` rather than
 * hanging or inventing an empty result set.
 */
import mongoose from 'mongoose';
import { fail } from './errors.js';
import { errorMessage, log } from './logger.js';

// Mongoose's ConnectionStates enum is not comparable to a bare literal under
// `noUncheckedIndexedAccess`-style strictness, so the connected code is named.
const READY_STATE_CONNECTED = 1;

export interface ConnectOptions {
  dbName?: string;
  serverSelectionTimeoutMS?: number;
}

export async function connectDatabase(uri: string, options: ConnectOptions = {}): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    ...(options.dbName ? { dbName: options.dbName } : {}),
    serverSelectionTimeoutMS: options.serverSelectionTimeoutMS ?? 10_000,
  });
  mongoose.connection.on('error', (err: unknown) => {
    log.error('mongodb connection error', { error: errorMessage(err) });
  });
  mongoose.connection.on('disconnected', () => {
    log.warn('mongodb disconnected');
  });
}

export function isDatabaseConnected(): boolean {
  return (mongoose.connection.readyState as number) === READY_STATE_CONNECTED;
}

/** Throws the shared 503 when there is no live database to answer from. */
export function assertDatabaseConnected(): void {
  if (!isDatabaseConnected()) {
    throw fail.dbUnavailable(
      'The reporting database is not reachable right now. Nothing was saved — please try again later.',
    );
  }
}

export async function disconnectDatabase(): Promise<void> {
  if ((mongoose.connection.readyState as number) === 0) return;
  await mongoose.disconnect();
}
