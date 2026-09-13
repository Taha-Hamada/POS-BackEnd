import BaseRepository from '../../core/base/BaseRepository.js';

import Customer from './customer.model.js';
import CustomerLedger from './customerLedger.model.js';
import LoyaltyEntry from './loyaltyEntry.model.js';

class CustomerRepository extends BaseRepository {
  constructor() {
    super(Customer);
    this.ledger = new BaseRepository(CustomerLedger);
    this.loyalty = new BaseRepository(LoyaltyEntry);
  }

  findByPhone(phone) {
    return this.findOne({ phone: String(phone).trim() }, { lean: true });
  }

  /**
   * بيعدّل الرصيد بـ $inc عشان فاتورتين في نفس اللحظة ميدوسوش على بعض،
   * وبيرجّع الرصيد بعد التعديل عشان نكتبه في كشف الحساب.
   */
  applyBalanceDelta(customerId, delta, { session } = {}) {
    return this.model.findByIdAndUpdate(
      customerId,
      { $inc: { balance: delta } },
      { new: true, session },
    );
  }

  /**
   * بيعدّل النقط. الاستهلاك بيشترط توفرها في نفس العملية عشان الرصيد مايخشش سالب،
   * إلا لما نكون بنصحّح رصيد (سحب نقط فاتورة ملغاة) فبنسمح بالنزول.
   */
  applyPointsDelta(customerId, delta, { session, allowNegative = false } = {}) {
    const filter = { _id: customerId };

    if (delta < 0 && !allowNegative) filter.points = { $gte: Math.abs(delta) };

    return this.model.findOneAndUpdate(
      filter,
      { $inc: { points: delta } },
      { new: true, session },
    );
  }

  recordPurchase(customerId, amount, { session } = {}) {
    return this.model.findByIdAndUpdate(
      customerId,
      {
        $inc: { totalPurchases: amount, ordersCount: 1 },
        $set: { lastVisitAt: new Date() },
      },
      { new: true, session },
    );
  }

  addLedgerEntry(payload, { session } = {}) {
    return CustomerLedger.create([payload], { session }).then(([doc]) => doc);
  }

  listLedger(filter, options) {
    return this.ledger.paginate(filter, options);
  }

  addLoyaltyEntry(payload, { session } = {}) {
    return LoyaltyEntry.create([payload], { session }).then(([doc]) => doc);
  }

  listLoyalty(filter, options) {
    return this.loyalty.paginate(filter, options);
  }

  /** بيعكس إجماليات فاتورة اتلغت من غير ما ينزل بالعدّاد تحت الصفر. */
  reversePurchase(customerId, amount, { session } = {}) {
    return this.model.findOneAndUpdate(
      { _id: customerId },
      [
        {
          $set: {
            totalPurchases: { $max: [0, { $subtract: ['$totalPurchases', amount] }] },
            ordersCount: { $max: [0, { $subtract: ['$ordersCount', 1] }] },
          },
        },
      ],
      { new: true, session },
    );
  }

  /** إجمالي المديونية على كل العملاء — رقم في شاشة الداشبورد. */
  async totalReceivables() {
    const [row] = await this.model.aggregate([
      { $match: { balance: { $lt: 0 } } },
      { $group: { _id: null, total: { $sum: '$balance' }, count: { $sum: 1 } } },
    ]);

    return { total: Math.abs(row?.total ?? 0), count: row?.count ?? 0 };
  }
}

export const customerRepository = new CustomerRepository();

export default customerRepository;
