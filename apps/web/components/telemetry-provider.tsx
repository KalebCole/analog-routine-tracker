'use client';

import { useEffect } from 'react';
import { useReportWebVitals } from 'next/web-vitals';
import { installGlobalErrorHandlers, reportWebVital } from '@/lib/telemetry';

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  useReportWebVitals((metric) => {
    reportWebVital(metric);
  });

  return <>{children}</>;
}
