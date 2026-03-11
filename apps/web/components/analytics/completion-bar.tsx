'use client';

interface CompletionBarProps {
  completed: number;
  total: number;
  showLabel?: boolean;
}

export function CompletionBar({ completed, total, showLabel = true }: CompletionBarProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-1">
      {showLabel && (
        <div className="flex justify-between text-sm">
          <span className="font-medium">{completed}/{total} items</span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
      )}
      <div className="h-3 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
