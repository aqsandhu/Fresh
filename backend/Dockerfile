# ============================================================================
# FreshBazar Backend Dockerfile
# Multi-stage build for optimized production image
#
# Build context must be the REPO ROOT (pnpm monorepo):
#   docker build -f backend/Dockerfile .
# ============================================================================

# ── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# pnpm via corepack (version pinned by packageManager in root package.json)
RUN corepack enable

# Copy workspace manifests (root lockfile + the backend package)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @freshbazar/backend...

# Copy source code
COPY backend ./backend

# Build TypeScript
RUN pnpm --filter @freshbazar/backend build

# ── Stage 2: Production ───────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install PostgreSQL client for health checks and migrations
RUN apk add --no-cache postgresql-client

# pnpm via corepack
RUN corepack enable

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install production dependencies only
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile --prod --filter @freshbazar/backend...

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app/backend/dist ./backend/dist

# (SQL migrations live in the repo's /database folder; they're applied in
#  Supabase + auto-ensured on boot, so they are NOT needed in the runtime image.
#  The previous COPY here used shell redirection that isn't valid in a Dockerfile
#  and would break the build.)

# Create uploads directory
RUN mkdir -p uploads && chown -R nodejs:nodejs uploads

# Switch to non-root user
USER nodejs

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "backend/dist/app.js"]
