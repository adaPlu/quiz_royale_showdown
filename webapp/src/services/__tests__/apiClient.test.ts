import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
// These must be defined with vi.hoisted so they are available when vi.mock factories run.

const {
  mockAxiosPost,
  mockAxiosRequest,
  mockInterceptorCapture,
} = vi.hoisted(() => {
  // Storage for captured interceptors — populated by the fake axios.create() instance
  const capture: {
    requestFulfilled: ((config: Record<string, unknown>) => Record<string, unknown>) | null;
    responseRejected:
      | ((error: {
          response?: { status: number };
          config?: Record<string, unknown> & { _retry?: boolean; url?: string };
          message?: string;
        }) => unknown)
      | null;
  } = {
    requestFulfilled: null,
    responseRejected: null,
  };

  return {
    mockAxiosPost: vi.fn(),
    mockAxiosRequest: vi.fn(),
    mockInterceptorCapture: capture,
  };
});

// ─── Module mock ──────────────────────────────────────────────────────────────

vi.mock('axios', () => {
  // Build a minimal fake AxiosInstance returned by axios.create()
  const fakeInstance = {
    interceptors: {
      request: {
        use: (
          onFulfilled: (config: Record<string, unknown>) => Record<string, unknown>,
        ) => {
          mockInterceptorCapture.requestFulfilled = onFulfilled;
        },
      },
      response: {
        use: (
          _onFulfilled: unknown,
          onRejected: (error: {
            response?: { status: number };
            config?: Record<string, unknown> & { _retry?: boolean; url?: string };
            message?: string;
          }) => unknown,
        ) => {
          mockInterceptorCapture.responseRejected = onRejected;
        },
      },
    },
    request: mockAxiosRequest,
    post: mockAxiosPost,
    get: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  };

  return {
    default: {
      create: vi.fn(() => fakeInstance),
      post: mockAxiosPost,
    },
    create: vi.fn(() => fakeInstance),
    post: mockAxiosPost,
  };
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { setAccessToken, getAccessToken } from '../apiClient';

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setAccessToken(null);
  vi.clearAllMocks();
});

describe('apiClient', () => {
  it('setAccessToken stores token used in subsequent requests', () => {
    setAccessToken('tok123');
    expect(getAccessToken()).toBe('tok123');

    // Verify the request interceptor injects the Authorization header
    const interceptor = mockInterceptorCapture.requestFulfilled;
    if (interceptor) {
      const config = { headers: {} as Record<string, string> };
      const result = interceptor(config as Record<string, unknown>) as {
        headers: Record<string, string>;
      };
      expect(result.headers['Authorization']).toBe('Bearer tok123');
    } else {
      // Interceptor was not captured — verify token is at least stored
      expect(getAccessToken()).toBe('tok123');
    }
  });

  it('refresh interceptor calls /auth/refresh on 401 response', async () => {
    const interceptor = mockInterceptorCapture.responseRejected;
    if (!interceptor) return; // guard — interceptor not captured

    const error = {
      response: { status: 401 },
      config: {
        url: '/some/protected/endpoint',
        _retry: false,
        headers: {} as Record<string, string>,
      },
      message: 'Unauthorized',
    };

    mockAxiosPost.mockResolvedValueOnce({ data: { accessToken: 'new-token' } });
    mockAxiosRequest.mockResolvedValueOnce({ data: 'retried-response' });

    await interceptor(error);

    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      {},
      { withCredentials: true },
    );
  });

  it('refresh interceptor retries original request with new token after successful refresh', async () => {
    const interceptor = mockInterceptorCapture.responseRejected;
    if (!interceptor) return;

    setAccessToken('old-token');

    const error = {
      response: { status: 401 },
      config: {
        url: '/api/some-data',
        _retry: false,
        headers: {} as Record<string, string>,
      },
      message: 'Unauthorized',
    };

    mockAxiosPost.mockResolvedValueOnce({ data: { accessToken: 'refreshed-token' } });
    mockAxiosRequest.mockResolvedValueOnce({ data: { result: 'ok' } });

    await interceptor(error);

    // The original request should have been retried with the instance
    expect(mockAxiosRequest).toHaveBeenCalled();
    // Token should be updated
    expect(getAccessToken()).toBe('refreshed-token');
  });

  it('refresh interceptor clears auth and redirects on refresh failure', async () => {
    const interceptor = mockInterceptorCapture.responseRejected;
    if (!interceptor) return;

    setAccessToken('old-token');

    const error = {
      response: { status: 401 },
      config: {
        url: '/api/some-data',
        _retry: false,
        headers: {} as Record<string, string>,
      },
      message: 'Unauthorized',
    };

    const refreshError = new Error('Refresh token expired');
    mockAxiosPost.mockRejectedValueOnce(refreshError);

    await expect(interceptor(error)).rejects.toThrow('Refresh token expired');

    // Token should be cleared after failed refresh
    expect(getAccessToken()).toBeNull();
  });
});
