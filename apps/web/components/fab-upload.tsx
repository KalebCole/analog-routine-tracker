'use client';

import { useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Camera } from 'lucide-react';
import { useUploadContext } from '@/lib/upload-context';

export function FabUpload() {
  const router = useRouter();
  const pathname = usePathname();
  const { setPendingFile } = useUploadContext();
  const inputRef = useRef<HTMLInputElement>(null);

  // Hide on upload pages
  if (pathname === '/upload' || pathname.endsWith('/upload')) {
    return null;
  }

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.type.startsWith('image/')) {
        setPendingFile(file);
        router.push('/upload');
      }
      // Reset so the same file can be selected again
      if (inputRef.current) inputRef.current.value = '';
    },
    [setPendingFile, router]
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-transform"
        aria-label="Upload routine photo"
      >
        <Camera className="h-6 w-6" />
      </button>
    </>
  );
}
