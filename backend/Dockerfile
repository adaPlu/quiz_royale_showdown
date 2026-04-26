# ── Stage 1: production-only deps ────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

# ── Stage 2: full deps + compile + prisma generate ───────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json .
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build

# ── Stage 3: lean runtime image ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY package.json .
COPY start.sh .
RUN chmod +x start.sh
EXPOSE 4000
USER node
CMD ["sh", "start.sh"]
