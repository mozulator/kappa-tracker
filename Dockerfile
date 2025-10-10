# Multi-stage build for EFT Kappa Tracker

FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create app user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# Copy necessary files
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/package.json ./package.json
COPY --from=builder --chown=appuser:nodejs /app/server.js ./server.js
COPY --from=builder --chown=appuser:nodejs /app/prisma ./prisma
COPY --from=builder --chown=appuser:nodejs /app/scripts ./scripts
COPY --from=builder --chown=appuser:nodejs /app/*.html ./
COPY --from=builder --chown=appuser:nodejs /app/*.js ./
COPY --from=builder --chown=appuser:nodejs /app/*.css ./
COPY --from=builder --chown=appuser:nodejs /app/imgs ./imgs

# Create prisma directory if it doesn't exist
RUN mkdir -p ./prisma && chown appuser:nodejs ./prisma

USER appuser

EXPOSE 3000

# Run migrations and start server
CMD npx prisma migrate deploy && node server.js

