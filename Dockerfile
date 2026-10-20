# syntax=docker/dockerfile:1

# --- deps --------------------------------------------------------------------
# Installs dependencies (including devDependencies) in their own layer so
# installs are cached independently of source changes.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---------------------------------------------------------------------
# Builds the production Next.js bundle. No secrets or database
# connectivity are available or needed here: DATABASE_URL is read lazily
# at request time (src/db/index.ts), never at build time.
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- migrator ------------------------------------------------------------------
# Same filesystem as `builder` (full devDependencies, including drizzle-kit),
# used only to run `npm run db:migrate` / `npm run db:seed` as a one-off
# container against a running `db` service — see docker-compose.production.yml
# (service: migrate) and scripts/deploy.sh. Never exposed/started as a
# long-running service.
FROM builder AS migrator
CMD ["npm", "run", "db:migrate"]

# --- runner ----------------------------------------------------------------
# Minimal runtime image: only the standalone server output, static assets,
# and a non-root user. No devDependencies, no drizzle-kit, no secrets baked
# in — DATABASE_URL etc. are supplied at container start via
# docker-compose.production.yml's env_file.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Used by docker-compose.production.yml's healthcheck and by anyone running
# the image standalone. Treats both 200 (healthy/degraded) and 503
# (unhealthy, but the process itself is up and answering) as "container is
# alive"; Docker/compose restart policy, not this healthcheck, is what
# should react to a persistent 503 from upstream monitoring.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit([200,503].includes(r.status) ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
