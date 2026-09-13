import { ROLES } from './roles.js';

/**
 * الصلاحيات بصيغة "مورد:إجراء".
 * الدور بيحدّد الباقة الافتراضية، ولكل مستخدم قايمة إضافية أو استثناءات فوقها.
 */
export const PERMISSIONS = Object.freeze({
  PRODUCT_VIEW: 'product:view',
  PRODUCT_MANAGE: 'product:manage',

  CATEGORY_VIEW: 'category:view',
  CATEGORY_MANAGE: 'category:manage',

  CUSTOMER_VIEW: 'customer:view',
  CUSTOMER_MANAGE: 'customer:manage',

  SUPPLIER_VIEW: 'supplier:view',
  SUPPLIER_MANAGE: 'supplier:manage',

  INVOICE_VIEW: 'invoice:view',
  INVOICE_CREATE: 'invoice:create',
  INVOICE_VOID: 'invoice:void',
  INVOICE_DISCOUNT: 'invoice:discount',

  RETURN_VIEW: 'return:view',
  RETURN_MANAGE: 'return:manage',

  INVENTORY_VIEW: 'inventory:view',
  INVENTORY_ADJUST: 'inventory:adjust',
  INVENTORY_TRANSFER: 'inventory:transfer',

  PURCHASE_VIEW: 'purchase:view',
  PURCHASE_MANAGE: 'purchase:manage',

  SHIFT_VIEW: 'shift:view',
  SHIFT_MANAGE: 'shift:manage',

  EXPENSE_VIEW: 'expense:view',
  EXPENSE_MANAGE: 'expense:manage',
  EXPENSE_APPROVE: 'expense:approve',

  PROMOTION_VIEW: 'promotion:view',
  PROMOTION_MANAGE: 'promotion:manage',

  BRANCH_VIEW: 'branch:view',
  BRANCH_MANAGE: 'branch:manage',

  USER_VIEW: 'user:view',
  USER_MANAGE: 'user:manage',

  REPORT_VIEW: 'report:view',
  SETTINGS_MANAGE: 'settings:manage',
});

export const PERMISSION_VALUES = Object.freeze(Object.values(PERMISSIONS));

const P = PERMISSIONS;

/** الباقة الافتراضية لكل دور. مدير النظام بياخد كل حاجة ضمنيًا. */
export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: PERMISSION_VALUES,

  [ROLES.MANAGER]: [
    P.PRODUCT_VIEW, P.PRODUCT_MANAGE,
    P.CATEGORY_VIEW, P.CATEGORY_MANAGE,
    P.CUSTOMER_VIEW, P.CUSTOMER_MANAGE,
    P.SUPPLIER_VIEW, P.SUPPLIER_MANAGE,
    P.INVOICE_VIEW, P.INVOICE_CREATE, P.INVOICE_VOID, P.INVOICE_DISCOUNT,
    P.RETURN_VIEW, P.RETURN_MANAGE,
    P.INVENTORY_VIEW, P.INVENTORY_ADJUST, P.INVENTORY_TRANSFER,
    P.PURCHASE_VIEW, P.PURCHASE_MANAGE,
    P.SHIFT_VIEW, P.SHIFT_MANAGE,
    P.EXPENSE_VIEW, P.EXPENSE_MANAGE, P.EXPENSE_APPROVE,
    P.PROMOTION_VIEW, P.PROMOTION_MANAGE,
    P.BRANCH_VIEW,
    P.USER_VIEW,
    P.REPORT_VIEW,
  ],

  [ROLES.CASHIER]: [
    P.PRODUCT_VIEW,
    P.CATEGORY_VIEW,
    P.CUSTOMER_VIEW, P.CUSTOMER_MANAGE,
    P.INVOICE_VIEW, P.INVOICE_CREATE,
    // المرتجع بيتعمل على الدرج، فالكاشير لازم يقدر ينفذه عشان رد الكاش يتسجل صح.
    P.RETURN_VIEW, P.RETURN_MANAGE,
    P.INVENTORY_VIEW,
    P.SHIFT_VIEW, P.SHIFT_MANAGE,
    P.PROMOTION_VIEW,
  ],

  [ROLES.ACCOUNTANT]: [
    P.PRODUCT_VIEW,
    P.CATEGORY_VIEW,
    P.CUSTOMER_VIEW,
    P.SUPPLIER_VIEW,
    P.INVOICE_VIEW,
    P.RETURN_VIEW,
    P.INVENTORY_VIEW,
    P.PURCHASE_VIEW,
    P.SHIFT_VIEW,
    P.EXPENSE_VIEW, P.EXPENSE_MANAGE, P.EXPENSE_APPROVE,
    P.BRANCH_VIEW,
    P.REPORT_VIEW,
  ],

  [ROLES.STOCK_KEEPER]: [
    P.PRODUCT_VIEW, P.PRODUCT_MANAGE,
    P.CATEGORY_VIEW,
    P.SUPPLIER_VIEW,
    P.INVENTORY_VIEW, P.INVENTORY_ADJUST, P.INVENTORY_TRANSFER,
    P.PURCHASE_VIEW, P.PURCHASE_MANAGE,
    P.REPORT_VIEW,
  ],
});

/** الصلاحيات الفعلية = باقة الدور + إضافات المستخدم − استثناءاته. */
export const resolvePermissions = ({ role, granted = [], revoked = [] }) => {
  const base = new Set(ROLE_PERMISSIONS[role] ?? []);
  granted.forEach((permission) => base.add(permission));
  revoked.forEach((permission) => base.delete(permission));
  return [...base];
};

export default PERMISSIONS;
