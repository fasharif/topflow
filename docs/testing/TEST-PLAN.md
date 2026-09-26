# Test plan

How TopFlow Hub is tested: what is in scope, which risks drive the tests, how the levels fit together, where the tests run, when a change is ready to merge, and which test covers which feature. The strategy is recorded in ADR-022 of [DECISIONS.md](../DECISIONS.md); defects found are in [BUGS-FOUND.md](BUGS-FOUND.md) and load-test targets in [PERFORMANCE.md](PERFORMANCE.md).

TopFlow Hub is a portfolio project built with Top Flow's permission; every account, company and document in the test data is fictional.

## 1. Scope

**In scope**

| Area | Tested through |
| --- | --- |
| Shared domain rules (`@topflow/shared`): money and VAT, state machines, permissions, request schemas, purchase approval | Unit tests |
| API (NestJS): guards, workflows, pricing, credit release, OpenAPI description | Unit tests, end-to-end tests over HTTP against PostgreSQL |
| Web app (Next.js): storefront, customer account, trade portal, back office, the `/api` backend-for-frontend | Playwright against the running stack, Chromium at desktop and phone size |
| Identity with Supabase Auth: sign-in, sign-up with email confirmation, sessions in httpOnly cookies | Playwright against a real local Supabase Auth; token verification in the API suites |
| Accessibility | axe-core scans (WCAG 2.2 A and AA rules) |
| Performance of key API endpoints | k6 load test with p95 thresholds |
| API contract | Schemathesis against the published OpenAPI description |
| Database lockdown (Row Level Security) | API end-to-end test |

**Out of scope for now**

| Area | Reason, and what covers it today |
| --- | --- |
| Mobile app on devices (for example Maestro flows on an Android emulator or iOS simulator) | Needs emulators or devices in CI. The app shares `@topflow/shared` and the API with the web app, both tested above, and CI type-checks it |
| Firefox and WebKit | The storefront uses no browser-specific APIs; Chromium keeps the run short. Another browser is one more project in `tests/playwright.config.ts` |
| Real email delivery (Resend) and SMTP | The API uses the console transport and Supabase sends to Mailpit; templates are checked by reading Mailpit |
| Online card payments | Not offered (payment on delivery, bank transfer and credit only) |
| Hosting, backups and restores | Nothing is hosted (ADR-019); the backup workflow is covered in OPERATIONS.md |
| Manual accessibility audit with screen readers, visual regression, penetration testing | Automated scans find only part of the accessibility issues; these belong to a release checklist, not to every change |

## 2. Risks

Likelihood and impact are rated Low, Medium or High; the level is the higher of the two when either is High, otherwise Medium.

| ID | Risk | Likelihood | Impact | Level | Tests that address it |
| --- | --- | --- | --- | --- | --- |
| R1 | A customer is charged, or shown, a price other than the catalogue or quoted price | Medium | High | High | Retail checkout journey; tampered-price check; API checkout test; decision tables; BUG-02 |
| R2 | A purchase above a buyer's limit becomes an order without an approver, or someone approves their own purchase | Low | High | High | Decision table A (unit and HTTP); procurement journey |
| R3 | Goods are released on credit beyond a company's credit limit | Low | High | High | Decision table B (unit and HTTP); procurement and company journeys |
| R4 | One company sees or acts on another company's quotations or orders | Low | High | High | Tenant-isolation checks in the browser path; API isolation test |
| R5 | A staff role does more than its permissions (warehouse approving a company, a purchase or a payment; a customer in the back office) | Low | High | High | Role checks in the browser path; API RBAC tests |
| R6 | Stock is deducted twice, never, or at the wrong step | Medium | Medium | Medium | Company journey (stock unchanged at picking, lower by the quantity at dispatch); API fulfilment test |
| R7 | VAT or rounding differs between preview, document and invoice | Low | High | High | Money unit tests; totals asserted in the journeys |
| R8 | Keyboard or screen-reader users cannot complete a task | Medium | Medium | Medium | axe scans at two sizes; BUG-01, BUG-11 |
| R9 | Clients rely on an API description that does not match the API | Medium | Medium | Medium | Schemathesis; OpenAPI end-to-end test; BUG-03 to BUG-07 |
| R10 | Key pages slow down under load | Unknown until measured | Medium | Medium | k6 thresholds; measured run pending |
| R11 | Sign-up, confirmation or sign-in breaks with a Supabase change | Low | High | High | Company journey (real sign-up and Mailpit confirmation); sign-in of every demo account; API token tests |
| R12 | Cross-site request forgery on state-changing calls | Low | High | High | Cross-site write check; Origin check in the `/api` handler |

