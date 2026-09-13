import process from 'node:process';

import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import logger from '../../config/logger.js';
import { ROLES, STOCK_MOVEMENT_REASONS } from '../../core/constants/index.js';
import Branch from '../../features/branches/branch.model.js';
import Category from '../../features/categories/category.model.js';
import Customer from '../../features/customers/customer.model.js';
import { applyStockMovement } from '../../features/inventory/inventory.service.js';
import Product from '../../features/products/product.model.js';
import { updateSettings } from '../../features/settings/settings.service.js';
import Supplier from '../../features/suppliers/supplier.model.js';
import User from '../../features/users/user.model.js';

/**
 * بيانات بداية للتطوير.
 * بيتخطّى أي حاجة موجودة، فتشغيله أكتر من مرة مبيعملش تكرار ولا بيدوس على شغلك.
 */

const BRANCHES = [
  { name: 'الفرع الرئيسي', code: 'MAIN', address: 'وسط البلد', phone: '0223456789', isMain: true },
  { name: 'فرع المعادي', code: 'MAAD', address: 'المعادي', phone: '0225551234' },
];

const CATEGORIES = [
  { name: 'مشروبات', icon: 'local_drink', color: '#3B82F6', sortOrder: 1 },
  { name: 'وجبات خفيفة', icon: 'fastfood', color: '#F59E0B', sortOrder: 2 },
  { name: 'منظفات', icon: 'cleaning_services', color: '#10B981', sortOrder: 3 },
  { name: 'ألبان', icon: 'egg', color: '#8B5CF6', sortOrder: 4 },
];

const PRODUCTS = [
  { name: 'بيبسي كانز 330 مل', sku: 'PEP-330', barcode: '6221031492283', category: 'مشروبات', price: 12.5, cost: 9, unit: 'علبة', minStock: 48, stock: 240 },
  { name: 'كوكاكولا 1 لتر', sku: 'COK-1L', barcode: '6221031492290', category: 'مشروبات', price: 22, cost: 16, unit: 'زجاجة', minStock: 24, stock: 120 },
  { name: 'مياه بركة 600 مل', sku: 'WTR-600', barcode: '6221031492306', category: 'مشروبات', price: 5, cost: 3, unit: 'زجاجة', minStock: 96, stock: 400 },
  { name: 'شيبسي جبنة', sku: 'CHP-CHS', barcode: '6221031492313', category: 'وجبات خفيفة', price: 10, cost: 7, unit: 'كيس', minStock: 60, stock: 180 },
  { name: 'بسكويت أولكر', sku: 'BSC-ULK', barcode: '6221031492320', category: 'وجبات خفيفة', price: 15, cost: 10.5, unit: 'باكو', minStock: 40, stock: 95 },
  { name: 'شوكولاتة جالاكسي', sku: 'CHO-GLX', barcode: '6221031492337', category: 'وجبات خفيفة', price: 25, cost: 18, unit: 'قطعة', minStock: 30, stock: 20 },
  { name: 'برسيل بودرة 2 كجم', sku: 'PER-2K', barcode: '6221031492344', category: 'منظفات', price: 145, cost: 112, unit: 'عبوة', minStock: 10, stock: 34 },
  { name: 'سائل أطباق فيري', sku: 'FRY-750', barcode: '6221031492351', category: 'منظفات', price: 48, cost: 35, unit: 'عبوة', minStock: 15, stock: 8 },
  { name: 'لبن جهينة 1 لتر', sku: 'MLK-JUH', barcode: '6221031492368', category: 'ألبان', price: 34, cost: 27, unit: 'كرتونة', minStock: 20, stock: 60, expiryInDays: 12 },
  { name: 'جبنة بيضاء دومتي', sku: 'CHS-DOM', barcode: '6221031492375', category: 'ألبان', price: 42, cost: 33, unit: 'علبة', minStock: 15, stock: 45, expiryInDays: 45 },
  { name: 'كيس بلاستيك', sku: 'BAG-STD', category: 'منظفات', price: 2, cost: 1, unit: 'قطعة', trackStock: false, isTaxable: false },
];

const CUSTOMERS = [
  { name: 'محمد أحمد سيد', phone: '01001234567', email: 'mohamed@example.com', creditLimit: 2000 },
  { name: 'فاطمة علي حسن', phone: '01112345678', creditLimit: 1000 },
  { name: 'كريم مصطفى', phone: '01223456789', creditLimit: 5000 },
  { name: 'نورا إبراهيم', phone: '01034567890' },
];

