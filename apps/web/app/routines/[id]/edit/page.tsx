'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ItemEditor, ItemInput } from '@/components/item-editor';
import { useRoutine } from '@/hooks/use-routine';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

interface PageProps {
  params: { id: string };
}

export default function EditRoutinePage({ params }: PageProps) {
  const { id } = params;
  const router = useRouter();
  const { toast } = useToast();
  const { routine, isLoading } = useRoutine(id);

  const [name, setName] = useState('');
  const [items, setItems] = useState<ItemInput[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (routine && !initialized) {
      setName(routine.name);
      setItems(
        routine.items.map((item) => ({
          name: item.name,
          type: item.type,
          unit: item.unit,
          hasNotes: item.hasNotes,
          order: item.order,
        }))
      );
      setInitialized(true);
    }
  }, [routine, initialized]);

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
      await api.updateRoutine(id, {
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
        title: 'Routine updated',
        description: 'Your routine has been updated. A new version snapshot was created.',
      });

      router.push(`/routines/${id}`);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update routine. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-2xl py-6 px-4">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!routine) {
    return (
      <div className="container max-w-2xl py-6 px-4">
        <header className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Routine Not Found</h1>
        </header>
        <Button asChild>
          <Link href="/">Back to Routines</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-6 px-4">
      <header className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/routines/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Edit Routine</h1>
      </header>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-yellow-800">
          <strong>Note:</strong> Editing items will create a new version. Previously printed cards
          will still work with their original version.
        </p>
      </div>

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
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
