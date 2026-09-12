import mongoose from 'mongoose';

import logger from '../../config/logger.js';

let transactionsSupported = null;

/**
 * الـ transactions في مونجو محتاجة replica set.
 * السيرفر الواحد المحلي مابيدعمهاش، فبنكتشف ده مرة واحدة وبنفضل على النتيجة.
 */
const detectSupport = async () => {
  if (transactionsSupported !== null) return transactionsSupported;

  try {
    const info = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsSupported = Boolean(info.setName || info.msg === 'isdbgrid');
  } catch (error) {
    logger.warn('مقدرناش نحدد دعم الـ transactions، هنكمل من غيرها', error);
    transactionsSupported = false;
  }

  if (!transactionsSupported) {
    logger.warn(
      'قاعدة البيانات مش replica set — العمليات المركبة هتتنفذ من غير transaction',
    );
  }

  return transactionsSupported;
};

/**
 * بينفذ الشغل جوه transaction لو الداتابيز بتدعمها، وغير كده بينفذه على طول.
 * الكود اللي جوه بياخد session (أو null) فبيشتغل في الحالتين من غير تفريع.
 */
export const withTransaction = async (work) => {
  if (!(await detectSupport())) return work(null);

  const session = await mongoose.startSession();

  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

export const supportsTransactions = () => transactionsSupported === true;

export default withTransaction;
