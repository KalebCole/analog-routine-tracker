'use client';

import { useState } from 'react';
import { Item, ItemValue, ItemType } from '@analog-routine-tracker/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  // Initialize values from props or defaults
  const [values, setValues] = useState<Record<string, ItemValue>>(() => {
    const initial: Record<string, ItemValue> = {};

    for (const item of items) {
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
        .map((item) => (
          <ItemInput
            key={item.id}
            item={item}
            value={values[item.id]?.value}
            onChange={(value) => updateValue(item.id, value)}
            disabled={isSubmitting}
          />
        ))}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save Completion'}
      </Button>
    </form>
  );
}

function getDefaultValue(type: ItemType): ItemValue['value'] {
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

interface ItemInputProps {
  item: Item;
  value: ItemValue['value'];
  onChange: (value: ItemValue['value']) => void;
  disabled?: boolean;
}

function ItemInput({ item, value, onChange, disabled }: ItemInputProps) {
  switch (item.type) {
    case 'checkbox':
      return (
        <CheckboxInput
          item={item}
          value={value as boolean}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'number':
      return (
        <NumberInput
          item={item}
          value={value as number | null}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'scale':
      return (
        <ScaleInput
          item={item}
          value={value as { value: number; notes?: string } | null}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'text':
      return (
        <TextInput
          item={item}
          value={value as string | null}
          onChange={onChange}
          disabled={disabled}
        />
      );
  }
}

function CheckboxInput({
  item,
  value,
  onChange,
  disabled,
}: {
  item: Item;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center space-x-3 p-3 border rounded-lg">
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
}: {
  item: Item;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="p-3 border rounded-lg space-y-2">
      <Label htmlFor={item.id} className="font-medium">
        {item.name}
        {item.unit && <span className="text-muted-foreground ml-1">({item.unit})</span>}
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
}: {
  item: Item;
  value: { value: number; notes?: string } | null;
  onChange: (value: { value: number; notes?: string } | null) => void;
  disabled?: boolean;
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
    <div className="p-3 border rounded-lg space-y-3">
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
}: {
  item: Item;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="p-3 border rounded-lg space-y-2">
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
