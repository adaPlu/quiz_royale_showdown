# Infrastructure Setup

## Local Development

1. Copy `.env.example` to `.env`.
2. Install Node dependencies with `npm ci`.
3. Start backing services with `docker compose up --build`.
4. Backend listens on `http://localhost:4000`.
5. PgAdmin is exposed on `http://localhost:5050`.
6. Web app expects `http://localhost:5173` during local development.

## Cloud Targets

- Backend runtime: Railway
- Web app: Vercel
- Assets: S3 + CloudFront
- Metrics: Grafana
- Alerts: PagerDuty

## Required Secrets

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `DATABASE_URL`
- `REDIS_URL`
- `RAILWAY_TOKEN`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- AWS credentials for asset upload

## Deployment Notes

- The deploy workflow builds a backend image and pushes it to GHCR.
- Railway and Vercel deploy steps are gated on secrets being present.
- The asset upload script is intended for a separate release step once build artifacts exist.
