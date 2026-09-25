# System tests

Black-box tests of the running platform: Supabase Auth, the API and the web app together, seeded with the demo profile. They complement the unit tests and the API's end-to-end suite (which simulates Supabase Auth); the reasoning is in ADR-022 and the full plan in [docs/testing/TEST-PLAN.md](../docs/testing/TEST-PLAN.md).

| Suite | Tool | Runs in | Command |
| --- | --- | --- | --- |
| Money paths, security checks | Playwright 1.63 (Chromium) | Node | `npm run e2e -w @topflow/system-tests` |
| Accessibility (WCAG 2.2 A/AA) | axe-core 4.13 through `@axe-core/playwright` | Node, same run | as above |
| Load | k6 2.3 (`grafana/k6`) | Docker | `npm run load -w @topflow/system-tests` |
| API contract | Schemathesis 4.28 (`schemathesis/schemathesis`) | Docker | `npm run contract -w @topflow/system-tests` |
| README screenshots and GIF | Playwright, ffmpeg 9 (`linuxserver/ffmpeg`) | Node, Docker | `npm run screenshots` then `npm run walkthrough:gif` (same workspace) |

The container images are pinned in [compose.yaml](compose.yaml), so nothing needs installing apart from Node and Docker.

## What the Playwright suite covers

| Spec | Scenarios |
| --- | --- |
| `e2e/auth.setup.ts` | Signs in every demo account through the sign-in form and keeps its session |
| `e2e/retail-checkout.spec.ts` | Money path 1: a customer buys from the catalogue; the order carries the catalogue price, delivery and VAT |
| `e2e/procurement-approval.spec.ts` | Money path 2: RFQ, quotation with the trade discount, acceptance above the buyer's limit, approver sign-off, order on credit terms |
| `e2e/company-verification-fulfilment.spec.ts` | Money path 3: business sign-up with email confirmation (Mailpit), KYC by sales, credit terms, acceptance, picking, dispatch with stock deduction, delivery |
| `e2e/security.spec.ts` | Tenant isolation, the warehouse role's limits, the back office closed to customers, cross-site writes refused, tampered prices ignored |
| `e2e/accessibility.spec.ts` | axe scans of 35 storefront, account, trade-portal and back-office pages, at desktop and phone size |

Journeys act through the user interface. Assertions that a page does not show (an order's saved totals, a status code) go through the web app's `/api` handler with the same user's cookies, which is the path the browser uses. The journeys run one at a time because they share the seeded organizations.

## Running locally

Prerequisites: Node 24 and npm 11, Docker, and the repository installed with `npm ci`.

```bash
# 1. Start Supabase (Auth, PostgreSQL, Mailpit), then create the schema and the demo data.
npm run supabase:start
npx supabase status                       # URLs and keys for the next steps
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
export SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=<SECRET_KEY from status>
npm run db:deploy && npm run db:seed      # the demo profile, with sign-in identities

# 2. Build and start the API and the web app (production builds, as in CI).
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>
export API_INTERNAL_URL=http://localhost:3000 INTERNAL_API_SECRET=<32 or more random characters>
npx turbo run build --filter=@topflow/api --filter=web
STAFF_MFA_REQUIRED=false THROTTLE_LIMIT=100000 AUTH_THROTTLE_LIMIT=1000 npm run start:prod -w @topflow/api &
npm run start -w web &

# 3. Run the suites.
npx -w @topflow/system-tests playwright install chromium   # once
npm run e2e -w @topflow/system-tests
npm run load -w @topflow/system-tests                      # k6 smoke profile
npm run contract -w @topflow/system-tests
npm run e2e:report -w @topflow/system-tests                # open the HTML report
```

`npm run dev` works too, but a development server compiles pages on first use and can make the first journeys slow.

Why the API settings differ from production:

- **`STAFF_MFA_REQUIRED=false`**: staff sign in without an authenticator app. Two-factor authentication for staff is tested by the API's end-to-end suite.
- **Raised `THROTTLE_LIMIT` and `AUTH_THROTTLE_LIMIT`**: all browser traffic reaches the API through the web app's server as one client (127.0.0.1), so the per-client limits would stop the suite. The k6 load profile keeps the default limits and sends each virtual user as its own shopper instead.

### Environment variables

The defaults match the commands above; set these to test another stack.

| Variable | Default | Used by |
| --- | --- | --- |
| `E2E_WEB_URL` | `http://localhost:3002` | Playwright |
| `E2E_API_URL` | `http://localhost:3000` | Playwright (readiness), k6, Schemathesis |
| `E2E_MAILPIT_URL` | `http://127.0.0.1:54324` | Playwright (sign-up confirmation) |
| `E2E_DEMO_PASSWORD` | `SEED_DEMO_PASSWORD`, else `TopFlow2026!` | Playwright, k6 |
| `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY`, `E2E_SUPABASE_SECRET_KEY` | read from `npx supabase status` | k6, Schemathesis |
| `E2E_INTERNAL_API_SECRET` | none | k6: each virtual user is rate limited as its own shopper |
| `K6_PROFILE` | `smoke` | k6: `smoke` or `load` ([docs/testing/PERFORMANCE.md](../docs/testing/PERFORMANCE.md)) |
| `SCHEMATHESIS_MAX_EXAMPLES`, `SCHEMATHESIS_SEED` | `50`, `20260926` | Schemathesis |
| `SCHEMATHESIS_UPDATE_BASELINE` | unset | `1` records the current findings in `contract/baseline.json` |
| `COMPOSE_PROJECT_NAME` | `topflow-system-tests` | Docker Compose project of the tool containers |

## Test data

The suite needs the demo profile of `npm run db:seed`. Every run adds data, and none of it is removed:

- orders from the demo customer, an RFQ, quotation and order for Desert Bloom, and a new company with its owner (`owner.<id>@e2e.topflow.test`) and one order, whose delivery lowers the stock of `AX-EFS-002` by 12;
- quote requests from k6, and a new customer (`fuzz.<id>@e2e.topflow.test`) plus whatever Schemathesis creates with it.

The procurement journey computes the expected release from Desert Bloom's credit position, so it stays correct as earlier runs use credit. To start again from a clean state, run `npx supabase db reset`, which recreates the local database including its sign-ins, then `npm run db:deploy && npm run db:seed`.

## Reports

Everything is written to `tests/reports/` and `tests/test-results/` (both git-ignored): the Playwright HTML report with traces, screenshots and videos of failures and every axe result, the k6 summary (`reports/k6/summary-<profile>.json`, without the access token), and the Schemathesis JUnit report and schema-coverage page. In CI they are uploaded as artifacts, and the Playwright report of `develop` is published to GitHub Pages.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| *The stack under test is not running* | The API, the web app or Mailpit is not reachable at the URLs above |
| *Sign-in as … did not complete* | The database was seeded without Supabase credentials, or with a different `SEED_DEMO_PASSWORD` |
| *… was asked for a second factor* | The API runs with `STAFF_MFA_REQUIRED=true` |
| 429 responses in a report | The API's rate limits were not raised for the browser suite |
| Docker cannot find `host.docker.internal` | Docker Engine older than 20.10; the tool containers rely on `host-gateway` |
