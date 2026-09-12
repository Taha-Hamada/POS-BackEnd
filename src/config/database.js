import mongoose from 'mongoose';

import env from './env.js';
import logger from './logger.js';

mongoose.set('strictQuery', true);

/** بيفتح اتصال واحد بالـ MongoDB ويستنى لحد ما يجهز فعلًا. */
export const connectDatabase = async () => {
  mongoose.connection.on('connected', () => logger.info('MongoDB متصلة'));
  mongoose.connection.on('disconnected', () =>
    logger.warn('اتصال MongoDB اتقطع'),
  );
  mongoose.connection.on('error', (error) =>
    logger.error('خطأ في اتصال MongoDB', error),
  );

  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: !env.isProduction,
  });

  return mongoose.connection;
};

export const disconnectDatabase = async () => {
  await mongoose.connection.close(false);
};

export default connectDatabase;
