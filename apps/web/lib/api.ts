import {
  RoutineDTO,
  CreateRoutineRequest,
  UpdateRoutineRequest,
  CompletedRoutineDTO,
  CompleteRoutineRequest,
  ConfirmOCRRequest,
  UpdateHistoryRequest,
  OCRResult,
  PrintRequest,
  PrintResult,
  RoutineStatsDTO,
  APIError,
} from '@analog-routine-tracker/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Additional response types
export interface LayoutOption {
  name: string;
  dimensions: string;
  cardsPerPage: number;
  maxItems: number;
  suitable: boolean;
}

export interface InventoryStatus {
  printed: number;
  uploaded: number;
  remaining: number;
  alertThreshold: number;
}

export interface PrintOptionsResponse {
  routine: {
    id: string;
    name: string;
    itemCount: number;
    version: number;
  };
  suggestedLayout: 'quarter' | 'half' | 'full';
  inventory: InventoryStatus;
  layouts: {
    quarter: LayoutOption;
    half: LayoutOption;
    full: LayoutOption;
  };
}

export interface InventoryResponse extends InventoryStatus {
  routineId: string;
  routineName: string;
  lastPrintedAt: string | null;
  lastAlertSentAt: string | null;
  needsRestock: boolean;
}

export interface AllInventoryResponse {
  inventories: Array<InventoryResponse>;
  summary: {
    total: number;
    needsRestock: number;
    routinesNeedingRestock: Array<{ id: string; name: string; remaining: number }>;
  };
}

// OCR Upload response
export interface UploadPhotoResponse extends OCRResult {
  photoUrl: string;
  photoBlobName: string;
  routineVersion: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error: APIError = await response.json().catch(() => ({
        error: 'NetworkError',
        message: 'Failed to connect to server',
      }));
      throw new ApiError(response.status, error.message, error.details);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Routines
  async getRoutines(): Promise<RoutineDTO[]> {
    return this.request<RoutineDTO[]>('/routines');
  }

  async getRoutine(id: string): Promise<RoutineDTO> {
    return this.request<RoutineDTO>(`/routines/${id}`);
  }

  async createRoutine(data: CreateRoutineRequest): Promise<RoutineDTO> {
    return this.request<RoutineDTO>('/routines', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRoutine(id: string, data: UpdateRoutineRequest): Promise<RoutineDTO> {
    return this.request<RoutineDTO>(`/routines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteRoutine(id: string): Promise<void> {
    return this.request<void>(`/routines/${id}`, {
      method: 'DELETE',
    });
  }

  // Completions
  async completeRoutine(routineId: string, data: CompleteRoutineRequest): Promise<CompletedRoutineDTO> {
    return this.request<CompletedRoutineDTO>(`/routines/${routineId}/complete`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async uploadPhoto(routineId: string, file: File): Promise<UploadPhotoResponse> {
    const formData = new FormData();
    formData.append('photo', file);

    const response = await fetch(`${this.baseUrl}/api/routines/${routineId}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error: APIError = await response.json().catch(() => ({
        error: 'UploadError',
        message: 'Failed to upload photo',
      }));
      throw new ApiError(response.status, error.message, error.details);
    }

    return response.json();
  }

  async confirmOCR(routineId: string, data: ConfirmOCRRequest): Promise<CompletedRoutineDTO> {
    return this.request<CompletedRoutineDTO>(`/routines/${routineId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // History
  async getHistory(
    routineId: string,
    params?: { startDate?: string; endDate?: string; page?: number; pageSize?: number }
  ): Promise<{ data: CompletedRoutineDTO[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());

    const query = searchParams.toString();
    return this.request(`/routines/${routineId}/history${query ? `?${query}` : ''}`);
  }

  async getHistoryEntry(routineId: string, date: string): Promise<CompletedRoutineDTO> {
    return this.request<CompletedRoutineDTO>(`/routines/${routineId}/history/${date}`);
  }

  async updateHistoryEntry(
    routineId: string,
    date: string,
    data: UpdateHistoryRequest
  ): Promise<CompletedRoutineDTO> {
    return this.request<CompletedRoutineDTO>(`/routines/${routineId}/history/${date}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Print
  async getPrintOptions(routineId: string): Promise<PrintOptionsResponse> {
    return this.request<PrintOptionsResponse>(`/routines/${routineId}/print`);
  }

  async generatePDF(routineId: string, data: Omit<PrintRequest, 'routineId'>): Promise<PrintResult & { pdf: { url: string; blobName: string }; success: boolean }> {
    return this.request(`/routines/${routineId}/print`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async confirmPrint(routineId: string, quantity: number): Promise<{ success: boolean; inventory: InventoryStatus }> {
    return this.request(`/routines/${routineId}/print/confirm`, {
      method: 'POST',
      body: JSON.stringify({ quantity }),
    });
  }

  // Inventory
  async getInventory(routineId: string): Promise<InventoryResponse> {
    return this.request<InventoryResponse>(`/routines/${routineId}/inventory`);
  }

  async updateInventory(routineId: string, data: { alertThreshold?: number; printedCount?: number; uploadedCount?: number }): Promise<InventoryStatus> {
    return this.request<InventoryStatus>(`/routines/${routineId}/inventory`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getAllInventory(): Promise<AllInventoryResponse> {
    return this.request<AllInventoryResponse>('/inventory');
  }

  // Stats
  async getStats(routineId: string): Promise<RoutineStatsDTO> {
    return this.request<RoutineStatsDTO>(`/routines/${routineId}/stats`);
  }

  // Health
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request('/health');
  }
}

// Custom error class
export class ApiError extends Error {
  public statusCode: number;
  public details?: Record<string, string[]>;

  constructor(statusCode: number, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Export singleton instance
export const api = new ApiClient(API_BASE);
