import { afterEach, describe, expect, it, vi } from "vitest";

const webPushMock = {
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
};
const loggerMock = {
  warn: vi.fn(),
};

async function importPushService(envOverrides: {
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  isProduction?: boolean;
}) {
  vi.doMock("web-push", () => ({
    default: webPushMock,
  }));
  vi.doMock("../../config/env", () => ({
    env: {
      vapidPublicKey: envOverrides.vapidPublicKey ?? "",
      vapidPrivateKey: envOverrides.vapidPrivateKey ?? "",
      vapidSubject: "mailto:test@example.com",
      isProduction: envOverrides.isProduction ?? false,
    },
  }));
  vi.doMock("../RedisService", () => ({
    redisService: null,
  }));
  vi.doMock("../../utils/logger", () => ({
    logger: loggerMock,
  }));

  return import("../PushNotificationService");
}

describe("PushNotificationService VAPID configuration", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock("web-push");
    vi.doUnmock("../../config/env");
    vi.doUnmock("../RedisService");
    vi.doUnmock("../../utils/logger");
  });

  it("does not install fallback VAPID secrets when keys are missing outside production", async () => {
    const { pushService } = await importPushService({});

    expect(pushService.vapidPublicKey).toBeNull();
    expect(pushService.isWebPushConfigured).toBe(false);
    expect(webPushMock.setVapidDetails).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Web push disabled: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not configured",
      { environment: "non-production" },
    );
  });

  it("configures web-push only when explicit VAPID keys are present", async () => {
    const { pushService } = await importPushService({
      vapidPublicKey: "public-key",
      vapidPrivateKey: "private-key",
    });

    expect(pushService.vapidPublicKey).toBe("public-key");
    expect(pushService.isWebPushConfigured).toBe(true);
    expect(webPushMock.setVapidDetails).toHaveBeenCalledWith(
      "mailto:test@example.com",
      "public-key",
      "private-key",
    );
  });

  it("keeps production startup live when optional VAPID keys are absent", async () => {
    const { pushService } = await importPushService({ isProduction: true });

    expect(pushService.vapidPublicKey).toBeNull();
    expect(pushService.isWebPushConfigured).toBe(false);
    expect(webPushMock.setVapidDetails).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Web push disabled: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not configured",
      { environment: "production" },
    );
  });
});
