export * from './roles.js';
export * from './permissions.js';

/** كاش وآجل بس — مفيش فيزا ولا محفظة في النظام. */
export const PAYMENT_METHODS = Object.freeze({
  CASH: 'cash',
  CREDIT: 'credit',
});

export const PAYMENT_METHOD_VALUES = Object.freeze(
  Object.values(PAYMENT_METHODS),
);

export const DISCOUNT_TYPES = Object.freeze({
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
});

export const DISCOUNT_TYPE_VALUES = Object.freeze(Object.values(DISCOUNT_TYPES));

export const INVOICE_STATUSES = Object.freeze({
  COMPLETED: 'completed',
  PARTIALLY_RETURNED: 'partially_returned',
  RETURNED: 'returned',
  VOIDED: 'voided',
});

export const INVOICE_STATUS_VALUES = Object.freeze(
  Object.values(INVOICE_STATUSES),
);

export const STOCK_MOVEMENT_REASONS = Object.freeze({
  SALE: 'sale',
  RETURN: 'return',
  PURCHASE: 'purchase',
  ADJUSTMENT: 'adjustment',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
  STOCKTAKE: 'stocktake',
  DAMAGE: 'damage',
  OPENING: 'opening',
});

export const STOCK_MOVEMENT_REASON_VALUES = Object.freeze(
  Object.values(STOCK_MOVEMENT_REASONS),
);

export const PURCHASE_ORDER_STATUSES = Object.freeze({
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  PARTIALLY_RECEIVED: 'partially_received',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const PURCHASE_ORDER_STATUS_VALUES = Object.freeze(
  Object.values(PURCHASE_ORDER_STATUSES),
);

export const EXPENSE_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const EXPENSE_STATUS_VALUES = Object.freeze(
  Object.values(EXPENSE_STATUSES),
);

export const SHIFT_STATUSES = Object.freeze({
  OPEN: 'open',
  CLOSED: 'closed',
});

export const SHIFT_STATUS_VALUES = Object.freeze(Object.values(SHIFT_STATUSES));

export const PROMOTION_TYPES = Object.freeze({
  PERCENTAGE: 'percentage',
  BUY_X_GET_Y: 'buy_x_get_y',
  QUANTITY_DISCOUNT: 'quantity_discount',
});

export const PROMOTION_TYPE_VALUES = Object.freeze(
  Object.values(PROMOTION_TYPES),
);

