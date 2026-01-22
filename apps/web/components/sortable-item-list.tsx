'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { SortableItem, DragHandleProps } from './sortable-item';
import { ItemEditor, ItemInput } from './item-editor';

interface SortableItemListProps {
  items: ItemInput[];
  onItemsChange: (items: ItemInput[]) => void;
  onItemChange: (index: number, item: ItemInput) => void;
  onItemDelete: (index: number) => void;
}

export function SortableItemList({
  items,
  onItemsChange,
  onItemChange,
  onItemDelete,
}: SortableItemListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

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

  const itemIds = items.map((_, index) => `item-${index}`);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = itemIds.indexOf(active.id as string);
      const newIndex = itemIds.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedItems = arrayMove(items, oldIndex, newIndex);
        // Update order property for each item
        const updatedItems = reorderedItems.map((item, idx) => ({
          ...item,
          order: idx,
        }));
        onItemsChange(updatedItems);
      }
    }
  };

  const activeIndex = activeId
    ? parseInt(activeId.replace('item-', ''), 10)
    : null;
  const activeItem = activeIndex !== null ? items[activeIndex] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map((item, index) => (
            <SortableItem key={`item-${index}`} id={`item-${index}`}>
              {(dragHandleProps: DragHandleProps) => (
                <ItemEditor
                  item={item}
                  index={index}
                  onChange={onItemChange}
                  onDelete={onItemDelete}
                  dragHandleProps={{
                    ref: dragHandleProps.ref,
                    ...dragHandleProps.listeners,
                    ...dragHandleProps.attributes,
                  }}
                />
              )}
            </SortableItem>
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeItem && activeIndex !== null ? (
          <div className="opacity-80">
            <ItemEditor
              item={activeItem}
              index={activeIndex}
              onChange={() => {}}
              onDelete={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
