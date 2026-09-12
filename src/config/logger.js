import process from 'node:process';

import env from './env.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = env.isProduction ? LEVELS.info : LEVELS.debug;

const write = (level, stream, message, meta) => {
  if (LEVELS[level] > activeLevel) return;

  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  stream.write(meta === undefined ? `${line}\n` : `${line} ${format(meta)}\n`);
};

const format = (meta) => {
  if (meta instanceof Error) return meta.stack ?? meta.message;
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
};

/** لوجر بسيط من غير مكتبات — كفاية لحد ما نحتاج شحن اللوجز لخدمة خارجية. */
export const logger = {
  error: (message, meta) => write('error', process.stderr, message, meta),
  warn: (message, meta) => write('warn', process.stderr, message, meta),
  info: (message, meta) => write('info', process.stdout, message, meta),
  debug: (message, meta) => write('debug', process.stdout, message, meta),
};

export default logger;
