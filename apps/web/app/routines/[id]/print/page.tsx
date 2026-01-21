'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer, Loader2, Download, CheckCircle, Package, AlertTriangle } from 'lucide-react';
import { CardLayout } from '@analog-routine-tracker/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useRoutine } from '@/hooks/use-routine';
import { api, PrintOptionsResponse, ApiError } from '@/lib/api';

interface PageProps {
  params: { id: string };
}

export default function PrintRoutinePage({ params }: PageProps) {
  const { id } = params;
  const { routine, isLoading: routineLoading, error: routineError } = useRoutine(id);

  const [printOptions, setPrintOptions] = useState<PrintOptionsResponse | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [selectedLayout, setSelectedLayout] = useState<CardLayout>('quarter');
  const [quantity, setQuantity] = useState(4);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generationResult, setGenerationResult] = useState<{
    pagesGenerated: number;
    cardsPerPage: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPrintConfirmed, setIsPrintConfirmed] = useState(false);

  // Fetch print options
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        setIsLoadingOptions(true);
        const options = await api.getPrintOptions(id);
        setPrintOptions(options);
        setSelectedLayout(options.suggestedLayout);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Failed to load print options');
        }
      } finally {
        setIsLoadingOptions(false);
      }
    };

    if (id) {
      fetchOptions();
    }
  }, [id]);

  const handleGeneratePDF = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      setPdfUrl(null);
      setGenerationResult(null);
      setIsPrintConfirmed(false);

      const result = await api.generatePDF(id, {
        layout: selectedLayout,
        quantity,
      });

      setPdfUrl(result.pdf.url);
      setGenerationResult({
        pagesGenerated: result.pagesGenerated,
        cardsPerPage: result.cardsPerPage,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to generate PDF');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmPrint = async () => {
    try {
      setError(null);
      await api.confirmPrint(id, quantity);
      setIsPrintConfirmed(true);

      // Refresh print options to get updated inventory
      const options = await api.getPrintOptions(id);
      setPrintOptions(options);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to confirm print');
      }
    }
  };

  const isLoading = routineLoading || isLoadingOptions;

  if (isLoading) {
    return (
      <div className="container max-w-2xl py-6 px-4">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (routineError || !routine) {
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

  const layouts = printOptions?.layouts || {
    quarter: { name: 'Quarter Page', dimensions: '4.25" × 5.5"', cardsPerPage: 4, maxItems: 8, suitable: true },
    half: { name: 'Half Page', dimensions: '5.5" × 8.5"', cardsPerPage: 2, maxItems: 15, suitable: true },
    full: { name: 'Full Page', dimensions: '8.5" × 11"', cardsPerPage: 1, maxItems: 999, suitable: true },
  };

  const inventory = printOptions?.inventory || { printed: 0, uploaded: 0, remaining: 0, alertThreshold: 5 };
  const needsRestock = inventory.remaining <= inventory.alertThreshold && inventory.printed > 0;

  return (
    <div className="container max-w-2xl py-6 px-4">
      <header className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/routines/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Print Cards</h1>
          <p className="text-sm text-muted-foreground">{routine.name}</p>
        </div>
      </header>

      {/* Inventory Status */}
      {inventory.printed > 0 && (
        <Card className={`mb-6 ${needsRestock ? 'border-yellow-500' : ''}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Paper Inventory
              {needsRestock && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{inventory.printed}</p>
                <p className="text-sm text-muted-foreground">Printed</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{inventory.uploaded}</p>
                <p className="text-sm text-muted-foreground">Used</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${needsRestock ? 'text-yellow-500' : ''}`}>
                  {inventory.remaining}
                </p>
                <p className="text-sm text-muted-foreground">Remaining</p>
              </div>
            </div>
            {needsRestock && (
              <p className="text-sm text-yellow-600 mt-3 text-center">
                Running low on cards! Consider printing more.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Layout Selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Card Layout</CardTitle>
          <CardDescription>
            {routine.items.length} items - Recommended: {printOptions?.suggestedLayout || 'quarter'} page
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {(['quarter', 'half', 'full'] as const).map((layout) => {
              const layoutInfo = layouts[layout];
              const isSelected = selectedLayout === layout;
              const isRecommended = layout === printOptions?.suggestedLayout;

              return (
                <button
                  key={layout}
                  onClick={() => setSelectedLayout(layout)}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  } ${!layoutInfo.suitable ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {layoutInfo.name}
                        {isRecommended && (
                          <span className="ml-2 text-xs text-primary">(Recommended)</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {layoutInfo.dimensions} • {layoutInfo.cardsPerPage} cards per page
                      </p>
                    </div>
                    {isSelected && <CheckCircle className="h-5 w-5 text-primary" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quantity */}
          <div className="pt-4 border-t">
            <Label htmlFor="quantity" className="text-sm font-medium">
              Number of Cards
            </Label>
            <div className="flex items-center gap-3 mt-2">
              <Input
                id="quantity"
                type="number"
                min={1}
                max={100}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                = {Math.ceil(quantity / layouts[selectedLayout].cardsPerPage)} page(s)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Generation Result */}
      {pdfUrl && generationResult && (
        <Card className="mb-6 border-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              PDF Generated!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Created {generationResult.pagesGenerated} page(s) with {quantity} card(s).
            </p>

            <div className="flex gap-3">
              <Button asChild className="flex-1">
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </a>
              </Button>
            </div>

            {!isPrintConfirmed && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-3">
                  After printing, confirm to update your inventory:
                </p>
                <Button variant="outline" onClick={handleConfirmPrint} className="w-full">
                  <Printer className="h-4 w-4 mr-2" />
                  I Printed {quantity} Card(s)
                </Button>
              </div>
            )}

            {isPrintConfirmed && (
              <div className="pt-4 border-t">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">Inventory updated!</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generate Button */}
      {!pdfUrl && (
        <Button
          className="w-full"
          onClick={handleGeneratePDF}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating PDF...
            </>
          ) : (
            <>
              <Printer className="h-4 w-4 mr-2" />
              Generate PDF
            </>
          )}
        </Button>
      )}

      {/* Generate Another */}
      {pdfUrl && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setPdfUrl(null);
            setGenerationResult(null);
            setIsPrintConfirmed(false);
          }}
        >
          Generate Another PDF
        </Button>
      )}

      {/* Version Info */}
      <p className="text-xs text-muted-foreground text-center mt-4">
        Cards will include version marker v{routine.version} for OCR compatibility
      </p>
    </div>
  );
}
