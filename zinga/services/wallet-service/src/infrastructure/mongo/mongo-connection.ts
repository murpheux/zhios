import mongoose, { type ConnectOptions } from 'mongoose';
import type { Logger } from '@zinga/shared-logging';

export const connectMongo = async (
  uri: string,
  logger: Logger,
  options?: ConnectOptions,
): Promise<typeof mongoose> => {
  mongoose.set('strictQuery', true);
  const connection = await mongoose.connect(uri, options);
  logger.info({ host: connection.connection.host }, 'connected to MongoDB');
  return connection;
};

export const disconnectMongo = async (): Promise<void> => {
  await mongoose.disconnect();
};
