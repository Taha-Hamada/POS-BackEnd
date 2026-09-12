import BaseRepository from '../../core/base/BaseRepository.js';

import Branch from './branch.model.js';

class BranchRepository extends BaseRepository {
  constructor() {
    super(Branch);
  }

  findByCode(code, options) {
    return this.findOne({ code: String(code).toUpperCase() }, options);
  }

  findMain() {
    return this.findOne({ isMain: true });
  }

  /** بينزع صفة "رئيسي" عن كل الفروع التانية عشان يفضل فرع رئيسي واحد. */
  clearMainFlag(exceptId, { session } = {}) {
    const query = this.model.updateMany(
      { isMain: true, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
      { $set: { isMain: false } },
    );
    if (session) query.session(session);
    return query;
  }
}

export const branchRepository = new BranchRepository();

export default branchRepository;
