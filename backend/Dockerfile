# Railway uses the repository root as the Docker build context.
# Keep all source paths rooted under backend/ so this Dockerfile works
# with the custom config file at /backend/railway.json.

# Stage 1: production-only dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: full dependencies, Prisma client, and TypeScript build
FROM node:20-alpine AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/prisma ./prisma
COPY backend/src ./src
RUN npx prisma generate
RUN npm run build

# Stage 3: lean runtime image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY backend/prisma ./prisma
COPY backend/package.json backend/package-lock.json ./
COPY backend/start.sh ./
RUN chmod +x start.sh
EXPOSE 4000
USER node
CMD ["sh", "start.sh"]
