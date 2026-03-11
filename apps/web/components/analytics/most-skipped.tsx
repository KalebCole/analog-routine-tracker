'use client';

import { AlertTriangle } from 'lucide-react';

interface SkippedItem {
  itemId: string;
  itemName: string;
  groupName: string | null;
  completionRate: number;
}

interface MostSkippedProps {
  items: SkippedItem[];
}

export function MostSkipped({ items }: MostSkippedProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.itemId} className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.itemName}</p>
            {item.groupName && (
              <p className="text-xs text-muted-foreground">{item.groupName}</p>
            )}
          </div>
          <span className="text-sm font-mono text-muted-foreground">
            {item.completionRate}%
          </span>
        </div>
      ))}
    </div>
  );
}
