/**
 * Confidence threshold utilities for OCR results
 */

// Confidence thresholds
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.9,      // Above this = high confidence (green)
  MEDIUM: 0.7,    // Above this = medium confidence (yellow)
  LOW: 0.0,       // Below MEDIUM = low confidence (red) - needs review
};

/**
 * Get confidence level category
 */
export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  return 'low';
}

/**
 * Check if value needs manual review
 */
export function needsReview(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.MEDIUM;
}

/**
 * Calculate overall confidence for a set of values
 */
export function calculateOverallConfidence(confidences: number[]): number {
  if (confidences.length === 0) return 0;
  return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
}

/**
 * Count values that need review
 */
export function countNeedsReview(confidences: number[]): number {
  return confidences.filter(c => needsReview(c)).length;
}

/**
 * Validate checkbox value (true/false only)
 */
export function validateCheckboxValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 'checked' || value === 'yes') return true;
  if (value === 'false' || value === '0' || value === 'unchecked' || value === 'no' || value === '' || value === null) return false;
  return null;
}

/**
 * Validate number value
 */
export function validateNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    // Remove common unit suffixes and parse
    const cleaned = value.replace(/[a-zA-Z]+$/, '').trim();
    const num = parseFloat(cleaned);
    if (!isNaN(num)) return num;
  }
  return null;
}

/**
 * Validate scale value (1-5)
 */
export function validateScaleValue(value: unknown): number | null {
  const num = validateNumberValue(value);
  if (num === null) return null;
  // Clamp to 1-5 range
  return Math.max(1, Math.min(5, Math.round(num)));
}

/**
 * Validate text value
 */
export function validateTextValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}
