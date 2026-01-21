// Item types
export type ItemType = 'checkbox' | 'number' | 'scale' | 'text';

// Individual item within a routine
export interface Item {
  id: string;
  name: string;
  type: ItemType;
  unit?: string; // for 'number' type (e.g., "lbs", "oz", "minutes")
  hasNotes?: boolean; // for 'scale' type - adds a notes line
  order: number;
}

// Full routine definition
export interface Routine {
  id: string;
  name: string;
  items: Item[];
  version: number;
  createdAt: Date;
  modifiedAt: Date;
}

// Routine for API responses (dates as strings)
export interface RoutineDTO {
  id: string;
  name: string;
  items: Item[];
  version: number;
  createdAt: string;
  modifiedAt: string;
}

// Snapshot of a routine at a specific version
export interface RoutineVersion {
  id: string;
  routineId: string;
  version: number;
  itemsSnapshot: Item[];
  createdAt: Date;
}

// Value types for completed items
export type CheckboxValue = boolean;
export type NumberValue = number | null;
export type ScaleValue = {
  value: number; // 1-5
  notes?: string;
} | null;
export type TextValue = string | null;

// Generic item value with confidence for OCR
export interface ItemValue {
  itemId: string;
  value: CheckboxValue | NumberValue | ScaleValue | TextValue;
  confidence?: number; // 0-100, only present for OCR results
}

// Completion source
export type CompletionSource = 'analog' | 'digital';

// Completed routine entry
export interface CompletedRoutine {
  id: string;
  routineId: string;
  routineVersion: number;
  date: Date;
  completedAt: Date;
  source: CompletionSource;
  values: ItemValue[];
  photoUrl?: string;
  photoExpiresAt?: Date;
}

// Completed routine for API responses
export interface CompletedRoutineDTO {
  id: string;
  routineId: string;
  routineVersion: number;
  date: string;
  completedAt: string;
  source: CompletionSource;
  values: ItemValue[];
  photoUrl?: string;
  photoExpiresAt?: string;
}

// Edit history for tracking changes
export interface EditHistory {
  id: string;
  completedRoutineId: string;
  previousValues: ItemValue[];
  editedAt: Date;
}

// Paper inventory tracking
export interface PaperInventory {
  id: string;
  routineId: string;
  printedCount: number;
  uploadedCount: number;
  alertThreshold: number;
  lastAlertSentAt?: Date;
  lastPrintedAt?: Date;
}

// Paper inventory for API responses
export interface PaperInventoryDTO {
  id: string;
  routineId: string;
  printedCount: number;
  uploadedCount: number;
  alertThreshold: number;
  remaining: number;
  lastAlertSentAt?: string;
  lastPrintedAt?: string;
}

// OCR value with confidence and review flag
export interface OCRValue {
  itemId: string;
  value: CheckboxValue | NumberValue | ScaleValue | TextValue;
  confidence: number; // 0-1
  needsReview: boolean;
  rawText?: string;
}

// OCR result from photo upload
export interface OCRResult {
  values: OCRValue[];
  dateDetected: string | null;
  versionDetected: number;
  overallConfidence: number;
  needsReview: boolean;
}

// Print card layout options
export type CardLayout = 'quarter' | 'half' | 'full';

// Print request
export interface PrintRequest {
  routineId: string;
  quantity: number;
  layout?: CardLayout; // auto-selected if not provided
}

// Print result
export interface PrintResult {
  pdfUrl: string;
  pagesGenerated: number;
  cardsPerPage: number;
  layout: CardLayout;
}

// Statistics for a routine
export interface RoutineStats {
  routineId: string;
  totalCompletions: number;
  currentStreak: number;
  longestStreak: number;
  completionRate: number; // 0-1
  lastCompletedAt?: Date;
}

// Statistics for API responses
export interface RoutineStatsDTO {
  routineId: string;
  totalCompletions: number;
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
  lastCompletedAt?: string;
}

// API request/response types
export interface CreateRoutineRequest {
  name: string;
  items: Omit<Item, 'id'>[];
}

export interface UpdateRoutineRequest {
  name?: string;
  items?: Omit<Item, 'id'>[];
}

export interface CompleteRoutineRequest {
  date: string; // ISO date string (YYYY-MM-DD)
  values: Omit<ItemValue, 'confidence'>[];
}

export interface ConfirmOCRRequest {
  date: string;
  values: Omit<ItemValue, 'confidence'>[];
  photoUrl: string;
  photoBlobName: string;
}

export interface UpdateHistoryRequest {
  values: Omit<ItemValue, 'confidence'>[];
}

// API error response
export interface APIError {
  error: string;
  message: string;
  details?: Record<string, string[]>;
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
