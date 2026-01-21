import { Router } from 'express';
import routinesRouter from './routines';
import completionsRouter from './completions';
import historyRouter from './history';
import printRouter from './print';
import inventoryRouter from './inventory';
import filesRouter from './files';
import adminRouter from './admin';
import { uuidParamSchema } from '@analog-routine-tracker/shared';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate';
import { NotFoundError } from '../middleware/error-handler';
import { getRoutineStats } from '../services/stats.service';

const router = Router();

// Health check endpoint
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount route modules
router.use('/routines', routinesRouter);
router.use('/routines', completionsRouter);
router.use('/routines', historyRouter);
router.use('/routines', printRouter);
router.use('/routines', inventoryRouter);
router.use('/inventory', inventoryRouter);
router.use('/files', filesRouter);
router.use('/admin', adminRouter);

// Stats endpoint
router.get(
  '/routines/:id/stats',
  validate({ params: uuidParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const stats = await getRoutineStats(id);

    if (!stats) {
      throw NotFoundError('Routine');
    }

    res.json(stats);
  })
);

export default router;
