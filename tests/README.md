# System tests

Black-box tests of the running platform: Supabase Auth, the API and the web app together, seeded with the demo profile. They complement the unit tests and the API's end-to-end suite (which simulates Supabase Auth); the reasoning is in ADR-022 and the full plan in [docs/testing/TEST-PLAN.md](../docs/testing/TEST-PLAN.md).

| Suite | Tool | Runs in | Command |
| --- | --- | --- | --- |
| Money paths, security checks, layout | Playwright 1.63 (Chromium) | Node | `npm run e2e -w @topflow/system-tests` |
| Accessibility (WCAG 2.2 A/AA) | axe-core 4.13 through `@axe-core/playwright` | Node, same run | as above |
| Load | k6 2.3 (`grafana/k6`) | Docker | `npm run load -w @topflow/system-tests` |
| API contract | Schemathesis 4.28 (`schemathesis/schemathesis`), three passes | Docker | `npm run contract -w @topflow/system-tests` |
| README screenshots and GIF | Playwright, ffmpeg 9 (`linuxserver/ffmpeg`) | Node, Docker | `npm run screenshots` then `npm run walkthrough:gif` (same workspace) |

The container images are pinned in [compose.yaml](compose.yaml), so nothing needs installing apart from Node and Docker.

## What the Playwright suite covers

| Spec | Scenarios |
| --- | --- |
| `e2e/auth.setup.ts` | Signs in every demo account through the sign-in form and keeps its session |
| `e2e/retail-checkout.spec.ts` | Money path 1: a customer buys from the catalogue; the order carries the catalogue price, delivery and VAT (also compared with totals worked out by hand), and the tracker shows it as confirmed. A price lowered while the customer is at checkout: the first attempt is refused with the new total, the second is charged at it |
| `e2e/procurement-approval.spec.ts` | Money path 2: RFQ, quotation with the trade discount, acceptance above the buyer's limit, approver sign-off, order on credit terms |
| `e2e/company-verification-fulfilment.spec.ts` | Money path 3: business sign-up with email confirmation (Mailpit), KYC by sales, credit terms, acceptance, picking, dispatch with stock deduction, delivery |
| `e2e/security.spec.ts` | Tenant isolation, the warehouse role's limits, the back office closed to customers, cross-site writes refused, tampered prices ignored (the test checks that its tampering happened) |
| `e2e/accessibility.spec.ts` | axe scans of 41 storefront, checkout, account, trade-portal and back-office pages, at desktop and phone size |
| `e2e/layout.spec.ts` | At 1280 × 720, six order and quotation pages show every line total without a sideways scroll; the customer's orders table is a tab stop and a named region only while it scrolls (at 412 px) |

