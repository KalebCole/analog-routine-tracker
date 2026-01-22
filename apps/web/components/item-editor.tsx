'use client';

import { useState } from 'react';
import {
  ItemType,
  LeafItemType,
  LeafItemInput,
  GroupItemInput,
} from '@analog-routine-tracker/shared';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
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
import {
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SortableItem, DragHandleProps } from './sortable-item';

// Re-export for backwards compatibility
export type ItemInput = LeafItemInput | GroupItemInput;

// Type guard
function isGroupItemInput(item: ItemInput): item is GroupItemInput {
  return item.type === 'group';
}

interface SortableDragHandleProps extends React.HTMLAttributes<HTMLButtonElement> {
  ref?: (node: HTMLElement | null) => void;
}

interface LeafItemEditorProps {
  item: LeafItemInput;
  index: number;
  onChange: (index: number, item: LeafItemInput) => void;
  onDelete: (index: number) => void;
  dragHandleProps?: SortableDragHandleProps;
  isNested?: boolean;
}

interface GroupItemEditorProps {
  item: GroupItemInput;
  index: number;
  onChange: (index: number, item: GroupItemInput) => void;
  onDelete: (index: number) => void;
  dragHandleProps?: SortableDragHandleProps;
}

interface ItemEditorProps {
  item: ItemInput;
  index: number;
  onChange: (index: number, item: ItemInput) => void;
  onDelete: (index: number) => void;
  dragHandleProps?: SortableDragHandleProps;
  isNested?: boolean;
}

const leafItemTypeLabels: Record<LeafItemType, string> = {
  checkbox: 'Checkbox',
  number: 'Number',
  scale: 'Scale (1-5)',
  text: 'Text',
};

const itemTypeLabels: Record<ItemType, string> = {
  ...leafItemTypeLabels,
  group: 'Group',
};

/**
 * Editor for leaf items (non-group items)
 */
function LeafItemEditor({
  item,
  index,
  onChange,
  onDelete,
  dragHandleProps,
  isNested = false,
}: LeafItemEditorProps) {
  const handleChange = <K extends keyof LeafItemInput>(
    field: K,
    value: LeafItemInput[K]
  ) => {
    onChange(index, { ...item, [field]: value });
  };

  // Nested items can only be leaf types
  const typeOptions = leafItemTypeLabels;

  return (
    <div
      className={cn(
        'flex items-start gap-2 p-3 border rounded-lg bg-card',
        isNested && 'ml-6 border-dashed'
      )}
    >
      <button
        type="button"
        className="p-1 cursor-grab hover:bg-accent rounded touch-none"
        ref={dragHandleProps?.ref}
        {...(dragHandleProps && { ...dragHandleProps, ref: undefined })}
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
              onValueChange={(value) =>
                handleChange('type', value as LeafItemType)
              }
            >
              <SelectTrigger id={`item-type-${index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(typeOptions).map(([value, label]) => (
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
        aria-label="Delete item"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * Editor for group items (contains nested leaf items)
 */
function GroupItemEditor({
  item,
  index,
  onChange,
  onDelete,
  dragHandleProps,
}: GroupItemEditorProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleNameChange = (name: string) => {
    onChange(index, { ...item, name });
  };

  const handleChildChange = (childIndex: number, child: LeafItemInput) => {
    const newChildren = [...item.children];
    newChildren[childIndex] = child;
    onChange(index, { ...item, children: newChildren });
  };

  const handleChildDelete = (childIndex: number) => {
    const newChildren = item.children.filter((_, i) => i !== childIndex);
    // If no children left, delete the group
    if (newChildren.length === 0) {
      onDelete(index);
    } else {
      onChange(index, { ...item, children: newChildren });
    }
  };

  const handleChildDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const childIds = item.children.map((_, idx) => `${index}-child-${idx}`);
      const oldIndex = childIds.indexOf(active.id as string);
      const newIndex = childIds.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedChildren = arrayMove(item.children, oldIndex, newIndex);
        const updatedChildren = reorderedChildren.map((child, idx) => ({
          ...child,
          order: idx,
        }));
        onChange(index, { ...item, children: updatedChildren });
      }
    }
  };

  const addChild = () => {
    const newChild: LeafItemInput = {
      name: '',
      type: 'checkbox',
      order: item.children.length,
    };
    onChange(index, {
      ...item,
      children: [...item.children, newChild],
    });
  };

  const completedCount = item.children.length;
  const childIds = item.children.map((_, idx) => `${index}-child-${idx}`);

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Group header */}
      <div className="flex items-center gap-2 p-3 bg-muted/50">
        <button
          type="button"
          className="p-1 cursor-grab hover:bg-accent rounded touch-none"
          ref={dragHandleProps?.ref}
          {...(dragHandleProps && { ...dragHandleProps, ref: undefined })}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>

        <div className="flex-1 flex items-center gap-3">
          <Input
            value={item.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Group name"
            className="max-w-[250px] bg-background"
          />
          <span className="text-xs text-muted-foreground">
            {completedCount} {completedCount === 1 ? 'item' : 'items'}
          </span>
          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
            Group
          </span>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(index)}
          aria-label="Delete group"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Group children */}
      {isExpanded && (
        <div className="p-3 space-y-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleChildDragEnd}
          >
            <SortableContext
              items={childIds}
              strategy={verticalListSortingStrategy}
            >
              {item.children.map((child, childIndex) => (
                <SortableItem
                  key={`${index}-child-${childIndex}`}
                  id={`${index}-child-${childIndex}`}
                >
                  {(childDragHandleProps: DragHandleProps) => (
                    <LeafItemEditor
                      item={child}
                      index={childIndex}
                      onChange={handleChildChange}
                      onDelete={handleChildDelete}
                      dragHandleProps={{
                        ref: childDragHandleProps.ref,
                        ...childDragHandleProps.listeners,
                        ...childDragHandleProps.attributes,
                      }}
                      isNested
                    />
                  )}
                </SortableItem>
              ))}
            </SortableContext>
          </DndContext>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={addChild}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add item to group
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Main item editor that handles both leaf and group items
 */
export function ItemEditor({
  item,
  index,
  onChange,
  onDelete,
  dragHandleProps,
  isNested = false,
}: ItemEditorProps) {
  if (isGroupItemInput(item)) {
    return (
      <GroupItemEditor
        item={item}
        index={index}
        onChange={onChange as (index: number, item: GroupItemInput) => void}
        onDelete={onDelete}
        dragHandleProps={dragHandleProps}
      />
    );
  }

  return (
    <LeafItemEditor
      item={item}
      index={index}
      onChange={onChange as (index: number, item: LeafItemInput) => void}
      onDelete={onDelete}
      dragHandleProps={dragHandleProps}
      isNested={isNested}
    />
  );
}

// Export types and labels for use in other components
export { itemTypeLabels, leafItemTypeLabels, isGroupItemInput };
