import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createRoutineSchema,
  updateRoutineSchema,
  uuidParamSchema,
  Item,
  RoutineDTO,
} from '@analog-routine-tracker/shared';
import { query, transaction } from '../db/client';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate';
import { NotFoundError } from '../middleware/error-handler';
import { updateRoutineWithVersioning } from '../services/versioning.service';

const router = Router();

interface RoutineRow {
  id: string;
  name: string;
  items: Item[];
  version: number;
  created_at: Date;
  modified_at: Date;
}

function toRoutineDTO(row: RoutineRow): RoutineDTO {
  return {
    id: row.id,
    name: row.name,
    items: row.items,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    modifiedAt: row.modified_at.toISOString(),
  };
}

// POST /routines - Create a new routine
router.post(
  '/',
  validate({ body: createRoutineSchema }),
  asyncHandler(async (req, res) => {
    const { name, items: itemInputs } = req.body;

    // Add IDs and ensure order is set
    const items: Item[] = itemInputs.map((item: Omit<Item, 'id'>, index: number) => ({
      ...item,
      id: uuidv4(),
      order: item.order ?? index,
    }));

    const result = await transaction(async (client) => {
      // Create routine
      const routineResult = await client.query<RoutineRow>(
        `INSERT INTO routines (name, items)
         VALUES ($1, $2)
         RETURNING *`,
        [name, JSON.stringify(items)]
      );

      const routine = routineResult.rows[0];

      // Create initial paper inventory record
      await client.query(
        `INSERT INTO paper_inventory (routine_id)
         VALUES ($1)`,
        [routine.id]
      );

      return routine;
    });

    res.status(201).json(toRoutineDTO(result));
  })
);

// GET /routines - List all routines
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const result = await query<RoutineRow>(
      `SELECT * FROM routines ORDER BY modified_at DESC`
    );

    res.json(result.rows.map(toRoutineDTO));
  })
);

// GET /routines/:id - Get a single routine
router.get(
  '/:id',
  validate({ params: uuidParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await query<RoutineRow>(
      `SELECT * FROM routines WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw NotFoundError('Routine');
    }

    res.json(toRoutineDTO(result.rows[0]));
  })
);

// PUT /routines/:id - Update a routine (triggers versioning if items change)
router.put(
  '/:id',
  validate({ params: uuidParamSchema, body: updateRoutineSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, items: itemInputs } = req.body;

    // If items are provided, add IDs to new items
    let items: Item[] | undefined;
    if (itemInputs) {
      items = itemInputs.map((item: Omit<Item, 'id'>, index: number) => ({
        ...item,
        id: uuidv4(),
        order: item.order ?? index,
      }));
    }

    const updated = await updateRoutineWithVersioning(id, { name, items });

    if (!updated) {
      throw NotFoundError('Routine');
    }

    res.json(toRoutineDTO(updated));
  })
);

// DELETE /routines/:id - Delete a routine
router.delete(
  '/:id',
  validate({ params: uuidParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await query(
      `DELETE FROM routines WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      throw NotFoundError('Routine');
    }

    res.status(204).send();
  })
);

export default router;