## 3. Approach

The levels form a pyramid: many fast tests of rules at the bottom, fewer slow tests of whole journeys at the top.

| Level | Tool | Where | What it proves |
| --- | --- | --- | --- |
| Static | TypeScript strict, ESLint, Prettier, shellcheck, actionlint | Every push (`ci.yml`) | Contracts compile, scripts and workflows are sound |
| Unit | Jest | `packages/shared`, `apps/api/src` | Rules in isolation, including every row of decision tables A and B |
| API end-to-end | Jest, Supertest, PostgreSQL, simulated Supabase Auth | `apps/api/test` | The real middleware stack, workflows and boundaries over HTTP |
| System | Playwright (Chromium) against the running stack | `tests/e2e` | Journeys, security and accessibility as users meet them |
| Load | k6 | `tests/load` | Latency targets per endpoint |
| Contract | Schemathesis | `tests/contract` | Responses and validation match the published description |

**Test design techniques**

- *Decision tables and boundary values* for the two money rules (section 7), derived from the code rather than the documentation.
- *Equivalence partitioning* of roles: platform roles (customer, sales, warehouse, admin) and organization roles (owner, approver, buyer), each with the demo account that represents it.
- *State transitions*: order and quotation state machines in unit tests; the journeys walk the main paths end to end.
- *Negative and abuse cases*: foreign tenants, missing permissions, cross-site writes, tampered prices, generated invalid input.
- *Test oracles* that restate a rule where the expected outcome depends on data from earlier runs: the procurement journey computes the expected credit release from the company's current exposure.

**Test data.** The demo profile of `npm run db:seed` provides the accounts, two companies and fixed-number documents. Tests that change state create their own data with unique names (`@e2e.topflow.test` addresses, run ids in project references); the decision tables use a new company each; the journeys run one at a time. Details in [tests/README.md](../../tests/README.md).

## 4. Environments

| Environment | Stack | Used for |
| --- | --- | --- |
| Developer machine | Supabase CLI stack (PostgreSQL 17, Auth, Mailpit), API and web app from production builds or `npm run dev`, Docker for k6, Schemathesis and ffmpeg | All suites; the screenshots |
| CI, `ci.yml` (every push and pull request) | GitHub-hosted Ubuntu runner, Node 24; PostgreSQL 17 service container for the API suite | Static checks, unit tests with coverage, builds, API end-to-end tests with coverage |
| CI, `system-tests.yml` (pull requests and `develop`) | Same runner with the Supabase CLI stack, the API and the web app started from production builds, Chromium from Playwright 1.63 | Playwright and axe, k6 smoke run, Schemathesis |
| Quiet machine (manual) | As the developer machine, nothing else running | Measured k6 load runs only |

Differences from production, deliberately: staff two-factor authentication is off in the system tests and covered by the API suite; per-client rate limits are raised for the browser suite because its traffic reaches the API as one client; email goes to the console and to Mailpit.

## 5. Entry and exit criteria

**Entry** (a suite may start when)

- the workspace installs with `npm ci` and the shared packages build;
- migrations apply to an empty database and the demo seed completes;
- for the system tests, the API readiness check, the web app and Mailpit answer (the Playwright global setup checks and explains what is missing).

**Exit for a pull request into `develop`**

- every job of `ci.yml` and `system-tests.yml` is green: no lint or type errors, no failed unit, API end-to-end or Playwright test;
- no serious or critical axe violation on the scanned pages;
- the k6 smoke run meets its thresholds;
- Schemathesis reports no finding outside `schemathesis.toml` and `baseline.json`;
- no open High-severity defect in BUGS-FOUND.md, and every Medium one has an issue and an owner.

**Additional exit for a public release**

- a measured k6 load run on a quiet machine meets the p95 targets in PERFORMANCE.md;
- a manual keyboard and screen-reader pass of checkout, quotation acceptance and approval.

## 6. Traceability

Features as listed in the README's *Highlights*, with the tests that cover them.

