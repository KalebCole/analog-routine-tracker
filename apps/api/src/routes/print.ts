import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Item } from '@analog-routine-tracker/shared';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate';
import { generatePDF, readPDF, cleanupPDF, createPrintResult } from '../services/pdf.service';
import { storageService } from '../services/storage.service';
import { query } from '../db/client';

const router = Router();

// Type definitions for query results
interface RoutineRow {
  id: string;
  name: string;
  items: Item[];
  version: number;
}

interface InventoryRow {
  printed_count: number;
  uploaded_count: number;
  alert_threshold: number;
}

// Validation schemas
const printRequestSchema = z.object({
  layout: z.enum(['quarter', 'half', 'full', 'auto']).default('auto'),
  quantity: z.number().int().min(1).max(100).default(4),
});

/**
 * GET /routines/:id/print
 * Get print options and current inventory status
 */
router.get(
  '/:id/print',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Get routine
    const routineResult = await query<RoutineRow>(
      'SELECT id, name, items, version FROM routines WHERE id = $1',
      [id]
    );

    if (routineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    const routine = routineResult.rows[0];
    const itemCount = routine.items.length;

    // Get inventory status
    const inventoryResult = await query<InventoryRow>(
      'SELECT printed_count, uploaded_count, alert_threshold FROM paper_inventory WHERE routine_id = $1',
      [id]
    );

    const inventory: InventoryRow = inventoryResult.rows[0] || {
      printed_count: 0,
      uploaded_count: 0,
      alert_threshold: 5,
    };

    // Suggest layout based on item count
    let suggestedLayout: 'quarter' | 'half' | 'full';
    if (itemCount <= 8) {
      suggestedLayout = 'quarter';
    } else if (itemCount <= 15) {
      suggestedLayout = 'half';
    } else {
      suggestedLayout = 'full';
    }

    res.json({
      routine: {
        id: routine.id,
        name: routine.name,
        itemCount,
        version: routine.version,
      },
      suggestedLayout,
      inventory: {
        printed: inventory.printed_count,
        uploaded: inventory.uploaded_count,
        remaining: inventory.printed_count - inventory.uploaded_count,
        alertThreshold: inventory.alert_threshold,
      },
      layouts: {
        quarter: {
          name: 'Quarter Page',
          dimensions: '4.25" × 5.5"',
          cardsPerPage: 4,
          maxItems: 8,
          suitable: itemCount <= 8,
        },
        half: {
          name: 'Half Page',
          dimensions: '5.5" × 8.5"',
          cardsPerPage: 2,
          maxItems: 15,
          suitable: itemCount <= 15,
        },
        full: {
          name: 'Full Page',
          dimensions: '8.5" × 11"',
          cardsPerPage: 1,
          maxItems: 999,
          suitable: true,
        },
      },
    });
  })
);

/**
 * POST /routines/:id/print
 * Generate PDF and return download URL
 */
router.post(
  '/:id/print',
  validate({ body: printRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { layout, quantity } = req.body;

    // Get routine with items
    const routineResult = await query<RoutineRow>(
      'SELECT id, name, items, version FROM routines WHERE id = $1',
      [id]
    );

    if (routineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    const routine = routineResult.rows[0];

    // Determine actual layout
    let actualLayout = layout;
    if (actualLayout === 'auto') {
      const itemCount = routine.items.length;
      if (itemCount <= 8) {
        actualLayout = 'quarter';
      } else if (itemCount <= 15) {
        actualLayout = 'half';
      } else {
        actualLayout = 'full';
      }
    }

    try {
      // Generate PDF
      const { pdfPath, result } = await generatePDF(
        routine.name,
        routine.items,
        routine.version,
        quantity
      );

      // Read PDF buffer
      const pdfBuffer = await readPDF(pdfPath);

      // Upload to storage
      const uploadResult = await storageService.uploadPDF(pdfBuffer, id);

      // Clean up temp file
      await cleanupPDF(pdfPath);

      // Return result
      res.json({
        success: true,
        pdf: {
          url: uploadResult.url,
          blobName: uploadResult.blobName,
        },
        ...createPrintResult(uploadResult.url, result),
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      res.status(500).json({
        error: 'Failed to generate PDF',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * POST /routines/:id/print/confirm
 * Confirm print job and update inventory
 */
router.post(
  '/:id/print/confirm',
  validate({ body: z.object({ quantity: z.number().int().min(1) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { quantity } = req.body;

    // Verify routine exists
    const routineResult = await query<{ id: string }>(
      'SELECT id FROM routines WHERE id = $1',
      [id]
    );

    if (routineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Routine not found' });
    }

    // Upsert inventory record
    const result = await query<InventoryRow>(
      `INSERT INTO paper_inventory (routine_id, printed_count, last_printed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (routine_id)
       DO UPDATE SET
         printed_count = paper_inventory.printed_count + $2,
         last_printed_at = NOW()
       RETURNING *`,
      [id, quantity]
    );

    const inventory = result.rows[0];

    res.json({
      success: true,
      inventory: {
        printed: inventory.printed_count,
        uploaded: inventory.uploaded_count,
        remaining: inventory.printed_count - inventory.uploaded_count,
        alertThreshold: inventory.alert_threshold,
      },
    });
  })
);

export default router;
