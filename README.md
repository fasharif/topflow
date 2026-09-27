# TopFlow Hub — a portfolio B2B/B2C commerce platform, built with Top Flow's permission

A monorepo with a storefront, a trade portal, a back office, an API and a mobile app for a UAE irrigation supplier, packaged as container images with a production-like stack, Terraform for AWS (never applied) and a release pipeline tested against a fake AWS CLI.

[![CI](https://github.com/fasharif/topflow/actions/workflows/ci.yml/badge.svg)](https://github.com/fasharif/topflow/actions/workflows/ci.yml)
[![Containers](https://github.com/fasharif/topflow/actions/workflows/containers.yml/badge.svg)](https://github.com/fasharif/topflow/actions/workflows/containers.yml)

> **Portfolio project.** Built independently by Farah Sharif, with Top Flow's permission to use its name and product catalogue. This is not Top Flow's official online store, and nothing is hosted yet. Every page of the web app says so.

![The storefront's home page in the production-like Compose stack, with the portfolio notice across the top.](docs/images/storefront-compose-stack.png)

*The storefront served by the production-like Compose stack (`docker-compose.prod.yml`, images built from commit `4725a2e`), captured with headless Chrome for Testing 153 at 1280 × 800 on 26 September 2026. It is a local stack, not a hosted site.*

## The problem

**Top Flow — Irrigation & Flow Control Supplies, UAE** sells electrofusion and HDPE fittings, sprinklers and rotors, drip irrigation, pipes and fittings, valves, filtration and landscaping products to two very different audiences:

- **Consumers** who want to buy a few rotors for a villa garden online, at VAT-inclusive prices, paying on delivery.
- **Businesses** — landscapers, MEP contractors, facility managers, developers — who buy for projects through **quotations**, negotiated prices, **purchase approvals** and **credit terms**.

A plain web shop serves the first group only. **TopFlow Hub** serves both: a storefront with approximate prices and quote requests, a trade portal, a back office for Top Flow's teams and a mobile app, all built on one set of shared domain contracts so prices, VAT and workflow rules agree everywhere. Because hosting is deferred until an officially free option fits (ADR-019), the platform also has to be ready to deploy anywhere without spending money on it now.

## Features

| Capability | What it does |
| --- | --- |
| **Catalogue** | 346 products in 11 categories and 61 product lines, with photos or drawn illustrations and specifications. Each product shows an approximate price range (**≈ AED min – max**, VAT included), and search covers names, codes and tags. Counted from `packages/database/prisma/data/topflow-catalogue.json`; sources and licensing in [its README](packages/database/prisma/data/README.md). |
| **Quote requests** | Anyone can send their basket for a quotation — or describe a project without choosing products — with a preferred contact channel and a required-by date. Requests land in the sales inbox next to trade RFQs, and the visitor gets an acknowledgement. |
| **Retail (B2C)** | VAT-inclusive prices, a guest basket, server-priced checkout (cash or card on delivery), and order tracking with a full status timeline. |
| **Procurement (B2B)** | Organisations with Owner / Approver / Buyer roles, RFQs, **versioned quotations** with **PDF** generation, accept / reject / request-revision, **spending-limit approvals** (segregation of duties), and sales orders released on the organisation's **credit terms**. |
| **Multi-tenancy** | Every B2B request runs inside a verified organisation context (`x-organization-id`). Users can belong to several organisations, and Top Flow staff verify each company (KYC). |
| **Operations** | Role-based back office for Sales, Warehouse and Admin: KYC queue, quotation builder, fulfilment state machine, stock deduction at dispatch, low-stock alerts, dashboard KPIs, staff invitations and an immutable audit trail. |
| **Identity & security** | **Supabase Auth** with email confirmation, password recovery and **two-factor authentication required for staff**. Web sessions live in httpOnly cookies behind a backend-for-frontend; the API verifies Supabase tokens (JWKS) and enforces RBAC and tenant isolation. Platform tables are locked away from Supabase's public Data API, rate limits apply per client, and prices are never trusted from clients. |
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
| Tooling | npm workspaces, Turborepo, ESLint, Prettier, Jest, Supertest, `node:test`, ShellCheck, actionlint | Builds in dependency order with caching; CI lints and tests every script and workflow. |

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
npm run supabase:start          # local PostgreSQL, Auth, Storage, Studio (54323) and a mail catcher (54324)
# copy apps/api/.env.example → apps/api/.env and apps/web/.env.example → apps/web/.env.local,
# fill in the keys from `npx supabase status`; packages/database/.env needs DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY
npm run db:deploy && npm run db:seed
npm run dev                     # API on :3000 (Swagger at /docs), web app on :3002
```

### Demo accounts

Every seeded account uses the password `TopFlow2026!` unless `SEED_DEMO_PASSWORD` is set. Because that password is public, a shared or production environment must be seeded with its own. With `STAFF_MFA_REQUIRED=true` (always on in the Compose stack), staff accounts are asked to set up an authenticator app the first time they open the back office.

| Email | Role | Try |
| --- | --- | --- |
| `customer@example.com` | Retail customer | Checkout, order tracking |
| `buyer@desertbloom.ae` | Trade **buyer** (AED 5,000 limit) | RFQs, accepting quotations |
| `approver@desertbloom.ae` | Trade **approver** (AED 50,000 limit) | Approving purchases above the buyer's limit |
| `owner@desertbloom.ae` | Trade **owner** | Team invitations, delivery sites, company profile |
| `sales@topflow.ae` | Top Flow sales | KYC, RFQ triage, quotation builder |
| `warehouse@topflow.ae` | Top Flow warehouse | Fulfilment, stock |
| `admin@topflow.ae` | Administrator | Everything, including staff invitations and the audit trail |

## Configuration

Each app reads its own environment file, and every variable is described in the example next to it. Nothing secret is committed: only `.env.example` and `terraform.tfvars.example` files.

| File | Created from | Holds |
| --- | --- | --- |
| `apps/api/.env` | `apps/api/.env.example` | Database, Supabase URL and secret key, internal secret, rate limits, mail, company details, optional Sentry |
| `apps/web/.env.local` | `apps/web/.env.example` | Supabase URL and publishable key, API origin, internal secret, site URL, optional Sentry |
| `packages/database/.env` | the root `.env.example` explains it | Database, plus Supabase keys so the seed creates sign-ins |
| `apps/mobile/.env` | `apps/mobile/.env.example` | API, web and Supabase URLs, publishable key |
| `infra/compose/.env` | `node infra/compose/generate-env.mts` | Ports, random database passwords and secrets, Supabase Auth keys for the Compose stack (written owner-only) |
| `infra/terraform/*/terraform.tfvars` | `terraform.tfvars.example` next to each | Host names, certificate, Supabase URL and publishable key (the environments' files are committed); the budget addresses (the bootstrap's file, not committed). The alarm address comes from `TF_VAR_alarm_email`, and secrets go to SSM |

The API validates its environment at start-up and stops with a readable report when something is missing or inconsistent; the release step runs the same check before migrations. The web image reads its `NEXT_PUBLIC_*` values at runtime, except `NEXT_PUBLIC_DEMO_MODE`, which is fixed when it is built. Production settings, secrets, backups and secret rotation are in the [operations runbook](docs/OPERATIONS.md).

## Tests

```bash
npm run check-types && npm run lint     # all workspaces
npm test                                # unit tests
npm run test:e2e -w @topflow/api        # end-to-end suite against a real database (DATABASE_URL)
npx tsc -p infra/tsconfig.json && node --test "infra/**/*.test.mts"   # env generator, smoke test, cost estimate
infra/scripts/tests/deploy-ecs.test.sh  # deploy script against a fake AWS CLI (bash, jq)
infra/scripts/check-terraform.sh        # fmt, validate, terraform test, tflint, Trivy, all in containers
```

- **Unit tests** cover money/VAT maths, workflow state machines, the permission matrix, request schemas, Supabase token verification, guards, error mapping, configuration and error reporting (Sentry off without a DSN; errors, breadcrumbs and spans scrubbed, also checked with the real SDK), and in the web app the health endpoint, the public origin, the portfolio notice and the Vercel-only analytics.
- **End-to-end tests** boot the real application (the production middleware stack) against PostgreSQL. They simulate Supabase Auth with locally signed tokens and exercise account provisioning, token rejection, staff MFA, staff invitations and suspension, team invitations, RBAC, tenant isolation, the full RFQ → quotation → approval → order flow, website quote requests and retail fulfilment. A test also asserts that every table has Row Level Security enabled.
- **Infrastructure tests** cover the deploy script (18 cases against a fake AWS CLI, including a web rollout that fails and a deploy that stopped half-way), the Terraform module and bootstrap (`terraform test`, mocked provider), the smoke test, the env generator, the cost estimate and the backup restore drill.
- **CI** (`.github/workflows/ci.yml`) runs all of the above except the Terraform checks, which run in `infra.yml`, plus the restore drill end to end. **Containers** (`containers.yml`) builds and scans the images, starts the production-like stack and runs the smoke test. These workflows have not run on GitHub yet, because this branch has not been pushed; every job's commands were run locally in Linux containers (see Limitations).

The smoke test against the Compose stack, on 26 September 2026 (images from commit `4725a2e`, Docker Desktop on Windows 11), passed all 11 checks:

| Result | Check | Detail |
| --- | --- | --- |
| pass | web: liveness (/health) | ok, version sha-4725a2e |
| pass | api: liveness (/health) | ok, version sha-4725a2e |
| pass | api: database readiness (/health/ready) | database up |
| pass | auth: Supabase Auth health | ok, v2.196.0 |
| pass | web: robots.txt uses the runtime site URL | Sitemap: https://localhost:55843/sitemap.xml |
| pass | web: home page renders | 273583 bytes of HTML |
| pass | web: marked as a portfolio project, not indexed | portfolio notice shown, X-Robots-Tag noindex |
| pass | auth: password sign-in | session for buyer@desertbloom.ae |
| pass | api: GET /auth/me with the Supabase token | role CUSTOMER, 1 organization(s) |
| pass | api: organization quotations | 3 quotation(s) |
| pass | api: quotation PDF renders | 3912 bytes |

## Folder structure

```
apps/
  api/        NestJS REST API (Swagger at /docs outside production), its Dockerfile and release entry point
  web/        Next.js storefront, trade portal (/business) and back office (/admin), and its Dockerfile
  mobile/     Expo React Native app
packages/
  shared/     @topflow/shared — enums, permissions, workflows, money/VAT, Zod schemas, DTO types
  database/   @topflow/database — Prisma schema, migrations, seed, generated client
infra/
  compose/    Caddyfile, database init script and the env generator of docker-compose.prod.yml
  scripts/    smoke test, deploy and rollback, restore drill, cost estimate, Terraform checks, and their tests
  terraform/  bootstrap (state, OIDC, CI roles, budget), staging and production, the environment module
supabase/     Supabase configuration: auth policy, branded email templates, storage buckets
docs/         Architecture, decisions, operations runbook, academic evolution
.github/      CI, Containers, Infrastructure, Deploy and Uptime workflows; Dependabot
docker-compose.prod.yml   the production-like stack of the container images
```

## Design decisions

The reasoning behind the main choices is recorded as short decision records in [docs/DECISIONS.md](docs/DECISIONS.md): among them the modular monolith (ADR-001), shared contracts (ADR-002), integer money and per-line VAT (ADR-006), immutable quotation revisions (ADR-007), Supabase Auth with authorisation kept in the API (ADR-012), httpOnly sessions behind a backend-for-frontend (ADR-013), deferred hosting (ADR-019) and the container images, production-like stack and switched-off AWS layout (ADR-023).

The original coursework was a Kotlin/Firebase Android app for a bicycle shop. [docs/ACADEMIC-EVOLUTION.md](docs/ACADEMIC-EVOLUTION.md) maps each prototype feature — and each of its engineering shortcuts, such as a hard-coded `admin/admin` login, card numbers typed into the app and totals computed on the device — to the production design used here.

## Limitations and roadmap

- **Nothing is hosted.** The platform runs locally or as the Compose stack. [ADR-019](docs/DECISIONS.md) records why: only officially free hosting qualifies, and Netlify's free plan is the default if the platform is published as a business site.
- **The AWS layout has never been applied.** It would cost about 183 US dollars a month for staging and production together (`node infra/scripts/cost-estimate.mts`, on-demand list prices of 26 September 2026, [infra/README.md](infra/README.md#cost-estimate-nothing-is-running)). No `terraform plan` has run against an account, and the deploy script has run only against a fake AWS CLI.
- **The new workflows have not run on GitHub.** This branch has not been pushed, so the CI, Containers and Infrastructure workflows have run only as their commands, locally in Linux containers. GHCR publishing and the provenance and SBOM attestations run on the first push to `develop`; the Deploy workflow's verification of them has not run either.
- **The Compose stack is not a Supabase project.** It runs Supabase Auth (GoTrue) with a shared signing secret, while hosted projects use asymmetric keys; both are covered by unit tests.
- **Errors in the browser are not reported.** Sentry covers the API and the web server only.
- **Restore timings are pending** a measured run on a quiet machine. The drill's test passes locally; the nightly backup workflow skips until a database is hosted, so there is no real backup to restore yet.
- **The release step's image has two high-severity advisories** in packages the Prisma CLI pins (listed in [infra/README.md](infra/README.md#container-images)); they clear when Prisma updates them.
- **Roadmap:** choose a host under ADR-019; then the first real plan, apply and deploy, a restore drill against a real nightly backup, and a Sentry project.

## Licence

The code is released under the [MIT licence](LICENSE), © 2026 Farah Sharif. Top Flow's name, logo, product data and product photos are used with Top Flow's permission and are not covered by that licence.
