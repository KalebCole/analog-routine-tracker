import dotenv from 'dotenv';
import path from 'path';

// Load .env from apps/api directory (works from both src and dist)
// Try multiple locations to support both development and production
const envPaths = [
  path.resolve(__dirname, '../../.env'),       // From dist/config -> apps/api/.env
  path.resolve(__dirname, '../../../.env'),    // From src/config -> apps/api/.env
  path.resolve(__dirname, '../../../../.env'), // Legacy: project root
];

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    break;
  }
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/analog_routine_tracker',

  // Azure Blob Storage
  azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
  azureStorageContainerPhotos: process.env.AZURE_STORAGE_CONTAINER_PHOTOS || 'photos',
  azureStorageContainerPdfs: process.env.AZURE_STORAGE_CONTAINER_PDFS || 'pdfs',

  // Azure OpenAI
  azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
  azureOpenAIKey: process.env.AZURE_OPENAI_KEY || '',
  azureOpenAIDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',

  // Generic Vision API (preferred over Azure-specific config)
  visionApiBaseUrl: process.env.VISION_API_BASE_URL || '',  // e.g. https://api.openai.com/v1
  visionApiKey: process.env.VISION_API_KEY || '',
  visionModel: process.env.VISION_MODEL || 'gpt-4o',

  // Todoist
  todoistApiToken: process.env.TODOIST_API_TOKEN || '',

  // App URLs
  apiUrl: process.env.API_URL || 'http://localhost:3001',

  // Storage
  storageMode: (process.env.STORAGE_MODE || 'azure') as 'azure' | 'local',
  localStoragePath: process.env.LOCAL_STORAGE_PATH || '/data/uploads',

  // Feature flags
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
} as const;

// Validate required config in production
export function validateConfig(): void {
  if (config.isProduction) {
    const required: string[] = ['DATABASE_URL'];

    // Only require Azure Storage if not using local storage
    if (config.storageMode !== 'local') {
      required.push('AZURE_STORAGE_CONNECTION_STRING');
    }

    // Azure OpenAI is needed for OCR regardless of storage mode
    if (process.env.AZURE_OPENAI_ENDPOINT) {
      // Only validate key if endpoint is set
      required.push('AZURE_OPENAI_KEY');
    }

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
}
