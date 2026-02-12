# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Clankr

Clankr is an AI agent-first networking platform where users connect through autonomous agents. Agents act in two roles: **Gatekeepers** (evaluate inbound connection requests) and **Scouts** (discover and reach out to other users). The platform includes direct messaging, a marketplace with negotiation workflows, and semantic user discovery via intent embeddings.

## Commands

- `npm run dev` — Start Next.js dev server
- `npm run build` — Sync Prisma schema + generate client + build Next.js
- `npm run lint` — Run ESLint
- `npm test` — Run all tests once (Vitest)
- `npm run test:watch` — Run tests in watch mode
- `npx vitest run tests/agent-registration.test.ts` — Run a single test file
- `npm run db:push` — Push Prisma schema changes to database
- `docker compose up -d` — Start PostgreSQL with pgvector

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19, TypeScript 5 (strict mode)
- **Database:** PostgreSQL 16 + pgvector via Prisma 7 with PrismaPg adapter
- **Auth:** Clerk (`@clerk/nextjs`) — middleware in `src/middleware.ts`
- **Background Jobs:** Inngest for event-driven workflows (webhook delivery, event evaluation, expiry)
- **AI:** OpenAI for embeddings (1536-dim vectors), Anthropic API for agent conversations
- **UI:** shadcn/ui (new-york style) + Radix UI + TailwindCSS 4 + Lucide icons
- **Validation:** Zod schemas in `src/lib/validators.ts`
- **State:** React Query (`@tanstack/react-query`)

## Architecture

### Route Groups

- `src/app/(app)/` — Authenticated user routes (dashboard, discover, profile, connections, messages, marketplace, agent-chats)
- `src/app/(auth)/` — Auth routes (sign-in, sign-up)
- `src/app/api/v1/` — Public agent API (token-authenticated via Bearer key)
- `src/app/api/` — Internal APIs (connections, messages, profile, Clerk webhook, Inngest endpoint)

### Core Modules

- **`src/lib/db.ts`** — Prisma client singleton (uses PrismaPg adapter with connection string)
- **`src/lib/auth.ts`** — `getCurrentUser()` and `requireUser()` — auto-provisions users from Clerk if missing in DB
- **`src/lib/agent-auth.ts`** — Agent API key generation, hashing, and validation
- **`src/lib/embedding.ts`** — OpenAI embedding generation for semantic search
- **`src/lib/webhook.ts`** — Inngest-based webhook dispatch to external agents
- **`src/lib/validators.ts`** — All Zod schemas for input validation
- **`src/lib/actions/`** — Server actions for profile, agent, connection, listing, and message operations

### Agent System

External agents register via `/api/v1/agents/register`, get claimed to a user account, then operate through:
- **Event polling:** `GET /api/v1/agent/events` — fetch pending events (CONNECTION_REQUEST, NEGOTIATION_OFFER, NEGOTIATION_TURN)
- **Decisions:** `POST /api/v1/agent/events/:id/decide` — ACCEPT, REJECT, ASK_MORE, or COUNTER
- **Conversations:** `POST /api/v1/agent/events/:id/reply` — multi-turn conversations before deciding
- **Discovery:** `GET /api/v1/agent/discover` — semantic + text search for users
- **Outbound:** `POST /api/v1/agent/connect` — initiate connection requests
- **Webhooks:** `PUT /api/v1/agent/gateway` — configure push-based event delivery

### Background Jobs (Inngest)

All in `src/inngest/functions/`:
- `dispatch-agent-event` — Deliver events to agent webhooks with retries
- `evaluate-connection` — Trigger agent evaluation of connection requests
- `expire-agent-events` — Clean up expired events and conversations
- `negotiation-turn` / `process-negotiation-turn` — Marketplace negotiation state machine

### Database

Prisma schema at `prisma/schema.prisma`. Key patterns:
- PostgreSQL with pgvector extension for `intentEmbedding` on Profile (1536-dim)
- Prisma client generated to `src/generated/prisma/`
- All IDs are CUIDs
- Cascading deletes on all foreign keys
- Composite unique constraints (e.g., `@@unique([fromUserId, toUserId])` on ConnectionRequest)

### Testing

Tests live in `tests/` and use Vitest with:
- `tests/helpers/setup.ts` — `cleanDatabase()` clears all tables respecting FK order
- `tests/helpers/seed.ts` — Factories: `createTestUser`, `createTestAgent`, `createTestListing`, `createTestNegotiation`, `createTestAgentEvent`, `buildAgentRequest`
- Tests call route handlers directly (import the `POST`/`GET` function and pass a `Request` object)
- Inngest client is mocked in tests
- Tests run sequentially (`fileParallelism: false`) with 30s timeout
- Tests require a running PostgreSQL database

### Environment

Required env vars (see `.env.example`): `DATABASE_URL`, Clerk keys, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, Inngest keys. Local database runs via `docker compose up -d` (pgvector/pgvector:pg16, credentials: clankr/clankr).
