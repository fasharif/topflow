# Bugs found

Defects found while building the system tests in [TEST-PLAN.md](TEST-PLAN.md), with the evidence to reproduce them. Clear, small bugs were fixed on this branch in their own `fix:` commit with a regression test; the rest are open and waiting for issues to be filed.

All reproductions ran on 26 September 2026 on a Windows 11 laptop, against the local stack (Supabase CLI, API and web app from production builds, demo seed). Severity uses this scale:

| Severity | Meaning |
| --- | --- |
| High | Money, data or access is wrong for real users, with no workaround |
| Medium | A user sees wrong information or cannot complete a task in one way, and a workaround exists |
| Low | Documentation, developer experience or a contract detail; no user-visible harm |

## Summary

| ID | Title | Severity | Found by | Status |
| --- | --- | --- | --- | --- |
| [BUG-01](#bug-01--wide-tables-cannot-be-scrolled-with-the-keyboard) | Wide tables cannot be scrolled with the keyboard | Medium | axe scan | Fixed |
| [BUG-02](#bug-02--basket-and-checkout-show-the-price-from-when-the-item-was-added) | Basket and checkout show the price from when the item was added | Medium | Security check (tampered price) | Fixed |
| [BUG-03](#bug-03--the-openapi-description-drops-every-validation-rule) | The OpenAPI description drops every validation rule | Low | Schemathesis | Fixed |
| [BUG-04](#bug-04--the-openapi-description-documents-only-success-responses) | The OpenAPI description documents only success responses | Low | Schemathesis | Fixed |
| [BUG-05](#bug-05--invalid-openapi-30-bounds-on-category-ids) | Invalid OpenAPI 3.0 bounds on category ids | Low | Schemathesis | Fixed |
| [BUG-06](#bug-06--identifiers-and-the-organization-header-are-not-described-as-uuids) | Identifiers and the organization header are not described as UUIDs | Low | Schemathesis | Open |
| [BUG-07](#bug-07--an-empty-includeinactive-filter-is-rejected) | An empty `includeInactive` filter is rejected | Low | Schemathesis | Open |
| [BUG-08](#bug-08--getting-started-copies-a-file-that-does-not-exist) | Getting started copies a file that does not exist | Low | Setting up the stack | Open (addressed on other branches) |
| [BUG-09](#bug-09--the-readme-understates-the-catalogue) | The README understates the catalogue | Low | Seeding | Fixed |
| [BUG-10](#bug-10--the-web-apps-readme-describes-the-previous-architecture) | The web app's README describes the previous architecture | Low | Reading the code | Open |

---

## BUG-01 — Wide tables cannot be scrolled with the keyboard

**Severity:** Medium. WCAG 2.2 success criterion 2.1.1 (Keyboard) fails; axe-core rates the rule `scrollable-region-focusable` as *serious*.

**Steps**

1. Sign in as `customer@example.com` and open the delivered demo order `TF-SO-2026-D00002` (`/account/orders/<id>`) in a 1280 × 720 window.
2. Press Tab through the page to reach the Total column of the Items table.
3. Run axe-core 4.13 on the page (`tests/e2e/accessibility.spec.ts`).

**Expected:** the scrolling container of the table can be focused and scrolled with the arrow keys, as with the mouse.

**Actual:** the container is not focusable, so the columns that do not fit cannot be reached from the keyboard. The first axe scan reported the violation on the customer's order page, the trade quotation page and the back-office order page at desktop size. Every table built with `Table` is at least 640 pixels wide, so on a phone all of them scroll sideways in the same kind of container.

**Fix** (commit `fix(web): let keyboard users scroll wide tables`): `ScrollRegion` renders the container as a named region with `tabIndex={0}`, and `Table` requires a label for it. The accessibility spec now scans 35 pages at desktop and phone size and fails on any serious or critical violation.

## BUG-02 — Basket and checkout show the price from when the item was added

**Severity:** Medium. The customer commits to a total that differs from the amount charged. The server always charged the correct catalogue price, so no one was overcharged or undercharged; the defect is the price shown before ordering.

**Steps (price changed by sales)**

1. As `customer@example.com`, add one *Electrofusion Reducer (63 x 32 mm)* (`AX-EFS-001`, AED 33.00 net) to the basket.
2. As `admin@topflow.ae`, change its price to AED 30.00 (`PATCH /admin/products/:id`).
3. As the customer, open `/checkout`, note the total and place the order.

**Expected:** checkout shows AED 57.75 (AED 30.00 + AED 25.00 delivery + AED 2.75 VAT), the amount of the order.

**Actual:** checkout showed **AED 60.90** (the old price); order `TF-SO-2026-000009` was created for **AED 57.75**.

**Steps (price edited in the browser)**

1. As the customer, add two *Electrofusion Tee (50 mm)* (`AX-EFS-002`, AED 39.00) to the basket.
2. In the browser's developer tools, set `unitPrice` to `"0.01"` in the `topflow.cart.v2` entry of localStorage.
3. Open `/checkout`.

**Expected:** checkout shows the catalogue total, AED 108.15.

**Actual:** checkout showed **AED 26.27**; the order placed from it cost AED 108.15.

**Fix** (commit `fix(web): show current catalogue prices in the basket and at checkout`): the basket and checkout pages refresh every line from the catalogue when they open (`useCartPriceRefresh` in `apps/web/lib/cart.ts`). After the fix the same two scenarios showed AED 57.75 and AED 108.15. Regression test: *a price tampered with in the browser is ignored* in `tests/e2e/security.spec.ts`, which also rewrites the order request in flight with a price and totals and checks that the order ignores them.

## BUG-03 — The OpenAPI description drops every validation rule

**Severity:** Low. The API validated correctly; its published contract said less than it enforced.

**Steps:** `curl http://localhost:3000/docs-json` and read `components.schemas.InvitationTokenDto` and `CreateWebsiteQuoteRequestDto`.

**Expected:** the Zod rules appear as JSON Schema constraints (`minLength: 20` on the token, a `pattern` on the phone number, integer bounds on quantities).

**Actual:** every property was a bare `{"type": "string"}` or `{"type": "number"}`. `nestjs-zod` generates the schemas with its own `zod` import, which npm resolved to zod 3.25.76 at the root (hoisted for Expo's CLI) while the schemas are built with zod 4.6.4. Schemathesis therefore generated values the API rightly rejected, which hid real findings.

**Fix** (commit `fix(api): publish the validation rules in the OpenAPI description`): zod 4.6.4 is a root dev dependency, so all workspaces and `nestjs-zod` share it; Expo's CLI keeps its own zod 3. Regression test: *publishes the validation rules in its OpenAPI description* in `apps/api/test/app.e2e-spec.ts`.

## BUG-04 — The OpenAPI description documents only success responses

**Severity:** Low.

**Steps:** run Schemathesis 4.28.0 against `/docs-json` (`npm run contract -w @topflow/system-tests`, before the fix).

**Expected:** every status the API returns is documented, with the shared error envelope (`ApiErrorBody`).

**Actual:** only the 200/201 response was documented. The first unauthenticated run (seed 1, 25 examples per operation) reported **78** undocumented status codes: the 400, 401, 403, 404, 409 and 429 answers clients must handle.

**Fix** (commit `fix(api): document the error envelope for every operation`): `documentErrorResponses` adds the `ApiError` schema as the `default` response of every operation. Regression tests: `apps/api/src/common/openapi.spec.ts` and the end-to-end OpenAPI test.

## BUG-05 — Invalid OpenAPI 3.0 bounds on category ids

**Severity:** Low.

**Steps:** run Schemathesis against `/docs-json` with a signed-in customer.

**Expected:** the document is valid OpenAPI 3.0.

**Actual:** Schemathesis stopped with *Schema Error* on four operations (`POST/PATCH /admin/products`, `POST/PATCH /admin/categories`): `categoryId` and `parentId` carried `exclusiveMinimum: 0`, which OpenAPI 3.0 only allows as a boolean next to `minimum`. The source was `z.number().int().positive()`.

**Fix** (commit `fix(shared): write positive category ids as a minimum of 1`): `min(1)` accepts exactly the same integers and is published as `minimum: 1`. Regression tests: a schema test in `packages/shared/src/schemas/schemas.spec.ts` and the end-to-end OpenAPI test, which fails on any numeric exclusive bound.

## BUG-06 — Identifiers and the organization header are not described as UUIDs

**Severity:** Low. Open.

**Steps:** run `npm run contract -w @topflow/system-tests` without `contract/baseline.json`.

**Expected:** a request that matches the published description is accepted, or refused with 401, 403, 404, 409, 422 or 429.

**Actual:** Schemathesis sends `0` as a path id or an empty `x-organization-id` header, which the description allows, and the API answers 400 (`Validation failed (uuid is expected)`, `Select an organization first`). This accounts for 30 of the 35 operations in the baseline: 6 personal routes with a UUID path id and 24 trade-portal routes under `/org`.

**Suggested fix:** declare `format: uuid` on the `@ApiHeader` for `x-organization-id` and add `@ApiParam({ format: 'uuid' })` where `ParseUUIDPipe` is used, then refresh the baseline with `SCHEMATHESIS_UPDATE_BASELINE=1`.

The other 5 baseline entries are rules JSON Schema cannot express and are accepted: at least one field to update (`PATCH /me`), an address or a saved address (`POST /me/orders`), products or a 20-character description (`POST /quote-requests`), the email check applied after trimming and lower-casing (`POST /me/organizations`), and BUG-07.

## BUG-07 — An empty `includeInactive` filter is rejected

**Severity:** Low. Open.

**Steps:** `curl -i "http://localhost:3000/catalog/products?includeInactive="`

**Expected:** an empty value is ignored, as for `search=`, `category=` and `brand=`.

**Actual:** 400 with *Invalid option: expected one of "true"|"1"|…*. The web app never sends the empty value, so no user is affected.

**Suggested fix:** treat an empty string as absent before `z.stringbool()` in `productQuerySchema`.

## BUG-08 — Getting started copies a file that does not exist

**Severity:** Low. Open.

**Steps:** follow *Getting started* in the README: `cp apps/web/.env.example apps/web/.env.local`.

**Expected:** a documented example of the web app's variables.

**Actual:** `cp: cannot stat 'apps/web/.env.example'`. `apps/web/.gitignore` ignores `.env*`, so the file was never committed; `docs/OPERATIONS.md` also says `apps/*/.env.example` documents every variable.

**Status:** `feature/demo-mode` and `feature/deploy-infra` both add `apps/web/.env.example`, so this branch leaves it alone to avoid a conflict. `tests/README.md` lists the variables the system tests need.

## BUG-09 — The README understates the catalogue

**Severity:** Low.

**Steps:** run `npm run db:seed` and compare its output with the README's *Highlights*.

**Expected:** the README matches `packages/database/prisma/data/topflow-catalogue.json` and its own README.

**Actual:** the README said *323 products in 9 categories and 41 product lines*; the catalogue and the seed have **346 products in 11 categories and 61 product lines**.

**Fix** (commit `docs: correct the catalogue figures in the README`): corrected in the README on this branch (documentation only, no test).

## BUG-10 — The web app's README describes the previous architecture

**Severity:** Low. Open.

`apps/web/README.md` still describes `npm run db:up`, a `/api` rewrite in `next.config.ts` and an access token held in memory with a refresh cookie. Since ADR-013 the web app uses Supabase sessions in httpOnly cookies and a route handler, and `db:up` no longer exists. `feature/demo-mode` edits this file, so it is not changed here.

---

## Schemathesis triage

The first authenticated run (seed 2, 30 examples per operation, 3,742 test cases) reported 64 failures, 3 network errors and 4 schema errors. Their fate:

| Finding | Decision |
| --- | --- |
| Missing validation rules in the description | Fixed: BUG-03 |
| Undocumented 4xx responses | Fixed: BUG-04 |
| Schema errors on four catalogue operations | Fixed: BUG-05 |
| 400 for UUID path ids and the organization header | Open: BUG-06, in `baseline.json` |
| 400 for cross-field rules JSON Schema cannot express | Accepted, in `baseline.json` |
| Unknown query parameters are accepted | By design: unknown parameters and body fields are ignored, which is how client-sent prices are discarded (ADR-009). `allow-extra-parameters = false` in `schemathesis.toml` |
| TRACE answers 404 instead of 405 | Accepted: Express does not route undeclared methods and nothing is exposed. The `unsupported_method` check is excluded |
| 422 for an unknown or archived product at checkout | Correct: 422 marks well-formed input that breaks a business rule. Added to the accepted statuses |
| Three network errors (*Resource temporarily unavailable*) | Test environment: Docker Desktop's port forwarding under four workers. The runner now uses two workers and retries network failures twice; they did not recur |

No check found a server error (5xx) in any run. With the configuration and baseline committed, the last run on 26 September 2026 generated 8,681 test cases and passed.

## Observations for review

These are not defects, but the rules differ in ways a reviewer might not expect:

- **Approval limits and credit limits measure different amounts.** A buyer's spending limit is compared with the net value (goods after discount plus delivery, excluding VAT); the credit limit is compared with order totals including VAT. Excluding VAT from budgets is common for VAT-registered companies, and credit covers what the customer owes, so both look intentional; the test plan's decision tables record them as found.
- **Orders waiting for payment count against the credit limit.** An order released as *Pending payment* because it exceeded the credit limit still counts as exposure until it is paid or cancelled, so an abandoned order blocks credit for later orders until sales cancel it.
