'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  Camera,
  Upload,
  X,
} from 'lucide-react';
import { OCRValue, ItemValue, RoutineDTO } from '@analog-routine-tracker/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRoutines } from '@/hooks/use-routines';
import { useRoutine } from '@/hooks/use-routine';
import { api, ApiError } from '@/lib/api';
import { OCRConfirmation } from '@/components/ocr-confirmation';

const PENDING_PHOTO_KEY = 'pendingPhotoDataUrl';

/** Convert a data URL to a File object for upload */
function dataUrlToFile(dataUrl: string, filename = 'photo.jpg'): File {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

interface OCRResultState {
  photoUrl: string;
  photoBlobName: string;
  values: OCRValue[];
  dateDetected: string | null;
  versionDetected: number;
  overallConfidence: number;
  needsReview: boolean;
}

export default function GlobalUploadPage() {
  const router = useRouter();
  const { routines, isLoading: routinesLoading } = useRoutines();

  const [preview, setPreview] = useState<string | null>(null);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResultState | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const hydratedRef = useRef(false);

  // Load the selected routine's full data for OCR confirmation
  const { routine: selectedRoutine } = useRoutine(selectedRoutineId || '');

  // Hydrate photo from sessionStorage (set by FAB before navigation)
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    try {
      const stored = sessionStorage.getItem(PENDING_PHOTO_KEY);
      if (stored) {
        setPreview(stored);
        setLocalFile(dataUrlToFile(stored));
        sessionStorage.removeItem(PENDING_PHOTO_KEY);
      }
    } catch {
      // sessionStorage unavailable — ignore
    }
  }, []);

  // Generate preview when a file is picked directly on this page
  useEffect(() => {
    if (!localFile || preview) return; // skip if we already have a preview (from hydration)

    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(localFile);
  }, [localFile, preview]);

  // Auto-select if only one routine
  useEffect(() => {
    if (routines.length === 1 && !selectedRoutineId) {
      setSelectedRoutineId(routines[0].id);
    }
  }, [routines, selectedRoutineId]);

  const activeFile = localFile;

  const handlePickFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && file.type.startsWith('image/')) {
        setLocalFile(file);
        // Generate preview for locally picked files
        const reader = new FileReader();
        reader.onloadend = () => setPreview(reader.result as string);
        reader.readAsDataURL(file);
      }
      input.remove();
    };
    input.click();
  };

  const handleClearPhoto = () => {
    setLocalFile(null);
    setPreview(null);
    setOcrResult(null);
    setUploadError(null);
    try { sessionStorage.removeItem(PENDING_PHOTO_KEY); } catch {}
  };

  const handleUpload = async () => {
    if (!activeFile || !selectedRoutineId) return;

    try {
      setIsUploading(true);
      setUploadError(null);
      const result = await api.uploadPhoto(selectedRoutineId, activeFile);
      setOcrResult({
        photoUrl: result.photoUrl,
        photoBlobName: result.photoBlobName,
        values: result.values,
        dateDetected: result.dateDetected,
        versionDetected: result.versionDetected,
        overallConfidence: result.overallConfidence,
        needsReview: result.needsReview,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setUploadError(err.message);
      } else {
        setUploadError('Failed to upload photo. Please try again.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirm = async (date: string, values: ItemValue[]) => {
    if (!ocrResult || !selectedRoutineId) return;

    try {
      setIsConfirming(true);
      setUploadError(null);
      await api.confirmOCR(selectedRoutineId, {
        date,
        values,
        photoUrl: ocrResult.photoUrl,
        photoBlobName: ocrResult.photoBlobName,
      });
      setIsComplete(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setUploadError(err.message);
      } else {
        setUploadError('Failed to save entry. Please try again.');
      }
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancelOCR = () => {
    setOcrResult(null);
    setUploadError(null);
  };

  // Success state
  if (isComplete) {
    return (
      <div className="container max-w-2xl py-6 px-4">
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Entry Saved!</h2>
          <p className="text-muted-foreground mb-6">
            Your completed routine has been recorded.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => router.replace('/')}>
              Home
            </Button>
            {selectedRoutineId && (
              <Button onClick={() => router.push(`/routines/${selectedRoutineId}/history`)}>
                View History
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // OCR confirmation state
  if (ocrResult && selectedRoutine) {
    return (
      <div className="container max-w-2xl py-6 px-4">
        <header className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={handleCancelOCR}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Confirm Data</h1>
            <p className="text-sm text-muted-foreground">{selectedRoutine.name}</p>
          </div>
        </header>

        {uploadError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-destructive">{uploadError}</p>
          </div>
        )}

        <OCRConfirmation
          items={selectedRoutine.items}
          ocrValues={ocrResult.values}
          dateDetected={ocrResult.dateDetected}
          overallConfidence={ocrResult.overallConfidence}
          photoUrl={ocrResult.photoUrl}
          onConfirm={handleConfirm}
          onCancel={handleCancelOCR}
          isConfirming={isConfirming}
        />
      </div>
    );
  }

  // Main upload flow: photo + routine picker
  return (
    <div className="container max-w-2xl py-6 px-4">
      <header className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.replace('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Upload Routine</h1>
      </header>

      {uploadError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6">
          <p className="text-sm text-destructive">{uploadError}</p>
        </div>
      )}

      {/* Photo section */}
      <div className="mb-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          1. Photo of your card
        </h2>
        {preview ? (
          <Card className="relative overflow-hidden">
            <img
              src={preview}
              alt="Routine card"
              className="w-full h-auto max-h-[300px] object-contain"
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2"
              onClick={handleClearPhoto}
              disabled={isUploading}
            >
              <X className="h-4 w-4" />
            </Button>
          </Card>
        ) : (
          <Card
            className="border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors"
            onClick={handlePickFile}
          >
            <CardContent className="flex flex-col items-center gap-3 py-8">
              <div className="p-3 rounded-full bg-muted">
                <Camera className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Tap to take a photo or choose from gallery
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Routine picker */}
      <div className="mb-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          2. Select routine
        </h2>
        {routinesLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : routines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No routines found.{' '}
            <Link href="/routines/new" className="underline">
              Create one first.
            </Link>
          </p>
        ) : (
          <div className="grid gap-2">
            {routines.map((r) => (
              <Card
                key={r.id}
                className={`cursor-pointer transition-colors ${
                  selectedRoutineId === r.id
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-muted-foreground/50'
                }`}
                onClick={() => setSelectedRoutineId(r.id)}
              >
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <div
                    className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                      selectedRoutineId === r.id
                        ? 'border-primary'
                        : 'border-muted-foreground/40'
                    }`}
                  >
                    {selectedRoutineId === r.id && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.items.length} items · v{r.version}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Process button */}
      <Button
        className="w-full"
        size="lg"
        onClick={handleUpload}
        disabled={!activeFile || !selectedRoutineId || isUploading}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing with AI...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            Process Card
          </>
        )}
      </Button>
    </div>
  );
}
