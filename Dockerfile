# LEADOS container image — single canonical build path (see docs/DEPLOYMENT.md).
# Multi-stage: deps -> builder -> runner. DATABASE_URL is supplied at `docker run`
# time, never baked into the image.

# ---- deps -------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- builder ------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No real DATABASE_URL is needed to build: `next build` does not execute
# src/app/page.tsx's database query at build time for a force-dynamic route.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 leados

COPY --from=builder /app/public ./public
COPY --from=builder --chown=leados:nodejs /app/.next/standalone ./
COPY --from=builder --chown=leados:nodejs /app/.next/static ./.next/static

USER leados
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
