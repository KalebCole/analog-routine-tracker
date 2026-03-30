'use client';

import { ReactNode } from 'react';
import { FabUpload } from '@/components/fab-upload';

export function ClientShell({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <FabUpload />
    </>
  );
}
