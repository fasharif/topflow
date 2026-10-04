# Architecture decision records

Short records of the decisions that shape the codebase: the context, the decision and its consequences. Superseded records stay for history. A record takes the next free number when the work on it starts, and keeps it when branches merge in a different order, so a gap in the numbers is a record still under review on another branch.

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

---

## ADR-020 — Paid orders are cancelled by Top Flow, and refunds are recorded

**Context.** A customer or a trade approver could cancel their own order until the warehouse started picking, whatever had been paid. A bank-transfer order cancelled after payment was left "Cancelled · Paid": the money was Top Flow's, nothing recorded that a refund was owed, no one on the team was told, and `PaymentStatus.REFUNDED` existed in the model but was never set by any code path.

**Decision.** Cancellation stays with the customer only while no payment has been recorded (`isCustomerCancellable` now takes the payment status). Once an order is paid, the customer's page says so and points at the contact page, and the API answers 409 with the same explanation. Top Flow's staff cancel it instead, and the cancellation email tells the customer the amount that will be refunded. `POST /admin/orders/:id/refund` then records the refund against a cancelled, paid order: it needs the `orders:manage` permission, sets the payment status to Refunded, adds the amount and reference to the order timeline, writes an `orders.refund_recorded` audit entry, and emails the customer. The back office shows a warning on any cancelled order that was paid until this is done.

**Consequences.** Money that has been taken cannot leave the system unnoticed: either it is refunded and recorded, or the order still shows a refund as due. The refund itself is made in the bank — the platform records it rather than moving money, which keeps it out of payment-services territory. Refunds for returns after delivery are deliberately not covered yet; delivered orders remain terminal.

---

## ADR-021 — A public demo runs the production code in demo mode

**Context.** A portfolio needs a version of the platform that reviewers can use without being invited, which means publishing sign-ins, including staff accounts that can change prices, send quotations and invite colleagues, on a site anyone can reach. Four risks follow. The platform sends email through Resend: quote acknowledgements go to whatever address a visitor types, sales notifications go to Top Flow's real inbox, and staff and customer invitations go out through Supabase Auth, so an open demo could send mail to strangers under Top Flow's name. Shared accounts can be locked by a single visitor: a changed password, an enrolled authenticator app, a suspension, a demoted approver or a suspended demo company would end the demo for everyone else. Published passwords next to real, mail-enabled addresses look like leaked credentials. And a copy of a real supplier's storefront must never pass for the supplier's own shop.

**Decision.** The demo is the production build with one setting switched on, `DEMO_MODE=true` in the API and `NEXT_PUBLIC_DEMO_MODE=true` in the web app, read the same way by both (and by the reset) and checked at start-up or build time.

- **API.** A mail guard delivers business email only to single addresses or `@domains` on `DEMO_MAIL_ALLOWLIST` (whole public mail domains are refused) and withholds everything else with a log line. Staff invitations, and customer invitations from website requests, are refused with `DEMO_RESTRICTED` unless the address is allow-listed. The published demo accounts keep their platform role, organisation membership and access, and the demo organisation keeps its KYC status, trading terms and legal identifiers. The configuration refuses staff MFA and rate limits looser than the production defaults.
- **Web app.** Every page opens with the banner "Portfolio demo: data resets every night. This is not Top Flow's official store.", every page title and link preview names the site a portfolio demo, search engines are asked not to index it, and a note beside Top Flow's real contact details says that quote requests and orders made in the demo are not passed to Top Flow. The sign-in page lists the demo accounts, and confirmation messages say that the demo does not email visitors. The Server Actions refuse sign-up, confirmation and password reset emails, password changes (including the set-password page, unless the session came from an invitation or recovery link for an account of the visitor's own) and authenticator changes.
- **Reset.** `npm run demo:reset` empties and reseeds the demo database and replaces the demo project's Supabase Auth users every night from GitHub Actions. It refuses to run without `--confirm` and a `DEMO_MODE=true` given for the run (never read from an `.env` file). It refuses a database without the demo data set that holds any account the demo seed does not create; the seed creates the demo organisation before any account, so a run that fails part-way never locks the next one out. It refuses Supabase settings unless the users they list are exactly the rows of the target database's own `auth.users`, so a key from another project never deletes anything.
- **Supabase project.** The demo gets its own Supabase project. It keeps Supabase's built-in email service, which only delivers to the project team's addresses, and has public sign-ups and authenticator enrolment switched off. The published accounts live on reserved example domains (RFC 2606).

