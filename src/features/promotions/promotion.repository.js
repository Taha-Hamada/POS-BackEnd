import BaseRepository from '../../core/base/BaseRepository.js';

import Promotion from './promotion.model.js';

class PromotionRepository extends BaseRepository {
  constructor() {
    super(Promotion);
  }

  /** العروض اللي شغالة في اللحظة دي — دي اللي بتتطبق على الفواتير. */
  findLive(now = new Date()) {
    return this.model
      .find({ isActive: true, startsAt: { $lte: now }, endsAt: { $gte: now } })
      .lean();
  }

  incrementUsage(ids, { session } = {}) {
    const query = this.model.updateMany(
      { _id: { $in: ids } },
      { $inc: { usageCount: 1 } },
    );
    if (session) query.session(session);
    return query;
  }
}

export const promotionRepository = new PromotionRepository();

export default promotionRepository;
