import BaseRepository from '../../core/base/BaseRepository.js';

import Stock from './stock.model.js';
import StockMovement from './stockMovement.model.js';

class StockRepository extends BaseRepository {
  constructor() {
    super(Stock);
  }

  findForProduct(productId, branchId, { session } = {}) {
    const query = this.model.findOne({ product: productId, branch: branchId });
    if (session) query.session(session);
    return query;
  }

  /** بينشئ سجل الرصيد لو مش موجود من غير ما يدوس على رصيد قايم. */
  ensureRecord(productId, branchId, { minStock = null, session } = {}) {
    return this.model.findOneAndUpdate(
      { product: productId, branch: branchId },
      { $setOnInsert: { quantity: 0, reserved: 0, minStock } },
      { new: true, upsert: true, session, setDefaultsOnInsert: true },
    );
  }

  /**
   * زيادة أو نقصان ذري للرصيد.
   * لو الحركة خصم بنحط شرط توفر الكمية في الفلتر نفسه، فالتحقق والتعديل بيحصلوا
   * في عملية واحدة ومفيش طلبين متوازيين يقدروا ينزلوا الرصيد تحت الصفر.
   */
  applyDelta(productId, branchId, delta, { session, allowNegative = false } = {}) {
    const filter = { product: productId, branch: branchId };

    if (delta < 0 && !allowNegative) {
      filter.quantity = { $gte: Math.abs(delta) };
    }

    return this.model.findOneAndUpdate(
      filter,
      { $inc: { quantity: delta } },
      { new: true, session },
    );
  }

  reserve(productId, branchId, quantity, { session } = {}) {
    return this.model.findOneAndUpdate(
      {
        product: productId,
        branch: branchId,
        $expr: { $gte: [{ $subtract: ['$quantity', '$reserved'] }, quantity] },
      },
      { $inc: { reserved: quantity } },
      { new: true, session },
    );
  }

  release(productId, branchId, quantity, { session } = {}) {
    return this.model.findOneAndUpdate(
      { product: productId, branch: branchId },
      { $inc: { reserved: -quantity } },
      { new: true, session },
    );
  }

  findManyForBranch(productIds, branchId, { session } = {}) {
    const query = this.model.find({
      product: { $in: productIds },
      branch: branchId,
    });
    if (session) query.session(session);
    return query.lean();
  }

  recordMovement(payload, { session } = {}) {
    return StockMovement.create([payload], { session }).then(([doc]) => doc);
  }

  listMovements(filter, options) {
    const repo = new BaseRepository(StockMovement);
    return repo.paginate(filter, options);
  }

  /** إجمالي رصيد المنتج على كل الفروع — بتستخدمه شاشة المنتجات. */
  async totalsByProduct(productIds) {
    const rows = await this.model.aggregate([
      { $match: { product: { $in: productIds } } },
      {
        $group: {
          _id: '$product',
          quantity: { $sum: '$quantity' },
          reserved: { $sum: '$reserved' },
        },
      },
    ]);

    return new Map(rows.map((row) => [String(row._id), row]));
  }
}

export const stockRepository = new StockRepository();

export { StockMovement };

export default stockRepository;
