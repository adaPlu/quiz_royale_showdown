import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadHookWithPushBackend(enabled: boolean) {
  vi.resetModules();
  vi.stubEnv('VITE_PUSH_BACKEND_ENABLED', enabled ? 'true' : 'false');
  return import('./useWebPush');
}

describe('getInitialPushState', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports unsupported when the push backend flag is disabled', async () => {
    const { getInitialPushState } = await loadHookWithPushBackend(false);

    expect(
      getInitialPushState({
        navigator: { serviceWorker: {} } as Navigator,
        window: { PushManager: function PushManager() {} } as Window & typeof globalThis,
        notification: { permission: 'granted' } as typeof Notification,
      }),
    ).toBe('unsupported');
  });

  it('reports unsupported without throwing when Notification is absent', async () => {
    const { getInitialPushState } = await loadHookWithPushBackend(true);

    expect(
      getInitialPushState({
        navigator: { serviceWorker: {} } as Navigator,
        window: { PushManager: function PushManager() {} } as Window & typeof globalThis,
        notification: undefined,
      }),
    ).toBe('unsupported');
  });

  it('reports denied when browser permission is denied', async () => {
    const { getInitialPushState } = await loadHookWithPushBackend(true);

    expect(
      getInitialPushState({
        navigator: { serviceWorker: {} } as Navigator,
        window: { PushManager: function PushManager() {} } as Window & typeof globalThis,
        notification: { permission: 'denied' } as typeof Notification,
      }),
    ).toBe('denied');
  });
});
