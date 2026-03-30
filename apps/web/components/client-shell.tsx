'use client';

import { ReactNode } from 'react';
import { UploadProvider } from '@/lib/upload-context';
import { FabUpload } from '@/components/fab-upload';

export function ClientShell({ children }: { children: ReactNode }) {
  return (
    <UploadProvider>
      {children}
      <FabUpload />
    </UploadProvider>
  );
}
