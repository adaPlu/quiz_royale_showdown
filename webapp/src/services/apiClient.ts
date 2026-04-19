import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

type ErrorBody = {
  error?: string;
  code?: string;
  message?: string;
  details?: unknown;
  issues?: unknown;
};

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

const getStoredAccessToken = () => localStorage.getItem('qrs.accessToken');
const getStoredRefreshToken = () => localStorage.getItem('qrs.refreshToken');

const storeTokens = (tokens: { accessToken: string; refreshToken?: string }) => {
  localStorage.setItem('qrs.accessToken', tokens.accessToken);
  if (tokens.refreshToken) {
    localStorage.setItem('qrs.refreshToken', tokens.refreshToken);
  }
};

export const clearStoredTokens = () => {
  localStorage.removeItem('qrs.accessToken');
  localStorage.removeItem('qrs.refreshToken');
};

const toApiError = (error: AxiosError<ErrorBody>) => {
  const status = error.response?.status ?? 0;
  const data = error.response?.data;
  return new ApiError(
    status,
    data?.code ?? 'REQUEST_FAILED',
    data?.message ?? data?.error ?? error.message,
    data?.details ?? data?.issues,
  );
};

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const accessToken = getStoredAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ErrorBody>) => {
    const originalRequest = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      throw toApiError(error);
    }

    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      clearStoredTokens();
      throw toApiError(error);
    }

    originalRequest._retry = true;

    refreshPromise ??= axios
      .post<{ tokens: { accessToken: string; refreshToken: string } }>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
      )
      .then((response) => {
        storeTokens(response.data.tokens);
        return response.data.tokens.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });

    try {
      const accessToken = await refreshPromise;
      originalRequest.headers = {
        ...originalRequest.headers,
        Authorization: `Bearer ${accessToken}`,
      };
      return apiClient.request(originalRequest);
    } catch (refreshError) {
      clearStoredTokens();
      throw refreshError;
    }
  },
);

export const api = {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return apiClient.get<T>(url, config);
  },
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return apiClient.post<T>(url, data, config);
  },
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return apiClient.put<T>(url, data, config);
  },
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return apiClient.patch<T>(url, data, config);
  },
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return apiClient.delete<T>(url, config);
  },
};

export const persistTokens = storeTokens;
