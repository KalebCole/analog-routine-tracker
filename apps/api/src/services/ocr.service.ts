import { Item, ItemValue, OCRResult, OCRValue } from '@analog-routine-tracker/shared';
import { config } from '../config';
import {
  validateCheckboxValue,
  validateNumberValue,
  validateScaleValue,
  validateTextValue,
  needsReview,
} from '../utils/confidence';

/**
 * OCR Service using Azure OpenAI GPT-4o with vision
 */

interface GPT4oResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ExtractedValue {
  itemId: string;
  itemName: string;
  value: unknown;
  confidence: number;
  rawText?: string;
}

/**
 * Generate the system prompt for OCR extraction
 */
function generateSystemPrompt(items: Item[]): string {
  const itemDescriptions = items.map((item, index) => {
    let typeDesc = '';
    switch (item.type) {
      case 'checkbox':
        typeDesc = 'checkbox (checked or unchecked)';
        break;
      case 'number':
        typeDesc = `number${item.unit ? ` with unit "${item.unit}"` : ''}`;
        break;
      case 'scale':
        typeDesc = 'scale value from 1 to 5';
        break;
      case 'text':
        typeDesc = 'text/freeform answer';
        break;
    }
    return `${index + 1}. "${item.name}" - ${typeDesc}`;
  }).join('\n');

  return `You are an OCR assistant that extracts handwritten routine tracking data from paper cards.

The card contains the following items to extract:
${itemDescriptions}

For each item, analyze the handwritten content and provide:
1. The extracted value
2. A confidence score (0.0 to 1.0) based on handwriting legibility

Rules:
- Checkboxes: Look for check marks, X marks, or filled boxes = true. Empty boxes = false.
- Numbers: Extract the numeric value. Ignore unit text.
- Scale (1-5): Look for circled numbers or marks in boxes numbered 1-5.
- Text: Transcribe the handwritten text as accurately as possible.
- If a field appears empty or you cannot read it, set value to null with low confidence.
- Be conservative with confidence scores - only use high confidence (>0.9) for very clear handwriting.

Respond with a JSON object containing an array of extracted values. Example format:
{
  "values": [
    {"itemId": "item-id-1", "itemName": "Item Name", "value": true, "confidence": 0.95},
    {"itemId": "item-id-2", "itemName": "Item Name", "value": 42, "confidence": 0.85},
    {"itemId": "item-id-3", "itemName": "Item Name", "value": 3, "confidence": 0.7},
    {"itemId": "item-id-4", "itemName": "Item Name", "value": "sample text", "confidence": 0.8}
  ],
  "dateDetected": "2024-01-15",
  "versionDetected": 1,
  "overallConfidence": 0.82
}`;
}

/**
 * Generate the user prompt with item IDs
 */
function generateUserPrompt(items: Item[]): string {
  const itemsJson = items.map(item => ({
    id: item.id,
    name: item.name,
    type: item.type,
    unit: item.unit,
  }));

  return `Extract the values from this routine card image.

Items to extract (use these exact IDs):
${JSON.stringify(itemsJson, null, 2)}

Return your response as valid JSON only, no other text.`;
}

/**
 * Call Azure OpenAI GPT-4o with vision
 */
async function callGPT4oVision(
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string
): Promise<GPT4oResponse> {
  const endpoint = config.azureOpenAIEndpoint;
  const apiKey = config.azureOpenAIKey;
  const deployment = config.azureOpenAIDeployment;

  if (!endpoint || !apiKey || !deployment) {
    throw new Error('Azure OpenAI configuration missing');
  }

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.1, // Low temperature for more consistent extraction
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Azure OpenAI API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<GPT4oResponse>;
}

/**
 * Parse GPT-4o response into structured values
 */
function parseGPT4oResponse(responseContent: string, items: Item[]): {
  values: ExtractedValue[];
  dateDetected?: string;
  versionDetected?: number;
  overallConfidence: number;
} {
  // Try to extract JSON from the response
  let jsonStr = responseContent;

  // Handle markdown code blocks
  const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  // Validate and normalize values
  const values: ExtractedValue[] = parsed.values.map((v: any) => {
    const item = items.find(i => i.id === v.itemId);
    return {
      itemId: v.itemId,
      itemName: v.itemName || item?.name || 'Unknown',
      value: v.value,
      confidence: Math.max(0, Math.min(1, v.confidence || 0)),
      rawText: v.rawText,
    };
  });

  return {
    values,
    dateDetected: parsed.dateDetected,
    versionDetected: parsed.versionDetected,
    overallConfidence: parsed.overallConfidence || 0,
  };
}

