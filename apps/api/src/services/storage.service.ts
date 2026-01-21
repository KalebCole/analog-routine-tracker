import { v4 as uuidv4 } from 'uuid';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from '@azure/storage-blob';
import { config } from '../config';

export interface UploadResult {
  url: string;
  blobName: string;
}

export interface StorageService {
  uploadPDF(buffer: Buffer, routineId: string): Promise<UploadResult>;
  uploadPhoto(buffer: Buffer, routineId: string): Promise<UploadResult>;
  deleteBlob(containerName: string, blobName: string): Promise<boolean>;
  generateSasUrl(containerName: string, blobName: string, expiresIn: number): Promise<string>;
}

/**
 * Mock storage service for development
 * Used when Azure Storage credentials are not configured
 */
class MockStorageService implements StorageService {
  private blobs = new Map<string, Buffer>();

  async uploadPDF(buffer: Buffer, routineId: string): Promise<UploadResult> {
    const blobName = `${routineId}/${uuidv4()}.pdf`;
    const url = `${config.apiUrl}/api/files/pdfs/${blobName}`;

    this.blobs.set(`pdfs/${blobName}`, buffer);

    return { url, blobName };
  }

  async uploadPhoto(buffer: Buffer, routineId: string): Promise<UploadResult> {
    const blobName = `${routineId}/${uuidv4()}.jpg`;
    const url = `${config.apiUrl}/api/files/photos/${blobName}`;

    this.blobs.set(`photos/${blobName}`, buffer);

    return { url, blobName };
  }

  async deleteBlob(containerName: string, blobName: string): Promise<boolean> {
    const key = `${containerName}/${blobName}`;
    if (this.blobs.has(key)) {
      this.blobs.delete(key);
      return true;
    }
    return true; // Return true even if not found (idempotent delete)
  }

  async generateSasUrl(containerName: string, blobName: string, _expiresIn: number): Promise<string> {
    return `${config.apiUrl}/api/files/${containerName}/${blobName}`;
  }

  // For mock file serving
  getBlob(containerName: string, blobName: string): Buffer | undefined {
    return this.blobs.get(`${containerName}/${blobName}`);
  }
}

/**
 * Azure Blob Storage service implementation
 * Used when AZURE_STORAGE_CONNECTION_STRING is configured
 */
class AzureStorageService implements StorageService {
  private blobServiceClient: BlobServiceClient;
  private accountName: string;
  private accountKey: string;

  constructor() {
    const connectionString = config.azureStorageConnectionString;
    if (!connectionString) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING is required for AzureStorageService');
    }

    this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

    // Parse account name and key from connection string for SAS generation
    const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
    const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/);

    if (!accountNameMatch || !accountKeyMatch) {
      throw new Error('Could not parse AccountName and AccountKey from connection string');
    }

    this.accountName = accountNameMatch[1];
    this.accountKey = accountKeyMatch[1];
  }

  async uploadPDF(buffer: Buffer, routineId: string): Promise<UploadResult> {
    const containerClient = this.blobServiceClient.getContainerClient(config.azureStorageContainerPdfs);

    // Ensure container exists
    await containerClient.createIfNotExists({ access: 'blob' });

    const blobName = `${routineId}/${uuidv4()}.pdf`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: 'application/pdf' },
    });

    return { url: blockBlobClient.url, blobName };
  }

  async uploadPhoto(buffer: Buffer, routineId: string): Promise<UploadResult> {
    const containerClient = this.blobServiceClient.getContainerClient(config.azureStorageContainerPhotos);

    // Ensure container exists
    await containerClient.createIfNotExists({ access: 'blob' });

    const blobName = `${routineId}/${uuidv4()}.jpg`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: 'image/jpeg' },
    });

    return { url: blockBlobClient.url, blobName };
  }

  async deleteBlob(containerName: string, blobName: string): Promise<boolean> {
    try {
      const containerClient = this.blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
      return true;
    } catch (error) {
      console.error(`Failed to delete blob ${containerName}/${blobName}:`, error);
      return false;
    }
  }

  async generateSasUrl(containerName: string, blobName: string, expiresIn: number): Promise<string> {
    const containerClient = this.blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + expiresIn * 1000);

    const sharedKeyCredential = new StorageSharedKeyCredential(this.accountName, this.accountKey);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        startsOn,
        expiresOn,
      },
      sharedKeyCredential
    ).toString();

    return `${blockBlobClient.url}?${sasToken}`;
  }
}

// Export singleton instance based on configuration
// Use AzureStorageService when credentials are available, otherwise fallback to mock
const createStorageService = (): StorageService & { getBlob?: (c: string, b: string) => Buffer | undefined } => {
  if (config.azureStorageConnectionString) {
    console.log('[Storage] Using Azure Blob Storage');
    return new AzureStorageService();
  }

  console.log('[Storage] Using mock storage (development mode)');
  return new MockStorageService();
};

export const storageService = createStorageService();
