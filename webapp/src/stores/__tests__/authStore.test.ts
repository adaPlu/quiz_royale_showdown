import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { setApiAccessToken, apiClientPost, socketConnect, socketDisconnect } = vi.hoisted(() => ({
  setApiAccessToken: vi.fn(),
  apiClientPost: vi.fn(),
  socketConnect: vi.fn(),
  socketDisconnect: vi.fn(),
}));

vi.mock('@/services/apiClient', () => ({
  apiClient: { post: apiClientPost },
  setAccessToken: setApiAccessToken,
}));

vi.mock('@/services/socketService', () => ({
  socketService: { connect: socketConnect, disconnect: socketDisconnect },
}));

// ─── Import store after mocks ────────────────────────────────────────────────

import { useAuthStore } from '../authStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function reset() {
  useAuthStore.setState({ user: null, accessToken: null });
  vi.clearAllMocks();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(reset);

describe('setUser', () => {
  it('normalizes a full user object', () => {
    useAuthStore.getState().setUser({
      id: 'u1',
      email: 'alice@example.com',
      displayName: 'Alice',
      username: 'alice',
      level: 3,
      xp: 500,
      coins: 20,
    });
    const { user } = useAuthStore.getState();
    expect(user?.id).toBe('u1');
    expect(user?.displayName).toBe('Alice');
    expect(user?.level).toBe(3);
  });

  it('derives displayName from username when displayName is absent', () => {
    useAuthStore.getState().setUser({ id: 'u2', email: 'bob@example.com', username: 'bobby' });
    expect(useAuthStore.getState().user?.displayName).toBe('bobby');
  });

  it('falls back to email when both displayName and username are absent', () => {
    useAuthStore.getState().setUser({ id: 'u3', email: 'carol@example.com' });
    expect(useAuthStore.getState().user?.displayName).toBe('carol@example.com');
  });

  it('defaults level to 1 and xp/coins to 0 when omitted', () => {
    useAuthStore.getState().setUser({ id: 'u4', email: 'dan@example.com' });
    const { user } = useAuthStore.getState();
    expect(user?.level).toBe(1);
    expect(user?.xp).toBe(0);
    expect(user?.coins).toBe(0);
  });
});

describe('setTokens', () => {
  it('stores accessToken in state', () => {
    useAuthStore.getState().setTokens({ accessToken: 'tok-abc' });
    expect(useAuthStore.getState().accessToken).toBe('tok-abc');
  });

  it('calls setApiAccessToken with the new token', () => {
    useAuthStore.getState().setTokens({ accessToken: 'tok-xyz' });
    expect(setApiAccessToken).toHaveBeenCalledWith('tok-xyz');
  });

  it('calls socketService.connect with the new token', () => {
    useAuthStore.getState().setTokens({ accessToken: 'tok-xyz' });
    expect(socketConnect).toHaveBeenCalledWith('tok-xyz');
  });
});

describe('clearAuth', () => {
  it('clears user and accessToken from state', () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'a@b.com', displayName: 'A', username: 'a', level: 1, xp: 0, coins: 0 },
      accessToken: 'tok-123',
    });
    useAuthStore.getState().clearAuth();
    const { user, accessToken } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(accessToken).toBeNull();
  });

  it('nullifies the API access token', () => {
    useAuthStore.getState().clearAuth();
    expect(setApiAccessToken).toHaveBeenCalledWith(null);
  });

  it('disconnects the socket', () => {
    useAuthStore.getState().clearAuth();
    expect(socketDisconnect).toHaveBeenCalledTimes(1);
  });
});

describe('initAuth', () => {
  it('sets accessToken and connects socket on successful refresh', async () => {
    apiClientPost.mockResolvedValueOnce({ data: { accessToken: 'refreshed-tok' } });
    await useAuthStore.getState().initAuth();
    expect(useAuthStore.getState().accessToken).toBe('refreshed-tok');
    expect(setApiAccessToken).toHaveBeenCalledWith('refreshed-tok');
    expect(socketConnect).toHaveBeenCalledWith('refreshed-tok');
  });

  it('silently swallows errors when the refresh call fails', async () => {
    apiClientPost.mockRejectedValueOnce(new Error('401 Unauthorized'));
    await expect(useAuthStore.getState().initAuth()).resolves.toBeUndefined();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
