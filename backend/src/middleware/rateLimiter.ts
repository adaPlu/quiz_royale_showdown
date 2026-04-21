import rateLimit from "express-rate-limit";

// Strict limit for auth endpoints — prevents brute-force
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later.", code: "RATE_LIMITED" },
});

// General API limit — prevents scraping / abuse
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later.", code: "RATE_LIMITED" },
});

// Game action limit — one answer submit per second per client
export const gameActionLimiter = rateLimit({
  windowMs: 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Slow down — action rate limit exceeded.", code: "RATE_LIMITED" },
});
