'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface UploadContextType {
  pendingFile: File | null;
  setPendingFile: (file: File | null) => void;
}

const UploadContext = createContext<UploadContextType>({
  pendingFile: null,
  setPendingFile: () => {},
});

export function UploadProvider({ children }: { children: ReactNode }) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  return (
    <UploadContext.Provider value={{ pendingFile, setPendingFile }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUploadContext() {
  return useContext(UploadContext);
}
