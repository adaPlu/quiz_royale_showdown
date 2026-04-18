import type { SessionUser } from "@/lib/authSession";

type JwtClaims = {
  sub: string;
  email: string;
  displayName: string;
};

const decodeBase64Url = (value: string): string => {
  const normalizedValue = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddedValue = normalizedValue.padEnd(Math.ceil(normalizedValue.length / 4) * 4, "=");
  return window.atob(paddedValue);
};

export const readUserFromAccessToken = (accessToken: string): SessionUser | null => {
  try {
    const [, payload] = accessToken.split(".");
    if (!payload) {
      return null;
    }

    const parsedPayload = JSON.parse(decodeBase64Url(payload)) as Partial<JwtClaims>;
    if (!parsedPayload.sub || !parsedPayload.email || !parsedPayload.displayName) {
      return null;
    }

    return {
      id: parsedPayload.sub,
      email: parsedPayload.email,
      displayName: parsedPayload.displayName
    };
  } catch {
    return null;
  }
};
