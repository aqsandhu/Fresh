# ============================================================================
# FreshBazar Admin Panel Dockerfile (Vite + React)
# Multi-stage build for optimized production image
# ============================================================================

# ── Stage 1: Dependencies ─────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Install dependencies
RUN npm ci

# ── Stage 2: Builder ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# ── Stage 3: Production with Nginx ────────────────────────────────────────
FROM nginx:alpine AS production

# Copy built files to nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5173/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
