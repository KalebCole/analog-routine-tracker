/**
 * Admin Routes
 *
 * Administrative endpoints for maintenance tasks.
 * In production, these should be protected with authentication.
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { triggerPhotoCleanup } from '../jobs/photo-cleanup';
import { todoistService } from '../services/todoist.service';

const router = Router();

// POST /admin/cleanup/photos - Manually trigger photo cleanup
router.post(
  '/cleanup/photos',
  asyncHandler(async (_req, res) => {
    const result = await triggerPhotoCleanup();

    res.json({
      success: true,
      message: `Photo cleanup completed: ${result.deleted} deleted, ${result.errors} errors`,
      ...result,
    });
  })
);

// POST /admin/alerts/check - Check all inventory and send alerts
router.post(
  '/alerts/check',
  asyncHandler(async (_req, res) => {
    const result = await todoistService.checkAllInventory();

    res.json({
      success: true,
      message: `Alert check completed: ${result.checked} checked, ${result.alerted} alerted`,
      ...result,
    });
  })
);

// GET /admin/status - Get admin status
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({
      todoistConfigured: todoistService.isConfigured(),
      environment: process.env.NODE_ENV || 'development',
    });
  })
);

export default router;