**Consequences.** One code path: the demo runs the same guards, transactions and tests as a real deployment, and the differences are a few checks that do nothing outside demo mode. Both modes are covered by the end-to-end suites and by the web app's Server Action tests, CI runs the real reset script against PostgreSQL and, through a stand-in for the Supabase Auth admin API, its Supabase steps too, and CI checks both web builds over HTTP. Visitors can still change anything the published roles allow on other accounts and organisations (prices, stock, orders, KYC decisions) until the next reset, and the banner says so. The web app's refusals cannot stop someone calling Supabase Auth directly with the published password, which is why the reset deletes and recreates every sign-in rather than trusting them; until it runs, a changed password can lock other visitors out of one account. Demo mode is only as safe as its configuration: a public deployment built without it would behave like production, so the runbook's checklist starts by checking that `GET /` reports `"demo": true`. Nothing is hosted yet (ADR-019), so the reset workflow skips itself until the demo project's secrets exist, and its Supabase steps have run only against a stand-in for the Auth admin API, which CI's `npm run demo:rehearse` exercises in every pipeline.

---

## ADR-022 — Testing strategy: a pyramid with system tests against the real stack

**Context.** Unit tests covered the shared rules and the API's guards, and the API's end-to-end suite exercised its middleware and workflows against PostgreSQL with Supabase Auth simulated. Nothing tested the web app, the backend-for-frontend, real Supabase sessions, email confirmation, accessibility, behaviour under load or the published API description, although the riskiest behaviour — what customers pay, who may approve a purchase, which company sees which quotation — crosses all of them.

**Decision.** Keep the pyramid and add a top layer, planned in `docs/testing/TEST-PLAN.md`:

- **Rules first, as decision tables.** Purchase approval and release on credit terms are written down as decision tables with boundary values, and tested at every level that decides them: the shared function, the service, and HTTP against PostgreSQL on a new organisation per table. A rule that depends on a sum other requests change (credit exposure) is also tested with simultaneous requests.
- **System tests in their own workspace (`tests/`)** against a stack started with the Supabase CLI, the API and the web app from production builds, seeded with the demo profile. Playwright drives Chromium as the demo users (published in `@topflow/shared`) through the three money paths and the security checks; assertions a page does not show go through the web app's `/api` handler with the same user's cookies. Journeys run one at a time; expected outcomes that depend on earlier runs (credit already used) are computed from the business rule. Tests that tamper with something first check that the tampering happened.
- **Accessibility and layout fail the build**: axe-core scans key pages, including checkout and the document pages, at desktop and phone size and fails on serious or critical WCAG 2.2 A/AA violations; a layout check fails if a money column is hidden at 1280 × 720.
- **k6 and Schemathesis run in pinned containers** (`tests/compose.yaml`, updated by Dependabot), as the calling user on Linux so that their reports belong to the CI runner. k6 thresholds are p95 targets that fail a load run; CI runs only a smoke profile, which fails on errors rather than timings, and measured results are published only from a quiet machine. Schemathesis fuzzes the API from its OpenAPI description in three passes (customer, back-office reads, trade company), each as a throwaway account with the test data it needs, and only against a stack on the same machine, because one of those accounts is an administrator; the accounts are deactivated and their sign-ins deleted when the run ends. Triaged findings live in a configuration file and a baseline per pass, so only new findings fail, and its coverage warnings are reported with the results. A mutation check breaks each decision-table rule and the credit row lock in turn and fails unless the tests notice.
- **CI**: a separate workflow runs the system tests on pull requests and pushes to `develop` and uploads the reports. A second one publishes the Playwright report of `develop` to GitHub Pages once Pages is enabled for the repository; until then it ends with a notice. API coverage is reported for the unit and end-to-end suites but not enforced as a threshold.
- **README media** come from a demo build, so every image carries the portfolio demo banner.
- **Deliberate gaps**: staff MFA is off in the system tests (the API suite covers it), rate limits are raised for the browser suite (its traffic arrives as one client), back-office writes are not fuzzed (they would change the shared demo data), only Chromium runs, and device tests of the mobile app (for example with Maestro) are out of scope for now.

**Consequences.** The money paths, tenant isolation and accessibility are checked where users meet them. Seventeen defects are recorded in `docs/testing/BUGS-FOUND.md`: three user-facing defects found by the browser suites, seven API defects found by Schemathesis (six in the published description, one server error), three documentation and set-up defects found while building them, three found in review of the suites themselves (an order tracker that showed "Delivered" too early, a credit limit passed by simultaneous acceptances, and money columns hidden on desktop screens), and one that stays open until a product decision is made (no limit on trade account applications per account). Review also found that the mobile app still charged a changed price without saying so; it now sends the total it shows, like the web app. Each fixed defect has a test that fails without its fix. The system-test job needs Docker and takes minutes rather than seconds, so it runs on pull requests and `develop` rather than on every feature push. Demo data accumulates across local runs; the suite tolerates it, and `supabase db reset` starts again. Coverage numbers inform reviews without inviting tests written to move a percentage.

