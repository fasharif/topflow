# Architecture decision records

Short records of the decisions that shape the codebase: the context, the decision and its consequences. Superseded records stay for history.

---

## ADR-001 — Modular monolith in a Turborepo monorepo

**Context.** One small team maintains an API, a web app and a mobile app that share a domain vocabulary (orders, quotations, VAT). Microservices would add network, deployment and consistency costs without a scaling need.

**Decision.** A single NestJS API with one module per bounded context, in an npm-workspaces + Turborepo monorepo together with the clients and shared packages. Turborepo orders builds by dependency graph (`dependsOn: ["^build"]`).

**Consequences.** Atomic cross-package changes and one CI pipeline. A deployment installs the workspace from the repository root and builds one app with a Turborepo filter. Module boundaries are enforced by convention and code review rather than by the network; modules communicate through exported providers (e.g. `OrderWriter`) instead of reaching into each other's tables ad hoc.

---

## ADR-002 — `@topflow/shared` as the single source of truth for contracts

**Context.** v1 duplicated types (`Product` interfaces in web and mobile, status arrays in admin pages) and validated with class-validator on the server only.

**Decision.** Enums, labels, the permission matrix, workflow transition maps, money maths and Zod request schemas live in `packages/shared`, compiled to CommonJS and consumed by the API (`nestjs-zod` DTOs), the web app and the mobile app. A compile-time test (`apps/api/src/common/enum-parity.ts`) fails the build if shared enums diverge from Prisma enums.

**Consequences.** A validation rule or state transition changes in one place and every client follows. Clients can preview totals with exactly the same code that produces the invoice. The package must be built before its consumers (handled by Turborepo).

---

## ADR-003 — Prisma 7 with the `pg` driver adapter and data-preserving migrations

**Context.** Prisma 7 removes the bundled query engine in favour of JavaScript driver adapters. The v1 production database already contains users and orders.

**Decision.** Use `prisma-client` generation with `@prisma/adapter-pg`, wrapped by `createPrismaClient`. Schema changes that alter existing data are generated with `prisma migrate diff` and **hand-edited** to convert data (contractors → organizations, enquiries → RFQs) inside a single transaction, then verified against a copy of v1 data and checked for drift.

**Consequences.** No native engine binaries in serverless bundles; migrations are reviewable SQL. Hand-edited migrations need careful testing — the workflow is documented and repeatable.

---

## ADR-004 — Short-lived access tokens with rotating refresh tokens

**Status.** Superseded by ADR-012.

**Context.** v1 issued 7-day JWTs stored in `localStorage`, with a hard-coded fallback secret.

**Decision.** 15-minute HS256 access tokens held in memory; opaque refresh tokens stored as SHA-256 hashes, rotated on every use and grouped into families, with reuse detection. Browsers received the refresh token as an httpOnly cookie through a same-origin proxy.

**Consequences.** Removed a class of token-theft risks, but left the platform owning password storage, email verification, recovery links and — eventually — MFA.

---

## ADR-005 — Organization-scoped multi-tenancy with a verified context header

**Context.** B2B customers need shared carts, quotations and orders across a team, and some people work for more than one company.

**Decision.** Shared-schema multi-tenancy: every B2B record carries `organizationId`. Clients send `x-organization-id`; `OrganizationGuard` verifies membership and role and attaches an `OrganizationContext`, which services use for every query. Organization roles (Owner, Approver, Buyer) are separate from platform roles (Customer, Sales, Warehouse, Admin).

**Consequences.** Simple operations and reporting (one database) with isolation enforced centrally. Cross-tenant leaks are covered by end-to-end tests. The database itself is closed to every role but the API's (ADR-015).

---

## ADR-006 — Integer money arithmetic and per-line VAT

**Context.** The prototype summed `Int` prices on the device; v1 used JavaScript numbers with `Math.round`, which is fragile for currency.

**Decision.** Store `DECIMAL(10|12,2)`, compute in integer fils (`toFils`, `calculateLine`, `calculateTotals`), apply rates in basis points with half-up rounding, and calculate VAT per line plus delivery.

**Consequences.** Deterministic totals that match to the fil across server, web and mobile, and documents whose line VAT sums to the document VAT.

---

## ADR-007 — Quotations as immutable revisions

**Context.** Commercial negotiation produces several versions of an offer; customers and auditors need to see what was offered when.

**Decision.** A revision is a new row (`number` + `revision`). Only drafts are editable; sending a revision supersedes earlier open revisions; an accepted revision creates exactly one sales order (unique `quotationId` on orders).

**Consequences.** Full negotiation history and a clear link from order to the offer it came from, at the cost of slightly more complex queries (latest revision per number).

---

## ADR-008 — Same-origin API proxy for the web app

**Status.** Superseded by ADR-013.

**Context.** The web app and the API live on different domains; third-party cookies are increasingly blocked by browsers.

