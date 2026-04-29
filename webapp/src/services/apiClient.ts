import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Token-store interface (provided by authStore at startup)
// ---------------------------------------------------------------------------
interface TokenStore {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  setTokens: (tokens: { accessToken: string; refreshToken?: string | null }) => void;
  clearAuth: () => void;
}

let tokenStore: TokenStore = {
  getAccessToken: () => null,
  getRefreshToken: () => null,
  setTokens: () => undefined,
  clearAuth: () => undefined,
};

export function configureApiClient(store: TokenStore): void {
  tokenStore = store;
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
const BASE_URL =
  (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_BASE_URL ??
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://quizroyaleshowdown-production.up.railway.app/api/v1'
    : 'http://localhost:4000/api/v1');

const axiosInstance: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: false,
  headers: { 'Content-Type': 'application/json' },
});

type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
};

function toApiError(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) {
    return new ApiError(0, 'UNKNOWN', error instanceof Error ? error.message : 'Request failed');
  }

  const status = error.response?.status ?? 0;
  const data = error.response?.data as Record<string, unknown> | undefined;

  return new ApiError(
    status,
    (data?.code as string) ?? 'UNKNOWN',
    (data?.message as string) ?? (data?.error as string) ?? error.message,
    data?.details,
  );
}

function shouldAttemptRefresh(url?: string): boolean {
  if (!url) return true;

  const normalizedUrl = url.toLowerCase();
  return (
    !normalizedUrl.includes('/auth/login') &&
    !normalizedUrl.includes('/auth/register') &&
    !normalizedUrl.includes('/auth/refresh')
  );
}

export async function refreshAuthSession(): Promise<RefreshResponse> {
  const refreshToken = tokenStore.getRefreshToken();

  if (!refreshToken) {
    throw new ApiError(401, 'AUTH_REFRESH_MISSING', 'No refresh token available');
  }

  try {
    const response = await axios.post<RefreshResponse>(
      `${BASE_URL}/auth/refresh`,
      { refreshToken },
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const tokens = {
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken ?? refreshToken,
    };

    tokenStore.setTokens(tokens);
    return tokens;
  } catch (error) {
    throw toApiError(error);
  }
}

// ---------------------------------------------------------------------------
// Request interceptor - attach Bearer token
// ---------------------------------------------------------------------------
axiosInstance.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// 401 -> refresh -> retry (single in-flight refresh, queue concurrent retries)
// ---------------------------------------------------------------------------
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
}

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error;

    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      !shouldAttemptRefresh(originalRequest.url)
    ) {
      throw toApiError(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          if (originalRequest.headers) {
            (originalRequest.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
          }
          return axiosInstance(originalRequest);
        })
        .catch((err: unknown) => {
          throw err;
        });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { accessToken: newToken } = await refreshAuthSession();
      processQueue(null, newToken);
      if (originalRequest.headers) {
        (originalRequest.headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
      }
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      tokenStore.clearAuth();
      throw refreshError instanceof ApiError ? refreshError : toApiError(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

// ---------------------------------------------------------------------------
// Typed convenience wrappers
// ---------------------------------------------------------------------------
export const api = {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return axiosInstance.get<T>(url, config);
  },
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return axiosInstance.post<T>(url, data, config);
  },
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return axiosInstance.put<T>(url, data, config);
  },
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return axiosInstance.patch<T>(url, data, config);
  },
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return axiosInstance.delete<T>(url, config);
  },
};

export default axiosInstance;
