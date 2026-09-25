# Top Flow web — storefront, trade portal and back office

Next.js 16 (App Router, Turbopack, React 19) front end for the Top Flow commerce platform.

| Area | Route | Audience |
| --- | --- | --- |
| Storefront | `app/(shop)` — `/`, `/products`, `/products/[slug]`, `/cart`, `/checkout`, `/quote`, `/contact` | Everyone |
| Authentication | `app/(auth)` — `/login`, `/register`, `/forgot-password`, `/auth/set-password`, `/auth/mfa`, `/invitations/accept`; `app/auth/confirm` handles Supabase email links | Everyone |
| Customer account | `app/account` — profile and security, orders, quotations, addresses, trade account | Signed-in customers |
| Trade portal | `app/business` — RFQs, quotations and their approval, orders, team, delivery sites, company | Members of a B2B organization |
| Back office | `app/admin` — dashboard, fulfilment, RFQs & quotations, organizations, catalog, users, audit | Top Flow staff (sales, warehouse, admin) |

## Architecture

- **Sessions stay on the server.** Sign-in, sign-up, password and two-factor changes run as Server Actions (`lib/auth/actions.ts`) against Supabase Auth. `@supabase/ssr` keeps the session in httpOnly cookies (`lib/supabase/server.ts`), and `proxy.ts` refreshes it before pages render. Browser code never holds an access or refresh token (ADR-013).
- **Two data paths.** Server Components fetch *public, cacheable* data (catalog, categories) straight from the API with `lib/server-api.ts` (`API_INTERNAL_URL`). Everything user-specific is rendered on the client and calls `/api/*` on this origin with `api()` (`lib/api.ts`). The route handler `app/api/[...path]/route.ts` is a backend for frontend: it attaches the access token from the session cookies, forwards the shopper's IP address with `INTERNAL_API_SECRET`, refuses cross-site writes and passes the request to the NestJS API, which authorises every call.
- **Supabase email links.** Confirmation, recovery and invitation emails open `app/auth/confirm`, which verifies the token and starts the session; recovery and invitation links continue to `/auth/set-password`.
- **Client view of the user.** `lib/session.ts` holds the platform user from `GET /api/auth/me` for rendering (`useSession()`); it is not a credential.
- **Multi-tenancy.** A user can belong to several organizations. The active one lives in the session store (`setActiveOrganization`) and is sent as the `x-organization-id` header when a request is made with `{ org: true }`. The API verifies membership on every call.
- **Shared contracts.** Enums, labels, permissions, workflow state machines, Zod schemas, money/VAT maths and all response DTO types come from `@topflow/shared` — the same package the API uses. Never redefine them locally.

## Conventions

- **Interactive pages** start with `'use client'`, read route params with `useParams()`, and render anything that uses `useSearchParams()` inside `<Suspense>`.
- **Reading data:** `useApiQuery<T>(path, { query, org })` → `{ data, error, loading, reload }` (waits for the session, cancels stale requests, keeps previous data while paginating).
- **Mutations:** `await api<T>(path, { method, body, org })` inside event handlers; show failures with `<Alert tone="danger">{errorMessage(err)}</Alert>`, then `reload()`.
- **Forms:** validate with the shared Zod schema first (`schema.safeParse` → `zodFieldErrors`), then submit; map server validation errors with `apiFieldErrors`.
- **UI kit:** `components/ui` (`Button`, `LinkButton`, `Input`, `Select`, `Textarea`, `Field`, `Card`, `CardHeader`, `Badge`, `Alert`, `Spinner`, `LoadingBlock`, `EmptyState`, `PageHeader`, `Stat`, `Table`/`Th`/`Td`, `Pagination`, `cx`) and `components/status-badge.tsx`.
- **Formatting:** `aed(decimalString)`, `formatDate`, `formatDateTime` from `lib/format.ts` (Dubai time zone). Decimal amounts from the API are strings — never do float maths on them; use `toFils`/`fromFils`/`calculateTotals` from `@topflow/shared`.
- **Access control in the UI:** wrap areas in `<RequireAuth staff | permission | membership>` and hide actions with `hasPermission` / `hasOrgPermission`. This is UX only — the API is the security boundary.
- **Documents:** `downloadFile(path, { org })` saves PDFs with the server-provided filename.
- **Lint rules that bite:** no `any`; never call `setState` synchronously inside a `useEffect` body (inside promise callbacks is fine); list every hook dependency.

## Running locally

From the repository root, once `npm run supabase:start` is running: `npm run setup` creates `.env.local` from `.env.example` (each variable is described there) and `npm run dev` starts the API on :3000 and this app on :3002.

## Tests

```bash
npm test -w web                                    # Server Action unit tests (Jest)
npm run build -w web && npm run test:demo -w web   # a build made with NEXT_PUBLIC_DEMO_MODE=true
npm run build -w web && npm run test:demo -w web -- --off   # an ordinary build
```

`lib/auth/actions.spec.ts` replaces Supabase with a recorder and checks every authentication Server Action in and out of demo mode; a new action fails the suite until it is given a demo-mode decision. `scripts/demo-smoke.mjs` starts the production build and checks over HTTP what a visitor and a search engine receive.

## Demo mode

`NEXT_PUBLIC_DEMO_MODE=true` builds the public portfolio demo ([ADR-021](../../docs/DECISIONS.md)). Every page shows the banner *"Portfolio demo: data resets every night. This is not Top Flow's official store."*, the sign-in page lists the demo accounts, robots.txt and page metadata keep the site out of search engines, and messages say that the demo sends no email where they would otherwise say one was sent. Because the demo accounts are shared, the Server Actions refuse sign-up, confirmation and password reset emails, password changes (the set-password page accepts only an invitation or recovery link for an account that is not a demo account) and adding or removing an authenticator, and a sign-out never ends other visitors' sessions. Next.js inlines the value at build time, on the server as well as in the browser, so changing it needs a new build. It is checked while the pages are prerendered: anything other than `true` or `false` fails the build.
