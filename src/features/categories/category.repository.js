import BaseRepository from '../../core/base/BaseRepository.js';

import Category from './category.model.js';

class CategoryRepository extends BaseRepository {
  constructor() {
    super(Category);
  }

  findByName(name) {
    return this.findOne({ name: String(name).trim() }, { lean: true });
  }

  countChildren(parentId) {
    return this.count({ parent: parentId });
  }

  /** عدد المنتجات في كل قسم — بيتحسب في الداتابيز بدل استعلام لكل قسم. */
  async countProductsByCategory(categoryIds) {
    const rows = await this.model.db
      .collection('products')
      .aggregate([
        { $match: { category: { $in: categoryIds }, isActive: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ])
      .toArray();

    return new Map(rows.map((row) => [String(row._id), row.count]));
  }
}

export const categoryRepository = new CategoryRepository();

export default categoryRepository;