const SUPPLIERS = [
  { name: 'شركة المشروبات المصرية', contactPerson: 'أ. سامي فؤاد', phone: '0223334444', paymentTermDays: 30 },
  { name: 'الوكيل للمنظفات', contactPerson: 'أ. هدى رشاد', phone: '0225556666', paymentTermDays: 15 },
  { name: 'ألبان الدلتا', contactPerson: 'أ. طارق نبيل', phone: '0227778888', paymentTermDays: 7 },
];

const USERS = [
  { name: 'طه حمادة', username: 'admin', password: 'Admin@12345', role: ROLES.ADMIN, branch: null },
  { name: 'أحمد منصور', username: 'manager', password: 'Manager@123', role: ROLES.MANAGER, branch: 'MAIN' },
  { name: 'سارة محمود', username: 'cashier', password: 'Cashier@123', role: ROLES.CASHIER, branch: 'MAIN' },
  { name: 'يوسف عادل', username: 'cashier2', password: 'Cashier@123', role: ROLES.CASHIER, branch: 'MAAD' },
  { name: 'منى صبري', username: 'accountant', password: 'Account@123', role: ROLES.ACCOUNTANT, branch: 'MAIN' },
  { name: 'خالد رمضان', username: 'stock', password: 'Stock@12345', role: ROLES.STOCK_KEEPER, branch: 'MAIN' },
];

/** بينشئ المستند لو مش موجود ويرجّعه في الحالتين. */
const upsert = async (Model, filter, payload) => {
  const existing = await Model.findOne(filter);
  if (existing) return { doc: existing, created: false };

  const doc = await Model.create(payload);
  return { doc, created: true };
};

const seed = async () => {
  await connectDatabase();

  const created = { branches: 0, categories: 0, products: 0, users: 0, customers: 0, suppliers: 0 };

  const branchByCode = new Map();
  for (const branch of BRANCHES) {
    const { doc, created: isNew } = await upsert(Branch, { code: branch.code }, branch);
    branchByCode.set(branch.code, doc);
    if (isNew) created.branches += 1;
  }

  const categoryByName = new Map();
  for (const category of CATEGORIES) {
    const { doc, created: isNew } = await upsert(Category, { name: category.name }, category);
    categoryByName.set(category.name, doc);
    if (isNew) created.categories += 1;
  }

  const mainBranch = branchByCode.get('MAIN');

  for (const [index, product] of PRODUCTS.entries()) {
    const { stock, expiryInDays, category, ...rest } = product;

    const expiryDate = expiryInDays
      ? new Date(Date.now() + expiryInDays * 86_400_000)
      : null;

    const { doc, created: isNew } = await upsert(
      Product,
      { sku: product.sku },
      {
        ...rest,
        category: categoryByName.get(category)._id,
        colorIndex: index % 8,
        expiryDate,
      },
    );

    if (!isNew || !stock) continue;

    created.products += 1;

    await applyStockMovement({
      product: doc._id,
      branch: mainBranch._id,
      quantity: stock,
      reason: STOCK_MOVEMENT_REASONS.OPENING,
      unitCost: doc.cost,
      note: 'رصيد افتتاحي من بيانات البداية',
    });
  }

  for (const user of USERS) {
    const { branch, ...rest } = user;
    const { created: isNew } = await upsert(
      User,
      { username: user.username },
      { ...rest, branch: branch ? branchByCode.get(branch)._id : null },
    );
    if (isNew) created.users += 1;
  }

  for (const customer of CUSTOMERS) {
    const { created: isNew } = await upsert(Customer, { phone: customer.phone }, customer);
    if (isNew) created.customers += 1;
  }

  for (const supplier of SUPPLIERS) {
    const { created: isNew } = await upsert(Supplier, { phone: supplier.phone }, supplier);
    if (isNew) created.suppliers += 1;
  }

  await updateSettings({
    storeName: 'سوبر ماركت الأمانة',
    storeAddress: 'شارع الجمهورية، وسط البلد، القاهرة',
    storePhone: '0223456789',
    taxNumber: '123-456-789',
  });

  logger.info(
    `بيانات البداية جاهزة — فروع ${created.branches} / أقسام ${created.categories} / ` +
      `منتجات ${created.products} / مستخدمين ${created.users} / ` +
      `عملاء ${created.customers} / موردين ${created.suppliers}`,
  );

  if (created.users > 0) {
    logger.info('الدخول: admin / Admin@12345 — غيّر كلمة السر فورًا');
  }

  await disconnectDatabase();
};

seed().catch(async (error) => {
  logger.error('فشل تجهيز بيانات البداية', error);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
