import BaseRepository from '../../core/base/BaseRepository.js';

import Product from './product.model.js';

class ProductRepository extends BaseRepository {
  constructor() {
    super(Product);
  }

  findBySku(sku) {
    return this.findOne({ sku: String(sku).trim().toUpperCase() }, { lean: true });
  }

  findByBarcode(barcode) {
    return this.findOne(
      { barcode: String(barcode).trim() },
      { populate: { path: 'category', select: 'name icon color' } },
    );
  }

  /** بحث الكاشير — بيدور في الاسم والكود والباركود ومتغيرات المنتج مع بعض. */
  searchForSale(regex, { limit = 20, category } = {}) {
    const filter = {
      isActive: true,
      $or: [
        { name: regex },
        { sku: regex },
        { barcode: regex },
        { brand: regex },
        { 'variants.sku': regex },
        { 'variants.barcode': regex },
      ],
    };

    if (category) filter.category = category;

    return this.model
      .find(filter)
      .limit(limit)
      .populate({ path: 'category', select: 'name icon color' })
      .lean();
  }

  countByCategory(categoryId) {
    return this.count({ category: categoryId });
  }

  findExpiringBefore(date, { limit = 50 } = {}) {
    return this.model
      .find({
        isActive: true,
        expiryDate: { $ne: null, $lte: date },
      })
      .sort('expiryDate')
      .limit(limit)
      .select('name sku expiryDate unit')
      .lean();
  }
}

export const productRepository = new ProductRepository();

export default productRepository;
