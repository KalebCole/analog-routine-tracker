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

  // Todoist
  todoistApiToken: process.env.TODOIST_API_TOKEN || '',

  // App URLs
  apiUrl: process.env.API_URL || 'http://localhost:3001',

  // Feature flags
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
} as const;

// Validate required config in production
export function validateConfig(): void {
  if (config.isProduction) {
    const required = [
      'DATABASE_URL',
      'AZURE_STORAGE_CONNECTION_STRING',
      'AZURE_OPENAI_ENDPOINT',
      'AZURE_OPENAI_KEY',
    ];

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
}
