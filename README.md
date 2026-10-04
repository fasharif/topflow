# TopFlow Hub — a portfolio B2B/B2C commerce platform, built with Top Flow's permission

A monorepo with a storefront, a trade portal, a back office, an API and a mobile app for a UAE irrigation supplier, covering quotations, purchase approvals and credit terms as well as retail orders. It is packaged as container images with a production-like stack, Terraform for AWS (never applied) and a release pipeline tested against a fake AWS CLI, and one setting turns a build into a public portfolio demo.

[![CI](https://github.com/fasharif/topflow/actions/workflows/ci.yml/badge.svg)](https://github.com/fasharif/topflow/actions/workflows/ci.yml)
[![Containers](https://github.com/fasharif/topflow/actions/workflows/containers.yml/badge.svg)](https://github.com/fasharif/topflow/actions/workflows/containers.yml)

> **Portfolio project.** Built independently by Farah Sharif, with Top Flow's permission to use its name and product catalogue. This is not Top Flow's official online store, and nothing is hosted yet. Every page of the web app says so: the portfolio notice in an ordinary build, the demo banner in a demo build.

![The storefront's home page in the production-like Compose stack, with the portfolio notice across the top.](docs/images/storefront-compose-stack.png)

*The storefront served by the production-like Compose stack (`docker-compose.prod.yml`, images built from commit `4725a2e`), captured with headless Chrome for Testing 153 at 1280 × 800 on 26 September 2026. It is a local stack, not a hosted site.*

![A retail customer searches for a pop-up rotor, adds four to the basket and places the order, paying on delivery](docs/screenshots/walkthrough.gif)

| Storefront | Trade purchase waiting for approval | Warehouse fulfilment |
| --- | --- | --- |
| ![Storefront home page with catalogue categories](docs/screenshots/storefront.png) | ![A quotation above the buyer's limit, waiting for the approver](docs/screenshots/trade-approval.png) | ![A trade order being picked, with the dispatch action](docs/screenshots/fulfilment.png) |

Also: a [product page](docs/screenshots/product.png) with its approximate price range and the [KYC review](docs/screenshots/kyc-review.png) of a new trade account. The screenshots and the GIF were captured on 26 September 2026 from the demo data and a local demo build (`NEXT_PUBLIC_DEMO_MODE=true`, hence the banner) with `npm run screenshots` and `npm run walkthrough:gif` in the [system-test workspace](tests/README.md). They predate the note about Top Flow's contact details that the footer of a demo build now carries.

## The problem

**Top Flow — Irrigation & Flow Control Supplies, UAE** sells electrofusion and HDPE fittings, sprinklers and rotors, drip irrigation, pipes and fittings, valves, filtration and landscaping products to two very different audiences:

- **Consumers** who want to buy a few rotors for a villa garden online, at VAT-inclusive prices, paying on delivery.
- **Businesses** — landscapers, MEP contractors, facility managers, developers — who buy for projects through **quotations**, negotiated prices, **purchase approvals** and **credit terms**.

A plain web shop serves the first group only. **TopFlow Hub** serves both: a storefront with approximate prices and quote requests, a trade portal, a back office for Top Flow's teams and a mobile app, all built on one set of shared domain contracts so prices, VAT and workflow rules agree everywhere. Because hosting is deferred until an officially free option fits (ADR-019), the platform also has to be ready to deploy anywhere without spending money on it now.

## Features

| Capability | What it does |
| --- | --- |
| **Catalogue** | 346 products in 11 categories and 61 product lines: 241 from Top Flow's own catalogue and 105 typical products of the UAE irrigation market with estimated prices, all with photos or drawn illustrations and specifications. Each product shows an approximate price range (**≈ AED min – max**, VAT included), and search covers names, codes and tags. Counted from `packages/database/prisma/data/topflow-catalogue.json`; sources and licensing in [its README](packages/database/prisma/data/README.md). |
| **Quote requests** | Anyone can send their basket for a quotation — or describe a project without choosing products — with a preferred contact channel and a required-by date. Requests land in the sales inbox next to trade RFQs, and the visitor gets an acknowledgement. |
| **Retail (B2C)** | VAT-inclusive prices, a guest basket, server-priced checkout (cash or card on delivery), and order tracking with a full status timeline. |
| **Procurement (B2B)** | Organisations with Owner / Approver / Buyer roles, RFQs, **versioned quotations** with **PDF** generation, accept / reject / request-revision, **spending-limit approvals** (segregation of duties), and sales orders released on the organisation's **credit terms**. |
| **Multi-tenancy** | Every B2B request runs inside a verified organisation context (`x-organization-id`). Users can belong to several organisations, and Top Flow staff verify each company (KYC). |
| **Operations** | Role-based back office for Sales, Warehouse and Admin: KYC queue, quotation builder, fulfilment state machine, stock deduction at dispatch, low-stock alerts, dashboard KPIs, staff invitations and an immutable audit trail. |
| **Delivery tracking** | Deliveries completed in [dispatch](https://github.com/fasharif/dispatch), a companion delivery-tracking portfolio project, mark orders delivered through HMAC-signed, idempotent webhooks, with the proof of delivery on the order timeline; a delivery completed before the warehouse marks the order dispatched is applied at dispatch ([ADR-024](docs/DECISIONS.md)). |
| **Identity & security** | **Supabase Auth** with email confirmation, password recovery and **two-factor authentication required for staff**. Web sessions live in httpOnly cookies behind a backend-for-frontend; the API verifies Supabase tokens (JWKS) and enforces RBAC and tenant isolation. Platform tables are locked away from Supabase's public Data API, rate limits apply per client, and prices are never trusted from clients. |
| **Public demo mode** | One setting per app turns a production build into the portfolio demo described under [Try the demo](#try-the-demo): a mail guard with an allow-list, refused invitations, fixed demo accounts and demo company, a banner in place of the portfolio notice, demo page titles and link previews, and a guarded nightly reset. |
| **Containers** | Non-root images for the API, its release step (migrations) and the web app, scanned with Trivy (critical findings fail the build). A **production-like Compose stack** runs them with HTTPS, Supabase Auth and the release step before the API; the Containers workflow starts it for every change and signs in through Supabase Auth. On `develop`, it publishes exactly the images it tested, with signed provenance and SBOM attestations. |
| **AWS, prepared** | **Terraform** for staging and production on ECS Fargate behind a load balancer, with secrets in SSM, CloudWatch alarms, a budget alert, S3 state with locking and GitHub OIDC roles under a permissions boundary. Checked with `terraform test` against a mocked provider, tflint and Trivy; **never applied**. |
| **Releases** | A manual deploy that verifies each image's provenance, pins digests, runs migrations before new code, keeps both services on one release if a rollout fails, and **rolls back in one step**; a restart for rotated secrets; a smoke test and an uptime check. |
| **Operations tooling** | Optional **Sentry** for server errors (a no-op without `SENTRY_DSN`), a workflow for nightly **encrypted off-site database backups** (it skips until a database is hosted), and a **timed restore drill**, whose test restores a synthetic backup encrypted to a throwaway key. |

## Architecture

```mermaid
flowchart LR
  subgraph Clients
    BROWSER["Browser"]
    MOB["apps/mobile<br/>Expo SDK 57"]
  end
  subgraph Host["Web and API host (planned: Vercel, ADR-014, on hold by ADR-019;<br/>or the container images, ADR-023)"]
    WEB["apps/web — Next.js 16<br/>pages · Server Actions · /api BFF"]
    API["apps/api — NestJS 11"]
  end
  subgraph Supabase["Supabase (planned project, ap-south-1)"]
    AUTH["Supabase Auth<br/>passwords · email links · TOTP MFA"]
    DB[("PostgreSQL<br/>Prisma 7")]
  end
  SHARED[["packages/shared<br/>contracts · permissions · state machines · money/VAT"]]
  MAIL["Transactional email<br/>(Resend)"]

  BROWSER -- "httpOnly session cookies" --> WEB
  WEB -- "sign-in, sign-up, MFA" --> AUTH
  WEB -- "Bearer token + client IP" --> API
  MOB -- "supabase-js" --> AUTH
  MOB -- "Bearer token" --> API
  API -- "verify tokens (JWKS)" --> AUTH
  API -- "Supavisor pooler" --> DB
  API --> MAIL
  SHARED -. imported by .-> WEB
  SHARED -. imported by .-> MOB
  SHARED -. imported by .-> API
```

The browser never holds a token: the web app's server keeps the Supabase session in httpOnly cookies and forwards API calls with the access token (ADR-013). The API authorises every request itself, with roles, organisation permissions and tenant checks.

**Delivery.** Three images carry the code: `topflow-hub-api`, `topflow-hub-migrate` (the release step: environment check, then database migrations) and `topflow-hub-web`. The same images run in the Compose stack and in the AWS layout: ECS Fargate services behind an Application Load Balancer, the release step as a one-off task before either service changes, and Supabase unchanged for data and identity. Diagrams and details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (data model, workflows, authentication, tenancy, containers) and [infra/README.md](infra/README.md) (images, stack, AWS, cost, releases).

## Tech stack

| Layer | Technology | Why |
| --- | --- | --- |
| Language | TypeScript everywhere (strict) | One language across API, web, mobile and the infrastructure scripts, so the shared contracts are checked by the compiler in every app. |
| API | NestJS 11, Zod (`nestjs-zod`), Swagger/OpenAPI, `jose`, `@nestjs/throttler`, Helmet, PDFKit | Modules, guards and dependency injection suit a modular monolith with RBAC and tenancy (ADR-001); Zod schemas are shared with the clients. |
| Identity | Supabase Auth (`@supabase/ssr` on the web, `@supabase/supabase-js` on mobile and for administration) | Email links, TOTP and session handling without running an identity service; the API keeps authorisation (ADR-012). |
| Data | Supabase PostgreSQL, Prisma 7 with the `pg` driver adapter | Transactions for money, stock and approvals; a typed client and reviewed SQL migrations (ADR-003). |
| Web | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, Lucide icons | Server-rendered catalogue pages, and Server Actions that keep authentication on the server. |
| Mobile | Expo SDK 57, Expo Router, SecureStore | One React Native codebase for Android and iOS that reuses the shared package. |
| Containers | Docker multi-stage builds, traced runtimes, Docker Compose, Caddy, GoTrue, Trivy | Small non-root images that run on any container host; a stack that exercises the real release order, HTTPS and Supabase Auth on one machine (ADR-023). |
| Cloud (prepared) | Terraform 1.16 with the AWS provider, ECS Fargate, ALB, SSM, CloudWatch, tflint, `terraform test` | Fargate runs the release step as a one-off task, which App Runner cannot; everything is testable without an account (ADR-023). |
| Delivery | GitHub Actions with OIDC to AWS, artifact attestations (Sigstore), Dependabot, Sentry | No stored cloud keys; deploys verify that an image came from this repository's CI; errors reported only when configured. |
| Tooling | npm workspaces, Turborepo, ESLint, Prettier, Jest, Supertest, `node:test`, ShellCheck, actionlint, release-please | Builds in dependency order with caching; CI lints and tests every script and workflow; release-please versions the releases. |
| Testing beyond unit tests | Playwright and axe-core (browser journeys, accessibility), k6 (load), Schemathesis (API contract), run from pinned containers where possible | Tests the running stack as users and clients meet it; the containers need only Docker (ADR-022). |

## Quick start

**Prerequisites:** Docker (with Compose) and Node.js 22.18 or later. The production-like stack runs everything, including Supabase Auth, in containers:

```bash
git clone https://github.com/fasharif/topflow.git && cd topflow
node infra/compose/generate-env.mts     # secrets, Supabase keys and URLs → infra/compose/.env
docker compose -f docker-compose.prod.yml --env-file infra/compose/.env up -d --build --wait
docker compose -f docker-compose.prod.yml --env-file infra/compose/.env --profile demo run --rm --build seed
```

Then open https://localhost:8443 (a local certificate authority: accept the warning, or trust its root certificate as [infra/README.md](infra/README.md#production-like-stack-docker-compose) explains). The API is at https://api.localhost:8443, and the emails Supabase Auth sends appear at http://127.0.0.1:8025. `docker compose -f docker-compose.prod.yml --env-file infra/compose/.env --profile demo down -v` stops everything and deletes the data.

**For development** with hot reload, against the Supabase CLI stack (Node.js 22+, npm 11):

```bash
npm install
npm run supabase:start   # local PostgreSQL, Auth, Storage, Studio and a mail catcher
npm run setup            # env files from the examples, local keys, migrations and demo data
npm run dev              # API on :3000 (Swagger at /docs), web app on :3002
```

`npm run setup` copies the API, web and database `.env.example` files to the files those apps read (it never overwrites one; the mobile app's is left to you, see [Configuration](#configuration)), fills in the local Supabase keys from `npx supabase status -o env` and a shared `INTERNAL_API_SECRET` where they are empty, then runs `npm run db:deploy` and `npm run db:seed`. It only loads data into a database on this machine. If it reports a key as still empty, copy it from `npx supabase status`.

| Local service | URL |
| --- | --- |
| Web app | http://localhost:3002 |
| API docs | http://localhost:3000/docs |
| Supabase Studio | http://127.0.0.1:54323 |
| Emails sent by the stack | http://127.0.0.1:54324 |

### Demo accounts

Every seeded account uses the password `TopFlow2026!` unless `SEED_DEMO_PASSWORD` is set (see `.env.example`). Because that password is public, a shared or production environment must be seeded with its own. The public demo is the exception: its password is published on purpose, and its data resets every night ([Try the demo](#try-the-demo)). With `STAFF_MFA_REQUIRED=true` (always on in the Compose stack), staff accounts are asked to set up an authenticator app the first time they open the back office.

| Email | Role | Try |
| --- | --- | --- |
| `customer@example.com` | Retail customer | Checkout, order tracking |
| `buyer@desertbloom.example` | Trade **buyer** (AED 5,000 limit) | RFQs, accepting quotations |
| `approver@desertbloom.example` | Trade **approver** (AED 50,000 limit) | Approving purchases above the buyer's limit |
| `owner@desertbloom.example` | Trade **owner** | Team invitations, delivery sites, company profile |
| `sales@topflow.example` | Top Flow sales | KYC, RFQ triage, quotation builder |
| `warehouse@topflow.example` | Top Flow warehouse | Fulfilment, stock |
| `admin@topflow.example` | Administrator | Everything, including staff invitations and the audit trail |

The addresses use reserved example domains (RFC 2606). Desert Bloom Landscaping LLC is a fictional company.

## Try the demo

> **Not hosted yet.** There is no public demo address today. Demo mode and the nightly reset are built and tested on a local machine, and the CI workflow runs the reset and the demo checks on every push to `develop` and feature branches and on every pull request to `develop`, but no demo deployment exists and the reset has never run against a hosted Supabase project. This section describes how the demo will work and how to run the same demo mode on your own machine.

![The sign-in page of a demo build: the portfolio demo banner across the top and the list of published demo accounts under the form.](docs/images/demo-sign-in.png)

*The sign-in page of a local demo build (`NEXT_PUBLIC_DEMO_MODE=true`), captured with headless Chromium on 26 September 2026. It is not a hosted site.*

The public demo will be the production build with demo mode switched on (`DEMO_MODE=true` in the API, `NEXT_PUBLIC_DEMO_MODE=true` in the web app), on a Supabase project of its own:

- Every page says *"Portfolio demo: data resets every night. This is not Top Flow's official store."* in place of the portfolio notice, every page title and link preview calls the site a portfolio demo, and search engines are asked not to index it, as for every build. The contact page and the footer say that Top Flow's phone number and email address are real, but that quote requests and orders made in the demo are not passed to Top Flow.
- You sign in with the published [demo accounts](#demo-accounts), from the retail customer to the administrator. They share the password `TopFlow2026!`, and the sign-in page lists them. Their addresses are on reserved example domains, so they are not real mailboxes.
- The demo emails nobody outside a short allow-list. Business emails (quote acknowledgements, quotations, order updates, team invitations) are withheld, and the web app says so; staff invitations and customer invitations from website requests are refused; sign-up and password reset emails are switched off.
- The demo accounts keep their role, membership and access, and the demo company (Desert Bloom Landscaping LLC) keeps its KYC status, trading terms and TRN, so no visitor can lock the others out of the trade flow. The web app does not offer password or two-factor changes for the shared accounts; changes made by calling Supabase Auth directly are undone by the nightly reset. Rate limits stay on.
- Every night at 03:00 UAE time, a GitHub Actions workflow runs `npm run demo:reset`, which empties the database, deletes every sign-in of the demo project (after checking that the project and the database belong together) and loads the demo data again.

**Demo mode on your machine.** After the development setup of the [quick start](#quick-start), set `DEMO_MODE=true` and `STAFF_MFA_REQUIRED=false` in `apps/api/.env` and `NEXT_PUBLIC_DEMO_MODE=true` in `apps/web/.env.local`, then run `npm run dev`. To return the local database to the demo data set, run `DEMO_MODE=true npm run demo:reset -- --confirm` in bash, or `$env:DEMO_MODE='true'; npm run demo:reset -- --confirm; Remove-Item Env:DEMO_MODE` in PowerShell. The reset takes `DEMO_MODE` only from the shell, never from an `.env` file, and also replaces the local sign-ins when `packages/database/.env` holds the local stack's keys.

Why it works this way: [ADR-021](docs/DECISIONS.md). How to host it and what it does not prevent: [the runbook's *Public demo* section](docs/OPERATIONS.md#public-demo).

## Configuration

Each app reads its own environment file, and every variable is described in the example next to it. Nothing secret is committed: only `.env.example` and `terraform.tfvars.example` files.

| File | Created from | Holds |
| --- | --- | --- |
| `apps/api/.env` | `apps/api/.env.example` (`npm run setup`) | Database, Supabase URL and secret key, internal secret, rate limits, mail, demo mode, optional Sentry, company details |
| `apps/web/.env.local` | `apps/web/.env.example` (`npm run setup`) | Supabase URL and publishable key, API origin, internal secret, site URL, demo mode, optional Sentry |
| `packages/database/.env` | `packages/database/.env.example` (`npm run setup`) | Database, plus Supabase keys so the seed creates sign-ins |
| `apps/mobile/.env` | `apps/mobile/.env.example` | API, web and Supabase URLs, publishable key |
| `infra/compose/.env` | `node infra/compose/generate-env.mts` | Ports, random database passwords and secrets, Supabase Auth keys for the Compose stack (written owner-only) |
| `infra/terraform/*/terraform.tfvars` | `terraform.tfvars.example` next to each | Host names, certificate, Supabase URL and publishable key (the environments' files are committed); the budget addresses (the bootstrap's file, not committed). The alarm address comes from `TF_VAR_alarm_email`, and secrets go to SSM |

The API validates its environment at start-up and stops with a readable report when something is missing or inconsistent; the release step (`npm run release`, or the `topflow-hub-migrate` image) runs the same check before migrations. The web image reads its `NEXT_PUBLIC_*` values at runtime, except `NEXT_PUBLIC_DEMO_MODE`, which is fixed when it is built. Production settings, secrets, backups and secret rotation are in the [operations runbook](docs/OPERATIONS.md).

## Tests

**Quality at a glance.** The latest run was made on 4 October 2026, after the system tests and the fixes they led to were merged with the container, infrastructure and dependency work on `develop`. It ran on a Windows 11 laptop with Docker Desktop, entirely in Linux containers and in the order of the CI workflows: Node 24 with npm 11.19, PostgreSQL 17 for the API suites, and a Supabase CLI 2.118 stack with the API and the web app from production builds for the system tests. The k6 load profile was last measured on 3 October 2026, before that merge. What ran, and what did not, is in the [test plan, section 9](docs/testing/TEST-PLAN.md#9-results-of-this-cycle).

| Level | Tool | Tests | Result | Details |
| --- | --- | --- | --- | --- |
| Unit | Jest, `node:test` | 298: shared 91, API 99, web 55, mobile 8, database 39, setup script 6 | all passed | [Test plan, section 9](docs/testing/TEST-PLAN.md#9-results-of-this-cycle) |
| API end-to-end | Jest, Supertest, PostgreSQL 17 | 53 | all passed; 79.3 % of API statements covered | [Test plan, section 7](docs/testing/TEST-PLAN.md#7-decision-tables-and-boundary-values) (decision tables) |
| Mutation check | `tests/scripts/mutation-check.mts` | 3 deliberate breaks of the money rules | all 3 caught | [Test plan, section 7](docs/testing/TEST-PLAN.md#7-decision-tables-and-boundary-values) |
| System | Playwright (Chromium) | 31 | all passed | [tests/README.md](tests/README.md) |
| Accessibility | axe-core | 41 pages, at desktop and phone size | no serious or critical violation | [Test plan, section 8](docs/testing/TEST-PLAN.md#8-non-functional-testing) |
| Load | k6 | 4 measured runs of 4½ minutes, about 24,500 requests each, on 3 October 2026; a smoke run on 4 October | p95 of every endpoint between 3 and 20 ms at about 90 requests a second; 1 of 97,905 requests failed. Smoke run: 0 of 27 requests failed | [PERFORMANCE.md](docs/testing/PERFORMANCE.md) |
| API contract | Schemathesis | 3 passes | no new failure | [Triage](docs/testing/BUGS-FOUND.md#schemathesis-triage) |
| Defects | | 17 recorded | 16 fixed; 1 of Low severity open | [BUGS-FOUND.md](docs/testing/BUGS-FOUND.md) |

The two High-severity defects were [BUG-02](docs/testing/BUGS-FOUND.md#bug-02--the-customer-can-be-charged-a-total-other-than-the-one-shown), a customer charged a total other than the one shown (now refused by the API, and fixed in the web and mobile apps), and [BUG-13](docs/testing/BUGS-FOUND.md#bug-13--two-acceptances-at-the-same-moment-pass-the-credit-limit), two quotations accepted at the same moment that together passed a company's credit limit (fixed with a row lock).

```bash
npm run check-types && npm run lint     # all workspaces
npm test                                # unit tests of every workspace
npm run test:e2e -w @topflow/api        # end-to-end suites against a real database (DATABASE_URL)
npm run test:scripts                    # the local setup script
npm run demo:rehearse -w @topflow/database   # the demo reset against a stand-in for Supabase Auth (DATABASE_URL of a disposable server)
NEXT_PUBLIC_DEMO_MODE=true npm run build -w web && npm run test:demo -w web   # the demo build, checked over HTTP
npm run build -w web && npm run test:demo -w web -- --off                     # an ordinary build, checked over HTTP
node tests/scripts/mutation-check.mts --with-db    # breaks each money rule in turn (DATABASE_URL)
npm run e2e -w @topflow/system-tests    # browser journeys, axe scans and layout checks against the running stack
npm run load -w @topflow/system-tests       # k6 smoke run (Docker)
npm run load:check -w @topflow/system-tests # the k6 load profile gates on every p95 threshold (Docker)
K6_PROFILE=load npm run load -w @topflow/system-tests # measured load run, about five minutes (Docker)
npm run contract -w @topflow/system-tests   # Schemathesis, three passes, local stack only (Docker)
npx tsc -p infra/tsconfig.json && node --test "infra/**/*.test.mts"   # env generator, smoke test, cost estimate
infra/scripts/tests/deploy-ecs.test.sh  # deploy script against a fake AWS CLI (bash, jq)
infra/scripts/check-terraform.sh        # fmt, validate, terraform test, tflint, Trivy, all in containers
```

- **Unit tests** cover money/VAT maths, workflow state machines, the permission matrix, request schemas, the published OpenAPI description, Supabase token verification, guards, error mapping, configuration and error reporting (Sentry off without a DSN; errors, breadcrumbs and spans scrubbed, also checked with the real SDK). For the demo they cover the mail guard, the demo policy, the demo settings and the safety checks of `npm run demo:reset` (including the check that the Supabase project and the database belong together). In the web app they cover the basket's price refresh, the order tracker, the health endpoint, the public origin, the Vercel-only analytics, every authentication Server Action in and out of demo mode, and, in both builds, the page titles and link previews, which notice opens the page and the agreement of the robots meta tag, the `X-Robots-Tag` header and `robots.txt`. In the mobile app they cover the cart's totals, its price refresh and the order request, which carries the total the cart shows.
- **End-to-end tests** boot the real application (the production middleware stack) against PostgreSQL. They simulate Supabase Auth with locally signed tokens and exercise account provisioning, token rejection, staff MFA, staff invitations and suspension, team invitations, RBAC, tenant isolation, the full RFQ → quotation → approval → order flow, website quote requests, retail fulfilment and signed delivery webhooks from the dispatch service. A test also asserts that every table has Row Level Security enabled. A second suite boots the API in demo mode and checks that visitors and Top Flow's inbox receive no email, that staff and customer invitations are refused while team invitations are kept without their email, that the demo accounts and the demo company cannot be changed while other accounts and companies can, and that rate limits still apply. Each of its tests starts from the seeded demo state.
- **Decision tables.** Purchase approval and release on credit terms are tested at their boundaries in unit tables (`approval.spec.ts`, `order-writer.service.spec.ts`: one fils below, at and one fils above each limit) and over HTTP on new organisations (`decision-tables.e2e-spec.ts`: below, at and above the buyer's limit; at and above the approver's and the credit limit). Five rounds of two simultaneous acceptances, each on a new company, check that orders released at the same moment cannot pass one credit limit. `tests/scripts/mutation-check.mts` then breaks each rule in turn (`>` for `>=`, `<=` for `<`, the row lock removed) and fails unless the tests catch it. Other end-to-end tests check the published OpenAPI description and that checkout refuses a total the customer was not shown.
- **System tests** ([tests/](tests/README.md)) run against the whole stack as the demo users: retail checkout (with totals also worked out by hand, and a price changed while the customer is at checkout), RFQ → approval above the buyer's limit → order, and a new company's sign-up, verification, fulfilment and stock deduction; tenant isolation, the warehouse role's limits and tampered prices; axe-core scans of 41 pages at desktop and phone size, failing on serious or critical WCAG 2.2 A/AA issues; and checks at 1280 × 720 that order and quotation lines show every total and that a table is a tab stop only while it scrolls.
- **Load tests**: k6 with p95 and failed-request thresholds per endpoint; the p95 thresholds are listed once in `tests/load/targets.json`. Four measured runs on 3 October 2026, on a laptop, put every endpoint's p95 between 3 and 20 ms at about 90 requests a second, and the thresholds were set from them at four times the highest p95 ([PERFORMANCE.md](docs/testing/PERFORMANCE.md), with the machine and the command). CI runs a smoke profile that fails on errors, not timings, and checks that the load profile still gates on every threshold.
- **Contract tests**: Schemathesis against the API's OpenAPI description in three passes: as a customer (every operation outside the trade portal), as back-office staff (read operations) and as a trade company. It runs only against a stack on the same machine, because it creates throwaway accounts, one of them an administrator, which it deactivates and deletes afterwards. Triaged findings are kept in a baseline per pass. Its coverage warnings are reported with the results and limit what the case counts mean. Of the 25 operations a customer or visitor may call, 10 mostly answered 404 for lack of test data (invitation tokens, personal quotations) or mostly received generated input that the API rejected, because rules across fields, such as "a saved address or a new one" at checkout, cannot be written in the description; in the trade pass, for a new company with no documents yet, 14 of 24 did. Case counts also vary a little between runs with the same seed. Details: [test plan, section 9](docs/testing/TEST-PLAN.md#9-results-of-this-cycle).
- **Test plan and findings**: scope, risks, environments, exit criteria, decision tables and traceability are in [docs/testing/TEST-PLAN.md](docs/testing/TEST-PLAN.md); defects found are in [docs/testing/BUGS-FOUND.md](docs/testing/BUGS-FOUND.md).
- **Build checks.** `npm run test:demo -w web` starts the production build and checks over HTTP what a visitor, a search engine and a link preview receive. A demo build shows the demo banner and not the portfolio notice, calls itself a portfolio demo in every page title and link preview, shows the note beside Top Flow's contact details and the sign-up and reset notices; with `-- --off`, an ordinary build shows the portfolio notice, describes itself as a portfolio project in its link previews and shows none of the demo traces. Both must send `noindex, nofollow` in the robots meta tag and the `X-Robots-Tag` header, with a `robots.txt` that blocks nothing and names no sitemap.
- **Infrastructure tests** cover the deploy script (18 cases against a fake AWS CLI, including a web rollout that fails and a deploy that stopped half-way), the Terraform module and bootstrap (`terraform test`, mocked provider), the smoke test, the env generator, the cost estimate and the backup restore drill.
- **CI** (`.github/workflows/ci.yml`) runs on every push to `develop` and feature branches and on every pull request to `develop`: lint, type checks, unit tests and a production build for the API and the web app, the build checks on both web builds, type checks and unit tests for the shared and database packages and for `npm run setup`, a type check and the unit tests of the mobile app (its lint and builds do not run in CI), lint, type checks and ShellCheck for the system-test workspace, its script guards and the k6 threshold check, the infrastructure tests above except the Terraform checks, which run in `infra.yml`, and the restore drill end to end. Its end-to-end job runs the real demo reset against a PostgreSQL service container, then the reset rehearsal against the stand-in for Supabase Auth, then the end-to-end suites and the mutation check, and reports the API's coverage for both suites in the job summary. **Containers** (`containers.yml`) builds and scans the images, starts the production-like stack and runs the smoke test. CI, Containers and Infrastructure ran on GitHub for PR #14, which added the containers and the AWS layout, and passed on `develop` after it was merged on 2 October 2026. **System tests** (`system-tests.yml`) starts the stack with the Supabase CLI and runs the Playwright suite, the k6 smoke run and Schemathesis on pull requests to `develop` and on pushes to `develop`; `test-report-pages.yml` publishes the Playwright report from `develop` to GitHub Pages once Pages is enabled for the repository; until then it ends with a notice and publishes nothing. The status of the system tests on `develop`, once they have run there: [![System tests](https://github.com/fasharif/topflow/actions/workflows/system-tests.yml/badge.svg)](https://github.com/fasharif/topflow/actions/workflows/system-tests.yml)

The smoke test against the Compose stack, on 28 September 2026 (images from commit `7d2e7df`, Docker Desktop on Windows 11), passed all 11 checks:

| Result | Check | Detail |
| --- | --- | --- |
| pass | web: liveness (/health) | ok, version sha-7d2e7df |
| pass | api: liveness (/health) | ok, version sha-7d2e7df |
| pass | api: database readiness (/health/ready) | database up |
| pass | auth: Supabase Auth health | ok, v2.196.0 |
| pass | web: robots.txt uses the runtime site URL | Sitemap: https://localhost:55843/sitemap.xml |
| pass | web: home page renders | 273333 bytes of HTML |
| pass | web: marked as a portfolio project, not indexed | portfolio notice shown, X-Robots-Tag noindex |
| pass | auth: password sign-in | session for buyer@desertbloom.ae |
| pass | api: GET /auth/me with the Supabase token | role CUSTOMER, 1 organization(s) |
| pass | api: organization quotations | 3 quotation(s) |
| pass | api: quotation PDF renders | 3912 bytes |

Since that run, the smoke test checks the runtime site URL through the redirect of an email link (`/auth/confirm`), because `robots.txt` no longer names a sitemap; its noindex check also accepts the demo banner of a demo build and reads `robots.txt`; and it signs in as `buyer@desertbloom.example`, since the demo accounts moved to reserved example domains.

## Folder structure

```
apps/
  api/        NestJS REST API (Swagger at /docs outside production), its Dockerfile and release entry point
  web/        Next.js storefront, trade portal (/business) and back office (/admin), and its Dockerfile
  mobile/     Expo React Native app
packages/
  shared/     @topflow/shared — enums, permissions, workflows, money/VAT, Zod schemas, DTO types, demo settings
  database/   @topflow/database — Prisma schema, migrations, seed, demo reset, generated client
infra/
  compose/    Caddyfile, database init script and the env generator of docker-compose.prod.yml
  scripts/    smoke test, deploy and rollback, restore drill, cost estimate, Terraform checks, and their tests
  terraform/  bootstrap (state, OIDC, CI roles, budget), staging and production, the environment module
scripts/      npm run setup for a local checkout
supabase/     Supabase configuration: auth policy, branded email templates, storage buckets
tests/        System tests: Playwright journeys with axe scans, k6 load tests, Schemathesis (tests/README.md)
docs/         Architecture, decisions, operations runbook, test plan and bug log, academic evolution
.github/      CI, Containers, Infrastructure, Deploy, Uptime, Backup, Demo reset, System tests, Publish test report, release-please and CodeQL workflows; Dependabot
docker-compose.prod.yml   the production-like stack of the container images
```

## Design decisions

The reasoning behind the main choices is recorded as short decision records in [docs/DECISIONS.md](docs/DECISIONS.md): among them the modular monolith (ADR-001), shared contracts (ADR-002), integer money and per-line VAT (ADR-006), immutable quotation revisions (ADR-007), Supabase Auth with authorisation kept in the API (ADR-012), httpOnly sessions behind a backend-for-frontend (ADR-013), deferred hosting (ADR-019), the public demo mode (ADR-021), the testing strategy (ADR-022) and the container images, production-like stack and switched-off AWS layout (ADR-023), which also says how every build is marked as a portfolio project.

The original coursework was a Kotlin/Firebase Android app for a bicycle shop. [docs/ACADEMIC-EVOLUTION.md](docs/ACADEMIC-EVOLUTION.md) maps each prototype feature — and each of its engineering shortcuts, such as a hard-coded `admin/admin` login, card numbers typed into the app and totals computed on the device — to the production design used here.

## Limitations and roadmap

- **Nothing is hosted.** The platform runs locally or as the Compose stack. [ADR-019](docs/DECISIONS.md) records why: only officially free hosting qualifies, and Netlify's free plan is the default if the platform is published as a business site.
- **Deploys have not run.** GHCR publishing with provenance and SBOM attestations first ran on a push to `develop` on 2 October 2026, but the Deploy workflow, which verifies them, has not run.
- **The AWS layout has never been applied.** It would cost about 183 US dollars a month for staging and production together (`node infra/scripts/cost-estimate.mts`, on-demand list prices of 26 September 2026, [infra/README.md](infra/README.md#cost-estimate-nothing-is-running)). No `terraform plan` has run against an account, and the deploy script has run only against a fake AWS CLI.
- **The Compose stack is not a Supabase project.** It runs Supabase Auth (GoTrue) with a shared signing secret, while hosted projects use asymmetric keys; both are covered by unit tests.
- **Errors in the browser are not reported.** Sentry covers the API and the web server only.
- **Restore timings are pending** a measured run on a quiet machine. The drill's test passes locally; the nightly backup workflow skips until a database is hosted, so there is no real backup to restore yet.
- **The release step's image has two high-severity advisories** in packages the Prisma CLI pins (listed in [infra/README.md](infra/README.md#container-images)); they clear when Prisma updates them.
- **The demo has not run against Supabase.** CI runs the nightly reset against PostgreSQL, and `npm run demo:rehearse` runs it, Supabase steps included, against a stand-in for the Supabase Auth admin API backed by an `auth.users` table. The first run against a real Supabase project will be the demo project's setup ([runbook, *Public demo*](docs/OPERATIONS.md#public-demo)).
- **Direct Supabase Auth calls.** The web app does not change a shared account's password or two-factor settings, but someone who calls Supabase Auth directly with the published password can change the password until the nightly reset. The runbook switches off authenticator enrolment in the demo project, which closes the two-factor route. The API still enforces every business rule.
- **The mobile app has no demo mode.** Pointed at the demo, it is subject to the same API restrictions, but it shows no banner, and its sign-up and password reset go straight to Supabase, where the demo project has sign-ups switched off and emails only its own team.
- **Releases are tags and release notes only.** release-please published `v1.0.0` and `v1.0.1` from `develop` as GitHub releases, both dated 2 October 2026 in [CHANGELOG.md](CHANGELOG.md). Nothing has been deployed from them, since nothing is hosted.
- **The system-test workflow is new on GitHub.** Until 4 October 2026 the steps of `system-tests.yml` had only been reproduced on a local machine; its first runs on GitHub are those of the pull request that adds it. `test-report-pages.yml` has not run on GitHub: it starts only after a system-test run on `develop`, and GitHub Pages is not enabled for the repository. It is written to end with a notice, and to leave the report as an artifact of the system-test run, until Pages is enabled with GitHub Actions as the source. Its first step was run as a script against the repository on 4 October 2026 and reported that Pages is not enabled; its publishing steps have never run.
- **Testing gaps.** Load-test timings come from a laptop running the whole stack, not from a hosted deployment, and no test has looked for the API's capacity; Schemathesis does not fuzz the back office's writes (the API suite covers them), and its generated input rarely satisfies rules across fields, for which it has no examples or custom strategies yet; only Chromium runs; device tests of the mobile app (for example with Maestro) are out of scope for now, so its screens have no automated test.
- **One defect is open.** Any account can open any number of trade account applications ([BUG-17](docs/testing/BUGS-FOUND.md#bug-17--one-account-can-open-any-number-of-trade-account-applications), Low); the limit is a product decision still to be made.
- **Roadmap:** choose a host under ADR-019; then the first real plan, apply and deploy, the hosted demo with its own Supabase project, a restore drill against a real nightly backup, and a Sentry project.

## Licence

The code is released under the [MIT licence](LICENSE), © 2026 Farah Sharif. Top Flow's name, logo, product data and product photos are used with Top Flow's permission and are not covered by that licence.
