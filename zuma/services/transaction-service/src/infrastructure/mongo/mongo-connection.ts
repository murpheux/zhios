import mongoose, { type ConnectOptions } from 'mongoose';
import type { Logger } from '@zuma/shared-logging';

// Fail fast (5s) instead of the driver's 30s default when Mongo is unreachable at startup.
const DEFAULT_OPTIONS: ConnectOptions = { serverSelectionTimeoutMS: 5000 };

export const connectMongo = async (
  uri: string,
  logger: Logger,
  options?: ConnectOptions,
): Promise<typeof mongoose> => {
  mongoose.set('strictQuery', true);
  const connection = await mongoose.connect(uri, { ...DEFAULT_OPTIONS, ...options });
  logger.info({ host: connection.connection.host }, 'connected to MongoDB');
  return connection;
};

export const disconnectMongo = async (): Promise<void> => {
  await mongoose.disconnect();
};
