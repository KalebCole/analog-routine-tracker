import { Item, LeafItem, ItemValue, OCRResult, OCRValue, isGroupItem, flattenItems } from '@analog-routine-tracker/shared';
import { config } from '../config';
import {
  validateCheckboxValue,
  validateNumberValue,
  validateScaleValue,
  validateTextValue,
  needsReview,
} from '../utils/confidence';

/**
 * OCR Service — generic OpenAI-compatible vision API
 * Prefers VISION_API_BASE_URL if set, falls back to Azure OpenAI
 */

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface VisionAPIConfig {
  url: string;
  headers: Record<string, string>;
  model?: string; // included in body for generic API, omitted for Azure (model is in the URL)
}

interface ExtractedValue {
  itemId: string;
  itemName: string;
  value: unknown;
  confidence: number;
  rawText?: string;
}

/**
 * Get human-readable description of an item type
 */
function getItemTypeDescription(item: LeafItem): string {
  switch (item.type) {
    case 'checkbox':
      return 'checkbox (checked or unchecked)';
    case 'number':
      return `number${item.unit ? ` with unit "${item.unit}"` : ''}`;
    case 'scale':
      return 'scale value from 1 to 5';
    case 'text':
      return 'text/freeform answer';
  }
}

/**
 * Generate the system prompt for OCR extraction
 */
function generateSystemPrompt(items: Item[]): string {
  let counter = 0;
  const itemDescriptions: string[] = [];

  for (const item of items) {
    if (isGroupItem(item)) {
      // Add group header
      itemDescriptions.push(`\n[Group: ${item.name}]`);
      // Add children with their descriptions
      for (const child of item.children) {
        counter++;
        const typeDesc = getItemTypeDescription(child);
        itemDescriptions.push(`  ${counter}. "${child.name}" - ${typeDesc}`);
      }
    } else {
      counter++;
      const typeDesc = getItemTypeDescription(item);
      itemDescriptions.push(`${counter}. "${item.name}" - ${typeDesc}`);
    }
  }

  const itemDescriptionsText = itemDescriptions.join('\n');

  return `You are an OCR assistant that extracts handwritten routine tracking data from paper cards.

The card contains the following items to extract:
${itemDescriptionsText}

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
 * Flattens group items but includes group context
 */
function generateUserPrompt(items: Item[]): string {
  const flatItemsJson: Array<{ id: string; name: string; type: string; unit?: string; groupName?: string }> = [];

  for (const item of items) {
    if (isGroupItem(item)) {
      for (const child of item.children) {
        flatItemsJson.push({
          id: child.id,
          name: child.name,
          type: child.type,
          unit: child.unit,
          groupName: item.name,
        });
      }
    } else {
      flatItemsJson.push({
        id: item.id,
        name: item.name,
        type: item.type,
        unit: item.unit,
      });
    }
  }

  return `Extract the values from this routine card image.

Items to extract (use these exact IDs):
${JSON.stringify(flatItemsJson, null, 2)}

Return your response as valid JSON only, no other text.`;
}

/**
 * Resolve which vision API to call.
 * Priority: VISION_API_BASE_URL > Azure OpenAI > none
 */
function resolveVisionConfig(): VisionAPIConfig {
  // 1. Generic OpenAI-compatible endpoint
  if (config.visionApiBaseUrl && config.visionApiKey) {
    return {
      url: `${config.visionApiBaseUrl.replace(/\/+$/, '')}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.visionApiKey}`,
      },
      model: config.visionModel,
    };
  }

  // 2. Azure OpenAI (legacy)
  const { azureOpenAIEndpoint: endpoint, azureOpenAIKey: apiKey, azureOpenAIDeployment: deployment } = config;
  if (endpoint && apiKey && deployment) {
    return {
      url: `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`,
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      // model is embedded in the Azure URL, not the body
    };
  }

  throw new Error('No vision API configured. Set VISION_API_BASE_URL + VISION_API_KEY, or AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY + AZURE_OPENAI_DEPLOYMENT.');
}

function detectMimeType(base64: string): string {
  // Check magic bytes from base64-encoded data
  const header = Buffer.from(base64.slice(0, 16), 'base64');
  if (header[0] === 0xFF && header[1] === 0xD8) return 'image/jpeg';
  if (header[0] === 0x89 && header[1] === 0x50) return 'image/png';
  if (header[0] === 0x52 && header[1] === 0x49) return 'image/webp'; // RIFF
  if (header[0] === 0x47 && header[1] === 0x49) return 'image/gif';
  return 'image/jpeg'; // fallback
}

/**
 * Call any OpenAI-compatible vision API
 */
async function callVisionAPI(
  imageBase64: string,
  systemPrompt: string,
  userPrompt: string
): Promise<ChatCompletionResponse> {
  const visionConfig = resolveVisionConfig();

  const body: Record<string, unknown> = {
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${detectMimeType(imageBase64)};base64,${imageBase64}`,
              detail: 'high',
            },
          },
        ],
      },
    ],
    max_completion_tokens: 4096,
    temperature: 0.1,
  };

  if (visionConfig.model) {
    body.model = visionConfig.model;
  }

  const response = await fetch(visionConfig.url, {
    method: 'POST',
    headers: visionConfig.headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vision API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<ChatCompletionResponse>;
}

/**
 * Parse vision API response into structured values
 */
function parseVisionResponse(responseContent: string, items: Item[]): {
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
 * Uses flattened leaf items for type checking
 */
function convertToItemValues(extractedValues: ExtractedValue[], items: Item[]): OCRValue[] {
  // Flatten items to get only leaf items for type checking
  const leafItems = flattenItems(items);

  return extractedValues.map(ev => {
    const item = leafItems.find(i => i.id === ev.itemId);
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
    // Call Vision API
    const response = await callVisionAPI(imageBase64, systemPrompt, userPrompt);

    // Parse response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from vision API');
    }

    const parsed = parseVisionResponse(content, items);

    // Convert to typed values
    const ocrValues = convertToItemValues(parsed.values, items);

    // Flatten items and ensure all leaf items have a value (even if null)
    const leafItems = flattenItems(items);
    const allValues = leafItems.map(item => {
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

  // Flatten items and generate mock values with varying confidence
  const leafItems = flattenItems(items);
  const mockValues: OCRValue[] = leafItems.map(item => {
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
  // Check if any vision API is configured
  const hasGenericVision = config.visionApiBaseUrl && config.visionApiKey;
  const hasAzureVision = config.azureOpenAIEndpoint && config.azureOpenAIKey && config.azureOpenAIDeployment;

  if (hasGenericVision || hasAzureVision) {
    return extractFromImage(imageBuffer, items, routineVersion);
  }

  // Fall back to mock for development
  console.warn('No vision API configured, using mock OCR. Set VISION_API_BASE_URL + VISION_API_KEY or Azure OpenAI env vars.');
  return mockExtractFromImage(imageBuffer, items, routineVersion);
}
