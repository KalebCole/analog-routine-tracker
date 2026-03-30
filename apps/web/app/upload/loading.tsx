import { Loader2 } from 'lucide-react';

export default function UploadLoading() {
  return (
    <div className="container max-w-2xl py-6 px-4">
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
