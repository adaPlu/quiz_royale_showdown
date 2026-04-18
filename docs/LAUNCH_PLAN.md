# Quiz Royale Showdown — Launch Plan

**Created:** 2026-04-18
**Lead:** Technical Lead

---

## Milestones

### M1: Phase 0 Complete (Target: Week 2)
- [ ] All 3 feature branches merged to main
- [ ] `docker-compose up`: backend healthy, postgres migrated, redis connected
- [ ] Android debug APK builds and runs (`./gradlew assembleDebug`)
- [ ] Web dev build serves login page (`npm run dev` at localhost:5173)
- [ ] CI pipeline green on main (`.github/workflows/ci.yml`)
- [ ] `scripts/smoke-test.sh` exits 0

### M2: Phase 1 Complete — Playable (Target: Week 6)
- [ ] 5 real players complete a full game session end-to-end
- [ ] Question bank: 500+ questions seeded in production DB
- [ ] WS reconnect tested: kill connection mid-game → rejoin works, game resumes
- [ ] XP credited correctly after game end (verified via `GET /users/me`)
- [ ] P95 round-result latency < 300ms (k6 load test: `load-test/game-simulation.js`)
- [ ] Backend crash recovery: kill process mid-game → Redis state restores on restart

### M3: Phase 2 Complete — Power-Ups (Target: Week 9)
- [ ] All 5 power-ups server-authoritative (no client-side bypass possible)
- [ ] DOUBLE_DOWN: score multiplier applied server-side
- [ ] FIFTY_FIFTY: server picks 2 wrong options, removes from both clients
- [ ] TIME_FREEZE: extends round deadline in `TimerAuthority`
- [ ] SHIELD: prevents elimination for one round
- [ ] SABOTAGE: marks target player as skipped for one round
- [ ] Balance sim: no power-up > 60% win rate contribution across 1000 simulated games
- [ ] Animations at 60fps on Pixel 4a and Chrome mobile

### M4: Phase 3 Complete — Meta (Target: Week 13)
- [ ] XP → level → cosmetic equip works cross-platform (Android + Web)
- [ ] Level-up notification emits on both clients simultaneously
- [ ] Season 1 ladder live (score updates within 60s of game end)
- [ ] Google Play Billing receipt validation rejects tampered receipts
- [ ] Stripe web payments functional in staging (test mode)
- [ ] Daily challenges endpoint live (`GET /api/v1/challenges`)

### M5: Phase 4 Complete — Parity + PWA (Target: Week 16)
- [ ] PWA installable on Chrome Android and Chrome desktop
- [ ] Web Push notifications delivered < 5s (FCM + VAPID)
- [ ] Android ↔ Web cross-platform friend invite works end-to-end
- [ ] 500-connection WS load test: < 1% message drop
- [ ] Deep links: `quizroyale://invite/:token` opens correct lobby on Android

### M6: Soft Launch — Beta (Target: Week 19)
- [ ] 1,000-user closed beta via Google Play Internal Testing track
- [ ] 7-day soak: crash-free rate > 99.5% (Crashlytics), server error rate < 1% (Sentry)
- [ ] All P0 and P1 bugs resolved (zero open P0s at launch)
- [ ] Grafana dashboards green for 48h continuous
- [ ] Load test: 2,000 concurrent WS connections, P99 latency < 500ms

### M7: Public Launch (Target: Week 20)
- [ ] Play Store Production rollout: 10% → 50% → 100% over 2 weeks
- [ ] Web live at production domain (quizroyale.gg or configured equivalent)
- [ ] Backend Railway production deployment with read replica for leaderboard queries
- [ ] Season 1 activated (start timestamp set, ladder open)
- [ ] Revenue reporting reconciled with Google Play + Stripe

---

## Pre-Launch Checklist

### Legal & Compliance
- [ ] GDPR/Privacy Policy page live on web
- [ ] Terms of Service page live on web
- [ ] Cookie consent banner implemented (EU users)
- [ ] Google Play data safety form completed and approved
- [ ] App Store listing: no prohibited content in screenshots or description

### Operations
- [ ] Support email configured (support@quizroyale.gg or equivalent)
- [ ] Crash monitoring: Firebase Crashlytics (Android) + Sentry (Web) dashboards set up
- [ ] Uptime monitoring: health check endpoint pinged every 60s (Railway + external monitor)
- [ ] Database automated backups confirmed (daily, 30-day retention, restore tested)
- [ ] Rollback procedure documented and tested (Railway rollback + Vercel rollback)

### Security
- [ ] Rate limiting tuned: auth endpoints 10 req/min, game endpoints 60 req/min
- [ ] SSL certificates valid and auto-renewed (Railway + Vercel handle this)
- [ ] JWT secrets rotated from dev values to production secrets
- [ ] All environment variables set in Railway + Vercel dashboards (no `.env` in repo)
- [ ] Penetration test: auth endpoints validated, inputs sanitized server-side
- [ ] Google Play receipt validation rejects tampered purchase tokens

### Infrastructure
- [ ] `docker-compose up --build` succeeds in clean environment (no local state)
- [ ] Railway production environment: DATABASE_URL, REDIS_URL, JWT secrets all set
- [ ] Vercel production environment: VITE_API_URL points to Railway production URL
- [ ] S3 bucket + CloudFront distribution created for cosmetic assets
- [ ] Redis 7 cluster mode or Railway Redis add-on with persistence enabled

### Store Listing
- [ ] App Store listing assets: screenshots (phone + tablet), feature graphic, icon
- [ ] App description (short + full) written and proofread
- [ ] Content rating questionnaire completed
- [ ] In-app purchase products created in Play Console and approved

### Monitoring & Alerting
- [ ] Grafana dashboard: active rooms, WS connections, P95 latency, error rate
- [ ] PagerDuty or equivalent: alert if error rate > 1% for 5 minutes
- [ ] Alert: crash-free rate drops below 99% in Crashlytics
- [ ] Alert: database connection pool exhausted

---

## Post-Launch Schedule (Week 21+)

| Week | Action |
|------|--------|
| 21 | Telemetry review: drop-off by round, power-up usage rates, XP per session |
| 21 | Power-up balance patch if any single power-up > 35% win rate |
| 22 | Season 2 spec begins based on Season 1 ladder data |
| 23 | Friend referral feature — invite link → signup credit |
| Month 2 | Push notification campaign: lapsed users (3d inactive) |
| Month 3 | Tournament mode: bracket, scheduled start time, prize pools |
| Month 4 | Seasonal cosmetic bundle (limited-time purchase) |
| Month 6 | iOS port assessment: SwiftUI vs React Native evaluation |
| Month 6 | Web PWA: promote to installable with app store listing (if eligible) |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Redis cold-start drops in-flight games | Medium | High | Persist game state to PostgreSQL at each round end |
| Google Play review rejection | Low | High | Submit 14 days before target launch date |
| Socket.IO scaling wall at 500 concurrent | Medium | High | Load-test at M5, add horizontal scaling + Redis adapter |
| TypeScript strict-mode errors block CI | High | Medium | Run typecheck in CI from day 1, never skip |
| JWT secret rotation in production | Low | Critical | Document rotation procedure, rotate before each phase |
| Question bank copyright issues | Medium | High | Use Open Trivia DB (CC BY 4.0) only; do not scrape other sources |
| Android Billing integration rejection | Low | High | Follow Play Billing best practices, test in sandbox first |
