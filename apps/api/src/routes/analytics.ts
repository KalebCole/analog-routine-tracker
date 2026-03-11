import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate';
import { uuidParamSchema } from '@analog-routine-tracker/shared';
import { NotFoundError } from '../middleware/error-handler';
import {
  getAnalyticsSummary,
  getHeatmapData,
  getItemBreakdown,
  getWeeklyTrends,
  getOverview,
  backfillAnalyticsCache,
} from '../services/analytics.service';

const router = Router();

// GET /routines/:id/analytics/summary
router.get(
  '/routines/:id/analytics/summary',
  validate({ params: uuidParamSchema }),
  asyncHandler(async (req, res) => {
    const summary = await getAnalyticsSummary(req.params.id);
    if (!summary) throw NotFoundError('Routine');
    res.json(summary);
  })
);

// GET /routines/:id/analytics/heatmap?months=3
router.get(
  '/routines/:id/analytics/heatmap',
  validate({ params: uuidParamSchema }),
  asyncHandler(async (req, res) => {
    const months = parseInt(req.query.months as string) || 3;
    const data = await getHeatmapData(req.params.id, months);
    res.json(data);
  })
);

// GET /routines/:id/analytics/items?days=30
router.get(
  '/routines/:id/analytics/items',
  validate({ params: uuidParamSchema }),
  asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days as string) || 30;
    const data = await getItemBreakdown(req.params.id, days);
    if (!data) throw NotFoundError('Routine');
    res.json(data);
  })
);

// GET /routines/:id/analytics/trends?weeks=12
router.get(
  '/routines/:id/analytics/trends',
  validate({ params: uuidParamSchema }),
  asyncHandler(async (req, res) => {
    const weeks = parseInt(req.query.weeks as string) || 12;
    const data = await getWeeklyTrends(req.params.id, weeks);
    res.json(data);
  })
);

// GET /analytics/overview
router.get(
  '/analytics/overview',
  asyncHandler(async (_req, res) => {
    const data = await getOverview();
    res.json(data);
  })
);

// POST /admin/analytics/rebuild
router.post(
  '/admin/analytics/rebuild',
  asyncHandler(async (_req, res) => {
    const result = await backfillAnalyticsCache();
    res.json({ success: true, ...result });
  })
);

export default router;
