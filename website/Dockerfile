# ============================================================================
# FreshBazar Website Dockerfile (Next.js)
# Multi-stage build for optimized production image
#
# Build context must be the REPO ROOT (pnpm monorepo):
#   docker build -f website/Dockerfile .
# ============================================================================

# ── Stage 1: Dependencies ─────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# pnpm via corepack (version pinned by packageManager in root package.json)
RUN corepack enable

# Copy workspace manifests (root lockfile + this package + its workspace deps)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY website/package.json website/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/core-auth/package.json packages/core-auth/

# Install dependencies (website + its workspace deps only)
RUN pnpm install --frozen-lockfile --filter freshbazar-website...

# ── Stage 2: Builder ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/website/node_modules ./website/node_modules

# Copy workspace root manifests + source code
COPY pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY website ./website

# Build shared workspace packages first (website imports them)
RUN pnpm --filter @freshbazar/shared-types build && pnpm --filter @freshbazar/core-auth build

# NEXT_PUBLIC_* values are inlined at build time — pass them as build args:
#   docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api ...
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api
ARG NEXT_PUBLIC_APP_NAME="Fresh Bazar"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME

# Build Next.js application (output: 'standalone' in next.config.js)
RUN pnpm --filter freshbazar-website build

# ── Stage 3: Production Runner ────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy standalone build output. In this pnpm monorepo Next traces to the repo
# root, so the standalone server lands at website/server.js inside the bundle.
COPY --from=builder --chown=nextjs:nodejs /app/website/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/website/.next/static ./website/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/website/public ./website/public

# Switch to non-root user
USER nextjs

# Expose application port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || \
      node -e "require('http').get('http://localhost:3001', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "website/server.js"]
