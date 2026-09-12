import { buildPagination, buildPaginationMeta } from '../utils/pagination.js';

/**
 * الطبقة اللي بتلمس Mongoose. أي فيتشر بيورّث منها فبيلاقي CRUD والترقيم جاهزين،
 * وبيضيف فوقها الاستعلامات الخاصة بيه بس.
 */
export class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  create(payload, options = {}) {
    return this.model.create([payload], options).then(([doc]) => doc);
  }

  createMany(payloads, options = {}) {
    return this.model.create(payloads, options);
  }

  findById(id, { populate, session, lean = false } = {}) {
    const query = this.model.findById(id);
    if (populate) query.populate(populate);
    if (session) query.session(session);
    return lean ? query.lean() : query;
  }

  findOne(filter, { populate, session, lean = false, select } = {}) {
    const query = this.model.findOne(filter);
    if (select) query.select(select);
    if (populate) query.populate(populate);
    if (session) query.session(session);
    return lean ? query.lean() : query;
  }

  find(filter = {}, { sort = '-createdAt', populate, limit, lean = true } = {}) {
    const query = this.model.find(filter).sort(sort);
    if (populate) query.populate(populate);
    if (limit) query.limit(limit);
    return lean ? query.lean() : query;
  }

  /** بيرجّع الصفحة ومعاها بيانات الترقيم في استعلامين متوازيين. */
  async paginate(filter = {}, { page, limit, sort = '-createdAt', populate, select } = {}) {
    const pagination = buildPagination({ page, limit });

    const query = this.model
      .find(filter)
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit);

    if (select) query.select(select);
    if (populate) query.populate(populate);

    const [items, total] = await Promise.all([
      query.lean(),
      this.model.countDocuments(filter),
    ]);

    return {
      items,
      pagination: buildPaginationMeta({ ...pagination, total }),
    };
  }

  updateById(id, payload, { session, populate } = {}) {
    const query = this.model.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });
    if (session) query.session(session);
    if (populate) query.populate(populate);
    return query;
  }

  deleteById(id, { session } = {}) {
    const query = this.model.findByIdAndDelete(id);
    if (session) query.session(session);
    return query;
  }

  exists(filter) {
    return this.model.exists(filter);
  }

  count(filter = {}) {
    return this.model.countDocuments(filter);
  }

  aggregate(pipeline, options = {}) {
    return this.model.aggregate(pipeline, options);
  }
}

export default BaseRepository;
