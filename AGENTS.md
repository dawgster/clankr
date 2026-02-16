# Repository Guidelines

## Project Structure & Module Organization
- `src/app/` contains Next.js App Router pages and API routes. Use `(app)` for authenticated UI and `(auth)` for sign-in/sign-up.
- `src/lib/` contains business logic (`actions/`, `matrix/`, `near/`, auth, validation, DB utilities).
- `src/inngest/functions/` holds background jobs for agent event dispatch/evaluation/expiry.
- `src/components/` is split by feature (`agent/`, `chat/`, `connection/`, `layout/`, `ui/`).
- `prisma/schema.prisma` defines data models; migrations live in `prisma/migrations/`; generated Prisma client is in `src/generated/prisma/`.
- `tests/` contains Vitest suites and shared factories in `tests/helpers/`.

## Build, Test, and Development Commands
- `docker compose up -d`: start PostgreSQL (pgvector) and Matrix Conduit services.
- `npm run dev`: run the app locally at `http://localhost:3000`.
- `npm run db:push`: apply Prisma schema changes to your local DB.
- `npm run build`: runs `prisma db push --accept-data-loss`, generates Prisma client, then builds Next.js.
- `npm run lint`: run ESLint (Next.js core-web-vitals + TypeScript rules).
- `npm test`: run all Vitest tests once.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run test:e2e`: run `tests/near-e2e.test.ts` only.

## Coding Style & Naming Conventions
- Use strict TypeScript and the `@/*` path alias.
- Follow current style: 2-space indentation, semicolons, and double quotes.
- Name React components in `PascalCase`, utilities/functions in `camelCase`, and test files as `*.test.ts`.
- Keep API route handlers explicit (`export async function GET/POST/...`) and validate inputs with schemas in `src/lib/validators.ts`.

## Testing Guidelines
- Framework: Vitest (`vitest.config.mts`), with global APIs enabled and sequential file execution.
- Add/update tests for behavior changes in API routes, server actions, and core libraries.
- Prefer `tests/helpers/setup.ts` and `tests/helpers/seed.ts` factories over custom setup per file.
- Run targeted tests while iterating: `npx vitest run tests/agent-registration.test.ts`.
- No coverage threshold is enforced; cover new logic and regressions.

## Commit & Pull Request Guidelines
- Match existing history: short, imperative commit subjects (e.g., `Add GET /agent/me endpoint`).
- Keep commits focused; separate schema, API, and UI changes when possible.
- PRs should include: concise summary, rationale, linked issue, and screenshots for UI changes.
- Call out breaking changes (schema/env/API) and list verification commands you ran (`npm run lint`, `npm test`).

## Security & Configuration Tips
- Do not commit secrets; copy `.env.example` to `.env` for local setup.
- Keep agent keys, Clerk secrets, and webhook tokens server-side only.
- Treat `npm run build` as local-safe only unless you explicitly intend `--accept-data-loss` on the target database.
