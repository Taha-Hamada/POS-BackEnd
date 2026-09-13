import { Router } from 'express';
import { z } from 'zod';

import { objectId } from '../../core/base/commonSchemas.js';
import { PERMISSIONS } from '../../core/constants/index.js';
import { sendSuccess } from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as reportService from './report.service.js';

const periodQuery = z.object({
  branch: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const router = Router();

router.use(authenticate);
router.use(requirePermissions(PERMISSIONS.REPORT_VIEW));

/** الفرع الافتراضي هو فرع المستخدم، والمدير بيقدر يشوف كل الفروع. */
const scope = (req) => ({
  ...req.query,
  branch: req.query.branch ?? req.user.branch ?? undefined,
});

const report = (handler, schema) => [
  ...(schema ? [validate(schema)] : []),
  asyncHandler(async (req, res) => {
    const data = await handler(scope(req));
    sendSuccess(res, { data });
  }),
];

router.get(
  '/dashboard',
  ...report(reportService.getDashboard, {
    query: z.object({
      branch: objectId.optional(),
      days: z.coerce.number().int().min(1).max(90).optional(),
    }),
  }),
);

router.get(
  '/sales-series',
  ...report(reportService.getSalesSeries, {
    query: z.object({
      branch: objectId.optional(),
      days: z.coerce.number().int().min(1).max(365).optional(),
    }),
  }),
);

router.get(
  '/top-products',
  ...report(reportService.getTopProducts, {
    query: periodQuery.extend({
      limit: z.coerce.number().int().min(1).max(50).optional(),
    }),
  }),
);

router.get(
  '/by-category',
  ...report(reportService.getSalesByCategory, { query: periodQuery }),
);

router.get(
  '/cashiers',
  ...report(reportService.getCashierPerformance, { query: periodQuery }),
);

router.get(
  '/inventory-valuation',
  ...report(reportService.getInventoryValuation, {
    query: z.object({ branch: objectId.optional() }),
  }),
);

router.get(
  '/tax',
  ...report(reportService.getTaxReport, {
    query: z.object({
      branch: objectId.optional(),
      months: z.coerce.number().int().min(1).max(36).optional(),
    }),
  }),
);

// مقارنة الفروع بتتجاهل فرع المستخدم لأن الغرض منها المقارنة، فمقصورة على المدير.
router.get(
  '/branches',
  requirePermissions(PERMISSIONS.BRANCH_VIEW),
  validate({ query: periodQuery.omit({ branch: true }) }),
  asyncHandler(async (req, res) => {
    const data = await reportService.getBranchComparison(req.query);
    sendSuccess(res, { data });
  }),
);

export default router;