Journeys act through the user interface. Assertions that a page does not show (an order's saved totals, a status code) go through the web app's `/api` handler with the same user's cookies, which is the path the browser uses. The journeys run one at a time because they share the seeded organisations. The demo accounts' addresses and password come from `@topflow/shared` (`DEMO_ACCOUNTS`), the list the seed and the demo's sign-in page use.

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
K6_PROFILE=load npm run load -w @topflow/system-tests      # measured run (5 min): API with default rate limits, E2E_INTERNAL_API_SECRET set; see docs/testing/PERFORMANCE.md
npm run load:check -w @topflow/system-tests                # the load profile's thresholds (no stack needed)
npm run contract -w @topflow/system-tests                  # local stack only
npm run e2e:report -w @topflow/system-tests                # open the HTML report
```

`npm run dev` works too, but a development server compiles pages on first use and can make the first journeys slow. If the Supabase CLI's default ports are taken, start it from a copy of `supabase/` with other ports and set the `E2E_*` variables below to match.

Why the API settings differ from production:

- **`STAFF_MFA_REQUIRED=false`**: staff sign in without an authenticator app. Two-factor authentication for staff is tested by the API's end-to-end suite. The staff pass of Schemathesis needs it too.
- **Raised `THROTTLE_LIMIT` and `AUTH_THROTTLE_LIMIT`**: all browser traffic reaches the API through the web app's server as one client (127.0.0.1), so the per-client limits would stop the suite. The k6 load profile keeps the default limits and sends each virtual user as its own shopper instead.

### README screenshots and GIF

The README media are captured from the demo data with a web app built in demo mode, so every image carries the banner *"Portfolio demo: data resets every night. This is not Top Flow's official store."*; each capture fails if the banner is missing.

```bash
NEXT_PUBLIC_DEMO_MODE=true npm run build -w web && npm run start -w web &
npm run screenshots -w @topflow/system-tests      # docs/screenshots/*.png and a walkthrough video
npm run walkthrough:gif -w @topflow/system-tests  # docs/screenshots/walkthrough.gif (ffmpeg container)
```

### Environment variables

The defaults match the commands above; set these to test another stack. Schemathesis refuses a stack that is not on this machine (below).

| Variable | Default | Used by |
| --- | --- | --- |
| `E2E_WEB_URL` | `http://localhost:3002` | Playwright |
| `E2E_API_URL` | `http://localhost:3000` | Playwright (readiness), k6, Schemathesis |
| `E2E_MAILPIT_URL` | `http://127.0.0.1:54324` | Playwright (sign-up confirmation) |
| `E2E_DEMO_PASSWORD` | `SEED_DEMO_PASSWORD`, else the published demo password | Playwright, k6, Schemathesis (staff pass) |
| `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY`, `E2E_SUPABASE_SECRET_KEY` | read from `npx supabase status` | k6, Schemathesis |
| `E2E_INTERNAL_API_SECRET` | none | k6: each virtual user is rate limited as its own shopper |
| `K6_PROFILE` | `smoke` | k6: `smoke` or `load` ([docs/testing/PERFORMANCE.md](../docs/testing/PERFORMANCE.md)) |
| `SCHEMATHESIS_MAX_EXAMPLES`, `SCHEMATHESIS_SEED` | `50`, `20260926` | Schemathesis |
| `SCHEMATHESIS_PASSES` | `customer staff trade` | Schemathesis: which passes to run |
| `SCHEMATHESIS_UPDATE_BASELINE` | unset | `1` records the current findings in the pass's baseline and drops entries no longer seen |
| `SCHEMATHESIS_ALLOW_REMOTE` | unset | `1` lets Schemathesis run against a stack that is not on this machine; only for a disposable one |
| `TOOL_USER` | the calling user on Linux, `0:0` elsewhere | User the tool containers run as, so reports belong to whoever ran them |
| `COMPOSE_PROJECT_NAME` | `topflow-system-tests` | Docker Compose project of the tool containers |

## API contract passes

`contract/run-schemathesis.sh` creates a throwaway account per pass through the Supabase admin API, so the demo accounts are never changed:

| Pass | Operations | Account and test data |
| --- | --- | --- |
| `customer` | all except the trade portal (`/org/...`), which refuses a customer before any code behind it runs | `fuzz.<run>@e2e.topflow.test`, with a saved address and one order whose ids `schemathesis.toml` gives to the operations that read, change or cancel them |
| `staff` | `GET /admin/...` only | `staff.<run>@e2e.topflow.test`, promoted to Administrator by the demo administrator. Back-office writes are not fuzzed, because they would change the shared demo catalogue, users and companies |
| `trade` | `/org/...` | `trade.<run>@e2e.topflow.test`, owner of a new company ("Fuzz Trading …") waiting for verification, whose id goes in the `x-organization-id` header |

**Safety.** The passes create accounts, one of them promoted to Administrator, and a company, an address and an order, so the script runs only when `E2E_API_URL` and `E2E_SUPABASE_URL` point at this machine (`localhost`, `127.0.0.1`, `[::1]` or `host.docker.internal`), unless `SCHEMATHESIS_ALLOW_REMOTE=1`. Each run gives its accounts a new random password, which is never printed, and builds its JSON bodies with Node, so any `SEED_DEMO_PASSWORD` works. When the script exits, even after a failure, the demo administrator deactivates the three accounts (demoting the promoted one first) and their sign-ins are deleted from Supabase Auth. The company, address and order stay in the database. `bash tests/scripts/common.test.sh` tests the check of the addresses.

Each pass has its own baseline (`contract/baseline.json`, `baseline-staff.json`, `baseline-trade.json`) and writes a JUnit and a JSON report. `node tests/scripts/schemathesis-summary.mts tests/reports/schemathesis` prints, per pass, the operations tested, the test cases, new and known failures, and Schemathesis's warnings about operations it could not reach (only 401/403, repeated 404, mostly rejected input). The triage is in [BUGS-FOUND.md](../docs/testing/BUGS-FOUND.md#schemathesis-triage).

## Test data

The suite needs the demo profile of `npm run db:seed`. Every run adds data, and none of it is removed:

- orders from the demo customer, an RFQ, quotation and order for Desert Bloom, and a new company with its owner (`owner.<id>@e2e.topflow.test`) and one order, whose delivery lowers the stock of `AX-EFS-002` by 12;
- one order from the changed-price journey, which lowers the price of `AX-EFS-005` by AED 8.00 and restores it afterwards;
- quote requests from k6, and per Schemathesis run three deactivated accounts (their sign-ins are deleted) with the company, address, order and other data they created.

The procurement journey computes the expected release from Desert Bloom's credit position, so it stays correct as earlier runs use credit. To start again from a clean state, run `npx supabase db reset`, which recreates the local database including its sign-ins, then `npm run db:deploy && npm run db:seed`.

## Reports

Everything is written to `tests/reports/` and `tests/test-results/` (both git-ignored): the Playwright HTML report with traces, screenshots and videos of failures and every axe result, the k6 summary (`reports/k6/summary-<profile>.json`, which holds no access token), and the Schemathesis JUnit and JSON reports and schema-coverage pages per pass. In CI they are uploaded as artifacts, the k6 and Schemathesis tables go into the job summary, and the Playwright report of `develop` is published to GitHub Pages once Pages is enabled for the repository.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| *The stack under test is not running* | The API, the web app or Mailpit is not reachable at the URLs above |
| *Sign-in as … did not complete* | The database was seeded without Supabase credentials, or with a different `SEED_DEMO_PASSWORD` |
| *… was asked for a second factor* | The API runs with `STAFF_MFA_REQUIRED=true` |
| *The demo administrator could not promote the staff account* | The same: the Schemathesis staff pass needs `STAFF_MFA_REQUIRED=false` |
| *Refusing to fuzz …* | `E2E_API_URL` or `E2E_SUPABASE_URL` points at another machine; Schemathesis runs only against a local stack |
| *No email to … with subject "Confirm your Top Flow account"*, and Mailpit received another subject | Supabase did not load the templates in `supabase/templates`, for example because Docker could not read the folder the stack was started from. Start the stack from a folder Docker can read |
| *No portfolio demo banner* while capturing | The web app was not built with `NEXT_PUBLIC_DEMO_MODE=true` |
| 429 responses in a report | The API's rate limits were not raised for the browser suite |
| Docker cannot find `host.docker.internal` | Docker Engine older than 20.10; the tool containers rely on `host-gateway` |
