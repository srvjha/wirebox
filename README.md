# Wirebox

**Learn system design by building it. Free, forever.**

Wirebox is a visual, hands-on system design course. Every concept is taught with an
interactive diagram first, then you use it to design a real product in a lab, load-test
your design in a simulator, and fix what breaks.

- **Learn** — 19 modules across three parts (Foundations, Distributed systems, Under the
  hood), following one app, *Gatepass*, from one server to many regions.
- **Labs** — design products like a URL shortener from requirements → API → schema →
  architecture canvas, then run load tests with traffic spikes, scrapers, cache restarts,
  dead servers and failed databases.
- **No paywall.** Accounts are optional and only sync progress across devices.

## Stack

| | |
|---|---|
| App | Next.js 16 (App Router, Cache Components, Turbopack), React 19, TypeScript |
| Styling | Tailwind CSS v4, Geist, dark-neutral + light themes |
| Data fetching | TanStack Query |
| Content | MDX lessons with a server-rendered SVG diagram kit and interactive visuals |
| Labs | React Flow canvas, Zustand, an analytical simulator in `src/sim` (Vitest-calibrated) |
| Auth | Better Auth (email/password, optional Google & GitHub) |
| Database | Postgres 17 (Docker) + Drizzle ORM |
| Analytics | PostHog via a `/ingest` reverse proxy; server-side sign-up events |
| AI debriefs | Pluggable provider (`src/lib/ai`): Anthropic, OpenAI (or any OpenAI-compatible API) or Gemini |

## Getting started

```bash
pnpm install
cp .env.example .env          # set BETTER_AUTH_SECRET: openssl rand -base64 32
pnpm db:up                    # Postgres on localhost:5433
pnpm db:migrate
pnpm dev                      # http://localhost:3000
```

Run everything in containers instead:

```bash
docker compose --profile app up --build
```

### Environment

| Variable | Needed for |
|---|---|
| `DATABASE_URL` | Postgres (defaults to the Docker database) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Sessions |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | Optional OAuth buttons (hidden when unset) |
| `ADMIN_EMAILS` | Comma-separated emails allowed to open `/admin` |
| `NEXT_PUBLIC_POSTHOG_KEY` | Analytics (disabled when unset) |
| `AI_PROVIDER` + one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (+ `OPENAI_BASE_URL`), `GEMINI_API_KEY`, each with an optional `*_MODEL` | AI lab debriefs (falls back to built-in feedback) |

OAuth callback URLs: `<BETTER_AUTH_URL>/api/auth/callback/google` and `/callback/github`.

## Who sees what

- **Learners** see only their own progress (`/me`).
- **Admins** (`ADMIN_EMAILS`) see `/admin`: total users, sign-ups per day, active learners,
  lesson and lab completion, load-test pass rates.
- **PostHog dashboards** (behaviour, funnels, session replays) live in your PostHog project
  and are visible only to its members.

## Scripts

| | |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm test` | Simulator calibration tests (Vitest) |
| `pnpm lint`, `pnpm typecheck` | Checks |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` | Drizzle |

## Project layout

```
src/
  app/(site)/        landing, /learn, /labs index, /sign-in, /me, /admin
  app/labs/[slug]/   full-screen lab player
  app/api/           auth, progress, lab progress & runs, postmortem
  components/        diagram kit, lesson blocks, visuals, lab engine, site chrome
  content/           course outline, MDX lessons, lab definitions
  lib/               auth, db (Drizzle schema), analytics, progress
  sim/               load-test simulator + tests
```

## Adding content

- **A lesson:** add `src/content/lessons/<slug>.mdx` for a slug in `src/content/course.ts`.
  It goes live automatically. Diagram kit and lesson blocks are available without imports.
- **A lab:** add a definition in `src/content/labs/`, register it in `src/content/labs/index.ts`
  and add calibration tests in `src/sim` so the reference design passes and naive ones fail.

Labs are modeled on well-known products for teaching; Wirebox isn't affiliated with them.
