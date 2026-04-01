'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { reportError } from '@/lib/telemetry';

export default function UploadError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Upload Error]', error);
    reportError(error, { boundary: 'upload', digest: error.digest });
  }, [error]);

  return (
    <div className="container max-w-2xl py-6 px-4">
      <div className="text-center py-12">
        <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {error.message || 'An unexpected error occurred while loading the upload page.'}
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            Go Home
          </Button>
          <Button onClick={reset}>
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}
