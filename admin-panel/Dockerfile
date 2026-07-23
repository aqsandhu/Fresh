# ============================================================================
# FreshBazar Admin Panel Dockerfile (Vite + React)
# Multi-stage build for optimized production image
#
# Build context must be the REPO ROOT (pnpm monorepo):
#   docker build -f admin-panel/Dockerfile .
# ============================================================================

# ── Stage 1: Dependencies ─────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# pnpm via corepack (version pinned by packageManager in root package.json)
RUN corepack enable

# Copy workspace manifests (root lockfile + this package)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY admin-panel/package.json admin-panel/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter freshbazar-admin...

# ── Stage 2: Builder ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/admin-panel/node_modules ./admin-panel/node_modules

# Copy workspace root manifests + source code
COPY pnpm-workspace.yaml package.json ./
COPY admin-panel ./admin-panel

# VITE_* values are inlined at build time — pass them as build args:
#   docker build --build-arg VITE_API_URL=https://api.example.com/api ...
ARG VITE_API_URL=http://localhost:3000/api
ENV VITE_API_URL=$VITE_API_URL

# Build the application
RUN pnpm --filter freshbazar-admin build

# ── Stage 3: Production with Nginx ────────────────────────────────────────
FROM nginx:alpine AS production

# Copy built files to nginx html directory
COPY --from=builder /app/admin-panel/dist /usr/share/nginx/html

# Copy custom nginx config
COPY admin-panel/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5173/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
