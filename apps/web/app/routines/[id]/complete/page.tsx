'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { ItemValue } from '@analog-routine-tracker/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CompletionForm } from '@/components/completion-form';
import { useRoutine } from '@/hooks/use-routine';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { getToday } from '@/lib/utils';

interface PageProps {
  params: { id: string };
}

export default function CompleteRoutinePage({ params }: PageProps) {
  const { id } = params;
  const router = useRouter();
  const { toast } = useToast();
  const { routine, isLoading, error } = useRoutine(id);

  const [date, setDate] = useState(getToday());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: ItemValue[]) => {
    try {
      setIsSubmitting(true);
      await api.completeRoutine(id, { date, values });

      toast({
        title: 'Routine completed',
        description: 'Your routine has been saved.',
      });

      router.push(`/routines/${id}/history`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save completion';

      if (message.includes('already exists')) {
        toast({
          title: 'Already completed',
          description: 'You have already completed this routine for this date. Edit the existing entry instead.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
      }
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

  if (error || !routine) {
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
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6" />
            Complete Routine
          </h1>
          <p className="text-sm text-muted-foreground">{routine.name}</p>
        </div>
      </header>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={getToday()}
            disabled={isSubmitting}
          />
        </div>

        <CompletionForm
          items={routine.items}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}
