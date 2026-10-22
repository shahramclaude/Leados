# LEADOS production image. Pinned base image per docs/RELEASING.md / Part 19 SBOM practice.
# Multi-stage build: install + build in one stage, copy only the Next.js
# "standalone" output (next.config.ts -> output: "standalone") into a minimal
# runtime stage.

FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22.23.2-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
