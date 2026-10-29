import mongoose from 'mongoose';
import type { Logger } from '@zuma/shared-logging';

export const connectMongo = async (uri: string, logger: Logger): Promise<typeof mongoose> => {
  mongoose.set('strictQuery', true);
  const connection = await mongoose.connect(uri);
  logger.info({ host: connection.connection.host }, 'connected to MongoDB');
  return connection;
};

export const disconnectMongo = async (): Promise<void> => {
  await mongoose.disconnect();
};
