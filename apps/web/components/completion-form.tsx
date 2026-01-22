'use client';

import { useState } from 'react';
import {
  Item,
  LeafItem,
  ItemValue,
  LeafItemType,
  isGroupItem,
  flattenItems,
} from '@analog-routine-tracker/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CompletionFormProps {
  items: Item[];
  initialValues?: ItemValue[];
  onSubmit: (values: ItemValue[]) => Promise<void>;
  isSubmitting?: boolean;
}

export function CompletionForm({
  items,
  initialValues = [],
  onSubmit,
  isSubmitting = false,
}: CompletionFormProps) {
  // Flatten items to get all leaf items
  const leafItems = flattenItems(items);

  // Initialize values from props or defaults
  const [values, setValues] = useState<Record<string, ItemValue>>(() => {
    const initial: Record<string, ItemValue> = {};

    for (const item of leafItems) {
      const existingValue = initialValues.find((v) => v.itemId === item.id);
      if (existingValue) {
        initial[item.id] = existingValue;
      } else {
        initial[item.id] = {
          itemId: item.id,
          value: getDefaultValue(item.type),
        };
      }
    }

    return initial;
  });

  const updateValue = (itemId: string, value: ItemValue['value']) => {
    setValues((prev) => ({
      ...prev,
      [itemId]: { itemId, value },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(Object.values(values));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {items
        .sort((a, b) => a.order - b.order)
        .map((item) => {
          if (isGroupItem(item)) {
            return (
              <GroupSection
                key={item.id}
                groupName={item.name}
                children={item.children}
                values={values}
                onValueChange={updateValue}
                disabled={isSubmitting}
              />
            );
          }

          return (
            <LeafItemInput
              key={item.id}
              item={item}
              value={values[item.id]?.value}
              onChange={(value) => updateValue(item.id, value)}
              disabled={isSubmitting}
            />
          );
        })}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save Completion'}
      </Button>
    </form>
  );
}

interface GroupSectionProps {
  groupName: string;
  children: LeafItem[];
  values: Record<string, ItemValue>;
  onValueChange: (itemId: string, value: ItemValue['value']) => void;
  disabled?: boolean;
}

function GroupSection({
  groupName,
  children,
  values,
  onValueChange,
  disabled,
}: GroupSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Calculate completion progress
  const completedCount = children.filter((child) => {
    const value = values[child.id]?.value;
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return true;
    if (typeof value === 'string') return value.length > 0;
    if (typeof value === 'object' && value !== null) return true;
    return false;
  }).length;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Group header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-3 bg-muted/50 hover:bg-muted transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-medium flex-1 text-left">{groupName}</span>
        <span className="text-sm text-muted-foreground">
          {completedCount}/{children.length}
        </span>
      </button>

      {/* Group children */}
      {isExpanded && (
        <div className="p-2 space-y-2 bg-background">
          {children
            .sort((a, b) => a.order - b.order)
            .map((child) => (
              <div key={child.id} className="ml-4">
                <LeafItemInput
                  item={child}
                  value={values[child.id]?.value}
                  onChange={(value) => onValueChange(child.id, value)}
                  disabled={disabled}
                  isNested
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function getDefaultValue(type: LeafItemType): ItemValue['value'] {
  switch (type) {
    case 'checkbox':
      return false;
    case 'number':
      return null;
    case 'scale':
      return null;
    case 'text':
      return null;
  }
}

interface LeafItemInputProps {
  item: LeafItem;
  value: ItemValue['value'];
  onChange: (value: ItemValue['value']) => void;
  disabled?: boolean;
  isNested?: boolean;
}

function LeafItemInput({
  item,
  value,
  onChange,
  disabled,
  isNested = false,
}: LeafItemInputProps) {
  switch (item.type) {
    case 'checkbox':
      return (
        <CheckboxInput
          item={item}
          value={value as boolean}
          onChange={onChange}
          disabled={disabled}
          isNested={isNested}
        />
      );
    case 'number':
      return (
        <NumberInput
          item={item}
          value={value as number | null}
          onChange={onChange}
          disabled={disabled}
          isNested={isNested}
        />
      );
    case 'scale':
      return (
        <ScaleInput
          item={item}
          value={value as { value: number; notes?: string } | null}
          onChange={onChange}
          disabled={disabled}
          isNested={isNested}
        />
      );
    case 'text':
      return (
        <TextInput
          item={item}
          value={value as string | null}
          onChange={onChange}
          disabled={disabled}
          isNested={isNested}
        />
      );
  }
}

function CheckboxInput({
  item,
  value,
  onChange,
  disabled,
  isNested,
}: {
  item: LeafItem;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  isNested?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center space-x-3 p-3 border rounded-lg',
        isNested && 'border-dashed'
      )}
    >
      <Checkbox
        id={item.id}
        checked={value}
        onCheckedChange={(checked) => onChange(checked === true)}
        disabled={disabled}
      />
      <Label htmlFor={item.id} className="flex-1 cursor-pointer font-medium">
        {item.name}
      </Label>
    </div>
  );
}

function NumberInput({
  item,
  value,
  onChange,
  disabled,
  isNested,
}: {
  item: LeafItem;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  isNested?: boolean;
}) {
  return (
    <div
      className={cn(
        'p-3 border rounded-lg space-y-2',
        isNested && 'border-dashed'
      )}
    >
      <Label htmlFor={item.id} className="font-medium">
        {item.name}
        {item.unit && (
          <span className="text-muted-foreground ml-1">({item.unit})</span>
        )}
      </Label>
      <Input
        id={item.id}
        type="number"
        step="any"
        value={value ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val === '' ? null : parseFloat(val));
        }}
        placeholder="Enter value"
        disabled={disabled}
      />
    </div>
  );
}

function ScaleInput({
  item,
  value,
  onChange,
  disabled,
  isNested,
}: {
  item: LeafItem;
  value: { value: number; notes?: string } | null;
  onChange: (value: { value: number; notes?: string } | null) => void;
  disabled?: boolean;
  isNested?: boolean;
}) {
  const scaleValue = value?.value ?? 0;
  const notes = value?.notes ?? '';

  const handleScaleChange = (newScale: number) => {
    if (newScale === scaleValue) {
      // Deselect
      onChange(null);
    } else {
      onChange({ value: newScale, notes: notes || undefined });
    }
  };

  const handleNotesChange = (newNotes: string) => {
    if (scaleValue > 0) {
      onChange({ value: scaleValue, notes: newNotes || undefined });
    }
  };

  return (
    <div
      className={cn(
        'p-3 border rounded-lg space-y-3',
        isNested && 'border-dashed'
      )}
    >
      <Label className="font-medium">{item.name}</Label>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => handleScaleChange(n)}
            disabled={disabled}
            className={cn(
              'w-10 h-10 rounded-lg border-2 font-medium transition-colors',
              scaleValue === n
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-input hover:bg-accent'
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {item.hasNotes && (
        <Input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          disabled={disabled || scaleValue === 0}
        />
      )}
    </div>
  );
}

function TextInput({
  item,
  value,
  onChange,
  disabled,
  isNested,
}: {
  item: LeafItem;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  isNested?: boolean;
}) {
  return (
    <div
      className={cn(
        'p-3 border rounded-lg space-y-2',
        isNested && 'border-dashed'
      )}
    >
      <Label htmlFor={item.id} className="font-medium">
        {item.name}
      </Label>
      <Input
        id={item.id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="Enter text"
        disabled={disabled}
      />
    </div>
  );
}
