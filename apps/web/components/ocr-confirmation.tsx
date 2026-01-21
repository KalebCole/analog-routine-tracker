'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Edit2 } from 'lucide-react';
import { Item, ItemValue, OCRValue } from '@analog-routine-tracker/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

interface OCRConfirmationProps {
  items: Item[];
  ocrValues: OCRValue[];
  dateDetected: string | null;
  overallConfidence: number;
  photoUrl: string;
  onConfirm: (date: string, values: ItemValue[]) => Promise<void>;
  onCancel: () => void;
  isConfirming: boolean;
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'text-green-600';
  if (confidence >= 0.7) return 'text-yellow-600';
  return 'text-red-600';
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return 'High';
  if (confidence >= 0.7) return 'Medium';
  return 'Low';
}

export function OCRConfirmation({
  items,
  ocrValues,
  dateDetected,
  overallConfidence,
  photoUrl,
  onConfirm,
  onCancel,
  isConfirming,
}: OCRConfirmationProps) {
  // Initialize values from OCR results
  const [values, setValues] = useState<Map<string, ItemValue['value']>>(new Map());
  const [date, setDate] = useState(dateDetected || new Date().toISOString().split('T')[0]);
  const [editingItem, setEditingItem] = useState<string | null>(null);

  // Initialize values from OCR on mount
  useEffect(() => {
    const initialValues = new Map<string, ItemValue['value']>();
    ocrValues.forEach((ocr) => {
      initialValues.set(ocr.itemId, ocr.value);
    });
    setValues(initialValues);
  }, [ocrValues]);

  const getValue = (itemId: string): ItemValue['value'] => {
    return values.get(itemId) ?? null;
  };

  const setValue = (itemId: string, value: ItemValue['value']) => {
    setValues((prev) => {
      const next = new Map(prev);
      next.set(itemId, value);
      return next;
    });
    setEditingItem(null);
  };

  const getOcrInfo = (itemId: string): OCRValue | undefined => {
    return ocrValues.find((v) => v.itemId === itemId);
  };

  const handleConfirm = async () => {
    const itemValues: ItemValue[] = items.map((item) => ({
      itemId: item.id,
      value: getValue(item.id),
    }));

    await onConfirm(date, itemValues);
  };

  const needsReviewCount = ocrValues.filter((v) => v.needsReview).length;

  return (
    <div className="space-y-6">
      {/* Overall status */}
      <Card className={needsReviewCount > 0 ? 'border-yellow-500' : 'border-green-500'}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            {needsReviewCount > 0 ? (
              <>
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <span>Review Required</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span>Ready to Confirm</span>
              </>
            )}
          </CardTitle>
          <CardDescription>
            Overall confidence: {Math.round(overallConfidence * 100)}%
            {needsReviewCount > 0 && ` • ${needsReviewCount} item(s) need review`}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Photo preview */}
      <div className="relative">
        <img
          src={photoUrl}
          alt="Uploaded card"
          className="w-full h-auto max-h-48 object-contain rounded-lg border"
        />
      </div>

      {/* Date field */}
      <div>
        <Label htmlFor="date">Date</Label>
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1"
        />
        {dateDetected && dateDetected !== date && (
          <p className="text-xs text-muted-foreground mt-1">
            Detected: {dateDetected}
          </p>
        )}
      </div>

      {/* Item values */}
      <div className="space-y-4">
        <h3 className="font-medium">Extracted Values</h3>

        {items.map((item) => {
          const ocrInfo = getOcrInfo(item.id);
          const value = getValue(item.id);
          const isEditing = editingItem === item.id;
          const confidence = ocrInfo?.confidence ?? 0;
          const needsReview = ocrInfo?.needsReview ?? true;

          return (
            <Card
              key={item.id}
              className={needsReview ? 'border-yellow-300 bg-yellow-50/50' : ''}
            >
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      {needsReview && (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs ${getConfidenceColor(confidence)}`}>
                        {getConfidenceLabel(confidence)} ({Math.round(confidence * 100)}%)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Value display/editor based on type */}
                    {item.type === 'checkbox' && !isEditing && (
                      <Checkbox
                        checked={value === true}
                        onCheckedChange={(checked) => setValue(item.id, checked === true)}
                      />
                    )}

                    {item.type === 'number' && !isEditing && (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-medium">
                          {value !== null && typeof value === 'number' ? value : '—'}
                        </span>
                        {item.unit && (
                          <span className="text-sm text-muted-foreground">{item.unit}</span>
                        )}
                      </div>
                    )}

                    {item.type === 'scale' && !isEditing && (
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => {
                          // Handle both number and ScaleValue object types
                          const scaleValue = typeof value === 'object' && value !== null && 'value' in value
                            ? (value as { value: number }).value
                            : value;
                          return (
                            <button
                              key={n}
                              onClick={() => setValue(item.id, n)}
                              className={`w-8 h-8 rounded border text-sm font-medium transition-colors ${
                                scaleValue === n
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background hover:bg-muted border-border'
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {item.type === 'text' && !isEditing && (
                      <span className="text-sm max-w-[200px] truncate">
                        {value !== null && typeof value === 'string' ? value : '—'}
                      </span>
                    )}

                    {/* Editing mode for number and text */}
                    {isEditing && (item.type === 'number' || item.type === 'text') && (
                      <div className="flex items-center gap-2">
                        <Input
                          type={item.type === 'number' ? 'number' : 'text'}
                          defaultValue={value !== null ? String(value) : ''}
                          className="w-32"
                          autoFocus
                          onBlur={(e) => {
                            if (item.type === 'number') {
                              const num = parseFloat(e.target.value);
                              setValue(item.id, isNaN(num) ? null : num);
                            } else {
                              setValue(item.id, e.target.value || null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                            if (e.key === 'Escape') {
                              setEditingItem(null);
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* Edit button for non-checkbox types */}
                    {item.type !== 'checkbox' && item.type !== 'scale' && !isEditing && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingItem(item.id)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onCancel} disabled={isConfirming} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={isConfirming} className="flex-1">
          {isConfirming ? 'Saving...' : 'Confirm & Save'}
        </Button>
      </div>
    </div>
  );
}
