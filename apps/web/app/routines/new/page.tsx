'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Loader2, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ItemInput, isGroupItemInput } from '@/components/item-editor';
import { SortableItemList } from '@/components/sortable-item-list';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import {
  LeafItemInput,
  GroupItemInput,
  countTotalItems,
} from '@analog-routine-tracker/shared';

// Helper to count total items including group children
function countItems(items: ItemInput[]): number {
  return countTotalItems(items as any);
}

// Helper to clean/validate items for submission
function prepareItemsForSubmission(
  items: ItemInput[]
): (LeafItemInput | GroupItemInput)[] {
  return items
    .filter((item) => {
      if (isGroupItemInput(item)) {
        // Group must have a name and at least one child with a name
        return (
          item.name.trim() &&
          item.children.some((child) => child.name.trim())
        );
      }
      return item.name.trim();
    })
    .map((item, index) => {
      if (isGroupItemInput(item)) {
        return {
          name: item.name.trim(),
          type: 'group' as const,
          order: index,
          children: item.children
            .filter((child) => child.name.trim())
            .map((child, childIndex) => ({
              name: child.name.trim(),
              type: child.type,
              unit: child.unit,
              hasNotes: child.hasNotes,
              order: childIndex,
            })),
        };
      }
      return {
        name: item.name.trim(),
        type: item.type,
        unit: item.unit,
        hasNotes: item.hasNotes,
        order: index,
      } as LeafItemInput;
    });
}

export default function NewRoutinePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [items, setItems] = useState<ItemInput[]>([
    { name: '', type: 'checkbox', order: 0 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addItem = () => {
    setItems([
      ...items,
      { name: '', type: 'checkbox', order: items.length },
    ]);
  };

  const addGroup = () => {
    const newGroup: GroupItemInput = {
      name: '',
      type: 'group',
      order: items.length,
      children: [{ name: '', type: 'checkbox', order: 0 }],
    };
    setItems([...items, newGroup]);
  };

  const updateItem = (index: number, item: ItemInput) => {
    const newItems = [...items];
    newItems[index] = item;
    setItems(newItems);
  };

  const deleteItem = (index: number) => {
    if (items.length <= 1) {
      toast({
        title: 'Cannot delete',
        description: 'A routine must have at least one item.',
        variant: 'destructive',
      });
      return;
    }
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems.map((item, i) => ({ ...item, order: i })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: 'Missing name',
        description: 'Please enter a routine name.',
        variant: 'destructive',
      });
      return;
    }

    const validItems = prepareItemsForSubmission(items);
    if (validItems.length === 0) {
      toast({
        title: 'No items',
        description: 'Please add at least one item with a name.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const routine = await api.createRoutine({
        name: name.trim(),
        items: validItems,
      });

      toast({
        title: 'Routine created',
        description: 'Your new routine has been created.',
      });

      router.push(`/routines/${routine.id}`);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create routine. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalItems = countItems(items);

  return (
    <div className="container max-w-2xl py-6 px-4">
      <header className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">New Routine</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="routine-name">Routine Name</Label>
          <Input
            id="routine-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Morning Routine"
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Items</Label>
            <span className="text-sm text-muted-foreground">
              {totalItems} total item{totalItems !== 1 ? 's' : ''}
            </span>
          </div>

          <SortableItemList
            items={items}
            onItemsChange={setItems}
            onItemChange={updateItem}
            onItemDelete={deleteItem}
          />

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={addItem}
              disabled={isSubmitting}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={addGroup}
              disabled={isSubmitting}
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              Add Group
            </Button>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Routine'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
