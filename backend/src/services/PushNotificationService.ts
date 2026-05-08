import webpush, { type PushSubscription } from "web-push";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { redisService } from "./RedisService";
import { prisma } from '../models/prismaClient';
import { generateId } from '../utils/ulid';

const VAPID_PUBLIC_KEY = env.vapidPublicKey;
const VAPID_PRIVATE_KEY = env.vapidPrivateKey;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  logger.warn("VAPID keys not configured — push notifications disabled");
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(env.vapidSubject, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

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
    const sub = subscription as { endpoint: string; keys: { p256dh: string; auth: string } };
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      create: { id: generateId(), userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    }).catch(() => undefined); // non-fatal
  }

  async removeWebPushSubscription(userId: string, subscription: PushSubscription): Promise<void> {
    if (!redisService) return;
    const serialized = JSON.stringify(subscription);
    await redisService.srem(pushSubKey(userId), serialized);
    const sub = subscription as { endpoint: string };
    await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint, userId } }).catch(() => undefined);
  }

  async saveFcmToken(userId: string, token: string): Promise<void> {
    if (redisService) {
      await redisService.set(fcmTokenKey(userId), token);
    }
    await prisma.fcmToken.upsert({
      where: { token },
      update: { userId },
      create: { id: generateId(), userId, token },
    }).catch(() => undefined);
  }

  async sendToUser(userId: string, payload: WebPushPayload): Promise<void> {
    let subscriptionStrings: string[] = [];

    if (redisService) {
      subscriptionStrings = await redisService.smembers(pushSubKey(userId));
    } else {
      // DB fallback when Redis unavailable
      const rows = await prisma.pushSubscription.findMany({ where: { userId } });
      subscriptionStrings = rows.map((row) =>
        JSON.stringify({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } })
      );
    }

    if (!subscriptionStrings.length) return;

    await Promise.allSettled(
      subscriptionStrings.map(async (raw) => {
        try {
          const sub = JSON.parse(raw) as PushSubscription;
          await webpush.sendNotification(sub, JSON.stringify(payload));
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // Subscription expired — remove it
            if (redisService) {
              await redisService.srem(pushSubKey(userId), raw);
            }
            const expiredSub = JSON.parse(raw) as { endpoint: string };
            await prisma.pushSubscription.deleteMany({ where: { endpoint: expiredSub.endpoint, userId } }).catch(() => undefined);
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
