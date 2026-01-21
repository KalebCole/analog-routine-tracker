import { z } from 'zod';

// Item type enum
export const itemTypeSchema = z.enum(['checkbox', 'number', 'scale', 'text']);

// Item schema
export const itemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: itemTypeSchema,
  unit: z.string().max(20).optional(),
  hasNotes: z.boolean().optional(),
  order: z.number().int().min(0),
});

// Item without ID (for creation)
export const createItemSchema = itemSchema.omit({ id: true });

// Routine schema
export const routineSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  items: z.array(itemSchema).min(1).max(30),
  version: z.number().int().positive(),
  createdAt: z.date(),
  modifiedAt: z.date(),
});

// Create routine request
export const createRoutineSchema = z.object({
  name: z.string().min(1).max(100),
  items: z.array(createItemSchema).min(1).max(30),
});

// Update routine request
export const updateRoutineSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  items: z.array(createItemSchema).min(1).max(30).optional(),
});

// Value schemas for each item type
export const checkboxValueSchema = z.boolean();

export const numberValueSchema = z.number().nullable();

export const scaleValueSchema = z
  .object({
    value: z.number().int().min(1).max(5),
    notes: z.string().max(200).optional(),
  })
  .nullable();

export const textValueSchema = z.string().max(500).nullable();

// Generic item value
export const itemValueSchema = z.object({
  itemId: z.string().uuid(),
  value: z.union([
    checkboxValueSchema,
    numberValueSchema,
    scaleValueSchema,
    textValueSchema,
  ]),
  confidence: z.number().min(0).max(100).optional(),
});

// Completion source
export const completionSourceSchema = z.enum(['analog', 'digital']);

// Completed routine
export const completedRoutineSchema = z.object({
  id: z.string().uuid(),
  routineId: z.string().uuid(),
  routineVersion: z.number().int().positive(),
  date: z.date(),
  completedAt: z.date(),
  source: completionSourceSchema,
  values: z.array(itemValueSchema),
  photoUrl: z.string().url().optional(),
  photoExpiresAt: z.date().optional(),
});

// Complete routine request (digital completion)
export const completeRoutineSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  values: z.array(
    itemValueSchema.omit({ confidence: true })
  ),
});

// Confirm OCR request
export const confirmOCRSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  values: z.array(
    itemValueSchema.omit({ confidence: true })
  ),
  photoUrl: z.string().url(),
  photoBlobName: z.string(),
});

// Update history request
export const updateHistorySchema = z.object({
  values: z.array(
    itemValueSchema.omit({ confidence: true })
  ),
});

// Paper inventory
export const paperInventorySchema = z.object({
  id: z.string().uuid(),
  routineId: z.string().uuid(),
  printedCount: z.number().int().min(0),
  uploadedCount: z.number().int().min(0),
  alertThreshold: z.number().int().min(0).max(100),
  lastAlertSentAt: z.date().optional(),
  lastPrintedAt: z.date().optional(),
});

// Update inventory threshold
export const updateInventoryThresholdSchema = z.object({
  alertThreshold: z.number().int().min(0).max(100),
});

// Card layout
export const cardLayoutSchema = z.enum(['quarter', 'half', 'full']);

// Print request
export const printRequestSchema = z.object({
  routineId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
  layout: cardLayoutSchema.optional(),
});

// OCR result
export const ocrResultSchema = z.object({
  values: z.array(itemValueSchema),
  overallConfidence: z.number().min(0).max(100),
  flaggedItems: z.array(z.string().uuid()),
});

// UUID param validation
export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

// Date param validation
export const dateParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

// Pagination query params
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// History query params
export const historyQuerySchema = paginationSchema.extend({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// Type exports from schemas
export type ItemInput = z.infer<typeof createItemSchema>;
export type RoutineInput = z.infer<typeof createRoutineSchema>;
export type RoutineUpdateInput = z.infer<typeof updateRoutineSchema>;
export type ItemValueInput = z.infer<typeof itemValueSchema>;
export type CompleteRoutineInput = z.infer<typeof completeRoutineSchema>;
export type ConfirmOCRInput = z.infer<typeof confirmOCRSchema>;
export type UpdateHistoryInput = z.infer<typeof updateHistorySchema>;
export type PrintRequestInput = z.infer<typeof printRequestSchema>;
export type UpdateInventoryInput = z.infer<typeof updateInventoryThresholdSchema>;