| Feature | Rules | Tests |
| --- | --- | --- |
| Catalogue and price ranges | Retail price includes 5 % VAT; ranges shown to consumers | API: *exposes indicative price ranges…*; system: retail checkout; axe: storefront pages; k6: catalogue, search, product |
| Website quote requests | Products or a 20-character description; contact details validated; public and rate limited | API: website quote request tests; k6: `quote`; Schemathesis: `POST /quote-requests` |
| Retail checkout (B2C) | Server prices every line; delivery AED 25 below AED 500 net; VAT per line and on delivery | System: retail checkout, tampered price; API: *prices checkout on the server…*; unit: money tests |
| Procurement: RFQ, quotations, approval | Decision table A; nobody approves their own purchase | Unit: `approval.spec.ts`; API: `decision-tables.e2e-spec.ts` table A, *routes purchases above the buyer limit…*; system: procurement journey |
| Credit terms | Decision table B | Unit: `order-writer.service.spec.ts`; API: `decision-tables.e2e-spec.ts` table B; system: procurement oracle, company journey |
| Multi-tenancy | Membership verified per request; organization id from the header only | System: tenant isolation; API: *isolates organizations from each other* |
| Company verification (KYC) | Only sales and admin review; pending companies cannot accept | System: company journey, warehouse limits; API: table B row B0 |
| Fulfilment and stock | Each step's permission; stock deducted at dispatch; cash on delivery marked paid on delivery | System: company journey; API: retail fulfilment test; system: warehouse cannot record payments |
| Refunds (ADR-020) | Paid orders cancelled by staff; refund recorded once | API: *leaves a paid order for Top Flow to cancel…* |
| Identity and security | Supabase tokens verified; MFA for staff; httpOnly sessions; cross-site writes refused | System: sign-in of every demo account, sign-up with confirmation, cross-site write; API: authentication tests; Schemathesis: `ignored_auth` check |
| Accessibility | WCAG 2.2 A and AA | System: `accessibility.spec.ts` (35 pages, two sizes) |
| API description | Validation rules, error envelope, valid OpenAPI 3.0 | API: *publishes the validation rules and the error envelope…*; unit: `openapi.spec.ts`; Schemathesis |

## 7. Decision tables and boundary values

### Table A — purchase approval by spending limit

Source: `requiresApproval` in `packages/shared/src/workflows/approval.ts`, applied by `QuotationsService.respond` and `decideApproval`. The amount compared is the **net value**: goods after discounts plus delivery, excluding VAT.

| Rule | Member has a limit | Amount compared with the limit | Organization role | Outcome when accepting |
| --- | --- | --- | --- | --- |
| A1 | Yes | below | any | Accepted; sales order created |
| A2 | Yes | equal | any | Accepted; sales order created |
| A3 | Yes | above | any, owners included | Pending approval |
| A4 | No | any amount, even zero | Buyer | Pending approval |
| A5 | No | any amount | Owner or approver | Accepted; sales order created |

Signing off a pending purchase (`decideApproval`) also needs all of: the organization permission *approve purchases* (owners and approvers), not being the member who accepted it, and the approver's own rule A1, A2 or A5 for the amount. Otherwise the API answers 403.

Boundary values with the demo limits (the HTTP table sets the same limits on a new company):

| Member | Limit | Values tested | Expected |
| --- | --- | --- | --- |
| Buyer | AED 5,000.00 | 4,999.99 · 5,000.00 · 5,000.01 | accepted · accepted · pending |
| Buyer without a limit | none | 0.00 (unit) · 0.01 | pending · pending |
| Approver signing off | AED 50,000.00 | 49,999.99 (unit) · 50,000.00 · 50,000.01 | allowed · allowed · 403, owner signs off |
| Approver buying | AED 50,000.00 | 50,000.01 | pending; cannot approve own purchase (403) |
| Owner | none | 50,000.01 | accepted |
| Member with a zero limit | AED 0.00 | 0.00 · 0.01 (unit) | accepted · pending |

### Table B — release of an accepted quotation on credit terms

Source: `OrderWriter.createFromQuotation` in `apps/api/src/orders/order-writer.service.ts`. **Exposure** is the sum of the organization's orders that are unpaid and not cancelled. The amount compared is the order **total including VAT**.

| Rule | Quotation for | Payment terms | Exposure + order total vs credit limit | Order status | Payment method |
| --- | --- | --- | --- | --- | --- |
| B0 | An organization not yet verified | any | — | No order: accepting is refused (403) | — |
| B1 | A person (no organization) | — | — | Confirmed, retail | Cash or card on delivery |
| B2 | An organization | Prepaid | — | Pending payment | Bank transfer |
| B3 | An organization | Net 15, 30 or 60 | below | Confirmed | Credit account |
| B4 | An organization | Net 15, 30 or 60 | equal | Confirmed | Credit account |
| B5 | An organization | Net 15, 30 or 60 | above | Pending payment | Bank transfer |
| B6 | An organization | Net terms with a zero limit | above (any positive total) | Pending payment | Bank transfer |
| B7 | An organization that no longer exists | — | — | Pending payment | Bank transfer |

