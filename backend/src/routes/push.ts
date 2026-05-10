import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { pushService } from "../services/PushNotificationService";

const router = Router();

// GET /push/vapid-public-key — webapp fetches this to create subscriptions
router.get("/vapid-public-key", (_req, res) => {
  res.json({ key: pushService.vapidPublicKey });
});

// base64url alphabet: A-Z a-z 0-9 - _  (no padding required for these fixed-size values)
const BASE64URL_RE = /^[A-Za-z0-9\-_]+$/;

const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      // Uncompressed EC public key: 65 raw bytes → 87–88 base64url chars
      p256dh: z
        .string()
        .regex(BASE64URL_RE, "p256dh must be a base64url string")
        .refine((v) => v.length >= 87 && v.length <= 88, {
          message: "p256dh must be 87–88 base64url characters (65-byte uncompressed EC key)",
        }),
      // 16-byte auth secret → 22–24 base64url chars (22 without padding, 24 with ==)
      auth: z
        .string()
        .regex(BASE64URL_RE, "auth must be a base64url string")
        .refine((v) => v.length >= 22 && v.length <= 24, {
          message: "auth must be 22–24 base64url characters (16-byte secret)",
        }),
    }),
  }),
});

// POST /push/subscribe — save a web push subscription for the authenticated user
router.post("/subscribe", requireAuth, validate({ body: SubscribeSchema }), async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const { subscription } = req.body as z.infer<typeof SubscribeSchema>;
    await pushService.saveWebPushSubscription(userId, subscription as never);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /push/subscribe — remove a subscription
router.delete("/subscribe", requireAuth, validate({ body: SubscribeSchema }), async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const { subscription } = req.body as z.infer<typeof SubscribeSchema>;
    await pushService.removeWebPushSubscription(userId, subscription as never);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /push/fcm-token — store Android FCM device token
router.post("/fcm-token", requireAuth, validate({ body: z.object({ token: z.string().min(1).max(512) }) }), async (req, res, next) => {
  try {
    const userId = req.jwtClaims!.sub;
    const { token } = req.body as { token: string };
    await pushService.saveFcmToken(userId, token);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
