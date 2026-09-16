import { DISCOUNT_TYPES } from '../../core/constants/index.js';
import { applyDiscount, round2 } from '../../core/utils/money.js';

/**
 * بيحسب فاتورة كاملة من سطورها.
 * دالة صافية: مبتلمسش داتابيز ولا وقت، فنفس المدخلات بتدي نفس النتيجة دايمًا،
 * وده اللي بيخلي الحسبة قابلة للاختبار ومتطابقة بين البيع والمرتجع وإعادة الحساب.
 *
 * ترتيب الحساب مهم: خصم السطر (يدوي أو عرض) الأول، بعدين خصم مستوى العميل،
 * بعدين خصم الفاتورة اليدوي على اللي فاضل، وآخر حاجة الضريبة.
 * الضريبة بتتحسب على الأصناف الخاضعة بس، وخصومات الفاتورة بتتوزع عليها بالنسبة والتناسب.
 */
export const calculateInvoice = ({
  lines,
  discount = null,
  taxRate = 0,
  tierDiscountPercent = 0,
}) => {
  const computedLines = lines.map((line) => {
    const gross = round2(line.unitPrice * line.quantity);

    const discountAmount = line.discountType
      ? applyDiscount(gross, {
          type: line.discountType,
          value: line.discountValue ?? 0,
        })
      : 0;

    return {
      ...line,
      discountAmount,
      lineTotal: round2(gross - discountAmount),
      gross,
    };
  });

  const subtotal = round2(
    computedLines.reduce((sum, line) => sum + line.gross, 0),
  );
  const lineDiscountTotal = round2(
    computedLines.reduce((sum, line) => sum + line.discountAmount, 0),
  );
  const afterLineDiscounts = round2(subtotal - lineDiscountTotal);

  // خصم المستوى قبل اليدوي، عشان نسبة الكاشير تتحسب على المبلغ بعد مزايا العميل.
  const tierDiscount =
    tierDiscountPercent > 0
      ? applyDiscount(afterLineDiscounts, {
          type: DISCOUNT_TYPES.PERCENTAGE,
          value: tierDiscountPercent,
        })
      : 0;

  const afterTierDiscount = round2(afterLineDiscounts - tierDiscount);

  const manualDiscount = discount?.type
    ? applyDiscount(afterTierDiscount, discount)
    : 0;

  const invoiceDiscount = round2(tierDiscount + manualDiscount);

  const netBeforeTax = round2(afterLineDiscounts - invoiceDiscount);

  // نصيب الأصناف الخاضعة للضريبة من الصافي، عشان خصم الفاتورة يقلل الوعاء بنفس النسبة.
  const taxableAfterLine = round2(
    computedLines
      .filter((line) => line.isTaxable !== false)
      .reduce((sum, line) => sum + line.lineTotal, 0),
  );

  const taxableShare =
    afterLineDiscounts > 0 ? taxableAfterLine / afterLineDiscounts : 0;
  const taxableBase = round2(taxableAfterLine - invoiceDiscount * taxableShare);
  const taxAmount = round2(taxableBase * taxRate);

  // الضريبة بتتوزع على السطور الخاضعة بنسبة قيمة كل سطر، وفرق التقريب بيروح لآخر سطر.
  const taxedLines = distributeTax(computedLines, taxAmount, taxableAfterLine);

  const costTotal = round2(
    computedLines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0),
  );

  return {
    lines: taxedLines.map(({ gross, ...line }) => line),
    subtotal,
    lineDiscountTotal,
    tierDiscount,
    invoiceDiscount,
    taxableBase,
    taxRate,
    taxAmount,
    total: round2(netBeforeTax + taxAmount),
    costTotal,
  };
};

const distributeTax = (lines, taxAmount, taxableAfterLine) => {
  if (taxAmount <= 0 || taxableAfterLine <= 0) {
    return lines.map((line) => ({ ...line, taxAmount: 0 }));
  }

  const taxableIndexes = lines
    .map((line, index) => (line.isTaxable !== false ? index : -1))
    .filter((index) => index >= 0);

  const result = lines.map((line) => ({ ...line, taxAmount: 0 }));
  let allocated = 0;

  taxableIndexes.forEach((index, position) => {
    const isLast = position === taxableIndexes.length - 1;

    const share = isLast
      ? round2(taxAmount - allocated)
      : round2((result[index].lineTotal / taxableAfterLine) * taxAmount);

    result[index].taxAmount = share;
    allocated = round2(allocated + share);
  });

  return result;
};

/**
 * بيوزّع المدفوع على الإجمالي.
 * الفرق الموجب بيبقى باقي للعميل لو فيه كاش، ودين عليه لو الدفع آجل.
 */
export const settlePayments = ({ total, payments = [] }) => {
  const paidAmount = round2(
    payments
      .filter((payment) => payment.method !== 'credit')
      .reduce((sum, payment) => sum + payment.amount, 0),
  );

  const creditAmount = round2(
    payments
      .filter((payment) => payment.method === 'credit')
      .reduce((sum, payment) => sum + payment.amount, 0),
  );

  const covered = round2(paidAmount + creditAmount);
  const changeDue = round2(Math.max(0, covered - total));
  const shortfall = round2(Math.max(0, total - covered));

  return { paidAmount, creditAmount, covered, changeDue, shortfall };
};

export const DISCOUNT = DISCOUNT_TYPES;

export default { calculateInvoice, settlePayments };
