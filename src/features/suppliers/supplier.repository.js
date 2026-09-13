import BaseRepository from '../../core/base/BaseRepository.js';

import Supplier from './supplier.model.js';

class SupplierRepository extends BaseRepository {
  constructor() {
    super(Supplier);
  }

  findByPhone(phone) {
    return this.findOne({ phone: String(phone).trim() }, { lean: true });
  }

  applyDueDelta(supplierId, delta, { session } = {}) {
    return this.model.findByIdAndUpdate(
      supplierId,
      { $inc: { balanceDue: delta } },
      { new: true, session },
    );
  }

  recordPurchase(supplierId, amount, { session } = {}) {
    return this.model.findByIdAndUpdate(
      supplierId,
      { $inc: { totalPurchases: amount, ordersCount: 1 } },
      { new: true, session },
    );
  }

  async totalPayables() {
    const [row] = await this.model.aggregate([
      { $match: { balanceDue: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$balanceDue' }, count: { $sum: 1 } } },
    ]);

    return { total: row?.total ?? 0, count: row?.count ?? 0 };
  }
}

export const supplierRepository = new SupplierRepository();

export default supplierRepository;