/**
 * Convert extracted values to typed ItemValue objects
 */
function convertToItemValues(extractedValues: ExtractedValue[], items: Item[]): OCRValue[] {
  return extractedValues.map(ev => {
    const item = items.find(i => i.id === ev.itemId);
    if (!item) {
      return {
        itemId: ev.itemId,
        value: null,
        confidence: 0,
        needsReview: true,
      };
    }

    let typedValue: ItemValue['value'] = null;

    switch (item.type) {
      case 'checkbox':
        typedValue = validateCheckboxValue(ev.value);
        break;
      case 'number':
        typedValue = validateNumberValue(ev.value);
        break;
      case 'scale':
        typedValue = validateScaleValue(ev.value);
        break;
      case 'text':
        typedValue = validateTextValue(ev.value);
        break;
    }

    return {
      itemId: ev.itemId,
      value: typedValue,
      confidence: ev.confidence,
      needsReview: needsReview(ev.confidence),
      rawText: ev.rawText,
    };
  });
}

/**
 * Main OCR extraction function
 */
export async function extractFromImage(
  imageBuffer: Buffer,
  items: Item[],
  routineVersion: number
): Promise<OCRResult> {
  // Convert buffer to base64
  const imageBase64 = imageBuffer.toString('base64');

  // Generate prompts
  const systemPrompt = generateSystemPrompt(items);
  const userPrompt = generateUserPrompt(items);

  try {
    // Call GPT-4o Vision
    const response = await callGPT4oVision(imageBase64, systemPrompt, userPrompt);

    // Parse response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from GPT-4o');
    }

    const parsed = parseGPT4oResponse(content, items);

    // Convert to typed values
    const ocrValues = convertToItemValues(parsed.values, items);

    // Ensure all items have a value (even if null)
    const allValues = items.map(item => {
      const existing = ocrValues.find(v => v.itemId === item.id);
      if (existing) return existing;

      // Add missing items with null values
      return {
        itemId: item.id,
        value: null,
        confidence: 0,
        needsReview: true,
      };
    });

    // Calculate overall confidence
    const confidences = allValues.map(v => v.confidence);
    const overallConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    return {
      values: allValues,
      dateDetected: parsed.dateDetected || null,
      versionDetected: parsed.versionDetected || routineVersion,
      overallConfidence,
      needsReview: allValues.some(v => v.needsReview),
    };
  } catch (error) {
    console.error('OCR extraction error:', error);
    throw new Error(`OCR extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Mock OCR extraction for development (when Azure OpenAI is not configured)
 */
export async function mockExtractFromImage(
  _imageBuffer: Buffer,
  items: Item[],
  routineVersion: number
): Promise<OCRResult> {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Generate mock values with varying confidence
  const mockValues: OCRValue[] = items.map(item => {
    const confidence = 0.6 + Math.random() * 0.35; // 0.6-0.95
    let value: ItemValue['value'] = null;

    switch (item.type) {
      case 'checkbox':
        value = Math.random() > 0.3;
        break;
      case 'number':
        value = Math.floor(Math.random() * 100);
        break;
      case 'scale':
        value = Math.floor(Math.random() * 5) + 1;
        break;
      case 'text':
        value = `Sample text for ${item.name}`;
        break;
    }

    return {
      itemId: item.id,
      value,
      confidence: Math.round(confidence * 100) / 100,
      needsReview: needsReview(confidence),
    };
  });

  const overallConfidence = mockValues.reduce((sum, v) => sum + v.confidence, 0) / mockValues.length;

  return {
    values: mockValues,
    dateDetected: new Date().toISOString().split('T')[0],
    versionDetected: routineVersion,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
    needsReview: mockValues.some(v => v.needsReview),
  };
}

/**
 * Main export - uses real OCR if configured, mock otherwise
 */
export async function performOCR(
  imageBuffer: Buffer,
  items: Item[],
  routineVersion: number
): Promise<OCRResult> {
  // Check if Azure OpenAI is configured
  if (config.azureOpenAIEndpoint && config.azureOpenAIKey && config.azureOpenAIDeployment) {
    return extractFromImage(imageBuffer, items, routineVersion);
  }

  // Fall back to mock for development
  console.warn('Azure OpenAI not configured, using mock OCR');
  return mockExtractFromImage(imageBuffer, items, routineVersion);
}
