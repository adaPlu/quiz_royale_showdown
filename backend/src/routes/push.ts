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

const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
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
router.post("/fcm-token", requireAuth, validate({ body: z.object({ token: z.string().min(1) }) }), async (req, res, next) => {
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
