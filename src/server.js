import process from 'node:process';

import createApp from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import env from './config/env.js';
import logger from './config/logger.js';

const start = async () => {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      `السيرفر شغال على http://localhost:${env.PORT}${env.API_PREFIX} (${env.NODE_ENV})`,
    );
  });

  /** إغلاق مرتّب: بنبطّل استقبال طلبات جديدة، نخلّص اللي شغال، وبعدين نقفل الداتابيز. */
  const shutdown = async (signal) => {
    logger.info(`${signal} وصلت — بنقفل الخدمة`);

    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('الإغلاق المرتّب اتأخر — بنقفل بالعافية');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('وعد مرفوض من غير معالجة', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('استثناء غير ممسوك — بنقفل الخدمة', error);
    process.exit(1);
  });
};

start().catch((error) => {
  logger.error('فشل تشغيل السيرفر', error);
  process.exit(1);
});
