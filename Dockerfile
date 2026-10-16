# syntax=docker/dockerfile:1
#
# Gym Ontime backend (NestJS + Prisma). Three stages:
#   build : install everything, generate the Prisma client, compile TypeScript
#   deps  : install production dependencies only
#   final : small image that runs `node dist/main.js` as a non-root user
#
# Build:  docker build -t gym-ontime-backend .
# Secrets are NEVER baked in: pass them at run time (env vars / --env-file).

ARG NODE_VERSION=22

# ---------- build ----------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app

# openssl + certificates: needed by the Prisma CLI while generating the client
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json nest-cli.json ./
# `prisma generate` reads the schema only; it never connects to a database,
# but prisma.config.ts insists DATABASE_URL exists, so give it a dummy one
# (this value lives only in this build stage).
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate

COPY src ./src
RUN npx nest build

# ---------- production dependencies ----------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --omit=dev --ignore-scripts

# ---------- final ----------
FROM node:${NODE_VERSION}-bookworm-slim AS final
WORKDIR /app

# tini = a tiny init process so `docker stop` (SIGTERM) reaches Node and the
# app can flush traces and exit cleanly. openssl/certificates: TLS to Neon etc.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3001

COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
# The generated Prisma client (prisma-client-js writes into node_modules/.prisma)
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/dist ./dist
# Kept so `npx prisma migrate deploy` can run from this image as a separate
# release step (it is NOT run at container start).
COPY --chown=node:node package.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma

USER node
EXPOSE 3001

# 200 = ok or degraded (still serving). 503 = database down -> unhealthy.
HEALTHCHECK --interval=30s --timeout=8s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