**Decision.** `next.config.ts` rewrote `/api/*` to the API so refresh cookies stayed first-party.

**Consequences.** Worked for cookie-based refresh tokens, but a rewrite cannot attach a server-held session, forward the client IP safely or refuse cross-site writes.

---

## ADR-009 — Server-side pricing and snapshot document lines

**Context.** The prototype trusted prices and totals computed on the client and deleted products that still appeared in orders.

**Decision.** Checkout and quotation endpoints accept product ids and quantities only; the server loads prices, applies discounts, delivery and VAT. Document lines snapshot SKU, name, unit and prices; products are archived, never deleted.

**Consequences.** Price tampering is impossible through the API, historical documents stay accurate, and the catalog can evolve freely.

---

## ADR-010 — Indicative price ranges with the online price at the top

**Context.** Top Flow works enquiry-first. Most of its catalogue shows "price on request", but a storefront still needs prices people can act on. Project buyers expect to negotiate, while homeowners want to buy a few items straight away.

**Decision.** Each product stores an indicative range (`priceMin` / `priceMax`, net of VAT) next to `unitPrice`, the price used for online orders. The catalogue sets `unitPrice` to the top of the range. The storefront shows the VAT-inclusive range as an approximate price (**≈ AED min – max**) and invites a quotation "for your best price". Quotations keep using the list price with line discounts, so they can land anywhere in the range or below it.

**Consequences.** Visitors see honest guidance instead of "call for price", online checkout needs no special cases, and sales keeps room to negotiate. When a range is missing, the single retail price is shown instead.

---

## ADR-011 — Website quote requests are RFQs with a source

**Context.** Anyone should be able to ask for a quotation from their basket without creating an account. Sales should not have to work in two inboxes.

**Decision.** `quote_requests` gains a `source` (`TRADE_PORTAL` or `WEBSITE`) and contact fields. `POST /quote-requests` is public and rate-limited. It validates products and minimum quantities exactly as trade RFQs do, emails the visitor an acknowledgement and notifies sales. Website requests appear in the same back-office RFQ list, which can be filtered by source. A formal quotation still needs a registered customer.

**Consequences.** One pipeline and one audit trail for every request. Trade-only products cannot be requested anonymously, because they are invisible to the public catalogue.

---

## ADR-012 — Supabase Auth owns identity; the API keeps authorization

**Context.** Owning credentials meant owning password hashing, verification and recovery emails, session revocation and, next, multi-factor authentication — security-critical code with no business differentiation. Top Flow also wanted enterprise features such as MFA and managed backups of the identity store.

