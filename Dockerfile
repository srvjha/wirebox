# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Public env is inlined at build time.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_POSTHOG_KEY=
ARG NEXT_PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_UI_HOST=$NEXT_PUBLIC_POSTHOG_UI_HOST
RUN pnpm build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/src/content/lessons ./src/content/lessons
# Self-contained migrator (pnpm's symlinked node_modules don't copy cleanly).
COPY --from=build --chown=app:app /app/drizzle ./migrator/drizzle
COPY --from=build --chown=app:app /app/scripts/migrate.mjs ./migrator/migrate.mjs
RUN cd migrator && npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund drizzle-orm@0.45.4 postgres@3.4.9 >/dev/null && chown -R app:app /app/migrator
USER app
EXPOSE 3000
CMD ["sh", "-c", "cd migrator && node migrate.mjs && cd .. && node server.js"]
