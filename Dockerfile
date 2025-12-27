# --- STAGE 1: BUILDER ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy config files first to leverage caching
COPY package*.json tsconfig*.json nest-cli.json ./

# ⚠️ HACK: We remove the 'postbuild' script via sed to prevent 
# crash due to missing 'scripts/postbuild-fix-dist-entry.js'
RUN sed -i '/postbuild/d' package.json

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build the application
# This will output to /app/dist/main.js based on nest-cli.json
RUN npm run build

# Prune dev dependencies to save space for the final image
RUN npm prune --production

# --- STAGE 2: RUNNER ---
FROM node:20-alpine

# Install Tini (Process Manager for proper signal handling/graceful shutdown)
RUN apk add --no-cache tini

WORKDIR /app

# Copy built assets and production deps from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Set Environment Default
ENV NODE_ENV=production
ENV PORT=3000

# Expose Port
EXPOSE 3000

# Use Tini as entrypoint
ENTRYPOINT ["/sbin/tini", "--"]

# ✅ FIXED: Pointing to the standard NestJS output location
CMD ["node", "dist/main.js"]