**Decision.** Supabase Auth handles sign-up, email confirmation, sign-in, sessions, password recovery and TOTP MFA. `users.id` equals `auth.users.id`. The API verifies Supabase access tokens itself (`jose`: signature against the project's JWKS, issuer, audience, expiry; legacy HS256 only when configured), provisions the platform account on the first request from the sign-up metadata, and keeps roles, permissions and memberships in its own tables. Supabase administration (staff invitations, suspension) runs in the API with the secret key. Supabase's Admin API also accepts existing bcrypt hashes, so accounts from an earlier system can be imported without forcing password resets.

**Consequences.** Less security-critical code and new capabilities (MFA, secure email change, rate-limited auth endpoints) for free. Authorization stays testable without Supabase: the end-to-end suite signs its own tokens and replaces the admin API with an in-memory fake. Transactional emails for accounts are sent by Supabase with branded templates; business emails stay in the API.

---

## ADR-013 — Backend-for-frontend route handler with httpOnly session cookies

**Context.** With Supabase in the browser, session tokens would be readable by JavaScript (an XSS target). The API must also see the shopper's IP for rate limits and the audit trail, which a plain rewrite cannot provide safely.

**Decision.** Supabase runs only on the web server: Server Actions for authentication, `proxy.ts` to refresh sessions, and `app/api/[...path]/route.ts` to forward browser calls to the API. The handler attaches the access token from the httpOnly session cookies, refuses cross-site state-changing requests, and forwards the client IP together with a shared secret that the API verifies in constant time. Browser code only ever calls `/api/*` on its own origin.

**Consequences.** Tokens never reach browser JavaScript and CSRF is blocked twice (SameSite cookies and an Origin check). Client code is unchanged from the rewrite era (`api()` calls `/api/...`). Every browser API call makes one extra hop inside Vercel's network.

---

## ADR-014 — Vercel for the web app and the API, Supabase for data; Railway retired

**Status.** Railway is retired as planned. The Vercel half is on hold since 16 September 2026, because Vercel's Hobby plan allows non-commercial use only: hosting is deferred (ADR-019) and the platform runs locally.

**Context.** The API ran on Railway with its own PostgreSQL and Redis; the web app on Vercel. Two hosting providers doubled configuration, monitoring and cost, and the Railway database had no managed backups.

**Decision.** The API deploys to Vercel as a NestJS Function on Fluid compute (project `topflow-hub-api`), next to the web app (project `topflow-hub`), both in `bom1`. PostgreSQL moves to Supabase (`ap-south-1`) behind the Supavisor pooler. Production builds of the API run the environment preflight and `prisma migrate deploy` before traffic moves; previews never migrate. The retired Redis had no remaining consumers.

**Consequences.** One platform for compute with previews, instant rollback and edge protection, and one for data and identity. Serverless instances need pooled connections (`attachDatabasePool`, transaction pooler) and in-memory rate limits apply per instance.

---

## ADR-015 — Platform tables are closed to Supabase's Data API

**Context.** Supabase exposes the `public` schema through PostgREST and GraphQL with the publishable key. Platform data must only be reachable through the API's rules.

**Decision.** A migration enables Row Level Security on every table without policies and revokes all privileges from `anon` and `authenticated` (guarded so it also runs on plain PostgreSQL). `supabase/config.toml` exposes no application schema and stops auto-exposing new tables. An end-to-end test fails if any table lacks RLS.

**Consequences.** Leaking the publishable key reveals nothing. Tenant rules stay in the API (ADR-005); per-tenant RLS policies remain possible if a second data consumer ever needs direct access.

---

## ADR-016 — Two-factor authentication for staff

**Context.** Back-office accounts can change prices, approve KYC and see every customer's orders — the most valuable accounts to compromise.

**Decision.** With `STAFF_MFA_REQUIRED=true`, `PermissionsGuard` requires an `aal2` session for staff permissions and answers `MFA_REQUIRED` otherwise. The web app routes staff to `/auth/mfa` to enrol an authenticator app or enter a code. Customers can opt in from their account page. Invitations let staff choose their own password; no administrator handles one.

**Consequences.** Stolen staff passwords alone cannot open the back office. Lost authenticators need an administrator to remove the factor in Supabase (documented in OPERATIONS.md).

---

## ADR-017 — Nightly encrypted off-site backups on the Supabase Free plan

**Context.** The Free plan has no automatic backups and pauses projects after a week without activity; Top Flow chose it to start.

**Decision.** A scheduled GitHub Actions workflow dumps roles, schema and data with the Supabase CLI, checks the dump, encrypts it with `age` to a public key whose private half Top Flow keeps offline, and stores it as a 30-day workflow artifact. The same job calls Supabase Auth and the API health endpoint to keep the project awake.

**Consequences.** Point-in-time recovery to the last night at no cost, without trusting GitHub with readable data. Restores are manual (documented). Upgrading to Supabase Pro adds daily managed backups on top.

---

## ADR-018 — Project enquiries and contact preferences on website quote requests

**Context.** Many project buyers start from a bill of quantities rather than individual products, and prefer WhatsApp or phone to email.

**Decision.** `POST /quote-requests` accepts an empty item list when the notes describe the need (at least 20 characters), plus an optional preferred contact channel (`PHONE`, `WHATSAPP`, `EMAIL`), project reference, required-by date (never in the past) and per-line notes. The shared schema enforces the rules on every client.

**Consequences.** The quote page never dead-ends on an empty basket, and sales sees how and when to reply.

---

## ADR-019 — Hosting is deferred: only officially free options qualify

**Context.** Top Flow wants the platform on services that are free *and* officially allowed for a business site. Checking the terms on 16 September 2026 ruled most of them out. Vercel's Hobby plan is "restricted to non-commercial personal use only". Render's free instances say "Do not use them for production applications". Azure for Students is limited to education and non-commercial use, and the other student credits expire after 12–24 months. Google Cloud Run, Azure Container Apps and Oracle Cloud allow business use inside a free tier, but all require a billing account with a card. Cloudflare's free Workers plan allows 10 ms of CPU per request — too little for server-rendered pages. Supabase's free plan carries the database, authentication and storage without restricting business use, but it cannot serve the website: Edge Functions return HTML as plain text unless a paid custom domain is attached.

**Decision.** Nothing is hosted for now. The platform runs locally against the Supabase CLI stack and the repository stays deployment-ready: the environment is validated at boot, migrations run from a release script, and no code depends on a particular host beyond two optional Vercel helpers that do nothing elsewhere. Netlify's free plan is the one host that is officially free for commercial projects ("no credit card required and no fees"), so it is the default choice when Top Flow decides to publish — accepting its 300-credit monthly cap, which suspends the site for the rest of the month when exceeded, and its Ohio-only functions on the free plan, which would put the database in the same region.

**Consequences.** No hosting bill and no terms violation while the platform is being finished. The cloud pieces that were prepared — a Supabase project, environment variables, nightly encrypted backups — wait for that decision, and the backup workflow skips itself with a notice until a hosted database exists. Choosing a host later is a configuration exercise, not a rewrite.
