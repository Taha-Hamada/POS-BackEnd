export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  ACCOUNTANT: 'accountant',
  STOCK_KEEPER: 'stock_keeper',
});

export const ROLE_VALUES = Object.freeze(Object.values(ROLES));

export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: 'مدير النظام',
  [ROLES.MANAGER]: 'مدير فرع',
  [ROLES.CASHIER]: 'كاشير',
  [ROLES.ACCOUNTANT]: 'محاسب',
  [ROLES.STOCK_KEEPER]: 'أمين مخزن',
});

export default ROLES;
