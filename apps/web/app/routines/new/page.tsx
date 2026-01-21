'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ItemEditor, ItemInput } from '@/components/item-editor';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

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

    const validItems = items.filter((item) => item.name.trim());
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
        items: validItems.map(({ name, type, unit, hasNotes, order }) => ({
          name: name.trim(),
          type,
          unit,
          hasNotes,
          order,
        })),
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
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-2">
            {items.map((item, index) => (
              <ItemEditor
                key={index}
                item={item}
                index={index}
                onChange={updateItem}
                onDelete={deleteItem}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={addItem}
            disabled={isSubmitting}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
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
