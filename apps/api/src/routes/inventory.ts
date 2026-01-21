import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate';
import { query } from '../db/client';

const router = Router();

// Type definitions for query results
interface RoutineRow {
  id: string;
  name: string;
}

interface InventoryRow {
  routine_id: string;
  printed_count: number;
  uploaded_count: number;
  alert_threshold: number;
  last_printed_at: string | null;
  last_alert_sent_at: string | null;
}

interface InventoryListRow {
  routine_id: string;
  routine_name: string;
  printed: number;
  uploaded: number;
  remaining: number;
  alert_threshold: number;
  last_printed_at: string | null;
}

// Validation schemas
const updateInventorySchema = z.object({
  alertThreshold: z.number().int().min(0).max(50).optional(),
  printedCount: z.number().int().min(0).optional(),
  uploadedCount: z.number().int().min(0).optional(),
});

/**
 * GET /routines/:id/inventory
 * Get inventory status for a routine
 */
router.get(
  '/:id/inventory',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Verify routine exists
    const routineResult = await query<RoutineRow>(
      'SELECT id, name FROM routines WHERE id = $1',
      [id]
    );

    if (routineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    // Get or create inventory
    let inventoryResult = await query<InventoryRow>(
      'SELECT * FROM paper_inventory WHERE routine_id = $1',
      [id]
    );

    if (inventoryResult.rows.length === 0) {
      // Create default inventory record
      inventoryResult = await query<InventoryRow>(
        `INSERT INTO paper_inventory (routine_id, printed_count, uploaded_count, alert_threshold)
         VALUES ($1, 0, 0, 5)
         RETURNING *`,
        [id]
      );
    }

    const inventory = inventoryResult.rows[0];

    res.json({
      routineId: id,
      routineName: routineResult.rows[0].name,
      printed: inventory.printed_count,
      uploaded: inventory.uploaded_count,
      remaining: inventory.printed_count - inventory.uploaded_count,
      alertThreshold: inventory.alert_threshold,
      lastPrintedAt: inventory.last_printed_at,
      lastAlertSentAt: inventory.last_alert_sent_at,
      needsRestock: (inventory.printed_count - inventory.uploaded_count) <= inventory.alert_threshold,
    });
  })
);

/**
 * PUT /routines/:id/inventory
 * Update inventory settings
 */
router.put(
  '/:id/inventory',
  validate({ body: updateInventorySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { alertThreshold, printedCount, uploadedCount } = req.body;

    // Verify routine exists
    const routineResult = await query<{ id: string }>(
      'SELECT id FROM routines WHERE id = $1',
      [id]
    );

    if (routineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: unknown[] = [id];
    let paramIndex = 2;

    if (alertThreshold !== undefined) {
      updates.push(`alert_threshold = $${paramIndex++}`);
      values.push(alertThreshold);
    }

    if (printedCount !== undefined) {
      updates.push(`printed_count = $${paramIndex++}`);
      values.push(printedCount);
    }

    if (uploadedCount !== undefined) {
      updates.push(`uploaded_count = $${paramIndex++}`);
      values.push(uploadedCount);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    // Upsert inventory
    const result = await query<InventoryRow>(
      `INSERT INTO paper_inventory (routine_id, printed_count, uploaded_count, alert_threshold)
       VALUES ($1, ${printedCount ?? 0}, ${uploadedCount ?? 0}, ${alertThreshold ?? 5})
       ON CONFLICT (routine_id)
       DO UPDATE SET ${updates.join(', ')}
       RETURNING *`,
      values
    );

    const inventory = result.rows[0];

    res.json({
      routineId: id,
      printed: inventory.printed_count,
      uploaded: inventory.uploaded_count,
      remaining: inventory.printed_count - inventory.uploaded_count,
      alertThreshold: inventory.alert_threshold,
      lastPrintedAt: inventory.last_printed_at,
    });
  })
);

/**
 * POST /routines/:id/inventory/increment-uploaded
 * Increment uploaded count (called after successful OCR confirmation)
 */
router.post(
  '/:id/inventory/increment-uploaded',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Verify routine exists
    const routineResult = await query<{ id: string }>(
      'SELECT id FROM routines WHERE id = $1',
      [id]
    );

    if (routineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    // Increment uploaded count
    const result = await query<InventoryRow>(
      `INSERT INTO paper_inventory (routine_id, uploaded_count)
       VALUES ($1, 1)
       ON CONFLICT (routine_id)
       DO UPDATE SET uploaded_count = paper_inventory.uploaded_count + 1
       RETURNING *`,
      [id]
    );

    const inventory = result.rows[0];
    const remaining = inventory.printed_count - inventory.uploaded_count;

    res.json({
      routineId: id,
      printed: inventory.printed_count,
      uploaded: inventory.uploaded_count,
      remaining,
      alertThreshold: inventory.alert_threshold,
      needsRestock: remaining <= inventory.alert_threshold,
    });
  })
);

/**
 * GET /inventory
 * Get inventory status for all routines
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await query<InventoryListRow>(
      `SELECT
         r.id as routine_id,
         r.name as routine_name,
         COALESCE(pi.printed_count, 0) as printed,
         COALESCE(pi.uploaded_count, 0) as uploaded,
         COALESCE(pi.printed_count, 0) - COALESCE(pi.uploaded_count, 0) as remaining,
         COALESCE(pi.alert_threshold, 5) as alert_threshold,
         pi.last_printed_at
       FROM routines r
       LEFT JOIN paper_inventory pi ON r.id = pi.routine_id
       ORDER BY r.name`
    );

    const inventories = result.rows.map((row) => ({
      routineId: row.routine_id,
      routineName: row.routine_name,
      printed: row.printed,
      uploaded: row.uploaded,
      remaining: row.remaining,
      alertThreshold: row.alert_threshold,
      lastPrintedAt: row.last_printed_at,
      needsRestock: row.remaining <= row.alert_threshold,
    }));

    // Summary stats
    const needsRestock = inventories.filter((i) => i.needsRestock && i.printed > 0);

    res.json({
      inventories,
      summary: {
        total: inventories.length,
        needsRestock: needsRestock.length,
        routinesNeedingRestock: needsRestock.map((i) => ({
          id: i.routineId,
          name: i.routineName,
          remaining: i.remaining,
        })),
      },
    });
  })
);

export default router;
