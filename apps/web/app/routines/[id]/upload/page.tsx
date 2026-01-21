'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { OCRValue, ItemValue } from '@analog-routine-tracker/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useRoutine } from '@/hooks/use-routine';
import { api, ApiError } from '@/lib/api';
import { PhotoUploader } from '@/components/photo-uploader';
import { OCRConfirmation } from '@/components/ocr-confirmation';

interface PageProps {
  params: { id: string };
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

export default function UploadRoutinePage({ params }: PageProps) {
  const { id } = params;
  const { routine, isLoading, error } = useRoutine(id);

  const [isUploading, setIsUploading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResultState | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const handleUpload = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadError(null);

      const result = await api.uploadPhoto(id, file);

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
    if (!ocrResult) return;

    try {
      setIsConfirming(true);
      setUploadError(null);

      await api.confirmOCR(id, {
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

  const handleCancel = () => {
    setOcrResult(null);
    setUploadError(null);
  };

  if (isLoading) {
    return (
      <div className="container max-w-2xl py-6 px-4">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !routine) {
    return (
      <div className="container max-w-2xl py-6 px-4">
        <header className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Routine Not Found</h1>
        </header>
        <Button asChild>
          <Link href="/">Back to Routines</Link>
        </Button>
      </div>
    );
  }

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
            <Button asChild variant="outline">
              <Link href={`/routines/${id}`}>Back to Routine</Link>
            </Button>
            <Button asChild>
              <Link href={`/routines/${id}/history`}>View History</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-6 px-4">
      <header className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/routines/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {ocrResult ? 'Confirm Data' : 'Upload Photo'}
          </h1>
          <p className="text-sm text-muted-foreground">{routine.name}</p>
        </div>
      </header>

      {/* Error display */}
      {uploadError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6">
          <p className="text-sm text-destructive">{uploadError}</p>
        </div>
      )}

      {/* OCR result confirmation */}
      {ocrResult ? (
        <OCRConfirmation
          items={routine.items}
          ocrValues={ocrResult.values}
          dateDetected={ocrResult.dateDetected}
          overallConfidence={ocrResult.overallConfidence}
          photoUrl={ocrResult.photoUrl}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isConfirming={isConfirming}
        />
      ) : (
        <>
          {/* Instructions */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">How it works</CardTitle>
              <CardDescription>
                Upload a photo of your completed card and we&apos;ll extract the data using OCR
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Take a photo of your completed routine card</li>
                <li>Make sure all items are clearly visible</li>
                <li>We&apos;ll extract the values using AI</li>
                <li>Review and confirm the extracted data</li>
              </ol>
            </CardContent>
          </Card>

          {/* Photo uploader */}
          <PhotoUploader
            onUpload={handleUpload}
            isUploading={isUploading}
          />
        </>
      )}
    </div>
  );
}
