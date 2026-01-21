import { Router } from 'express';
import multer from 'multer';
import {
  completeRoutineSchema,
  confirmOCRSchema,
  uuidParamSchema,
  CompletedRoutineDTO,
  ItemValue,
  Item,
} from '@analog-routine-tracker/shared';
import { query, transaction } from '../db/client';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate';
import { NotFoundError, ConflictError, BadRequestError } from '../middleware/error-handler';
import { performOCR } from '../services/ocr.service';
import { storageService } from '../services/storage.service';
import { todoistService } from '../services/todoist.service';

const router = Router();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and HEIC images are allowed.'));
    }
  },
});

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

// POST /routines/:id/complete - Digital completion
router.post(
  '/:id/complete',
  validate({ params: uuidParamSchema, body: completeRoutineSchema }),
  asyncHandler(async (req, res) => {
    const { id: routineId } = req.params;
    const { date, values } = req.body;

    const result = await transaction(async (client) => {
      // Get routine
      const routineResult = await client.query<{
        id: string;
        version: number;
        items: { id: string }[];
      }>('SELECT id, version, items FROM routines WHERE id = $1', [routineId]);

      if (routineResult.rows.length === 0) {
        throw NotFoundError('Routine');
      }

      const routine = routineResult.rows[0];

      // Validate that all item IDs in values exist in the routine
      const routineItemIds = new Set(routine.items.map((item) => item.id));
      const invalidItemIds = values.filter(
        (v: { itemId: string }) => !routineItemIds.has(v.itemId)
      );

      if (invalidItemIds.length > 0) {
        throw BadRequestError('Invalid item IDs in values', {
          itemIds: invalidItemIds.map((v: { itemId: string }) => v.itemId),
        });
      }

      // Check if completion already exists for this date
      const existingResult = await client.query(
        'SELECT id FROM completed_routines WHERE routine_id = $1 AND date = $2',
        [routineId, date]
      );

      if (existingResult.rows.length > 0) {
        throw ConflictError('A completion already exists for this date. Edit the existing entry instead.');
      }

      // Create completion
      const completionResult = await client.query<CompletedRoutineRow>(
        `INSERT INTO completed_routines (routine_id, routine_version, date, source, values)
         VALUES ($1, $2, $3, 'digital', $4)
         RETURNING *`,
        [routineId, routine.version, date, JSON.stringify(values)]
      );

      return completionResult.rows[0];
    });

    res.status(201).json(toCompletedRoutineDTO(result));
  })
);

// POST /routines/:id/upload - Upload photo and run OCR
router.post(
  '/:id/upload',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const { id: routineId } = req.params;

    if (!req.file) {
      throw BadRequestError('No photo uploaded');
    }

    // Get routine
    const routineResult = await query<{
      id: string;
      version: number;
      items: Item[];
    }>('SELECT id, version, items FROM routines WHERE id = $1', [routineId]);

    if (routineResult.rows.length === 0) {
      throw NotFoundError('Routine');
    }

    const routine = routineResult.rows[0];

    // Upload photo to storage
    const uploadResult = await storageService.uploadPhoto(req.file.buffer, routineId);

    // Perform OCR
    const ocrResult = await performOCR(req.file.buffer, routine.items, routine.version);

    // Return OCR results with photo URL
    res.json({
      photoUrl: uploadResult.url,
      photoBlobName: uploadResult.blobName,
      routineVersion: routine.version,
      ...ocrResult,
    });
  })
);

// POST /routines/:id/confirm - Confirm OCR results and save completion
router.post(
  '/:id/confirm',
  validate({ params: uuidParamSchema, body: confirmOCRSchema }),
  asyncHandler(async (req, res) => {
    const { id: routineId } = req.params;
    const { date, values, photoUrl } = req.body;

    const result = await transaction(async (client) => {
      // Get routine
      const routineResult = await client.query<{
        id: string;
        version: number;
        items: { id: string }[];
      }>('SELECT id, version, items FROM routines WHERE id = $1', [routineId]);

      if (routineResult.rows.length === 0) {
        throw NotFoundError('Routine');
      }

      const routine = routineResult.rows[0];

      // Validate that all item IDs in values exist in the routine
      const routineItemIds = new Set(routine.items.map((item) => item.id));
      const invalidItemIds = values.filter(
        (v: { itemId: string }) => !routineItemIds.has(v.itemId)
      );

      if (invalidItemIds.length > 0) {
        throw BadRequestError('Invalid item IDs in values', {
          itemIds: invalidItemIds.map((v: { itemId: string }) => v.itemId),
        });
      }

      // Check if completion already exists for this date
      const existingResult = await client.query(
        'SELECT id FROM completed_routines WHERE routine_id = $1 AND date = $2',
        [routineId, date]
      );

      if (existingResult.rows.length > 0) {
        throw ConflictError('A completion already exists for this date. Edit the existing entry instead.');
      }

      // Calculate photo expiration (30 days from now)
      const photoExpiresAt = new Date();
      photoExpiresAt.setDate(photoExpiresAt.getDate() + 30);

      // Create completion with photo
      const completionResult = await client.query<CompletedRoutineRow>(
        `INSERT INTO completed_routines (routine_id, routine_version, date, source, values, photo_url, photo_expires_at)
         VALUES ($1, $2, $3, 'analog', $4, $5, $6)
         RETURNING *`,
        [routineId, routine.version, date, JSON.stringify(values), photoUrl, photoExpiresAt]
      );

      // Increment uploaded count in inventory
      await client.query(
        `INSERT INTO paper_inventory (routine_id, uploaded_count)
         VALUES ($1, 1)
         ON CONFLICT (routine_id)
         DO UPDATE SET uploaded_count = paper_inventory.uploaded_count + 1`,
        [routineId]
      );

      return { completion: completionResult.rows[0], routineName: '' };
    });

    // Get routine name for Todoist alert (outside transaction)
    const routineNameResult = await query<{ name: string }>(
      'SELECT name FROM routines WHERE id = $1',
      [routineId]
    );
    const routineName = routineNameResult.rows[0]?.name || 'Unknown';

    // Check if we need to send an inventory alert (async, non-blocking)
    todoistService.sendInventoryAlert(routineId, routineName).catch((err) => {
      console.error('[Todoist] Alert failed:', err);
    });

    res.status(201).json(toCompletedRoutineDTO(result.completion));
  })
);

export default router;
