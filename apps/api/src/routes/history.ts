import { Router } from 'express';
import {
  uuidParamSchema,
  historyQuerySchema,
  updateHistorySchema,
  CompletedRoutineDTO,
  ItemValue,
} from '@analog-routine-tracker/shared';
import { query, transaction } from '../db/client';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate';
import { NotFoundError } from '../middleware/error-handler';
import { z } from 'zod';

const router = Router();

interface CompletedRoutineRow {
  id: string;
  routine_id: string;
  routine_version: number;
  date: Date;
  completed_at: Date;
  source: 'analog' | 'digital';
  values: ItemValue[];
  photo_url: string | null;
  photo_expires_at: Date | null;
}

function toCompletedRoutineDTO(row: CompletedRoutineRow): CompletedRoutineDTO {
  return {
    id: row.id,
    routineId: row.routine_id,
    routineVersion: row.routine_version,
    date: row.date.toISOString().split('T')[0],
    completedAt: row.completed_at.toISOString(),
    source: row.source,
    values: row.values,
    photoUrl: row.photo_url || undefined,
    photoExpiresAt: row.photo_expires_at?.toISOString(),
  };
}

// Combined param schema for :id and :date
const idAndDateParamSchema = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

// GET /routines/:id/history - List history
router.get(
  '/:id/history',
  validate({ params: uuidParamSchema, query: historyQuerySchema }),
  asyncHandler(async (req, res) => {
    const { id: routineId } = req.params;
    const validatedQuery = req.query as unknown as z.infer<typeof historyQuerySchema>;
    const { page, pageSize, startDate, endDate } = validatedQuery;

    // Verify routine exists
    const routineResult = await query('SELECT id FROM routines WHERE id = $1', [routineId]);
    if (routineResult.rows.length === 0) {
      throw NotFoundError('Routine');
    }

    // Build query with filters
    let whereClause = 'WHERE routine_id = $1';
    const params: unknown[] = [routineId];
    let paramIndex = 2;

    if (startDate) {
      whereClause += ` AND date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ` AND date <= $${paramIndex++}`;
      params.push(endDate);
    }

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM completed_routines ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const offset = (page - 1) * pageSize;
    const dataResult = await query<CompletedRoutineRow>(
      `SELECT * FROM completed_routines ${whereClause}
       ORDER BY date DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, pageSize, offset]
    );

    res.json({
      data: dataResult.rows.map(toCompletedRoutineDTO),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  })
);

// GET /routines/:id/history/:date - Get single entry
router.get(
  '/:id/history/:date',
  validate({ params: idAndDateParamSchema }),
  asyncHandler(async (req, res) => {
    const { id: routineId, date } = req.params;

    const result = await query<CompletedRoutineRow>(
      `SELECT * FROM completed_routines
       WHERE routine_id = $1 AND date = $2`,
      [routineId, date]
    );

    if (result.rows.length === 0) {
      throw NotFoundError('Completion entry');
    }

    res.json(toCompletedRoutineDTO(result.rows[0]));
  })
);

// PUT /routines/:id/history/:date - Update entry
router.put(
  '/:id/history/:date',
  validate({ params: idAndDateParamSchema, body: updateHistorySchema }),
  asyncHandler(async (req, res) => {
    const { id: routineId, date } = req.params;
    const { values } = req.body;

    const result = await transaction(async (client) => {
      // Get existing entry
      const existingResult = await client.query<CompletedRoutineRow>(
        `SELECT * FROM completed_routines
         WHERE routine_id = $1 AND date = $2
         FOR UPDATE`,
        [routineId, date]
      );

      if (existingResult.rows.length === 0) {
        throw NotFoundError('Completion entry');
      }

      const existing = existingResult.rows[0];

      // Save previous values to edit history
      await client.query(
        `INSERT INTO edit_history (completed_routine_id, previous_values)
         VALUES ($1, $2)`,
        [existing.id, JSON.stringify(existing.values)]
      );

      // Update values
      const updateResult = await client.query<CompletedRoutineRow>(
        `UPDATE completed_routines
         SET values = $1
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify(values), existing.id]
      );

      return updateResult.rows[0];
    });

    res.json(toCompletedRoutineDTO(result));
  })
);

export default router;
