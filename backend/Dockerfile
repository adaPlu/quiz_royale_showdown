# Railway builds this service with backend/ as the source context.

# Stage 1: production-only dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The committed backend lockfile is currently missing a transitive package.
# npm install repairs the lock/tree in the image instead of npm ci rejecting it.
RUN npm install --omit=dev --no-audit --no-fund

# Stage 2: full dependencies, Prisma client, and TypeScript build
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build

# Stage 3: lean runtime image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY package.json package-lock.json ./
COPY start.sh ./
RUN chmod +x start.sh
EXPOSE 4000
USER node
CMD ["sh", "start.sh"]
