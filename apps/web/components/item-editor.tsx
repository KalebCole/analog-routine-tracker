'use client';

import { ItemType } from '@analog-routine-tracker/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, GripVertical } from 'lucide-react';

export interface ItemInput {
  name: string;
  type: ItemType;
  unit?: string;
  hasNotes?: boolean;
  order: number;
}

interface ItemEditorProps {
  item: ItemInput;
  index: number;
  onChange: (index: number, item: ItemInput) => void;
  onDelete: (index: number) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}

const itemTypeLabels: Record<ItemType, string> = {
  checkbox: 'Checkbox',
  number: 'Number',
  scale: 'Scale (1-5)',
  text: 'Text',
};

export function ItemEditor({
  item,
  index,
  onChange,
  onDelete,
  dragHandleProps,
}: ItemEditorProps) {
  const handleChange = <K extends keyof ItemInput>(
    field: K,
    value: ItemInput[K]
  ) => {
    onChange(index, { ...item, [field]: value });
  };

  return (
    <div className="flex items-start gap-2 p-3 border rounded-lg bg-card">
      <button
        type="button"
        className="p-1 cursor-grab hover:bg-accent rounded touch-none"
        {...dragHandleProps}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="flex-1 grid gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor={`item-name-${index}`}>Name</Label>
            <Input
              id={`item-name-${index}`}
              value={item.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Item name"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor={`item-type-${index}`}>Type</Label>
            <Select
              value={item.type}
              onValueChange={(value) => handleChange('type', value as ItemType)}
            >
              <SelectTrigger id={`item-type-${index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(itemTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {item.type === 'number' && (
          <div className="space-y-1">
            <Label htmlFor={`item-unit-${index}`}>Unit (optional)</Label>
            <Input
              id={`item-unit-${index}`}
              value={item.unit || ''}
              onChange={(e) => handleChange('unit', e.target.value || undefined)}
              placeholder="e.g., lbs, oz, minutes"
              className="max-w-[200px]"
            />
          </div>
        )}

        {item.type === 'scale' && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`item-notes-${index}`}
              checked={item.hasNotes || false}
              onCheckedChange={(checked) =>
                handleChange('hasNotes', checked === true)
              }
            />
            <Label
              htmlFor={`item-notes-${index}`}
              className="text-sm font-normal cursor-pointer"
            >
              Include notes line
            </Label>
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(index)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
