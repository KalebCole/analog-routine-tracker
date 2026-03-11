'use client';

import { Flame, Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StreakCardProps {
  current: number;
  longest: number;
  consistencyScore: number;
}

export function StreakCard({ current, longest, consistencyScore }: StreakCardProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card>
        <CardContent className="pt-4 pb-4 text-center">
          <Flame className="h-6 w-6 mx-auto mb-1 text-orange-500" />
          <p className="text-2xl font-bold">{current}</p>
          <p className="text-xs text-muted-foreground">day streak</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-4 text-center">
          <Trophy className="h-6 w-6 mx-auto mb-1 text-yellow-500" />
          <p className="text-2xl font-bold">{longest}</p>
          <p className="text-xs text-muted-foreground">best streak</p>
        </CardContent>
      </Card>
    </div>
  );
}
