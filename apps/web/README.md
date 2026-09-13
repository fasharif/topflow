# Top Flow web — storefront, trade portal and back office

Next.js 16 (App Router, Turbopack, React 19) front end for the Top Flow commerce platform.

| Area | Route | Audience |
| --- | --- | --- |
| Storefront | `app/(shop)` — `/`, `/products`, `/products/[slug]`, `/cart`, `/checkout` | Everyone |
| Authentication | `app/(auth)` — `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/invitations/accept` | Everyone |
| Customer account | `app/account` — profile, orders, addresses | Signed-in customers |
| Trade portal | `app/business` — RFQs, quotations, approvals, orders, team, delivery sites | Members of a B2B organization |
| Back office | `app/admin` — dashboard, fulfilment, RFQs & quotations, organizations, catalog, users, audit | Top Flow staff (sales, warehouse, admin) |

## Architecture

- **Two data paths.** Server Components fetch *public, cacheable* data (catalog, categories) straight from the API with `lib/server-api.ts` (`API_INTERNAL_URL`). Everything user-specific is rendered on the client and calls the API through this app's own origin: `next.config.ts` rewrites `/api/*` to the NestJS API.
- **Authentication.** `lib/session.ts` keeps the short-lived access token **in memory only**; the refresh token is an httpOnly cookie that the browser sends to `/api/auth/refresh` (first-party thanks to the rewrite). `SessionBootstrap` restores the session on load and `api()` transparently refreshes once on a `401`.
- **Multi-tenancy.** A user can belong to several organizations. The active one lives in the session store (`setActiveOrganization`) and is sent as the `x-organization-id` header when a request is made with `{ org: true }`. The API verifies membership on every call.
- **Shared contracts.** Enums, labels, permissions, workflow state machines, Zod schemas, money/VAT maths and all response DTO types come from `@topflow/shared` — the same package the API uses. Never redefine them locally.

## Conventions

- **Interactive pages** start with `'use client'`, read route params with `useParams()`, and render anything that uses `useSearchParams()` inside `<Suspense>`.
- **Reading data:** `useApiQuery<T>(path, { query, org })` → `{ data, error, loading, reload }` (waits for the session, cancels stale requests, keeps previous data while paginating).
- **Mutations:** `await api<T>(path, { method, body, org })` inside event handlers; show failures with `<Alert tone="danger">{errorMessage(err)}</Alert>`, then `reload()`.
- **Forms:** validate with the shared Zod schema first (`schema.safeParse` → `zodFieldErrors`), then submit; map server validation errors with `apiFieldErrors`.
- **UI kit:** `components/ui.tsx` (`Button`, `LinkButton`, `Input`, `Select`, `Textarea`, `Field`, `Card`, `CardHeader`, `Badge`, `Alert`, `Spinner`, `LoadingBlock`, `EmptyState`, `PageHeader`, `Stat`, `Table`/`Th`/`Td`, `Pagination`, `cx`) and `components/status-badge.tsx`.
- **Formatting:** `aed(decimalString)`, `formatDate`, `formatDateTime` from `lib/format.ts` (Dubai time zone). Decimal amounts from the API are strings — never do float maths on them; use `toFils`/`fromFils`/`calculateTotals` from `@topflow/shared`.
- **Access control in the UI:** wrap areas in `<RequireAuth staff | permission | membership>` and hide actions with `hasPermission` / `hasOrgPermission`. This is UX only — the API is the security boundary.
- **Documents:** `downloadFile(path, { org })` saves PDFs with the server-provided filename.
- **Lint rules that bite:** no `any`; never call `setState` synchronously inside a `useEffect` body (inside promise callbacks is fine); list every hook dependency.

## Running locally

```bash
npm run db:up            # local Postgres (from the repo root)
npm run dev              # API on :3000, web on :3002
```

Environment (`apps/web/.env.local`):

```bash
API_INTERNAL_URL=http://localhost:3000   # where the /api rewrite and Server Components reach the API
NEXT_PUBLIC_DEMO_MODE=true               # show seeded demo accounts on the sign-in page
```