---

## ADR-023 — Container images, a production-like stack and an AWS layout that stays switched off

**Context.** ADR-014 put the web app and the API on Vercel and data and identity on Supabase; ADR-019 then deferred hosting, because only officially free options qualify. The platform could only be built and released inside a Vercel build: there were no container images, no way to run it with production settings outside a developer's machine, and no tested path to another host. A host-neutral delivery pipeline had to be ready without spending money or applying anything.

**Decision.**

- **Images.** Three non-root images without npm: `topflow-hub-api` (only the files the compiled API loads), `topflow-hub-migrate` (the release step: the environment preflight, then `prisma migrate deploy`) and `topflow-hub-web` (the Next.js standalone server, which reads `NEXT_PUBLIC_*` at runtime, so one image serves every environment).
- **Marked as a portfolio project.** Every page of every build says that the site is Farah Sharif's portfolio project, built with Top Flow's permission and not Top Flow's official store, and asks search engines not to index it; this is deliberately not a setting (`apps/web/lib/portfolio.ts`). With ADR-021's demo mode it combines as follows. A demo build keeps all of ADR-021: its banner, which says the same and adds the nightly reset, takes the place of the portfolio notice, and its titles, link previews and notices name it a portfolio demo. Every other build shows the portfolio notice, and its page description and link previews describe it as a portfolio project, not as Top Flow's store. No page shows both. Every build sends `noindex, nofollow` as the robots meta tag and the `X-Robots-Tag` header, and its robots.txt allows every path and names no sitemap: a page that robots.txt blocks is never fetched, so its noindex is never read and a linked address can still be listed, and a sitemap would ask for pages to be indexed. This replaces the `Disallow: /` of ADR-021's demo build, and the sitemap is gone.
- **A production-like stack.** `docker-compose.prod.yml` runs the images with production settings behind Caddy with HTTPS, next to PostgreSQL 17, Supabase Auth (GoTrue) and a mail catcher. The release step finishes before the API starts.
- **AWS, written but not applied.** Terraform describes staging and production on **ECS Fargate behind an Application Load Balancer** in `ap-south-1`, next to the Supabase project. ECS rather than App Runner, because ECS can run the release step as a one-off task with the services' network and secrets and App Runner cannot. Tasks run in public subnets without NAT gateways and accept traffic only from the load balancer. Secrets are SSM SecureString parameters that Terraform never reads. GitHub Actions reaches AWS only through OIDC roles, and every role the environments create carries a permissions boundary.
- **Delivery.** CI builds, scans and smoke-tests the images and, on `develop`, publishes exactly those images with signed provenance and SBOM attestations. A manual Deploy workflow, approved per environment, verifies the provenance, pins digests, runs migrations before either service changes and rolls back in one step.
- **Operations.** Optional Sentry for server errors, with personal data switched off and scrubbed; an uptime workflow whose schedule stays off until something is hosted; a timed restore drill for the nightly backups.

The details are in `infra/README.md` and in sections 7 and 11 of `docs/OPERATIONS.md`.

**Consequences.** ADR-019 still stands: nothing is hosted. At list prices the AWS layout would cost about 183 US dollars a month for both environments (`infra/scripts/cost-estimate.mts`, 26 September 2026), so it is a prepared option, checked with `terraform test` against a mocked provider, tflint and Trivy but never planned against an account. The images also fit the container hosts ADR-019 lists, and ADR-014's Vercel configuration is unchanged. One web image for every environment depends on `NEXT_PUBLIC_*` staying unset at build time. The exception is `NEXT_PUBLIC_DEMO_MODE`, which a client component reads: the web image takes it as a build argument that is always inlined (`false` unless set), so an image for ADR-021's public demo is a separate build. Browser-side errors are not reported, since that would build the DSN into the client bundle. The Compose stack's Supabase Auth signs tokens with a shared secret, while hosted projects use asymmetric keys; unit tests cover both. The apply role stays broad (PowerUserAccess for every service except IAM), so the environment approval is its main control.

---

## ADR-024 — Deliveries confirmed by the dispatch service through signed, idempotent webhooks

