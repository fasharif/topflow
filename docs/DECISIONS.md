# Architecture decision records

Short records of the decisions that shape the codebase: the context, the decision and its consequences.

---

## ADR-001 — Modular monolith in a Turborepo monorepo

**Context.** One small team maintains an API, a web app and a mobile app that share a domain vocabulary (orders, quotations, VAT). Microservices would add network, deployment and consistency costs without a scaling need.

**Decision.** A single NestJS API with one module per bounded context, in an npm-workspaces + Turborepo monorepo together with the clients and shared packages. Turborepo orders builds by dependency graph (`dependsOn: ["^build"]`) and `turbo prune` produces a minimal Docker context for the API.

**Consequences.** Atomic cross-package changes and one CI pipeline. Module boundaries are enforced by convention and code review rather than by the network; modules communicate through exported providers (e.g. `OrderWriter`) instead of reaching into each other's tables ad hoc.

---

## ADR-002 — `@topflow/shared` as the single source of truth for contracts

**Context.** v1 duplicated types (`Product` interfaces in web and mobile, status arrays in admin pages) and validated with class-validator on the server only.

**Decision.** Enums, labels, the permission matrix, workflow transition maps, money maths and Zod request schemas live in `packages/shared`, compiled to CommonJS and consumed by the API (`nestjs-zod` DTOs), the web app and the mobile app. A compile-time test (`apps/api/src/common/enum-parity.ts`) fails the build if shared enums diverge from Prisma enums.

**Consequences.** A validation rule or state transition changes in one place and every client follows. Clients can preview totals with exactly the same code that produces the invoice. The package must be built before its consumers (handled by Turborepo).

---

## ADR-003 — Prisma 7 with the `pg` driver adapter and data-preserving migrations

**Context.** Prisma 7 removes the bundled query engine in favour of JavaScript driver adapters. The v1 production database already contains users and orders.

**Decision.** Use `prisma-client` generation with `@prisma/adapter-pg`, wrapped by `createPrismaClient`. Schema changes that alter existing data are generated with `prisma migrate diff` and **hand-edited** to convert data (contractors → organizations, enquiries → RFQs) inside a single transaction, then verified against a copy of v1 data and checked for drift.

**Consequences.** No native engine binaries in containers; migrations are reviewable SQL. Hand-edited migrations need careful testing — the workflow is documented and repeatable.

---

## ADR-004 — Short-lived access tokens with rotating refresh tokens

**Context.** v1 issued 7-day JWTs stored in `localStorage`, with a hard-coded fallback secret.

**Decision.** 15-minute HS256 access tokens held in memory; opaque 256-bit refresh tokens stored as SHA-256 hashes, rotated on every use and grouped into families. Re-use of a rotated token outside a 30-second grace window revokes the family. Browsers receive the refresh token as an httpOnly `SameSite=Lax` cookie through a same-origin proxy; native apps receive it in the body and keep it in SecureStore. The JWT secret is validated at boot.

**Consequences.** Stolen access tokens expire quickly and stolen refresh tokens are detected. Each authenticated request reloads the user (cheap primary-key lookup) so deactivation is immediate. Clients must implement silent refresh (done in `apps/web/lib/api.ts`).

---

## ADR-005 — Organization-scoped multi-tenancy with a verified context header

**Context.** B2B customers need shared carts, quotations and orders across a team, and some people work for more than one company.

**Decision.** Shared-schema multi-tenancy: every B2B record carries `organizationId`. Clients send `x-organization-id`; `OrganizationGuard` verifies membership and role and attaches an `OrganizationContext`, which services use for every query. Organization roles (Owner, Approver, Buyer) are separate from platform roles (Customer, Sales, Warehouse, Admin).

**Consequences.** Simple operations and reporting (one database) with isolation enforced centrally. Cross-tenant leaks are covered by end-to-end tests. Row-level security in PostgreSQL could be added later as defence in depth.

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

**Context.** The web app (Vercel) and API (Railway) live on different domains; third-party cookies are increasingly blocked by browsers.

**Decision.** `next.config.ts` rewrites `/api/*` to the API. Browser code only calls `/api/...`; Server Components call the API directly over `API_INTERNAL_URL` for public, cacheable catalog data.

**Consequences.** First-party refresh cookies and no CORS preflights for the web app. The API still keeps a strict CORS allowlist for other browser origins. Client IP forwarding requires `TRUST_PROXY` to be configured for the hop count.

---

## ADR-009 — Server-side pricing and snapshot document lines

**Context.** The prototype trusted prices and totals computed on the client and deleted products that still appeared in orders.

**Decision.** Checkout and quotation endpoints accept product ids and quantities only; the server loads prices, applies discounts, delivery and VAT. Document lines snapshot SKU, name, unit and prices; products are archived, never deleted.

**Consequences.** Price tampering is impossible through the API, historical documents stay accurate, and the catalog can evolve freely.
