import webpush, { type PushSubscription } from "web-push";
import { logger } from "../utils/logger";
import { redisService } from "./RedisService";

// VAPID keys — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in env for production.
// Generate fresh keys with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ??
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ?? "UUxI4O8-FbRouAevSmBQ6co62GroYWmcOMkk7ujjZOQ";

webpush.setVapidDetails("mailto:admin@quizroyale.gg", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const pushSubKey = (userId: string) => `push:subs:${userId}`;
const fcmTokenKey = (userId: string) => `fcm:token:${userId}`;

export interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, unknown>;
}

class PushNotificationService {
  get vapidPublicKey() {
    return VAPID_PUBLIC_KEY;
  }

  async saveWebPushSubscription(userId: string, subscription: PushSubscription): Promise<void> {
    if (!redisService) return;
    const serialized = JSON.stringify(subscription);
    await redisService.sadd(pushSubKey(userId), serialized);
  }

  async removeWebPushSubscription(userId: string, subscription: PushSubscription): Promise<void> {
    if (!redisService) return;
    const serialized = JSON.stringify(subscription);
    await redisService.srem(pushSubKey(userId), serialized);
  }

  async saveFcmToken(userId: string, token: string): Promise<void> {
    if (!redisService) return;
    await redisService.set(fcmTokenKey(userId), token);
  }

  async sendToUser(userId: string, payload: WebPushPayload): Promise<void> {
    if (!redisService) return;
    const members = await redisService.smembers(pushSubKey(userId));
    if (!members.length) return;

    await Promise.allSettled(
      members.map(async (raw) => {
        try {
          const sub = JSON.parse(raw) as PushSubscription;
          await webpush.sendNotification(sub, JSON.stringify(payload));
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // Subscription expired — remove it
            await redisService!.srem(pushSubKey(userId), raw);
          } else {
            logger.warn("Web push send failed", { userId, err });
          }
        }
      }),
    );
  }

  async sendToUsers(userIds: string[], payload: WebPushPayload): Promise<void> {
    await Promise.allSettled(userIds.map((id) => this.sendToUser(id, payload)));
  }
}

export const pushService = new PushNotificationService();
