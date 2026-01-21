import { spawn } from 'child_process';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import { Item, CardLayout, PrintResult } from '@analog-routine-tracker/shared';

const SCRIPTS_DIR = path.join(__dirname, '../../scripts');
const TEMP_DIR = path.join(__dirname, '../../temp');

interface PDFGeneratorInput {
  name: string;
  items: Item[];
  version: number;
  quantity: number;
}

interface PDFGeneratorResult {
  layout: string;
  cards_per_page: number;
  pages_generated: number;
  cards_generated: number;
}

/**
 * Determines the card layout based on item count
 */
export function determineCardLayout(itemCount: number): CardLayout {
  if (itemCount <= 8) return 'quarter';
  if (itemCount <= 15) return 'half';
  return 'full';
}

/**
 * Generates a PDF of routine cards using the Python script
 */
export async function generatePDF(
  routineName: string,
  items: Item[],
  version: number,
  quantity: number
): Promise<{ pdfPath: string; result: PDFGeneratorResult }> {
  // Ensure temp directory exists
  await fs.mkdir(TEMP_DIR, { recursive: true });

  const inputId = uuidv4();
  const inputPath = path.join(TEMP_DIR, `${inputId}.json`);
  const outputPath = path.join(TEMP_DIR, `${inputId}.pdf`);

  // Prepare input data
  const inputData: PDFGeneratorInput = {
    name: routineName,
    items: items.map((item) => ({
      name: item.name,
      type: item.type,
      unit: item.unit,
      hasNotes: item.hasNotes,
      order: item.order,
    })) as Item[],
    version,
    quantity,
  };

  // Write input file
  await fs.writeFile(inputPath, JSON.stringify(inputData));

  try {
    // Run Python script
    const result = await runPythonScript(inputPath, outputPath);

    // Clean up input file
    await fs.unlink(inputPath).catch(() => {});

    return { pdfPath: outputPath, result };
  } catch (error) {
    // Clean up on error
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  }
}

/**
 * Runs the Python PDF generation script
 */
function runPythonScript(
  inputPath: string,
  outputPath: string
): Promise<PDFGeneratorResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, 'generate-card-pdf.py');

    const pythonProcess = spawn('python', [
      scriptPath,
      '--input',
      inputPath,
      '--output',
      outputPath,
    ]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`PDF generation failed: ${stderr || 'Unknown error'}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch {
        reject(new Error('Failed to parse PDF generation result'));
      }
    });

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start PDF generation: ${error.message}`));
    });
  });
}

/**
 * Cleans up a generated PDF file
 */
export async function cleanupPDF(pdfPath: string): Promise<void> {
  await fs.unlink(pdfPath).catch(() => {});
}

/**
 * Reads a generated PDF file
 */
export async function readPDF(pdfPath: string): Promise<Buffer> {
  return fs.readFile(pdfPath);
}

/**
 * Creates a PrintResult from generation data
 */
export function createPrintResult(
  pdfUrl: string,
  generatorResult: PDFGeneratorResult
): PrintResult {
  return {
    pdfUrl,
    pagesGenerated: generatorResult.pages_generated,
    cardsPerPage: generatorResult.cards_per_page,
    layout: generatorResult.layout as CardLayout,
  };
}