**Context.** The dispatch service ([fasharif/dispatch](https://github.com/fasharif/dispatch)), a separate delivery-tracking portfolio project, assigns drivers to TopFlow orders, follows them live and takes proof of delivery (photo, signature, position inside a geofence around the address). It tells other systems what happened through webhooks sent from a transactional outbox: delivered at least once, in no fixed order, retried with exponential backoff on 5xx, 408, 409, 425 and 429 (8 attempts from 2 seconds by default, so about 4 minutes in all), and given up on after other 4xx answers. TopFlow had no way to hear about a delivery except a warehouse user setting the status by hand, and an open endpoint that changes orders needs its own authentication, because the dispatch service has no Supabase account.

**Decision.** `POST /integrations/dispatch/events` is public to Supabase Auth but refuses anything without a valid HMAC-SHA256 signature over the exact request bytes: `x-dispatch-signature: t=<unix seconds>,v1=<hex>` over `"<t>.<raw body>"`, compared in constant time, with the timestamp within `DISPATCH_WEBHOOK_TOLERANCE_SECONDS` (300 by default) so a captured request cannot be replayed later. `DISPATCH_WEBHOOK_SECRET_PREVIOUS` stays valid during a rotation. The API keeps the raw body for this (`rawBody: true`). A signed request must also carry `x-dispatch-event-id`, equal to the event id in the body. Each accepted event is inserted into a new table, `dispatch_events`, keyed by the sender's event id with `ON CONFLICT DO NOTHING`, in the same transaction as the order change it causes: a repeated event finds its id taken and changes nothing (`DUPLICATE`), and a concurrent copy waits for the first transaction and then does the same (an end-to-end test sends two copies at once and gets one `APPLIED` and one `DUPLICATE`).

Only `delivery.completed` changes an order. It uses the existing transition `DISPATCHED → DELIVERED`, so no new transition was needed, and the same rules as a warehouse user marking an order delivered, now shared by one helper: the delivery time is recorded, cash on delivery counts as collected, the order timeline gets an entry and the audit trail an `orders.status_changed` record, both attributed to the integration (no user id, `source: "dispatch"`, the event and delivery ids and the proof summary), and the customer is emailed.

The driver can finish before the warehouse has marked the order dispatched: the goods left with the driver, but nobody clicked yet. That completion is not refused. It is recorded as `PENDING` and answered 200, and the warehouse's own `PROCESSING → DISPATCHED` change applies it in the same transaction, so the order goes on to `DELIVERED` at once, with one "Delivered" email to the customer. The order counts as delivered from the moment of dispatch, so it is never delivered before it was dispatched; the timeline says the driver finished earlier, and the audit record keeps the driver's own time. The same floor applies to every completion: the delivery time (and, for cash on delivery, the payment time) comes from the driver's phone, whose clock can be wrong, so a reported time before the order's dispatch time is recorded as the dispatch time, with a timeline note and the reported time in the audit record. A waiting event that no longer parses when the order is dispatched (for example after a schema change) does not block the warehouse: it is set aside as `IGNORED`, with a logged reason, and the order is dispatched without it. Both paths lock the order row first (the event with `SELECT … FOR UPDATE`, the warehouse by updating it), so an event arriving at the same moment is either seen by the dispatch step or sees the order dispatched. An earlier version answered 409 and relied on the dispatch service's retries, which stop after about four minutes; a warehouse later than that meant a manual *Send again*.

An unknown or cancelled order is answered 422, which the dispatch service treats as final. An order already delivered, the other known event types (assigned, picked up, failed, cancelled) and event types TopFlow does not know yet are recorded as `IGNORED` and acknowledged: an unknown type is checked only against the envelope every event carries (id, type, time, delivery id, order reference), so a type the dispatch service adds later does not end up in its failed list.

The contract is pinned by `apps/api/test/fixtures/dispatch-webhooks.recorded.json`: three signed requests recorded from the dispatch service's end-to-end flow. The dispatch repository keeps a byte-identical copy; each side's unit tests verify the signatures and parse the bodies with their own code.

**Consequences.** Deliveries close themselves without the warehouse, with proof attached to the timeline, while the order state machine and the audit trail stay the only way an order changes. Skipping `DISPATCHED` is impossible: stock is still deducted by the warehouse at dispatch, and a waiting completion is applied only then. A warehouse user who dispatches an order with a waiting completion sees it delivered straight away, which is what happened to the goods. The webhook secret is one more secret to rotate (OPERATIONS.md, section 8). `dispatch_events` grows by one row per event and is private to the API like every other table (ADR-015); a completion for an order that is later cancelled stays `PENDING` as a record. Showing the customer tracking link and the proof summary on TopFlow's own order pages is not done yet; both arrive in the stored events, so it can follow without changing the integration.
