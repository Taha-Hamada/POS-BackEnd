import BaseRepository from '../../core/base/BaseRepository.js';

import Invoice from './invoice.model.js';

class InvoiceRepository extends BaseRepository {
  constructor() {
    super(Invoice);
  }

  findByNumber(number) {
    return this.findOne(
      { number: String(number).trim().toUpperCase() },
      { populate: this.detailPopulate() },
    );
  }

  detailPopulate() {
    return [
      { path: 'branch', select: 'name code' },
      { path: 'cashier', select: 'name username' },
      { path: 'customer', select: 'name phone balance' },
      { path: 'lines.product', select: 'name sku unit imageUrl' },
    ];
  }

  listPopulate() {
    return [
      { path: 'branch', select: 'name code' },
      { path: 'cashier', select: 'name username' },
      { path: 'customer', select: 'name phone' },
    ];
  }

  /** إجماليات فترة لفرع — أساس أرقام الوردية والداشبورد. */
  async summarize(match) {
    const [row] = await this.model.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          invoicesCount: { $sum: 1 },
          total: { $sum: '$total' },
          taxAmount: { $sum: '$taxAmount' },
          costTotal: { $sum: '$costTotal' },
          discountTotal: { $sum: { $add: ['$lineDiscountTotal', '$invoiceDiscount'] } },
          returnedTotal: { $sum: '$returnedTotal' },
        },
      },
    ]);

    const summary = row ?? {
      invoicesCount: 0,
      total: 0,
      taxAmount: 0,
      costTotal: 0,
      discountTotal: 0,
      returnedTotal: 0,
    };

    delete summary._id;
    summary.profit =
      Math.round((summary.total - summary.taxAmount - summary.costTotal) * 100) / 100;

    return summary;
  }

  /** تفصيل المبيعات بطريقة الدفع — بيغذي مقارنة الدرج في تقفيل الوردية. */
  async totalsByPaymentMethod(match) {
    const rows = await this.model.aggregate([
      { $match: match },
      { $unwind: '$payments' },
      {
        $group: {
          _id: '$payments.method',
          amount: { $sum: '$payments.amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    return rows.reduce(
      (acc, row) => ({ ...acc, [row._id]: { amount: row.amount, count: row.count } }),
      {},
    );
  }
}

export const invoiceRepository = new InvoiceRepository();

export default invoiceRepository;
