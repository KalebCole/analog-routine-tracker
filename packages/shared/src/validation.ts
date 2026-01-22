import { z } from 'zod';

// Item type enums
export const leafItemTypeSchema = z.enum(['checkbox', 'number', 'scale', 'text']);
export const itemTypeSchema = z.enum(['checkbox', 'number', 'scale', 'text', 'group']);

// Leaf item schema (non-group items)
export const leafItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: leafItemTypeSchema,
  unit: z.string().max(20).optional(),
  hasNotes: z.boolean().optional(),
  order: z.number().int().min(0),
});

// Group item schema (with nested children)
export const groupItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.literal('group'),
  children: z.array(leafItemSchema).min(1).max(20),
  order: z.number().int().min(0),
});

// Union of leaf and group items
export const itemSchema = z.discriminatedUnion('type', [
  leafItemSchema.extend({ type: z.literal('checkbox') }),
  leafItemSchema.extend({ type: z.literal('number') }),
  leafItemSchema.extend({ type: z.literal('scale') }),
  leafItemSchema.extend({ type: z.literal('text') }),
  groupItemSchema,
]);

// Leaf item without ID (for creation)
export const createLeafItemSchema = leafItemSchema.omit({ id: true });

// Group item without IDs (for creation)
export const createGroupItemSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.literal('group'),
  children: z.array(createLeafItemSchema).min(1).max(20),
  order: z.number().int().min(0),
});

// Item without ID (for creation) - discriminated union
export const createItemSchema = z.discriminatedUnion('type', [
  createLeafItemSchema.extend({ type: z.literal('checkbox') }),
  createLeafItemSchema.extend({ type: z.literal('number') }),
  createLeafItemSchema.extend({ type: z.literal('scale') }),
  createLeafItemSchema.extend({ type: z.literal('text') }),
  createGroupItemSchema,
]);

// Helper to count total items including children
function countItems(items: z.infer<typeof createItemSchema>[]): number {
  return items.reduce((count, item) => {
    if (item.type === 'group') {
      return count + 1 + item.children.length;
    }
    return count + 1;
  }, 0);
}

// Routine schema
export const routineSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  items: z.array(itemSchema).min(1).max(50),
  version: z.number().int().positive(),
  createdAt: z.date(),
  modifiedAt: z.date(),
});

// Create routine request with total item count validation
export const createRoutineSchema = z.object({
  name: z.string().min(1).max(100),
  items: z.array(createItemSchema).min(1).max(50),
}).refine(
  (data) => countItems(data.items) <= 50,
  { message: 'Total number of items (including group children) cannot exceed 50', path: ['items'] }
);

// Update routine request with total item count validation
export const updateRoutineSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  items: z.array(createItemSchema).min(1).max(50).optional(),
}).refine(
  (data) => !data.items || countItems(data.items) <= 50,
  { message: 'Total number of items (including group children) cannot exceed 50', path: ['items'] }
);

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
