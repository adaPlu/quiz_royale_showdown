export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
};

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export type StoredSession = {
  user: SessionUser;
  tokens: SessionTokens;
};

const ACCESS_TOKEN_KEY = "qrs.accessToken";
const REFRESH_TOKEN_KEY = "qrs.refreshToken";
const USER_KEY = "qrs.user";

type TokenListener = (tokens: SessionTokens | null) => void;

const tokenListeners = new Set<TokenListener>();

const hasWindow = () => typeof window !== "undefined";

const parseStoredUser = (rawValue: string | null): SessionUser | null => {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as SessionUser;
  } catch {
    return null;
  }
};

const notifyTokenListeners = (tokens: SessionTokens | null) => {
  tokenListeners.forEach((listener) => listener(tokens));
};

export const getStoredTokens = (): SessionTokens | null => {
  if (!hasWindow()) {
    return null;
  }

  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
};

export const getStoredUser = (): SessionUser | null => {
  if (!hasWindow()) {
    return null;
  }

  return parseStoredUser(window.localStorage.getItem(USER_KEY));
};

export const getStoredSession = (): StoredSession | null => {
  const tokens = getStoredTokens();
  const user = getStoredUser();
  if (!tokens || !user) {
    return null;
  }

  return { user, tokens };
};

export const storeSession = (session: StoredSession): void => {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, session.tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, session.tokens.refreshToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  notifyTokenListeners(session.tokens);
};

export const updateStoredTokens = (tokens: SessionTokens): void => {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  notifyTokenListeners(tokens);
};

export const updateStoredUser = (user: SessionUser): void => {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearStoredSession = (): void => {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  notifyTokenListeners(null);
};

export const subscribeToTokenChanges = (listener: TokenListener): (() => void) => {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
};