Boundary values over HTTP, on a new company with a credit limit of AED 1,050.00:

| Step | Order (net + VAT = total) | Exposure before | Expected |
| --- | --- | --- | --- |
| 1 | 1,000.00 + 50.00 = 1,050.00 | 0.00 | Confirmed (equal, B4) |
| 2 | 0.20 + 0.01 = 0.21 | 1,050.00 | Pending payment (one order above, B5) |
| 3 | Order 1 paid; 999.80 + 49.99 = 1,049.79 | 0.21 (order 2 still counts) | Confirmed (equal again) |
| 4 | Order 2 cancelled, order 3 paid; 1,000.01 + 50.00 = 1,050.01 | 0.00 | Pending payment (a single order above the limit) |
| 5 | Terms changed to prepaid; 0.21 | — | Pending payment (B2) |
| 6 | Net 60 with a zero limit; 0.21 | — | Pending payment (B6) |

**Evidence that the tables bite.** On 26 September 2026, changing `>` to `>=` in `requiresApproval` failed 3 of the 16 rows of the unit table (`npm test -w @topflow/shared -- approval`), and changing `<=` to `<` in the credit check failed 3 of the 12 rows of the OrderWriter table (`npm test -w @topflow/api -- order-writer`). Both changes were reverted.

**Observations.** The two rules compare different amounts (net for approval, gross for credit), and orders waiting for payment keep counting against the credit limit until paid or cancelled. Both look intentional and are listed for review in BUGS-FOUND.md.

## 8. Non-functional testing

- **Accessibility.** axe-core 4.13 with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa` on 35 pages, as the audience of each page, at 1280 × 720 (Desktop Chrome) and on a Pixel 7 profile. Serious and critical violations fail; all findings are attached to the report. Automated rules cannot judge reading order, meaningful alternative text or focus management in flows, hence the manual pass in the release criteria.
- **Performance.** k6 targets and profiles are in PERFORMANCE.md. Only functional smoke runs have been made so far; no timing is published until a measured run on a quiet machine.
- **API contract.** Schemathesis 4.28 with every check, 50 examples per operation and a fixed seed, signed in as a new customer per run. Deliberate differences are in `tests/contract/schemathesis.toml`, known gaps in `baseline.json`; the triage is in BUGS-FOUND.md.
- **Security.** Tenant isolation, role limits, cross-site writes and tampered prices are checked through the browser path; token verification, MFA, suspension and Row Level Security in the API suite; Schemathesis's `ignored_auth` check confirms protected operations refuse anonymous calls.

## 9. Results of this cycle

Run on 26 September 2026 on a Windows 11 laptop with Docker Desktop (16 CPUs, 7.9 GB for all containers), shared with other builds. The final run started from a clean clone of the branch: the API and the web app from production builds, a freshly started Supabase CLI stack (Auth, PostgreSQL 17 and Mailpit only, on non-default ports because the defaults were taken on that machine) seeded with the demo profile, and a new `postgres:17` container for the API suites. Only pass and fail results and counts are reported here, not timings.

| Suite | Command | Result |
| --- | --- | --- |
| Shared unit tests | `npm test -w @topflow/shared` | 74 passed |
| API unit tests | `npm run test:cov -w @topflow/api` | 50 passed |
| API end-to-end tests | `npm run test:e2e:cov -w @topflow/api` | 34 passed (22 in `app.e2e-spec.ts`, 12 in `decision-tables.e2e-spec.ts`) |
| Playwright | `npm run e2e -w @topflow/system-tests` | 26 passed: 8 sign-ins, 13 journeys and checks on desktop, 5 accessibility tests on a phone |
| k6 smoke | `npm run load -w @topflow/system-tests` | All thresholds met, 0 failed requests |
| Schemathesis | `npm run contract -w @topflow/system-tests` | 8,683 generated cases passed against the baseline; no server error in any run |

API coverage from the same runs (statements, excluding specs and entry points): end-to-end suite 79.3 % (1,697 of 2,141), unit suite 15.5 % (331 of 2,141). CI prints both in its job summary.

Eleven defects were recorded; seven are fixed on this branch with regression tests or documentation changes, four are open. See BUGS-FOUND.md.
