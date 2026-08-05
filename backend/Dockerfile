# Railway builds this service with backend/ as the source context.

# Stage 1: production-only dependencies from the committed lockfile.
FROM node:25-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Stage 2: full dependencies, Prisma client, and TypeScript build.
FROM node:25-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build

# Stage 3: lean runtime image.
FROM node:25-alpine AS runner
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
