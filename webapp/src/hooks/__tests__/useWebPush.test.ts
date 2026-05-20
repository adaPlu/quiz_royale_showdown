import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/apiClient', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { key: 'fake-vapid-key' } }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: { id: 'user-1' } }),
}));

import { useWebPush } from '../useWebPush';
import { api } from '@/services/apiClient';

function stubPushSupport(supported: boolean, permission: NotificationPermission = 'default') {
  if (!supported) {
    Object.defineProperty(window, 'PushManager', { value: undefined, configurable: true, writable: true });
  } else {
    const mockSubscription = {
      toJSON: vi.fn().mockReturnValue({ endpoint: 'https://push.example.com' }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    const mockPushManager = {
      subscribe: vi.fn().mockResolvedValue(mockSubscription),
      getSubscription: vi.fn().mockResolvedValue(mockSubscription),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: mockPushManager }) },
      configurable: true, writable: true,
    });
    Object.defineProperty(window, 'PushManager', { value: class PushManager {}, configurable: true, writable: true });
  }
  Object.defineProperty(Notification, 'permission', { value: permission, configurable: true, writable: true });
  vi.spyOn(Notification, 'requestPermission').mockResolvedValue(permission === 'default' ? 'granted' : permission);
}

describe('useWebPush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { subscribe: vi.fn(), getSubscription: vi.fn() } }) },
      configurable: true, writable: true,
    });
  });

  it('returns pushState: unsupported when PushManager is not available', () => {
    stubPushSupport(false);
    const { result } = renderHook(() => useWebPush());
    expect(result.current.pushState).toBe('unsupported');
  });

  it('returns pushState: denied when Notification.permission is already denied', () => {
    stubPushSupport(true, 'denied');
    const { result } = renderHook(() => useWebPush());
    expect(result.current.pushState).toBe('denied');
  });

  it('calls subscribe with the VAPID key and posts the subscription to the API', async () => {
    stubPushSupport(true, 'default');
    const { result } = renderHook(() => useWebPush());
    await act(async () => { await result.current.subscribe(); });
    expect(api.get).toHaveBeenCalledWith('/push/vapid-public-key');
    expect(api.post).toHaveBeenCalledWith('/push/subscribe', expect.objectContaining({ subscription: expect.any(Object) }));
    expect(result.current.pushState).toBe('subscribed');
  });

  it('sets pushState: denied when Notification.requestPermission is denied', async () => {
    stubPushSupport(true, 'denied');
    vi.spyOn(Notification, 'requestPermission').mockResolvedValue('denied');
    const { result } = renderHook(() => useWebPush());
    await act(async () => { await result.current.subscribe(); });
    expect(result.current.pushState).toBe('denied');
  });
});
